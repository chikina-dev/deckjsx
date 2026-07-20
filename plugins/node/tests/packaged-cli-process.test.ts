import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const NODE_PACKAGE_ROOT = path.join(REPOSITORY_ROOT, "plugins/node");
const PROCESS_TIMEOUT_MS = 20_000;
const RECOVERY_TIMEOUT_MS = 20_000;

type ProcessCapture = {
  readonly child: ChildProcessWithoutNullStreams;
  readonly output: { stdout: string; stderr: string };
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

describe("@deckjsx/node packaged cli process contract", () => {
  test("keeps diagnostics on stderr and recovers from initial bundle and config failures", async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "deckjsx-packaged-cli-test-"));
    let resident: ProcessCapture | undefined;
    try {
      const projectRoot = await createPackedProject(fixtureRoot);
      const cliPath = await packagedCliPath(projectRoot);

      const help = await runCli(cliPath, projectRoot, ["dev", "--help"]);
      expect(help).toMatchObject({ code: 0, signal: null, stdout: "" });
      expect(help.stderr).toContain("Usage\n  deckjsx dev [--interactive]");

      const unknown = await runCli(cliPath, projectRoot, ["dev", "entry.cts", "--interative"]);
      expect(unknown).toMatchObject({ code: 1, signal: null, stdout: "" });
      expect(unknown.stderr).toContain("error deckjsx.node.cli.unknownOption");
      expect(unknown.stderr).toContain("Did you mean --interactive?");

      const invalid = await runCli(cliPath, projectRoot, ["dev", "entry.cts", "--out"]);
      expect(invalid).toMatchObject({ code: 1, signal: null, stdout: "" });
      expect(invalid.stderr).toContain("error deckjsx.node.cli.unknownOption");

      const entryPath = path.join(projectRoot, "entry.cts");
      const outputPath = path.join(projectRoot, "output.pptx");
      await writeFile(entryPath, "const broken = ;\n");

      resident = spawnCli(cliPath, projectRoot, ["dev", "--interactive"]);
      await waitForOutput(
        resident,
        () => resident!.output.stderr.includes("deckjsx.node.dev.bundleFailed"),
        "the initial bundle failure",
        RECOVERY_TIMEOUT_MS,
      );

      await writeFile(entryPath, validEntrySource());
      await waitForOutput(
        resident,
        async () => {
          const outputStats = await stat(outputPath).catch(() => undefined);
          return (
            resident!.output.stderr.includes("[deckjsx] ready") &&
            outputStats !== undefined &&
            outputStats.size > 0
          );
        },
        "the recovered artifact",
        RECOVERY_TIMEOUT_MS,
      );

      const secondOutputPath = path.join(projectRoot, "second.pdf");
      await writeFile(
        path.join(projectRoot, "deckjsx.config.ts"),
        `import { defineConfig } from "@deckjsx/node";
export default defineConfig({ entry: "entry.cts", output: "second.pdf" });
`,
      );
      await writeFile(entryPath, validEntrySource("second.pdf"));
      await waitForOutput(
        resident,
        async () => {
          const outputStats = await stat(secondOutputPath).catch(() => undefined);
          return outputStats !== undefined && outputStats.size > 0;
        },
        "the artifact selected by the rebuilt Host Session",
        RECOVERY_TIMEOUT_MS,
      );

      resident.child.stdin.end("exit\n");
      const exit = await withTimeout(
        resident.exited,
        PROCESS_TIMEOUT_MS,
        "the recovered CLI process to exit",
      );
      expect(exit).toEqual({ code: 0, signal: null });
      expect(resident.output.stdout).toBe("");
      expect(resident.output.stderr).toContain("[deckjsx] error");
      expect(resident.output.stderr).toContain("[deckjsx] ready");
      await expect(stat(outputPath)).resolves.toEqual(
        expect.objectContaining({ size: expect.any(Number) }),
      );

      resident = undefined;
      await writeFile(path.join(projectRoot, "deckjsx.config.ts"), `export default { entry: ;`);
      const recoveredConfigOutput = path.join(projectRoot, "config-recovered.pdf");
      const configFailureResident = spawnCli(cliPath, projectRoot, ["dev", "--interactive"]);
      resident = configFailureResident;
      await waitForOutput(
        configFailureResident,
        () => configFailureResident.output.stderr.includes("E_CONFIG_LOAD_FAILED"),
        "the initial config failure",
        RECOVERY_TIMEOUT_MS,
      );

      await writeFile(
        path.join(projectRoot, "deckjsx.config.ts"),
        `import { defineConfig } from "@deckjsx/node";
export default defineConfig({ entry: "entry.cts", output: "config-recovered.pdf" });
`,
      );
      await writeFile(entryPath, validEntrySource("config-recovered.pdf"));
      await waitForOutput(
        configFailureResident,
        async () => {
          const outputStats = await stat(recoveredConfigOutput).catch(() => undefined);
          return outputStats !== undefined && outputStats.size > 0;
        },
        "the artifact recovered from the initial config failure",
        RECOVERY_TIMEOUT_MS,
      );

      configFailureResident.child.stdin.end("exit\n");
      await expect(
        withTimeout(
          configFailureResident.exited,
          PROCESS_TIMEOUT_MS,
          "the config-recovered CLI process to exit",
        ),
      ).resolves.toEqual({ code: 0, signal: null });
      expect(configFailureResident.output.stdout).toBe("");
      expect(configFailureResident.output.stderr).toContain("E_CONFIG_LOAD_FAILED");
      expect(configFailureResident.output.stderr).toContain("[deckjsx] ready");
    } finally {
      await stopProcess(resident);
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  }, 90_000);
});

async function createPackedProject(fixtureRoot: string): Promise<string> {
  const packageStore = path.join(fixtureRoot, "packages");
  const projectRoot = path.join(fixtureRoot, "project");
  const nodeModules = path.join(projectRoot, "node_modules");
  await mkdir(packageStore, { recursive: true });
  await mkdir(path.join(nodeModules, "@deckjsx"), { recursive: true });

  const npmEnv = {
    ...process.env,
    npm_config_cache: path.join(fixtureRoot, ".npm-cache"),
    npm_config_logs_dir: path.join(fixtureRoot, ".npm-logs"),
  };
  const coreTarball = packPackage(REPOSITORY_ROOT, packageStore, npmEnv);
  const nodeTarball = packPackage(NODE_PACKAGE_ROOT, packageStore, npmEnv);
  await unpackPackage(coreTarball, path.join(nodeModules, "deckjsx"));
  await unpackPackage(nodeTarball, path.join(nodeModules, "@deckjsx/node"));

  await Promise.all(
    [
      { name: "bidi-js", packageRoot: REPOSITORY_ROOT },
      { name: "fontkit", packageRoot: REPOSITORY_ROOT },
      { name: "rolldown", packageRoot: NODE_PACKAGE_ROOT },
    ].map(async (dependency) => {
      const target = path.join(dependency.packageRoot, "node_modules", dependency.name);
      const link = path.join(nodeModules, dependency.name);
      await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    }),
  );
  await writeFile(path.join(projectRoot, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(
    path.join(projectRoot, "deckjsx.config.ts"),
    `import { defineConfig } from "@deckjsx/node";
export default defineConfig({ entry: "entry.cts", output: "output.pptx" });
`,
  );
  return projectRoot;
}

function packPackage(cwd: string, packageStore: string, env: NodeJS.ProcessEnv): string {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["pack", "--json", "--pack-destination", packageStore],
    { cwd, encoding: "utf8", env, stdio: "pipe" },
  );
  if (result.status !== 0) {
    throw new Error(`npm pack failed for ${cwd}\n${result.stderr}`);
  }
  const entries = JSON.parse(result.stdout) as readonly { readonly filename?: unknown }[];
  const filename = entries[0]?.filename;
  if (typeof filename !== "string") {
    throw new Error(`npm pack did not return a filename for ${cwd}`);
  }
  return path.join(packageStore, filename);
}

async function unpackPackage(tarball: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const result = spawnSync("tar", ["-xzf", tarball, "--strip-components=1", "-C", destination], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(`Could not unpack ${tarball}\n${result.stderr}`);
  }
}

async function packagedCliPath(projectRoot: string): Promise<string> {
  const packageRoot = path.join(projectRoot, "node_modules/@deckjsx/node");
  await mkdir(packageRoot, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")) as {
    readonly bin?: Readonly<Record<string, unknown>>;
  };
  const relativeCliPath = manifest.bin?.deckjsx;
  if (typeof relativeCliPath !== "string") {
    throw new Error("The packed @deckjsx/node package does not expose the deckjsx binary.");
  }
  return path.join(packageRoot, relativeCliPath);
}

async function runCli(
  cliPath: string,
  cwd: string,
  args: readonly string[],
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const capture = spawnCli(cliPath, cwd, args);
  const exit = await withTimeout(capture.exited, PROCESS_TIMEOUT_MS, `${args.join(" ")} to exit`);
  return { ...exit, ...capture.output };
}

function spawnCli(cliPath: string, cwd: string, args: readonly string[]): ProcessCapture {
  const child = spawn(process.execPath, [cliPath, ...args], {
    cwd,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const output = { stdout: "", stderr: "" };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output.stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    output.stderr += chunk;
  });
  return {
    child,
    output,
    exited: new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    }),
  };
}

async function waitForOutput(
  processCapture: ProcessCapture,
  predicate: () => boolean | Promise<boolean>,
  description: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    if (processCapture.child.exitCode !== null || processCapture.child.signalCode !== null) {
      throw new Error(
        `CLI exited before ${description}\nSTDOUT:\n${processCapture.output.stdout}\nSTDERR:\n${processCapture.output.stderr}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Timed out waiting for ${description}\nSTDOUT:\n${processCapture.output.stdout}\nSTDERR:\n${processCapture.output.stderr}`,
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  description: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${description}.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function stopProcess(capture: ProcessCapture | undefined): Promise<void> {
  if (!capture || capture.child.exitCode !== null || capture.child.signalCode !== null) {
    return;
  }
  capture.child.kill("SIGINT");
  try {
    await withTimeout(capture.exited, PROCESS_TIMEOUT_MS, "the CLI process to stop");
  } catch {
    capture.child.kill("SIGKILL");
    await capture.exited;
  }
}

function validEntrySource(output = "output.pptx"): string {
  return [
    'import { write } from "@deckjsx/node";',
    'import { Deck } from "deckjsx";',
    'import { pptx } from "deckjsx/adapter";',
    'import { jsx } from "deckjsx/jsx-runtime";',
    "module.exports = (async () => {",
    '  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });',
    '  deck.slide({ name: "Recovered" }, () => jsx("p", { children: "recovered" }));',
    `  await write(await deck.render(pptx({ inspection: "none" })), ${JSON.stringify(output)});`,
    "})();",
  ].join("\n");
}

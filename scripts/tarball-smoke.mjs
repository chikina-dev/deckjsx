#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-tarball-smoke-"));
  const npmCache =
    process.env.DECKJSX_TARBALL_SMOKE_NPM_CACHE ??
    (process.platform === "darwin"
      ? "/private/tmp/npm-cache"
      : path.join(tmpdir(), "deckjsx-npm-cache"));
  const npmEnv = {
    ...process.env,
    npm_config_cache: npmCache,
    npm_config_logs_dir: path.join(directory, ".npm-logs"),
  };
  try {
    const rootPackage = packPackage(root, directory, npmEnv);
    const nodePackage = packPackage(path.join(root, "plugins/node"), directory, npmEnv);
    run("npm", ["init", "-y"], { cwd: directory, env: npmEnv });
    run(
      "npm",
      [
        "install",
        "--prefer-offline",
        "--no-audit",
        "--no-fund",
        path.join(directory, rootPackage.filename),
        path.join(directory, nodePackage.filename),
      ],
      { cwd: directory, env: npmEnv },
    );

    await writeFile(path.join(directory, "entry.cts"), smokeEntrySource());
    const result = await runInteractiveSmoke(directory);
    await assertPptxOutput(directory);

    console.log(
      JSON.stringify(
        {
          ok: true,
          bytes: result.bytes,
          packages: [rootPackage.id, nodePackage.id],
          stderrTail: result.stderrTail,
          stdoutEmpty: result.stdoutEmpty,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function packPackage(cwd, directory, env) {
  const result = run("npm", ["pack", "--json", "--pack-destination", directory], {
    cwd,
    env,
  });
  const packs = JSON.parse(result.stdout);
  const pack = packs[0];
  if (!pack || typeof pack.filename !== "string" || typeof pack.id !== "string") {
    throw new Error(`npm pack did not report a package filename for ${cwd}`);
  }
  return {
    filename: pack.filename,
    id: pack.id,
  };
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }
  return result;
}

async function runInteractiveSmoke(directory) {
  const child = spawn(
    process.execPath,
    ["./node_modules/.bin/deckjsx", "dev", "entry.cts", "--out", "output.pptx", "--interactive"],
    {
      cwd: directory,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const outputPath = path.join(directory, "output.pptx");
  const deadline = Date.now() + 20_000;
  let bytes = 0;
  while (Date.now() < deadline) {
    const stats = await stat(outputPath).catch(() => undefined);
    if (stats && stats.size > 0) {
      bytes = stats.size;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  child.stdin.write("status\nprojection\nexit\n");
  const exitDeadline = Date.now() + 10_000;
  while (Date.now() < exitDeadline && child.exitCode === null) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (child.exitCode === null) {
    child.kill("SIGINT");
    await new Promise((resolve) => child.once("exit", resolve));
  }

  if (bytes === 0) {
    throw new Error(`tarball smoke did not produce output.pptx\nSTDERR:\n${stderr}`);
  }
  if (stdout.trim()) {
    throw new Error(`interactive smoke wrote to stdout\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
  if (stderr.includes("CONFIGURATION_FIELD_CONFLICT")) {
    throw new Error(`Rolldown emitted a JSX configuration warning\nSTDERR:\n${stderr}`);
  }
  if (!stderr.includes("ok session.status") || !stderr.includes("ok projection.inspect")) {
    throw new Error(`interactive smoke missed expected command responses\nSTDERR:\n${stderr}`);
  }

  return {
    bytes,
    stderrTail: stderr.trim().split("\n").slice(-12),
    stdoutEmpty: stdout.trim() === "",
  };
}

async function assertPptxOutput(directory) {
  const zip = unzipSync(await readFile(path.join(directory, "output.pptx")));
  const decoder = new TextDecoder();
  const parentSlideXml = decoder.decode(zip["ppt/slides/slide1.xml"]);
  const childSlideXml = decoder.decode(zip["ppt/slides/slide2.xml"]);

  if (
    !parentSlideXml.includes("FF0000") ||
    !childSlideXml.includes("0000FF") ||
    childSlideXml.includes("FF0000")
  ) {
    throw new Error("tarball smoke composed Deck style output did not stay source-local");
  }
}

function smokeEntrySource() {
  return [
    'import { write } from "@deckjsx/node";',
    'import { Deck, StyleSheet } from "deckjsx";',
    'import { pptx } from "deckjsx/adapter";',
    'import { jsx } from "deckjsx/jsx-runtime";',
    "module.exports = (async () => {",
    '  const parent = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });',
    '  const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });',
    '  parent.useStyles(new StyleSheet({ classes: { note: { target: "p.note", style: { color: "#FF0000" } } } }));',
    '  child.useStyles(new StyleSheet({ classes: { note: { target: "p.note", style: { color: "#0000FF" } } } }));',
    '  parent.slide({ name: "Parent" }, () => jsx("p", { className: "note", style: { position: "absolute", left: 1, top: 1, width: 4, height: 0.6 }, children: "Parent note" }));',
    '  child.slide({ name: "Child" }, () => jsx("p", { className: "note", style: { position: "absolute", left: 1, top: 1, width: 4, height: 0.6 }, children: "Child note" }));',
    '  parent.mount("child", child);',
    '  await write(await parent.render(pptx({ inspection: "none" })), "output.pptx");',
    "})();",
  ].join("\n");
}

await main();

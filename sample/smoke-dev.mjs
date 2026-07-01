import { spawn } from "node:child_process";
import { stat, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL(".", import.meta.url));
const outputPath = fileURLToPath(new URL("./output-tsx.pptx", import.meta.url));
const bin = fileURLToPath(new URL("./node_modules/@deckjsx/node/dist/cli.mjs", import.meta.url));

await unlink(outputPath).catch(() => undefined);

const child = spawn(
  process.execPath,
  [
    "--preserve-symlinks",
    "--preserve-symlinks-main",
    bin,
    "dev",
    "main.tsx",
    "--out",
    "output-tsx.pptx",
  ],
  {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
});
child.stderr.on("data", (chunk) => {
  output += chunk;
});

try {
  const stats = await waitForOutput(outputPath, 20_000);
  child.kill("SIGTERM");
  await onceExit(child);
  console.log(output.trim());
  console.log(`sample output bytes ${stats.size}`);
} catch (error) {
  child.kill("SIGTERM");
  await onceExit(child);
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${message}\n${output}`);
  process.exitCode = 1;
}

async function waitForOutput(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stats = await stat(path).catch(() => undefined);
    if (stats && stats.size > 0) {
      return stats;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("sample dev did not produce output.");
}

function onceExit(childProcess) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    childProcess.once("exit", resolve);
  });
}

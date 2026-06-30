#!/usr/bin/env node

const MARKDOWN_PATH_RE = /(?:^|\/)[^/]+\.mdx?$/i;

const ROOT_CORE_PATHS = [
  /^\.github\/workflows\/ci\.yml$/,
  /^src\//,
  /^tests\//,
  /^scripts\//,
  /^package\.json$/,
  /^bun\.lock$/,
  /^tsconfig\.json$/,
  /^vite\.config\.ts$/,
];

const NODE_PACKAGE_PATHS = [
  /^\.github\/workflows\/ci\.yml$/,
  /^\.github\/scripts\/benchmark-node-runtime-with-diagnostics\.sh$/,
  /^plugins\/node\//,
  /^sample\//,
  /^src\//,
  /^scripts\/benchmark-node-runtime\.mjs$/,
  /^scripts\/tarball-smoke\.mjs$/,
  /^tests\/types\//,
  /^package\.json$/,
  /^bun\.lock$/,
  /^tsconfig\.json$/,
  /^vite\.config\.ts$/,
];

const DIRECT_PPTX_BENCHMARK_PATHS = [
  /^\.github\/workflows\/ci\.yml$/,
  /^src\/writers\/pptx(?:\.ts|\/)/,
  /^src\/projection\/pptx(?:\.ts|\/)/,
  /^src\/pipeline(?:\/|-|\.|$)/,
  /^src\/adapter(?:\.ts|\/)/,
  /^tests\/pptx\//,
  /^scripts\/benchmark-pptx-writer\.tsx$/,
  /^\.github\/scripts\/benchmark-pptx-with-diagnostics\.sh$/,
  /^package\.json$/,
  /^bun\.lock$/,
];

function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

function classifyCiScope(changedPaths) {
  const paths = changedPaths.map(normalizePath).filter(Boolean);
  const docsOnly = paths.length > 0 && paths.every((path) => MARKDOWN_PATH_RE.test(path));

  return {
    benchmark: !docsOnly && paths.some((path) => matchesAny(path, DIRECT_PPTX_BENCHMARK_PATHS)),
    core: !docsOnly && paths.some((path) => matchesAny(path, ROOT_CORE_PATHS)),
    docsOnly,
    node: !docsOnly && paths.some((path) => matchesAny(path, NODE_PACKAGE_PATHS)),
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const githubOutputIndex = args.indexOf("--github-output");
  const githubOutput =
    githubOutputIndex >= 0 && args[githubOutputIndex + 1] ? args[githubOutputIndex + 1] : undefined;

  if (githubOutputIndex >= 0) {
    args.splice(githubOutputIndex, 2);
  }

  return { changedPaths: args, githubOutput };
}

async function readStdin() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const { changedPaths, githubOutput } = parseArgs(process.argv.slice(2));
  const stdinPaths = (await readStdin()).split(/\r?\n/).filter(Boolean);
  const scope = classifyCiScope([...changedPaths, ...stdinPaths]);
  const lines = Object.entries(scope).map(([key, value]) => `${key}=${value ? "true" : "false"}`);

  if (githubOutput) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(githubOutput, `${lines.join("\n")}\n`);
  }

  console.log(JSON.stringify(scope, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

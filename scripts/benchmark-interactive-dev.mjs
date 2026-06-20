import { access, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function* interactiveLines() {
  yield "projection";
  yield "timings";
  yield "exit";
}

export async function runInteractiveDevBenchmark(options = {}) {
  const iterations = options.iterations ?? 3;
  const runs = [];

  for (let index = 0; index < iterations; index += 1) {
    runs.push(await runInteractiveDevBenchmarkOnce());
  }

  return {
    fixture: "interactive-minimal",
    iterations,
    metrics: [
      { name: "coldInteractiveDevMs", unit: "ms", value: average(runs, "coldInteractiveDevMs") },
      {
        name: "projectionCommandMs",
        unit: "ms",
        value: averageDefined(runs.map((run) => run.projectionCommandMs)),
      },
      { name: "outputBytes", unit: "bytes", value: average(runs, "outputBytes") },
      { name: "projectionSlideCount", unit: "count", value: average(runs, "projectionSlideCount") },
    ],
    runs,
  };
}

async function runInteractiveDevBenchmarkOnce() {
  const runtime = await loadBenchmarkRuntime();
  const cwd = await mkdtemp(path.join(process.cwd(), ".deckjsx-interactive-benchmark-"));
  const outputPath = path.join(cwd, "output.pptx");
  const output = [];
  await writeBenchmarkEntry(cwd);

  const artifactSession = runtime.createIncrementalArtifactSession();
  const compiler = runtime.createDeckjsxDevCompiler({
    cwd,
    entry: "entry.cts",
    out: "output.pptx",
    session: artifactSession,
  });
  const startedAt = performance.now();
  try {
    await runtime.runDeckjsxDevCompilerHost({
      compiler,
      interactive: true,
      artifactSession,
      interactiveLines: interactiveLines(),
      interactiveWriteLine(line) {
        output.push(line);
      },
      maxCompilations: 1,
    });
    await access(outputPath);
    const outputStats = await stat(outputPath);
    const projectionSlideCount = numberFieldAfterSection(output, "ok projection.inspect", "slides");
    const projectionCommandMs = numberFieldAfterSection(output, "ok session.timings", "latency");

    return {
      ok: true,
      coldInteractiveDevMs: performance.now() - startedAt,
      ...(projectionCommandMs !== undefined ? { projectionCommandMs } : {}),
      outputBytes: outputStats.size,
      projectionSlideCount: projectionSlideCount ?? 0,
    };
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
}

function numberFieldAfterSection(lines, sectionHeader, field) {
  const start = lines.lastIndexOf(sectionHeader);
  if (start < 0) {
    return undefined;
  }
  for (const line of lines.slice(start + 1)) {
    if (/^(ok|error) /.test(line)) {
      return undefined;
    }
    const match = new RegExp(`^\\s*${escapeRegExp(field)}\\s+(\\d+)`).exec(line);
    if (match) {
      return Number(match[1]);
    }
  }
  return undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadBenchmarkRuntime() {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const [integration, nodeCli, nodeDev] = await Promise.all([
    import(pathToFileURL(path.resolve(root, "../dist/integration.mjs")).href),
    import(pathToFileURL(path.resolve(root, "../plugins/node/dist/cli.mjs")).href),
    import(pathToFileURL(path.resolve(root, "../plugins/node/dist/dev.mjs")).href),
  ]);
  return {
    createIncrementalArtifactSession: integration.createIncrementalArtifactSession,
    createDeckjsxDevCompiler: nodeDev.createDeckjsxDevCompiler,
    runDeckjsxDevCompilerHost: nodeCli.runDeckjsxDevCompilerHost,
  };
}

async function writeBenchmarkEntry(cwd) {
  await writeFile(
    path.join(cwd, "entry.cts"),
    [
      'import { writeFile } from "node:fs/promises";',
      'import { Deck } from "deckjsx";',
      'import { pptx } from "deckjsx/adapter";',
      'import { getArtifactWriteToken, recordArtifactWrite } from "deckjsx/integration";',
      'import { jsx } from "deckjsx/jsx-runtime";',
      "module.exports = (async () => {",
      '  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });',
      '  deck.slide({ name: "Interactive benchmark" }, () => jsx("p", { style: { x: 1, y: 1, width: 5, height: 0.5 }, children: "interactive benchmark" }));',
      "  const render = await deck.render(pptx());",
      "  if (!render.ok || !render.artifact) throw new Error('render failed');",
      '  await writeFile("output.pptx", render.artifact.bytes);',
      '  recordArtifactWrite(getArtifactWriteToken(render), { path: "output.pptx", result: { status: "created", strategy: "write-file", bytesWritten: render.artifact.bytes.byteLength, patchedParts: [], diagnostics: [] } });',
      "})();",
    ].join("\n"),
  );
}

function average(runs, key) {
  return averageDefined(runs.map((run) => (typeof run[key] === "number" ? run[key] : undefined)));
}

function averageDefined(values) {
  const numbers = values.filter((value) => value !== undefined);
  return numbers.reduce((sum, value) => sum + value, 0) / Math.max(1, numbers.length);
}

function parseIterations(argv) {
  const index = argv.indexOf("--iterations");
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value ? Number(value) : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runInteractiveDevBenchmark({
    iterations: parseIterations(process.argv.slice(2)),
  });
  console.log(JSON.stringify(result, null, 2));
}

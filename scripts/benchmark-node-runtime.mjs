#!/usr/bin/env node
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_NODE_RUNTIME_BENCHMARK_BUDGETS = {
  changedRenderMs: 180,
  coldRenderMs: 220,
  inspectPatchableMs: 50,
  patchedPartCount: 32,
  writeCreatedMs: 30,
  writeExistingMs: 80,
};

const METRIC_ORDER = [
  { name: "coldRenderMs", unit: "ms" },
  { name: "writeCreatedMs", unit: "ms" },
  { name: "changedRenderMs", unit: "ms" },
  { name: "writeExistingMs", unit: "ms" },
  { name: "inspectPatchableMs", unit: "ms" },
  { name: "patchedPartCount", unit: "count" },
];

function summarizeNodeRuntimeBenchmark(metrics, budgets = DEFAULT_NODE_RUNTIME_BENCHMARK_BUDGETS) {
  const summaries = METRIC_ORDER.map(({ name, unit }) => ({
    actual: metrics[name],
    budget: budgets[name] ?? DEFAULT_NODE_RUNTIME_BENCHMARK_BUDGETS[name],
    name,
    ok: metrics[name] <= (budgets[name] ?? DEFAULT_NODE_RUNTIME_BENCHMARK_BUDGETS[name]),
    unit,
  }));
  return { metrics: summaries, ok: summaries.every((metric) => metric.ok) };
}

async function runNodeRuntimeBenchmark(options = {}) {
  const iterations = options.iterations ?? 3;
  const runtime = await loadBenchmarkRuntime();
  const runs = [];

  for (let index = 0; index < iterations; index += 1) {
    runs.push(await runNodeRuntimeBenchmarkOnce(runtime, index));
  }

  const metrics = averageMetrics(runs);
  return {
    fixture: "node-runtime-mixed-write",
    iterations,
    metrics,
    runs,
    summary: summarizeNodeRuntimeBenchmark(metrics),
  };
}

async function runNodeRuntimeBenchmarkOnce(runtime, index) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "deckjsx-node-runtime-benchmark-"));
  const outputPath = path.join(dir, "output.pptx");
  try {
    const coldRender = await timed(async () => renderBenchmarkDeck(runtime, `before ${index}`));
    assertRenderOk(coldRender.value, "cold render");

    const writeCreated = await timed(async () => runtime.write(coldRender.value, outputPath));
    assertWriteOk(writeCreated.value, "created write");

    const changedRender = await timed(async () => renderBenchmarkDeck(runtime, `after ${index}`));
    assertRenderOk(changedRender.value, "changed render");

    const writeExisting = await timed(async () => runtime.write(changedRender.value, outputPath));
    assertWriteOk(writeExisting.value, "existing write");
    if (writeExisting.value.status !== "patched") {
      throw new Error(`existing write used ${writeExisting.value.status}; expected patched`);
    }
    if (writeExisting.value.patchedParts.length === 0) {
      throw new Error("existing write patched no package parts");
    }

    const inspectPatchable = await timed(async () => runtime.inspectPatchablePptx(outputPath));
    if (!inspectPatchable.value.ok) {
      throw new Error("patchable PPTX inspection failed");
    }

    const output = await stat(outputPath);
    return {
      changedRenderMs: changedRender.ms,
      coldRenderMs: coldRender.ms,
      inspectPatchableMs: inspectPatchable.ms,
      outputBytes: output.size,
      patchedPartCount: writeExisting.value.patchedParts.length,
      writeCreatedMs: writeCreated.ms,
      writeExistingMs: writeExisting.ms,
    };
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function renderBenchmarkDeck(runtime, text) {
  const { Deck, jsx, pptx } = runtime;
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

  for (let slide = 0; slide < 8; slide += 1) {
    deck.slide({ name: `Node runtime ${slide + 1}` }, () =>
      jsx("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 0.1,
          height: 4.8,
          padding: 0.4,
        },
        children: Array.from({ length: 24 }, (_, item) =>
          jsx("p", {
            style: {
              color: item % 2 === 0 ? "#111827" : "#2563EB",
              fontSize: 10 + (item % 5),
              height: 0.28,
            },
            children: `${text} ${slide + 1}.${item + 1}`,
          }),
        ),
      }),
    );
  }

  return deck.render(pptx({ inspection: "none" }));
}

async function loadBenchmarkRuntime() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const [deckjsx, adapter, jsxRuntime, nodeRuntime] = await Promise.all([
    import(pathToFileURL(path.join(root, "dist/index.mjs")).href),
    import(pathToFileURL(path.join(root, "dist/adapter/index.mjs")).href),
    import(pathToFileURL(path.join(root, "dist/jsx-runtime.mjs")).href),
    import(pathToFileURL(path.join(root, "sample/node_modules/@deckjsx/node/dist/index.mjs")).href),
  ]);
  return {
    Deck: deckjsx.Deck,
    inspectPatchablePptx: nodeRuntime.inspectPatchablePptx,
    jsx: jsxRuntime.jsx,
    pptx: adapter.pptx,
    write: nodeRuntime.write,
  };
}

function assertRenderOk(render, label) {
  if (!render.ok || !render.artifact) {
    throw new Error(`${label} failed`);
  }
}

function assertWriteOk(write, label) {
  if (!write.ok) {
    throw new Error(`${label} failed`);
  }
}

async function timed(operation) {
  const started = performance.now();
  const value = await operation();
  return { ms: roundMs(performance.now() - started), value };
}

function averageMetrics(runs) {
  return {
    changedRenderMs: average(runs, "changedRenderMs"),
    coldRenderMs: average(runs, "coldRenderMs"),
    inspectPatchableMs: average(runs, "inspectPatchableMs"),
    outputBytes: Math.round(average(runs, "outputBytes")),
    patchedPartCount: Math.round(average(runs, "patchedPartCount")),
    writeCreatedMs: average(runs, "writeCreatedMs"),
    writeExistingMs: average(runs, "writeExistingMs"),
  };
}

function average(runs, key) {
  return roundMs(runs.reduce((sum, run) => sum + run[key], 0) / runs.length);
}

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}

function parseOptions(argv) {
  let iterations = 3;
  let json = false;
  let strict = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--iterations" && next) {
      iterations = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error("--iterations must be a positive integer.");
  }
  return { iterations, json, strict };
}

function formatText(result) {
  return [
    `@deckjsx/node runtime benchmark (${result.iterations} iteration${result.iterations === 1 ? "" : "s"})`,
    `${result.fixture} (${result.metrics.outputBytes} bytes, patchedParts=${result.metrics.patchedPartCount})`,
    ...result.summary.metrics.map(
      (metric) =>
        `  ${metric.name.padEnd(18)} ${formatMetric(metric).padStart(10)} / budget ${formatMetricBudget(metric).padStart(10)} ${metric.ok ? "ok" : "over"}`,
    ),
  ].join("\n");
}

function formatMetric(metric) {
  return metric.unit === "ms" ? formatMs(metric.actual) : metric.actual.toLocaleString();
}

function formatMetricBudget(metric) {
  return metric.unit === "ms" ? formatMs(metric.budget) : metric.budget.toLocaleString();
}

function formatMs(ms) {
  return `${ms.toFixed(2)}ms`;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const result = await runNodeRuntimeBenchmark({ iterations: options.iterations });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatText(result));
  }
  if (options.strict && !result.summary.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

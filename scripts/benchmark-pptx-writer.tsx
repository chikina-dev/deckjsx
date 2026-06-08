import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Deck, type AssetLoader } from "../src/index.ts";
import type { PptxPackageBuildArtifact } from "../src/pipeline-artifacts.ts";
import type { PackagePartId } from "../src/projection/pptx/model.ts";
import {
  renderPptxPackage as renderPptxPackageBase,
  type PptxWriterContext,
  type PptxWriterOptions,
} from "../src/writers/pptx.ts";
import { createPptxZipBytesFromEntries, type PptxZipEntry } from "../src/writers/pptx/zip.ts";

type BenchmarkPptxWriterResult = Awaited<ReturnType<typeof renderPptxPackageBase>> & {
  readonly buildArtifacts?: readonly PptxPackageBuildArtifact[];
};

async function renderPptxPackage(
  projection: Parameters<typeof renderPptxPackageBase>[0],
  options?: PptxWriterOptions,
  context?: PptxWriterContext,
): Promise<BenchmarkPptxWriterResult> {
  let buildArtifacts: readonly PptxPackageBuildArtifact[] | undefined;
  const result = await renderPptxPackageBase(projection, options, {
    ...context,
    onBuildArtifacts: (artifacts) => {
      buildArtifacts = artifacts;
      context?.onBuildArtifacts?.(artifacts);
    },
  });

  return { ...result, ...(buildArtifacts ? { buildArtifacts } : {}) };
}

type BenchmarkMetric = {
  readonly name: string;
  readonly category:
    | "artifactReuse"
    | "asset"
    | "inspection"
    | "output"
    | "project"
    | "writer"
    | "zip";
  readonly averageMs: number;
  readonly budgetMs: number;
  readonly ok: boolean;
};

type AssetCounters = { probeCalls: number; loadCalls: number };

type BenchmarkResult = {
  readonly fixture: string;
  readonly slideCount: number;
  readonly zipBytes: number;
  readonly zipEntryCount: number;
  readonly firstProjectProbeCalls: number;
  readonly firstProjectLoadCalls: number;
  readonly warmProjectProbeCalls: number;
  readonly warmProjectLoadCalls: number;
  readonly pathOutputStatus: string;
  readonly warmFailedCount: number;
  readonly warmMissingCount: number;
  readonly warmReusedCount: number;
  readonly warmRebuiltCount: number;
  readonly metrics: readonly BenchmarkMetric[];
};

type BenchmarkRunContext = { readonly assets: AssetCounters };

type BenchmarkFixture = {
  readonly name: string;
  readonly createDeck: (context?: BenchmarkRunContext) => Deck<void, any>;
  readonly budgets: {
    readonly projectMs: number;
    readonly projectDetailsMs: number;
    readonly projectNoInspectionMs: number;
    readonly warmProjectMs: number;
    readonly coldWriterMs: number;
    readonly warmWriterMs: number;
    readonly zipAssemblyMs: number;
    readonly pathOutputMs: number;
  };
};

type Options = { readonly iterations: number; readonly json: boolean; readonly strict: boolean };

const tinySvgDataUri = `data:image/svg+xml;base64,${btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#2563EB"/><circle cx="24" cy="20" r="12" fill="#F97316"/></svg>',
)}`;

const templateSet = {
  report: {
    areas: {
      title: { frame: { x: 0.6, y: 0.35, width: 8.8, height: 0.55 } },
      body: { frame: { x: 0.7, y: 1.05, width: 5.8, height: 3.8 } },
      aside: { frame: { x: 6.75, y: 1.05, width: 2.45, height: 3.8 } },
      footer: { frame: { x: 0.7, y: 5.0, width: 8.2, height: 0.3 } },
    },
  },
} as const;

function decodeDataUri(dataUri: string): Uint8Array {
  const [, payload = ""] = dataUri.split(",", 2);
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function benchmarkAssetLoader(counters: AssetCounters): AssetLoader {
  const bytes = decodeDataUri(tinySvgDataUri);
  const metadata = {
    mediaType: "image/svg+xml",
    extension: "svg",
    width: 80,
    height: 40,
    byteLength: bytes.byteLength,
    hash: "benchmark-tiny-svg-v1",
  };

  return {
    name: "benchmark-data-uri-assets",
    async probe(context) {
      if (context.source.kind !== "data" || context.source.data !== tinySvgDataUri) {
        return undefined;
      }
      counters.probeCalls += 1;
      return metadata;
    },
    async load(context) {
      if (context.source.kind !== "data" || context.source.data !== tinySvgDataUri) {
        return undefined;
      }
      counters.loadCalls += 1;
      return { ...metadata, bytes };
    },
  };
}

function createAssetCounters(): AssetCounters {
  return { probeCalls: 0, loadCalls: 0 };
}

function registerBenchmarkAssets(deck: Deck, context: BenchmarkRunContext | undefined): void {
  if (context) {
    deck.useAssets(benchmarkAssetLoader(context.assets));
  }
}

const fixtures: readonly BenchmarkFixture[] = [
  {
    name: "minimal",
    createDeck() {
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.slide({ name: "Minimal" }, () => <p>Hello</p>);
      return deck;
    },
    budgets: {
      projectMs: 80,
      projectDetailsMs: 100,
      projectNoInspectionMs: 80,
      warmProjectMs: 20,
      coldWriterMs: 80,
      warmWriterMs: 50,
      zipAssemblyMs: 40,
      pathOutputMs: 120,
    },
  },
  {
    name: "text-heavy",
    createDeck() {
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      for (let slide = 0; slide < 8; slide += 1) {
        deck.slide({ name: ` ${slide + 1}` }, () => (
          <>
            {Array.from({ length: 24 }, (_, index) => (
              <p
                style={{
                  x: 0.5 + (index % 3) * 3,
                  y: 0.35 + Math.floor(index / 3) * 0.55,
                  width: 2.6,
                  height: 0.35,
                  fontSize: 11 + (index % 4),
                  color: index % 2 === 0 ? "#111827" : "#2563EB",
                }}
              >
                Row {index + 1}: direct PPTX writer benchmark text
              </p>
            ))}
          </>
        ));
      }
      return deck;
    },
    budgets: {
      projectMs: 350,
      projectDetailsMs: 430,
      projectNoInspectionMs: 350,
      warmProjectMs: 30,
      coldWriterMs: 450,
      warmWriterMs: 180,
      zipAssemblyMs: 100,
      pathOutputMs: 650,
    },
  },
  {
    name: "image-heavy",
    createDeck(context) {
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      registerBenchmarkAssets(deck, context);
      for (let slide = 0; slide < 6; slide += 1) {
        deck.slide({ name: `Images ${slide + 1}` }, () => (
          <>
            {Array.from({ length: 12 }, (_, index) => (
              <img
                data={tinySvgDataUri}
                style={{
                  x: 0.5 + (index % 4) * 2.2,
                  y: 0.5 + Math.floor(index / 4) * 1.45,
                  width: 1.6,
                  height: 0.9,
                  objectFit: index % 2 === 0 ? "contain" : "cover",
                }}
              />
            ))}
          </>
        ));
      }
      return deck;
    },
    budgets: {
      projectMs: 300,
      projectDetailsMs: 380,
      projectNoInspectionMs: 300,
      warmProjectMs: 35,
      coldWriterMs: 450,
      warmWriterMs: 180,
      zipAssemblyMs: 120,
      pathOutputMs: 700,
    },
  },
  {
    name: "template-layout",
    createDeck() {
      const deck = new Deck({
        layout: { width: 10, height: 5.625, unit: "in" },
        templates: templateSet,
      });
      for (let slide = 0; slide < 8; slide += 1) {
        deck.slide({ name: `Report ${slide + 1}`, template: "report" }, ({ template }) => (
          <>
            <h1 area={template.title}>Template report {slide + 1}</h1>
            <div
              area={template.body}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 0.18,
                backgroundColor: "#F8FAFC",
              }}
            >
              {Array.from({ length: 8 }, (_, index) => (
                <p style={{ fontSize: 11, color: index % 2 === 0 ? "#111827" : "#1D4ED8" }}>
                  Area item {index + 1}
                </p>
              ))}
            </div>
            <div area={template.aside} style={{ backgroundColor: "#E0F2FE", padding: 0.12 }}>
              <p style={{ fontSize: 18, fontWeight: 700 }}>KPI</p>
              <p style={{ fontSize: 30, color: "#0369A1" }}>{92 + slide}%</p>
            </div>
            <p area={template.footer} style={{ fontSize: 9, color: "#64748B" }}>
              Template area frames and layout anchors
            </p>
          </>
        ));
      }
      return deck;
    },
    budgets: {
      projectMs: 420,
      projectDetailsMs: 520,
      projectNoInspectionMs: 420,
      warmProjectMs: 35,
      coldWriterMs: 520,
      warmWriterMs: 220,
      zipAssemblyMs: 120,
      pathOutputMs: 760,
    },
  },
  {
    name: "mixed-paint",
    createDeck() {
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      for (let slide = 0; slide < 6; slide += 1) {
        deck.slide({ name: `Mixed ${slide + 1}` }, () => (
          <>
            <div
              style={{
                x: 0.35,
                y: 0.35,
                width: 9.1,
                height: 4.8,
                background: "linear-gradient(135deg, #DBEAFE 0%, #F8FAFC 100%)",
                border: "1.5pt solid #1D4ED8",
                borderRadius: 16,
              }}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <shape
                  shape={index % 3 === 0 ? "ellipse" : "rect"}
                  style={{
                    x: 0.35 + (index % 4) * 2.1,
                    y: 0.45 + Math.floor(index / 4) * 1.1,
                    width: 1.45,
                    height: 0.65,
                    fill: index % 2 === 0 ? "#F97316" : "#16A34A",
                    opacity: 0.65,
                    boxShadow: "3px 3px 8px rgba(15, 23, 42, 0.25)",
                    zIndex: index % 5,
                  }}
                />
              ))}
              <p style={{ x: 0.55, y: 3.95, width: 6.8, height: 0.45, fontSize: 18 }}>
                Mixed CSS-like paint, z-index, gradients, shadows, and text
              </p>
            </div>
          </>
        ));
      }
      return deck;
    },
    budgets: {
      projectMs: 350,
      projectDetailsMs: 450,
      projectNoInspectionMs: 350,
      warmProjectMs: 35,
      coldWriterMs: 500,
      warmWriterMs: 220,
      zipAssemblyMs: 120,
      pathOutputMs: 760,
    },
  },
];

function parseOptions(args: readonly string[]): Options {
  let iterations = 5;
  let json = false;
  let strict = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

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

async function measure(iterations: number, run: () => Promise<void>): Promise<number> {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function buildArtifactMap(
  artifacts: readonly PptxPackageBuildArtifact[] | undefined,
): ReadonlyMap<PackagePartId, PptxPackageBuildArtifact> {
  return new Map((artifacts ?? []).map((artifact) => [artifact.packagePartId, artifact]));
}

function buildArtifactForSummaryPackagePartId(input: {
  readonly artifactsByPartId: ReadonlyMap<PackagePartId, PptxPackageBuildArtifact>;
  readonly packagePartId: string | undefined;
}): PptxPackageBuildArtifact | undefined {
  if (!input.packagePartId) {
    return undefined;
  }

  for (const [packagePartId, artifact] of input.artifactsByPartId) {
    if (packagePartId === input.packagePartId) {
      return artifact;
    }
  }

  return undefined;
}

function zipEntriesFromBuildArtifacts(input: {
  readonly artifacts: readonly PptxPackageBuildArtifact[] | undefined;
  readonly assemblyEntries:
    | readonly {
        readonly packagePartId?: string;
        readonly path: string;
        readonly compression: "default" | "store";
      }[]
    | undefined;
}): PptxZipEntry[] {
  const artifactsByPartId = buildArtifactMap(input.artifacts);
  return (input.assemblyEntries ?? []).flatMap((entry) => {
    const artifact = buildArtifactForSummaryPackagePartId({
      artifactsByPartId,
      packagePartId: entry.packagePartId,
    });
    return artifact
      ? [{ path: entry.path, bytes: artifact.bytes, compression: entry.compression }]
      : [];
  });
}

async function runFixture(fixture: BenchmarkFixture, iterations: number): Promise<BenchmarkResult> {
  let slideCount = 0;
  let zipBytes = 0;
  let zipEntryCount = 0;
  let firstProjectProbeCalls = 0;
  let firstProjectLoadCalls = 0;
  let warmProjectProbeCalls = 0;
  let warmProjectLoadCalls = 0;
  let warmFailedCount = 0;
  let warmMissingCount = 0;
  let warmReusedCount = 0;
  let warmRebuiltCount = 0;
  let pathOutputStatus = "notMeasured";

  const projectMs = await measure(iterations, async () => {
    const deck = fixture.createDeck();
    const project = await deck.project();
    if (!project.projection || !project.ok) {
      throw new Error(`${fixture.name} projection failed.`);
    }
    slideCount = project.projection.slides.length;
  });

  const projectNoInspectionMs = await measure(iterations, async () => {
    const deck = fixture.createDeck();
    const project = await deck.project({ inspection: "none" });
    if (!project.projection || !project.ok || project.summary) {
      throw new Error(`${fixture.name} no-inspection projection failed.`);
    }
  });

  const projectDetailsMs = await measure(iterations, async () => {
    const deck = fixture.createDeck();
    const project = await deck.project({ inspection: "details" });
    if (
      !project.projection ||
      !project.ok ||
      !project.summary?.details?.composedPaintOrder ||
      !project.summary.details.effectiveProjectedStyles ||
      !project.summary.details.packageDependencyInvalidation ||
      !project.summary.details.paintFallbackAggregation ||
      !project.summary.details.themeProjections
    ) {
      throw new Error(`${fixture.name} detailed projection inspection failed.`);
    }
  });

  const warmProjectContext = { assets: createAssetCounters() };
  const warmProjectDeck = fixture.createDeck(warmProjectContext);
  const firstProject = await warmProjectDeck.project({ inspection: "none" });
  if (!firstProject.projection || !firstProject.ok) {
    throw new Error(`${fixture.name} first warm projection failed.`);
  }
  firstProjectProbeCalls = warmProjectContext.assets.probeCalls;
  firstProjectLoadCalls = warmProjectContext.assets.loadCalls;
  const probeCallsBeforeWarmProject = warmProjectContext.assets.probeCalls;
  const loadCallsBeforeWarmProject = warmProjectContext.assets.loadCalls;
  const warmProjectMs = await measure(iterations, async () => {
    const project = await warmProjectDeck.project({ inspection: "none" });
    if (!project.projection || !project.ok) {
      throw new Error(`${fixture.name} warm projection failed.`);
    }
  });
  warmProjectProbeCalls = warmProjectContext.assets.probeCalls - probeCallsBeforeWarmProject;
  warmProjectLoadCalls = warmProjectContext.assets.loadCalls - loadCallsBeforeWarmProject;

  const projectedDeck = fixture.createDeck();
  const projection = (await projectedDeck.project()).projection;
  if (!projection) {
    throw new Error(`${fixture.name} projection was unavailable.`);
  }

  const coldMs = await measure(iterations, async () => {
    const result = await renderPptxPackage(projection, { compression: "fast" });
    if (!result.artifact) {
      throw new Error(`${fixture.name} cold writer failed.`);
    }
    zipBytes = result.artifact.bytes.byteLength;
  });

  const cold = await renderPptxPackage(projection, { compression: "fast" });
  const buildArtifactsByPartId = buildArtifactMap(cold.buildArtifacts);
  const zipEntries = zipEntriesFromBuildArtifacts({
    artifacts: cold.buildArtifacts,
    assemblyEntries: cold.summary?.assembly?.entries,
  });
  zipEntryCount = zipEntries.length;
  const zipAssemblyMs = await measure(iterations, async () => {
    const bytes = createPptxZipBytesFromEntries(zipEntries, { compression: "fast" });
    if (bytes.byteLength === 0) {
      throw new Error(`${fixture.name} ZIP assembly produced no bytes.`);
    }
  });

  const warmMs = await measure(iterations, async () => {
    const result = await renderPptxPackage(
      projection,
      { compression: "fast" },
      { pptxBuildArtifactsByPartId: buildArtifactsByPartId },
    );
    if (!result.artifact) {
      throw new Error(`${fixture.name} warm writer failed.`);
    }
    warmReusedCount = result.summary?.assembly?.reusedCount ?? 0;
    warmRebuiltCount = result.summary?.assembly?.rebuiltCount ?? 0;
    warmMissingCount = result.summary?.assembly?.missingCount ?? 0;
    warmFailedCount = result.summary?.assembly?.failedCount ?? 0;
  });

  const tempDir = await mkdtemp(join(tmpdir(), "deckjsx-pptx-bench-"));
  try {
    const outputDeck = fixture.createDeck();
    const output = join(tempDir, `${fixture.name}.pptx`);
    const pathOutputMs = await measure(iterations, async () => {
      const result = await outputDeck.render({ output });
      if (!result.artifact || result.summary?.output?.status !== "written") {
        throw new Error(`${fixture.name} path output failed.`);
      }
      pathOutputStatus = result.summary.output.status;
    });

    const metrics: BenchmarkMetric[] = [
      {
        name: "projectSummary",
        category: "inspection",
        averageMs: projectMs,
        budgetMs: fixture.budgets.projectMs,
        ok: projectMs <= fixture.budgets.projectMs,
      },
      {
        name: "project",
        category: "project",
        averageMs: projectNoInspectionMs,
        budgetMs: fixture.budgets.projectNoInspectionMs,
        ok: projectNoInspectionMs <= fixture.budgets.projectNoInspectionMs,
      },
      {
        name: "projectDetails",
        category: "inspection",
        averageMs: projectDetailsMs,
        budgetMs: fixture.budgets.projectDetailsMs,
        ok: projectDetailsMs <= fixture.budgets.projectDetailsMs,
      },
      {
        name: "warmProject",
        category: "asset",
        averageMs: warmProjectMs,
        budgetMs: fixture.budgets.warmProjectMs,
        ok: warmProjectMs <= fixture.budgets.warmProjectMs,
      },
      {
        name: "coldWriter",
        category: "writer",
        averageMs: coldMs,
        budgetMs: fixture.budgets.coldWriterMs,
        ok: coldMs <= fixture.budgets.coldWriterMs,
      },
      {
        name: "zipAssembly",
        category: "zip",
        averageMs: zipAssemblyMs,
        budgetMs: fixture.budgets.zipAssemblyMs,
        ok: zipAssemblyMs <= fixture.budgets.zipAssemblyMs,
      },
      {
        name: "warmWriter",
        category: "artifactReuse",
        averageMs: warmMs,
        budgetMs: fixture.budgets.warmWriterMs,
        ok: warmMs <= fixture.budgets.warmWriterMs,
      },
      {
        name: "pathOutput",
        category: "output",
        averageMs: pathOutputMs,
        budgetMs: fixture.budgets.pathOutputMs,
        ok: pathOutputMs <= fixture.budgets.pathOutputMs,
      },
    ];

    return {
      fixture: fixture.name,
      slideCount,
      zipBytes,
      zipEntryCount,
      firstProjectProbeCalls,
      firstProjectLoadCalls,
      warmProjectProbeCalls,
      warmProjectLoadCalls,
      pathOutputStatus,
      warmFailedCount,
      warmMissingCount,
      warmReusedCount,
      warmRebuiltCount,
      metrics,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function printTable(results: readonly BenchmarkResult[]): void {
  for (const result of results) {
    console.log(
      `\n${result.fixture} (${result.slideCount} slides, ${result.zipBytes} bytes, ${result.zipEntryCount} zip entries)`,
    );
    console.log(
      `  warm assembly: reused=${result.warmReusedCount} rebuilt=${result.warmRebuiltCount} missing=${result.warmMissingCount} failed=${result.warmFailedCount}`,
    );
    console.log(
      `  asset calls: firstProject probe=${result.firstProjectProbeCalls} load=${result.firstProjectLoadCalls}; warmProject probe=${result.warmProjectProbeCalls} load=${result.warmProjectLoadCalls}`,
    );
    console.log(`  path output: ${result.pathOutputStatus}`);
    for (const metric of result.metrics) {
      const mark = metric.ok ? "ok" : "over";
      console.log(
        `  ${metric.name.padEnd(14)} ${metric.category.padEnd(13)} ${formatMs(metric.averageMs).padStart(10)} / budget ${formatMs(metric.budgetMs).padStart(10)} ${mark}`,
      );
    }
  }
}

const options = parseOptions(process.argv.slice(2));
const results = [];
for (const fixture of fixtures) {
  results.push(await runFixture(fixture, options.iterations));
}

if (options.json) {
  console.log(JSON.stringify({ iterations: options.iterations, results }, null, 2));
} else {
  console.log(`PPTX writer benchmark (${options.iterations} iterations)`);
  printTable(results);
}

const failures = results.flatMap((result) =>
  result.metrics.flatMap((metric) =>
    metric.ok
      ? []
      : [
          `${result.fixture}.${metric.name} ${formatMs(metric.averageMs)} > ${formatMs(metric.budgetMs)}`,
        ],
  ),
);

const invariantFailures = results.flatMap((result) => {
  const failures: string[] = [];

  if (result.zipEntryCount <= 0) {
    failures.push(`${result.fixture}.zipEntryCount expected generated ZIP entries`);
  }
  if (result.pathOutputStatus !== "written") {
    failures.push(
      `${result.fixture}.pathOutputStatus expected written, got ${result.pathOutputStatus}`,
    );
  }
  if (result.warmFailedCount !== 0) {
    failures.push(`${result.fixture}.warmAssembly failed=${result.warmFailedCount}`);
  }
  if (result.warmMissingCount !== 0) {
    failures.push(`${result.fixture}.warmAssembly missing=${result.warmMissingCount}`);
  }
  if (result.warmReusedCount <= 0) {
    failures.push(`${result.fixture}.warmAssembly expected at least one reused entry`);
  }
  if (result.firstProjectLoadCalls !== 0) {
    failures.push(
      `${result.fixture}.firstProjectLoadCalls expected 0 Project load() calls, got ${result.firstProjectLoadCalls}`,
    );
  }
  if (result.warmProjectProbeCalls !== 0) {
    failures.push(
      `${result.fixture}.warmProjectProbeCalls expected 0 cached Project probe() calls, got ${result.warmProjectProbeCalls}`,
    );
  }
  if (result.warmProjectLoadCalls !== 0) {
    failures.push(
      `${result.fixture}.warmProjectLoadCalls expected 0 cached Project load() calls, got ${result.warmProjectLoadCalls}`,
    );
  }

  return failures;
});

const allFailures = [...failures, ...invariantFailures];

if (allFailures.length > 0) {
  console.warn(
    `\nBenchmark budgets or invariants failed:\n${allFailures.map((failure) => `- ${failure}`).join("\n")}`,
  );
  if (options.strict) {
    process.exitCode = 1;
  }
}

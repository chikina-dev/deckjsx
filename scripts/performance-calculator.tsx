import { pathToFileURL } from "node:url";
import {
  createIncrementalArtifactSession,
  runIncrementalArtifactCycle,
} from "../src/incremental-artifact-session.ts";
import { Deck } from "../src/index.ts";
import { PipelineArtifactCollection } from "../src/pipeline-artifacts.ts";
import { compileSource, projectSource, renderSource } from "../src/pipeline-runner.ts";

export type MetricRun = {
  readonly name: string;
  readonly valueMs: number;
};

export type MetricSummary = {
  readonly name: string;
  readonly samples: readonly number[];
  readonly averageMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly p95Ms: number;
};

type FixtureName = "minimal" | "text-heavy";

type Options = {
  readonly fixture: FixtureName | "all";
  readonly iterations: number;
  readonly json: boolean;
};

type Fixture = {
  readonly name: FixtureName;
  createDeck(options?: FixtureDeckOptions): Deck<void, any>;
};

type FixtureDeckOptions = {
  readonly editedText?: () => string;
};

const fixtures: readonly Fixture[] = [
  {
    name: "minimal",
    createDeck(options) {
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.slide({ name: "Minimal" }, () => (
        <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>{options?.editedText?.() ?? "hello"}</p>
      ));
      return deck;
    },
  },
  {
    name: "text-heavy",
    createDeck(options) {
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      for (let slide = 0; slide < 8; slide += 1) {
        deck.slide({ name: `Text ${slide + 1}` }, () => (
          <>
            {Array.from({ length: 24 }, (_, index) => (
              <p
                style={{
                  color: index % 2 === 0 ? "#111827" : "#2563EB",
                  fontSize: 11 + (index % 4),
                  height: 0.35,
                  width: 2.6,
                  x: 0.5 + (index % 3) * 3,
                  y: 0.35 + Math.floor(index / 3) * 0.55,
                }}
              >
                {slide === 0 && index === 0
                  ? (options?.editedText?.() ?? `Row ${index + 1}: performance calculator text`)
                  : `Row ${index + 1}: performance calculator text`}
              </p>
            ))}
          </>
        ));
      }
      return deck;
    },
  },
];

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export function metricSummary(name: string, samples: readonly number[]): MetricSummary {
  if (samples.length === 0) {
    throw new Error(`Metric ${name} has no samples.`);
  }

  return {
    averageMs: average(samples),
    maxMs: Math.max(...samples),
    minMs: Math.min(...samples),
    name,
    p95Ms: percentile(samples, 95),
    samples,
  };
}

export function summarizeMetricRuns(runs: readonly MetricRun[]): readonly MetricSummary[] {
  const byName = new Map<string, number[]>();
  for (const run of runs) {
    const samples = byName.get(run.name) ?? [];
    samples.push(run.valueMs);
    byName.set(run.name, samples);
  }

  return [...byName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, samples]) => metricSummary(name, samples));
}

async function timed(name: string, operation: () => void | Promise<void>): Promise<MetricRun> {
  const startedAt = performance.now();
  await operation();
  return { name, valueMs: roundMs(performance.now() - startedAt) };
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

async function collectFixtureRuns(
  fixture: Fixture,
  iterations: number,
): Promise<readonly MetricRun[]> {
  const runs: MetricRun[] = [];

  for (let index = 0; index < iterations; index += 1) {
    runs.push(
      await timed("compile", () => {
        const deck = fixture.createDeck();
        const compile = compileSource(deck);
        if (!compile.graph || !compile.ok) {
          throw new Error(`${fixture.name} compile failed.`);
        }
      }),
    );

    runs.push(
      await timed("project", async () => {
        const deck = fixture.createDeck();
        const project = await projectSource({
          source: deck,
          options: deck.options,
          projectOptions: { inspection: "none" },
        });
        if (!project.projection || !project.ok) {
          throw new Error(`${fixture.name} project failed.`);
        }
      }),
    );

    runs.push(
      await timed("render", async () => {
        const deck = fixture.createDeck();
        const render = await renderSource({
          source: deck,
          options: deck.options,
        });
        if (!render.artifact || !render.ok) {
          throw new Error(`${fixture.name} render failed.`);
        }
      }),
    );

    const warmDeck = fixture.createDeck();
    const warmArtifacts = new PipelineArtifactCollection();
    const firstRender = await renderSource({
      source: warmDeck,
      options: warmDeck.options,
      artifacts: warmArtifacts,
    });
    if (!firstRender.artifact || !firstRender.ok) {
      throw new Error(`${fixture.name} warm setup render failed.`);
    }

    runs.push(
      await timed("warmRender", async () => {
        const render = await renderSource({
          source: warmDeck,
          options: warmDeck.options,
          artifacts: warmArtifacts,
        });
        if (!render.artifact || !render.ok) {
          throw new Error(`${fixture.name} warm render failed.`);
        }
      }),
    );

    let editedText = "before";
    const incrementalDeck = fixture.createDeck({
      editedText: () => editedText,
    });
    const incrementalSession = createIncrementalArtifactSession();
    const renderIncrementalCycle = async (sourceInvalidated: boolean) => {
      const render = await runIncrementalArtifactCycle(
        incrementalSession,
        sourceInvalidated
          ? { sourceInvalidation: { changedSourceIds: ["/project/src/deck.tsx"] } }
          : {},
        async () =>
          renderSource({
            source: incrementalDeck,
            options: incrementalDeck.options,
          }),
      );
      if (!render.artifact || !render.ok) {
        throw new Error(`${fixture.name} incremental render failed.`);
      }
    };

    await renderIncrementalCycle(false);
    runs.push(await timed("warmIncrementalRender", () => renderIncrementalCycle(false)));

    editedText = `first change ${index}`;
    runs.push(await timed("firstSourceChangeRender", () => renderIncrementalCycle(true)));

    editedText = `source change ${index}`;
    runs.push(await timed("sourceChangeRender", () => renderIncrementalCycle(true)));
  }

  return runs;
}

function parseOptions(args: readonly string[]): Options {
  let fixture: Options["fixture"] = "all";
  let iterations = 3;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--fixture" && next) {
      if (!["all", ...fixtures.map((item) => item.name)].includes(next)) {
        throw new Error(`Unknown fixture: ${next}`);
      }
      fixture = next as Options["fixture"];
      index += 1;
      continue;
    }
    if (arg === "--iterations" && next) {
      iterations = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error("--iterations must be a positive integer.");
  }

  return { fixture, iterations, json };
}

async function run(options: Options) {
  const selected =
    options.fixture === "all"
      ? fixtures
      : fixtures.filter((fixture) => fixture.name === options.fixture);
  const results = [];

  for (const fixture of selected) {
    const runs = await collectFixtureRuns(fixture, options.iterations);
    results.push({
      fixture: fixture.name,
      iterations: options.iterations,
      metrics: summarizeMetricRuns(runs),
    });
  }

  return { results };
}

function printText(result: Awaited<ReturnType<typeof run>>): void {
  for (const fixture of result.results) {
    console.log(`\n${fixture.fixture}`);
    for (const metric of fixture.metrics) {
      console.log(
        [
          `  ${metric.name.padEnd(10)}`,
          `avg=${metric.averageMs.toFixed(3)}ms`,
          `p95=${metric.p95Ms.toFixed(3)}ms`,
          `min=${metric.minMs.toFixed(3)}ms`,
          `max=${metric.maxMs.toFixed(3)}ms`,
        ].join(" "),
      );
    }
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const result = await run(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printText(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

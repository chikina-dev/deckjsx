#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const FIXTURE_DIR = "tests/types/perf";
const FIXTURE_SOURCE_FILE = `${FIXTURE_DIR}/fixtures.tsx`;

const PUBLISHED_DECKJSX_PATHS = {
  deckjsx: ["dist/index.d.mts"],
  "deckjsx/adapter": ["dist/adapter/index.d.mts"],
  "deckjsx/inspect": ["dist/inspect.d.mts"],
  "deckjsx/integration": ["dist/integration.d.mts"],
  "deckjsx/plugin-validation": ["dist/plugin-validation.d.mts"],
  "deckjsx/jsx-dev-runtime": ["dist/jsx-dev-runtime.d.mts"],
  "deckjsx/jsx-runtime": ["dist/jsx-runtime.d.mts"],
};

const PUBLISHED_DECKJSX_STYLE_PATHS = {
  ...PUBLISHED_DECKJSX_PATHS,
  "deckjsx/style": ["dist/style/public.d.mts"],
};

const NODE_AUTHORING_CONSUMER_PATHS = {
  "@deckjsx/node": ["plugins/node/src/index.ts"],
  ...PUBLISHED_DECKJSX_PATHS,
};

const NODE_PLUGIN_PATHS = {
  "@/scripts/*": ["scripts/*"],
  "@/*": ["plugins/node/*"],
  "@deckjsx/node": ["plugins/node/src/index.ts"],
  "@deckjsx/node/dev": ["plugins/node/src/dev.ts"],
  ...PUBLISHED_DECKJSX_PATHS,
};

const TYPE_PERFORMANCE_PROFILES = {
  "authoring-root-import": {
    checkTimeMs: 5000,
    instantiations: 310000,
    memoryKb: 500000,
  },
  "published-root-import": {
    checkTimeMs: 5000,
    instantiations: 5000,
    memoryKb: 250000,
  },
  "published-deck-import": {
    checkTimeMs: 5000,
    instantiations: 5000,
    memoryKb: 250000,
  },
  "published-style-subpath": {
    checkTimeMs: 10000,
    instantiations: 5000,
    memoryKb: 250000,
  },
  "source-style-subpath": {
    checkTimeMs: 3000,
    instantiations: 310000,
    memoryKb: 500000,
  },
  "source-style-types-only": {
    checkTimeMs: 3000,
    instantiations: 310000,
    memoryKb: 500000,
  },
  "source-style-values-only": {
    checkTimeMs: 3000,
    instantiations: 310000,
    memoryKb: 500000,
  },
  "source-stylesheet": {
    checkTimeMs: 3000,
    instantiations: 310000,
    memoryKb: 500000,
  },
  "published-stylesheet": {
    checkTimeMs: 8000,
    instantiations: 15000,
    memoryKb: 250000,
  },
  "node-authoring-consumer": {
    checkTimeMs: 5000,
    instantiations: 15000,
    memoryKb: 250000,
  },
  "authoring-surface": {
    checkTimeMs: 5000,
    instantiations: 350000,
    memoryKb: 500000,
  },
  "node-plugin": {
    checkTimeMs: 5000,
    instantiations: 50000,
    memoryKb: 500000,
  },
};

const TYPE_PERFORMANCE_PROFILE_REGIONS = Object.fromEntries(
  Object.keys(TYPE_PERFORMANCE_PROFILES)
    .filter((profile) => profile !== "node-plugin")
    .map((profile) => [profile, profile]),
);

const TYPE_PERFORMANCE_RUN_PROFILES = Object.keys(TYPE_PERFORMANCE_PROFILES);

const METRIC_PATTERNS = {
  checkTimeMs: /^Check time:\s+([\d.]+)s$/m,
  files: /^Files:\s+(\d+)$/m,
  instantiations: /^Instantiations:\s+(\d+)$/m,
  memoryKb: /^Memory used:\s+(\d+)K$/m,
  totalTimeMs: /^Total time:\s+([\d.]+)s$/m,
  types: /^Types:\s+(\d+)$/m,
};

function parseExtendedDiagnostics(output) {
  return {
    checkTimeMs: parseSecondsMetric(output, "checkTimeMs"),
    files: parseIntegerMetric(output, "files"),
    instantiations: parseIntegerMetric(output, "instantiations"),
    memoryKb: parseIntegerMetric(output, "memoryKb"),
    totalTimeMs: parseSecondsMetric(output, "totalTimeMs"),
    types: parseIntegerMetric(output, "types"),
  };
}

function summarizeTypePerformance(metrics, budgets) {
  const summary = {
    checkTimeMs: budgetSummary(metrics.checkTimeMs, budgets.checkTimeMs),
    instantiations: budgetSummary(metrics.instantiations, budgets.instantiations),
    memoryKb: budgetSummary(metrics.memoryKb, budgets.memoryKb),
  };
  return {
    budgets: summary,
    ok: Object.values(summary).every((item) => item.ok),
  };
}

function budgetSummary(actual, budget) {
  return { actual, budget, ok: actual <= budget };
}

function parseIntegerMetric(output, metric) {
  const match = METRIC_PATTERNS[metric].exec(output);
  if (!match?.[1]) {
    throw new Error(`Missing TypeScript extended diagnostics metric: ${metric}`);
  }
  return Number.parseInt(match[1], 10);
}

function parseSecondsMetric(output, metric) {
  const match = METRIC_PATTERNS[metric].exec(output);
  if (!match?.[1]) {
    throw new Error(`Missing TypeScript extended diagnostics metric: ${metric}`);
  }
  return Math.round(Number.parseFloat(match[1]) * 1000);
}

function formatTypePerformanceProgress(profile, index, total) {
  return `[${index + 1}/${total}] measuring ${profile}...`;
}

function pathsForGeneratedProject(profile) {
  if (profile === "authoring-root-import" || profile === "authoring-surface") {
    return PUBLISHED_DECKJSX_STYLE_PATHS;
  }
  if (profile === "node-authoring-consumer") {
    return NODE_AUTHORING_CONSUMER_PATHS;
  }
  if (profile === "published-style-subpath") {
    return PUBLISHED_DECKJSX_STYLE_PATHS;
  }
  if (profile.startsWith("published-")) {
    return PUBLISHED_DECKJSX_PATHS;
  }
  return undefined;
}

function relativePathsForGeneratedProject(paths, generatedRoot) {
  return Object.fromEntries(
    Object.entries(paths).map(([specifier, targets]) => [
      specifier,
      targets.map((target) => {
        const relative = path.relative(generatedRoot, path.resolve(REPO_ROOT, target));
        const normalized = relative.split(path.sep).join("/");
        return normalized.startsWith(".") ? normalized : `./${normalized}`;
      }),
    ]),
  );
}

function typePerformanceProjectPathForProfile(profile, generatedRoot) {
  if (profile === "root") {
    return undefined;
  }
  if (!(profile in TYPE_PERFORMANCE_PROFILE_REGIONS)) {
    return profile === "node-plugin"
      ? path.join(generatedRoot, "node-plugin-tsconfig.json")
      : undefined;
  }
  return path.join(generatedRoot, "tsconfig.json");
}

function typePerformanceFixturePathForProfile(profile, generatedRoot) {
  if (!(profile in TYPE_PERFORMANCE_PROFILE_REGIONS)) {
    return undefined;
  }
  return path.join(generatedRoot, "fixture.tsx");
}

function typePerformanceProjectConfigForProfile(profile, generatedRoot) {
  if (profile === "node-plugin") {
    return nodePluginTypePerformanceProjectConfig(generatedRoot);
  }

  const fixture = typePerformanceFixturePathForProfile(profile, generatedRoot);
  if (!fixture) {
    return undefined;
  }

  return {
    extends: path.join(REPO_ROOT, "tsconfig.json"),
    compilerOptions: {
      ignoreDeprecations: "6.0",
      typeRoots: [path.join(REPO_ROOT, "node_modules", "@types")],
      ...(pathsForGeneratedProject(profile)
        ? {
            allowImportingTsExtensions: false,
            paths: {
              ...relativePathsForGeneratedProject(pathsForGeneratedProject(profile), generatedRoot),
              ...(profile === "node-authoring-consumer"
                ? {
                    rolldown: ["./rolldown-shim.d.ts"],
                    "rolldown/parseAst": ["./rolldown-shim.d.ts"],
                  }
                : {}),
            },
          }
        : {}),
    },
    include: [path.relative(generatedRoot, fixture)],
    exclude: [],
  };
}

function nodePluginTypePerformanceProjectConfig(generatedRoot) {
  return {
    extends: path.join(REPO_ROOT, "plugins/node/tsconfig.json"),
    compilerOptions: {
      ignoreDeprecations: "6.0",
      paths: {
        ...relativePathsForGeneratedProject(NODE_PLUGIN_PATHS, generatedRoot),
        rolldown: ["./rolldown-shim.d.ts"],
        "rolldown/parseAst": ["./rolldown-shim.d.ts"],
      },
      typeRoots: [path.join(REPO_ROOT, "node_modules", "@types")],
    },
    include: [
      path.join(REPO_ROOT, "plugins/node/src"),
      path.join(REPO_ROOT, "plugins/node/tests"),
      path.join(REPO_ROOT, "plugins/node/tests/types"),
    ],
    exclude: [path.join(REPO_ROOT, "plugins/node/dist")],
  };
}

function nodePluginRolldownShimPath(generatedRoot) {
  return path.join(generatedRoot, "rolldown-shim.d.ts");
}

function nodePluginRolldownShimSource() {
  return `
declare module "rolldown" {
  export type OutputChunk = {
    readonly type: "chunk";
    readonly code: string;
    readonly moduleIds: readonly string[];
    readonly isEntry?: boolean;
  };

  export type OutputAsset = {
    readonly type: "asset";
    readonly fileName: string;
    readonly source: unknown;
  };

  export type OutputItem = OutputAsset | OutputChunk;

  export type Plugin = {
    readonly name?: string;
    buildStart?(): void;
    load?(id: string): string | undefined | null | Promise<string | undefined | null>;
    moduleParsed?(info: { readonly id: string }): void;
    resolveId?(
      source: string,
    ):
      | string
      | { readonly id: string; readonly external?: boolean }
      | undefined
      | null
      | Promise<string | { readonly id: string; readonly external?: boolean } | undefined | null>;
    watchChange?(id: string): void;
    transform?:
      | ((code: string, id: string) => TransformResult | Promise<TransformResult>)
      | {
          readonly filter?: unknown;
          handler(code: string, id: string): TransformResult | Promise<TransformResult>;
        };
  };

  export type TransformResult =
    | undefined
    | null
    | string
    | {
        readonly code: string;
        readonly map?: unknown;
      };

  export type WatchOptions = {
    readonly input?: string;
    readonly cwd?: string;
    readonly platform?: "node" | "browser" | string;
    readonly external?: (id: string) => boolean;
    readonly plugins?: readonly Plugin[];
    readonly transform?: unknown;
    readonly [key: string]: unknown;
  };

  export type RolldownBuild = {
    readonly watchFiles: Promise<readonly string[]> | readonly string[];
    generate(options?: object): Promise<{ readonly output: readonly OutputItem[] }>;
    close(): Promise<void> | void;
  };

  export type RolldownWatcher = {
    on(
      event: string,
      listener: (...args: readonly unknown[]) => void | Promise<void>,
    ): RolldownWatcher;
    off?(
      event: string,
      listener: (...args: readonly unknown[]) => void | Promise<void>,
    ): RolldownWatcher;
    clear?(event: string): void;
    close(): Promise<void> | void;
  };

  export function rolldown(options: WatchOptions): Promise<RolldownBuild>;
  export function watch(options: WatchOptions): RolldownWatcher;
}

declare module "rolldown/parseAst" {
  export function parseAst(
    code: string,
    options: { readonly lang: string; readonly sourceType: string },
    filename?: string,
  ): any;
}
`.trimStart();
}

function extractTypePerformanceFixture(source, profile) {
  const region = TYPE_PERFORMANCE_PROFILE_REGIONS[profile];
  if (!region) {
    return undefined;
  }

  const start = `//#region profile:${region}`;
  const end = `//#endregion profile:${region}`;
  const startIndex = source.indexOf(start);
  if (startIndex === -1) {
    throw new Error(`Missing type performance fixture region: ${region}`);
  }
  const contentStart = startIndex + start.length;
  const endIndex = source.indexOf(end, contentStart);
  if (endIndex === -1) {
    throw new Error(`Missing type performance fixture end region: ${region}`);
  }
  return `${source.slice(contentStart, endIndex).trim()}\n`;
}

async function materializeTypePerformanceProject(profile, generatedRoot) {
  const project = typePerformanceProjectPathForProfile(profile, generatedRoot);
  const config = typePerformanceProjectConfigForProfile(profile, generatedRoot);
  if (!project || !config) {
    return project;
  }

  await mkdir(generatedRoot, { recursive: true });
  if (profile === "node-plugin" || profile === "node-authoring-consumer") {
    await writeFile(nodePluginRolldownShimPath(generatedRoot), nodePluginRolldownShimSource());
  }
  if (profile === "node-plugin") {
    await writeFile(project, `${JSON.stringify(config, null, 2)}\n`);
    return project;
  }

  const source = await readFile(path.join(REPO_ROOT, FIXTURE_SOURCE_FILE), "utf8");
  const fixture = extractTypePerformanceFixture(source, profile);
  if (!fixture) {
    throw new Error(`No generated fixture for type performance profile: ${profile}`);
  }
  await writeFile(typePerformanceFixturePathForProfile(profile, generatedRoot), fixture);
  await writeFile(project, `${JSON.stringify(config, null, 2)}\n`);
  return project;
}

async function removeLegacyGeneratedProjectArtifacts() {
  await rm(path.join(REPO_ROOT, ".tmp", "type-performance"), {
    recursive: true,
    force: true,
  });
}

async function runTscExtendedDiagnostics(project) {
  const executable = path.join(REPO_ROOT, "node_modules", ".bin", "tsc");
  const args = ["--noEmit", "--extendedDiagnostics", "--pretty", "false"];
  if (project) {
    args.push("-p", project);
  }
  const result = await spawnToResult(executable, args);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0) {
    throw new Error(output.trim() || `tsc exited with status ${result.status}`);
  }
  return parseExtendedDiagnostics(output);
}

async function buildCurrentPublicDeclarations() {
  const executable = path.join(REPO_ROOT, "node_modules", ".bin", "vp");
  const result = await spawnToResult(executable, ["pack"]);
  if (result.status !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.trim();
    throw new Error(output || `vp pack exited with status ${result.status}`);
  }
}

function spawnToResult(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function formatText(metrics, summary, profile = "root") {
  const rows = [
    [
      "checkTime",
      `${formatMs(metrics.checkTimeMs)} / budget ${formatMs(summary.budgets.checkTimeMs.budget)}`,
      summary.budgets.checkTimeMs.ok,
    ],
    [
      "instantiations",
      `${metrics.instantiations.toLocaleString()} / budget ${summary.budgets.instantiations.budget.toLocaleString()}`,
      summary.budgets.instantiations.ok,
    ],
    [
      "memory",
      `${metrics.memoryKb.toLocaleString()}K / budget ${summary.budgets.memoryKb.budget.toLocaleString()}K`,
      summary.budgets.memoryKb.ok,
    ],
    ["types", metrics.types.toLocaleString(), true],
    ["files", metrics.files.toLocaleString(), true],
    ["totalTime", formatMs(metrics.totalTimeMs), true],
  ];
  return [
    `TypeScript type performance (${profile})`,
    ...rows.map(
      ([name, value, ok]) =>
        `  ${name.padEnd(15)} ${String(value).padStart(24)} ${ok ? "ok" : "over"}`,
    ),
  ].join("\n");
}

function formatMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length > 0) {
    throw new Error("type-performance does not accept CLI options.");
  }

  const profiles = TYPE_PERFORMANCE_RUN_PROFILES;
  const results = [];
  const generatedRoot = await mkdtemp(path.join(tmpdir(), "deckjsx-type-performance-"));

  try {
    console.error("building current public declarations...");
    await buildCurrentPublicDeclarations();
    await removeLegacyGeneratedProjectArtifacts();
    for (const [index, profile] of profiles.entries()) {
      const project = await materializeTypePerformanceProject(profile, generatedRoot);
      console.error(formatTypePerformanceProgress(profile, index, profiles.length));
      const metrics = await runTscExtendedDiagnostics(project);
      const budgets = TYPE_PERFORMANCE_PROFILES[profile];
      const summary = summarizeTypePerformance(metrics, budgets);
      results.push({ metrics, profile, project, summary });
    }
  } finally {
    await rm(generatedRoot, { recursive: true, force: true });
  }

  console.log(
    results.map((item) => formatText(item.metrics, item.summary, item.profile)).join("\n\n"),
  );

  if (!results.every((item) => item.summary.ok)) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

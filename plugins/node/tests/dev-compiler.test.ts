import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { Deck } from "deckjsx";
import { pptx } from "deckjsx/adapter";
import {
  getArtifactWriteToken,
  recordArtifactWrite,
  type ArtifactWriteToken,
} from "deckjsx/integration";
import { jsx } from "deckjsx/jsx-runtime";
import {
  classifyDevWrites,
  devOutputIgnoreFiles,
  normalizeDevOutputPaths,
} from "../src/tracked-output-coordinator.ts";
import { createDevArtifactPlanApplier } from "../src/dev-artifact-plan-applier.ts";
import {
  createDevModuleGraphSnapshot,
  filterChangedSourceIdsForDevGraph,
} from "../src/dev-module-graph.ts";
import { createDevChangeScheduler } from "../src/dev-change-scheduler.ts";
import { createEntryExecutionHost } from "../src/entry-execution-host.ts";
import {
  createRolldownWatchAdapter,
  createRolldownWatchOptions,
} from "../src/rolldown-watch-adapter.ts";
import { createDeckjsxDevCompiler } from "../src/dev-compiler.ts";
import { observeDeckjsxDevAssetFile } from "../src/dev-asset-observer.ts";
import type { DevAssetFileWatcher } from "../src/dev-asset-file-watcher.ts";

type TestWriteResult =
  | { readonly status: "created" }
  | { readonly status: "patched" }
  | {
      readonly status: "failed";
      readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
    };

function createNoopWatcher() {
  return {
    on(_event: string, _listener: (...args: readonly unknown[]) => void | Promise<void>) {
      return this;
    },
    off(_event: string, _listener: (...args: readonly unknown[]) => void | Promise<void>) {
      return this;
    },
    clear(_event: string) {},
    async close() {},
  };
}

function outputDirectory(options: { readonly output?: unknown }): string {
  const output = Array.isArray(options.output) ? options.output[0] : options.output;
  if (typeof output === "object" && output !== null && "dir" in output) {
    return String(output.dir);
  }
  throw new Error("expected watch output directory");
}

async function recordRenderedWrite(path: string, result: TestWriteResult) {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.slide({ name: "Dev" }, () => jsx("p", { children: "Dev" }));
  const render = await deck.render(pptx());
  return recordArtifactWrite(getArtifactWriteToken(render), { path, result });
}

describe("@deckjsx/node dev compiler output coordinator", () => {
  test("retains only the primary --out write while allowing extra output writes", () => {
    const result = classifyDevWrites({
      cwd: "/project",
      out: "output.pptx",
      outputs: ["output.pptx", "components.pptx"],
      writes: [
        { cycle: 1, slot: 0, path: "/project/output.pptx", result: { status: "created" } },
        { cycle: 1, slot: 1, path: "/project/components.pptx", result: { status: "created" } },
      ],
    });

    expect(result.records).toEqual([
      { path: "/project/output.pptx", tracked: true, result: { status: "created" } },
      { path: "/project/components.pptx", tracked: false, result: { status: "created" } },
    ]);
    expect(result.retainedSlots).toEqual([0]);
    expect(result.diagnostics).toEqual([]);
  });

  test("reports missing tracked output without retaining new slots", () => {
    const result = classifyDevWrites({
      cwd: "/project",
      out: "output.pptx",
      outputs: ["output.pptx", "components.pptx"],
      writes: [
        { cycle: 1, slot: 0, path: "/project/components.pptx", result: { status: "created" } },
      ],
    });

    expect(result.records).toEqual([
      { path: "/project/components.pptx", tracked: false, result: { status: "created" } },
    ]);
    expect(result.retainedSlots).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        severity: "error",
        code: "deckjsx.node.dev.missingTrackedOutput",
        title: "Tracked output was not written.",
        message: "output.pptx",
        primary: {
          file: "/project/output.pptx",
        },
        phase: "output",
        help: [
          "Make sure the entry calls write(...) for the same path passed to deckjsx dev --out.",
        ],
      },
    ]);
  });

  test("blocks artifact updates when the tracked output write failed", () => {
    const result = classifyDevWrites({
      cwd: "/project",
      out: "output.pptx",
      outputs: ["output.pptx"],
      writes: [
        {
          cycle: 1,
          slot: 0,
          path: "/project/output.pptx",
          result: {
            status: "failed",
            diagnostics: [
              {
                code: "deckjsx.node.write.failed",
                message: "write failed",
                path: "/project/output.pptx",
              },
            ],
          },
        },
      ],
    });

    expect(result.records).toEqual([
      {
        path: "/project/output.pptx",
        tracked: true,
        result: {
          status: "failed",
          diagnostics: [
            {
              code: "deckjsx.node.write.failed",
              message: "write failed",
              path: "/project/output.pptx",
            },
          ],
        },
      },
    ]);
    expect(result.retainedSlots).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        severity: "error",
        code: "deckjsx.node.dev.outputWriteFailed",
        title: "Output write failed.",
        message: "output.pptx",
        primary: {
          file: "/project/output.pptx",
        },
        phase: "output",
        notes: ["deckjsx.node.write.failed: write failed"],
      },
    ]);
  });

  test("normalizes output paths and ignore files", () => {
    expect(
      normalizeDevOutputPaths({
        cwd: "/project",
        out: "output.pptx",
        outputs: ["components.pptx", "output.pptx", "/project/components.pptx"],
      }),
    ).toEqual({
      out: "/project/output.pptx",
      outputs: ["/project/output.pptx", "/project/components.pptx"],
    });

    expect(
      devOutputIgnoreFiles({
        cwd: "/project",
        out: "output.pptx",
        outputs: ["components.pptx"],
      }),
    ).toEqual([
      "/project/.components.pptx.deckjsx-lock",
      "/project/.output.pptx.deckjsx-lock",
      "/project/components.pptx",
      "/project/output.pptx",
    ]);
  });

  test("classifies writes from a normalized cwd", () => {
    const cwd = path.join(".", "relative-project");
    const out = "output.pptx";
    const absoluteOut = path.resolve(cwd, out);

    const result = classifyDevWrites({
      cwd,
      out,
      writes: [{ cycle: 1, slot: 0, path: out, result: { status: "created" } }],
    });

    expect(result.records).toEqual([
      {
        path: absoluteOut,
        tracked: true,
        result: { status: "created" },
      },
    ]);
    expect(result.retainedSlots).toEqual([0]);
    expect(result.diagnostics).toEqual([]);
  });
});

describe("@deckjsx/node dev artifact plan applier", () => {
  test("retains slots only when an artifact plan is ready", () => {
    const retainedSlots: Array<readonly number[]> = [];
    const applier = createDevArtifactPlanApplier({
      session: {
        get cycle() {
          return 0;
        },
        beginCycle() {
          throw new Error("not used");
        },
        snapshot() {
          return { cycle: 0, writes: [] };
        },
        retainArtifactSlots(slots) {
          retainedSlots.push(slots);
        },
      },
    });

    applier.apply({
      status: "ready",
      writes: [],
      retainedSlots: [0, 2],
      diagnostics: [],
    });
    applier.apply({
      status: "blocked",
      writes: [],
      retainedSlots: [1],
      diagnostics: [],
    });

    expect(retainedSlots).toEqual([[0, 2]]);
  });
});

describe("@deckjsx/node dev module graph", () => {
  test("combines module ids, watch files, and observed assets while filtering dev outputs", () => {
    const graph = createDevModuleGraphSnapshot({
      cwd: "/project",
      moduleIds: ["/project/src/main.tsx", "/project/src/component.tsx"],
      watchFiles: [
        "/project/src/main.tsx",
        "/project/output.pptx",
        "/project/.output.pptx.deckjsx-lock",
        "/project/.output.pptx.123.456.deckjsx-tmp",
        "/project/.deckjsx/dev/bundle-1.mjs",
      ],
      observedAssetFiles: ["/project/assets/hero.png"],
      ignoredFiles: ["/project/output.pptx", "/project/.output.pptx.deckjsx-lock"],
    });

    expect(graph.files).toEqual([
      "/project/assets/hero.png",
      "/project/src/component.tsx",
      "/project/src/main.tsx",
    ]);
    expect(graph.moduleIds).toEqual(["/project/src/component.tsx", "/project/src/main.tsx"]);
    expect(graph.observedAssetFiles).toEqual(["/project/assets/hero.png"]);
  });

  test("passes through changed ids that are known to the dev graph", () => {
    const graph = createDevModuleGraphSnapshot({
      cwd: "/project",
      moduleIds: ["/project/src/main.tsx"],
      watchFiles: ["/project/src/main.tsx"],
      observedAssetFiles: ["/project/assets/hero.png"],
      ignoredFiles: ["/project/output.pptx"],
    });

    expect(
      filterChangedSourceIdsForDevGraph({
        graph,
        changedSourceIds: [
          "/project/src/main.tsx",
          "/project/assets/hero.png",
          "/project/output.pptx",
        ],
      }),
    ).toEqual(["/project/assets/hero.png", "/project/src/main.tsx"]);
  });
});

describe("@deckjsx/node dev change scheduler", () => {
  test("reruns the retained executable build for observed asset invalidations", async () => {
    let adapterCalls = 0;
    const scheduler = createDevChangeScheduler({
      cwd: "/project",
      async nextSourceSnapshot() {
        adapterCalls += 1;
        return {
          status: "executable",
          code: `generated ${adapterCalls}`,
          moduleIds: ["/project/src/main.tsx"],
          watchFiles: ["/project/src/main.tsx"],
          changedSourceIds: ["/project/src/main.tsx"],
        };
      },
    });
    const firstBuild = await scheduler.nextSourceSnapshot();
    if (!("code" in firstBuild)) {
      throw new Error("expected executable build");
    }
    const graph = createDevModuleGraphSnapshot({
      cwd: "/project",
      moduleIds: firstBuild.moduleIds,
      watchFiles: firstBuild.watchFiles,
      observedAssetFiles: ["/project/assets/hero.png"],
    });
    scheduler.commitExecutableSnapshot({ graph, sourceSnapshot: firstBuild });

    scheduler.invalidateAssets(["/project/assets/hero.png"]);
    const secondBuild = await scheduler.nextSourceSnapshot();

    expect(adapterCalls).toBe(1);
    expect(secondBuild).toMatchObject({ code: "generated 1" });
    expect(scheduler.consumeChangedSourceIds(secondBuild)).toEqual(["/project/assets/hero.png"]);
  });

  test("waits for adapter output for source invalidations", async () => {
    let releaseSecondBuild!: () => void;
    let resolved = false;
    const scheduler = createDevChangeScheduler({
      cwd: "/project",
      async nextSourceSnapshot() {
        if (!resolved) {
          resolved = true;
          return {
            status: "executable",
            code: "generated 1",
            moduleIds: ["/project/src/main.tsx"],
            watchFiles: ["/project/src/main.tsx"],
            changedSourceIds: ["/project/src/main.tsx"],
          };
        }
        await new Promise<void>((resolve) => {
          releaseSecondBuild = resolve;
        });
        return {
          status: "executable",
          code: "generated 2",
          moduleIds: ["/project/src/main.tsx"],
          watchFiles: ["/project/src/main.tsx"],
          changedSourceIds: ["/project/src/main.tsx"],
        };
      },
    });
    const firstBuild = await scheduler.nextSourceSnapshot();
    if (!("code" in firstBuild)) {
      throw new Error("expected executable build");
    }
    scheduler.commitExecutableSnapshot({
      graph: createDevModuleGraphSnapshot({
        cwd: "/project",
        moduleIds: firstBuild.moduleIds,
        watchFiles: firstBuild.watchFiles,
      }),
      sourceSnapshot: firstBuild,
    });

    scheduler.invalidateSources(["/project/src/main.tsx"]);
    const secondBuildPromise = scheduler.nextSourceSnapshot();
    await Promise.resolve();
    let settled = false;
    void secondBuildPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseSecondBuild();
    await expect(secondBuildPromise).resolves.toMatchObject({ code: "generated 2" });
  });

  test("lets source invalidations override asset cached reruns", async () => {
    let releaseSecondBuild!: () => void;
    let buildCalls = 0;
    const scheduler = createDevChangeScheduler({
      cwd: "/project",
      async nextSourceSnapshot() {
        buildCalls += 1;
        if (buildCalls === 2) {
          await new Promise<void>((resolve) => {
            releaseSecondBuild = resolve;
          });
        }
        return {
          status: "executable",
          code: `generated ${buildCalls}`,
          moduleIds: ["/project/src/main.tsx"],
          watchFiles: ["/project/src/main.tsx"],
          changedSourceIds: ["/project/src/main.tsx"],
        };
      },
    });
    const firstBuild = await scheduler.nextSourceSnapshot();
    if (!("code" in firstBuild)) {
      throw new Error("expected executable build");
    }
    scheduler.commitExecutableSnapshot({
      graph: createDevModuleGraphSnapshot({
        cwd: "/project",
        moduleIds: firstBuild.moduleIds,
        watchFiles: firstBuild.watchFiles,
        observedAssetFiles: ["/project/assets/hero.png"],
      }),
      sourceSnapshot: firstBuild,
    });

    const secondBuildPromise = scheduler.nextSourceSnapshot();
    scheduler.invalidateAssets(["/project/assets/hero.png"]);
    scheduler.invalidateSources(["/project/src/main.tsx"]);
    await Promise.resolve();
    let settled = false;
    void secondBuildPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseSecondBuild();
    await expect(secondBuildPromise).resolves.toMatchObject({ code: "generated 2" });
  });
});

describe("@deckjsx/node entry execution host", () => {
  test("executes generated modules from the project cwd and restores cwd", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-host-"));
    const report = path.join(project, "cwd.txt");
    const realProject = await realpath(project);
    const previousCwd = process.cwd();
    const host = createEntryExecutionHost({ cwd: project });

    await host.execute({
      code: [
        'import { writeFile } from "node:fs/promises";',
        `await writeFile(${JSON.stringify(report)}, process.cwd());`,
      ].join("\n"),
    });

    expect(await import("node:fs/promises").then((fs) => fs.readFile(report, "utf8"))).toBe(
      realProject,
    );
    expect(process.cwd()).toBe(previousCwd);
  });

  test("restores cwd after generated module failures", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-host-fail-"));
    const previousCwd = process.cwd();
    const host = createEntryExecutionHost({ cwd: root });

    await expect(host.execute({ code: 'throw new Error("entry exploded");' })).rejects.toThrow(
      "entry exploded",
    );
    expect(process.cwd()).toBe(previousCwd);
  });
});

describe("@deckjsx/node rolldown watch adapter", () => {
  test("satisfies the DevSourceProvider lifecycle and queued snapshot contract", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    let watchStarts = 0;
    let closeCalls = 0;
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      watchFactory() {
        watchStarts += 1;
        return {
          on(event: string, listener: (...args: unknown[]) => void) {
            listeners.set(event, listener);
            return this;
          },
          off() {
            return this;
          },
          clear() {},
          async close() {
            closeCalls += 1;
          },
        };
      },
    });

    adapter.start();
    adapter.start();
    listeners.get("event")?.({
      code: "ERROR",
      error: new Error("queued diagnostic"),
      result: {
        close: async () => undefined,
      },
    });

    await expect(adapter.nextSourceSnapshot()).resolves.toMatchObject({
      status: "diagnostic",
      diagnostics: [
        {
          code: "deckjsx.node.dev.bundleFailed",
          title: "Bundle failed.",
          message: "queued diagnostic",
        },
      ],
    });
    await adapter.close();

    expect(watchStarts).toBe(1);
    expect(closeCalls).toBe(1);
  });

  test("writes Rolldown watch output only under the ignored dev temp directory", () => {
    const options = createRolldownWatchOptions({
      cwd: "/project",
      entry: "/project/src/main.tsx",
      onBuildStart() {},
      onModuleId() {},
      onWatchChange() {},
    });

    expect(options.output).toMatchObject({
      dir: "/project/.deckjsx/dev",
      entryFileNames: "rolldown-watch-output.mjs",
    });
  });

  test("isolates real watch adapter output directories per compiler instance", async () => {
    const outputDirectories: string[] = [];
    const adapters = [
      createRolldownWatchAdapter({
        cwd: "/project",
        entry: "src/main.tsx",
        watchFactory(options) {
          outputDirectories.push(outputDirectory(options));
          return createNoopWatcher();
        },
      }),
      createRolldownWatchAdapter({
        cwd: "/project",
        entry: "src/main.tsx",
        watchFactory(options) {
          outputDirectories.push(outputDirectory(options));
          return createNoopWatcher();
        },
      }),
    ];

    adapters.forEach((adapter) => adapter.start());
    await Promise.all(adapters.map((adapter) => adapter.close()));

    expect(outputDirectories).toHaveLength(2);
    expect(outputDirectories[0]).not.toBe(outputDirectories[1]);
    for (const outputDirectory of outputDirectories) {
      expect(outputDirectory).toMatch(/^\/project\/\.deckjsx\/dev\/watch-/);
    }
  });

  test("generates one executable bundle from BUNDLE_END and closes the watch result", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const closed: string[] = [];
    const generated = {
      output: [
        {
          type: "chunk",
          code: 'console.log("deck");',
          moduleIds: ["/project/src/main.tsx", "/project/src/component.tsx"],
        },
      ],
    };
    const result = {
      watchFiles: Promise.resolve(["/project/src/main.tsx", "/project/src/theme.ts"]),
      generate: async () => generated,
      close: async () => {
        closed.push("result");
      },
    };
    let watchOptions: { plugins?: { watchChange?: (id: string) => void }[] } | undefined;
    const watcher = {
      on(event: string, listener: (...args: unknown[]) => void) {
        listeners.set(event, listener);
        return this;
      },
      off() {
        return this;
      },
      clear() {},
      async close() {
        closed.push("watcher");
      },
    };
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      watchFactory(options) {
        watchOptions = options as typeof watchOptions;
        return watcher;
      },
    });

    const buildPromise = adapter.nextSourceSnapshot();
    adapter.start();
    watchOptions?.plugins
      ?.find((plugin) => plugin.watchChange)
      ?.watchChange?.("/project/src/component.tsx");
    listeners.get("event")?.({
      code: "BUNDLE_END",
      duration: 10,
      output: [],
      result,
    });

    await expect(buildPromise).resolves.toEqual({
      status: "executable",
      code: 'console.log("deck");',
      moduleIds: ["/project/src/component.tsx", "/project/src/main.tsx"],
      watchFiles: ["/project/src/main.tsx", "/project/src/theme.ts"],
      changedSourceIds: ["/project/src/component.tsx"],
    });
    expect(closed).toEqual(["result"]);

    await adapter.close();
    expect(closed).toEqual(["result", "watcher"]);
  });

  test("executes the entry chunk when Rolldown returns multiple chunks", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const result = {
      watchFiles: Promise.resolve(["/project/src/main.tsx"]),
      generate: async () => ({
        output: [
          {
            type: "chunk",
            code: "helper chunk",
            moduleIds: ["/project/src/helper.ts"],
            isEntry: false,
          },
          {
            type: "chunk",
            code: "entry chunk",
            moduleIds: ["/project/src/main.tsx"],
            isEntry: true,
          },
        ],
      }),
      close: async () => undefined,
    };
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      watchFactory() {
        return {
          on(event: string, listener: (...args: unknown[]) => void) {
            listeners.set(event, listener);
            return this;
          },
          off() {
            return this;
          },
          clear() {},
          async close() {},
        };
      },
    });

    const buildPromise = adapter.nextSourceSnapshot();
    adapter.start();
    listeners.get("event")?.({
      code: "BUNDLE_END",
      duration: 10,
      output: [],
      result,
    });

    await expect(buildPromise).resolves.toMatchObject({
      code: "entry chunk",
      moduleIds: ["/project/src/helper.ts", "/project/src/main.tsx"],
    });
  });

  test("prefers BUNDLE_END output over regenerating watch results", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      watchFactory() {
        return {
          on(event: string, listener: (...args: unknown[]) => void) {
            listeners.set(event, listener);
            return this;
          },
          off() {
            return this;
          },
          clear() {},
          async close() {},
        };
      },
    });

    const buildPromise = adapter.nextSourceSnapshot();
    adapter.start();
    listeners.get("event")?.({
      code: "BUNDLE_END",
      duration: 10,
      output: [],
      result: {
        output: [
          {
            type: "chunk",
            code: "bundle end output",
            moduleIds: ["/project/src/main.tsx"],
            isEntry: true,
          },
        ],
        generate: async () => ({
          output: [
            {
              type: "chunk",
              code: "regenerated output",
              moduleIds: ["/project/src/main.tsx"],
              isEntry: true,
            },
          ],
        }),
        close: async () => undefined,
      },
    });

    await expect(buildPromise).resolves.toMatchObject({
      code: "bundle end output",
    });
  });

  test("reports bundle errors through the pending build instead of throwing from start", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      watchFactory() {
        return {
          on(event: string, listener: (...args: unknown[]) => void) {
            listeners.set(event, listener);
            return this;
          },
          off() {
            return this;
          },
          clear() {},
          async close() {},
        };
      },
    });

    const buildPromise = adapter.nextSourceSnapshot();
    adapter.start();
    listeners.get("event")?.({
      code: "ERROR",
      error: new Error("bundle exploded"),
      result: {
        close: async () => undefined,
      },
    });

    await expect(buildPromise).resolves.toEqual({
      status: "diagnostic",
      diagnostics: [
        {
          severity: "error",
          code: "deckjsx.node.dev.bundleFailed",
          title: "Bundle failed.",
          message: "bundle exploded",
          primary: {
            file: "/project/src/main.tsx",
          },
          labels: [{ message: "while bundling the deckjsx entry" }],
          help: ["Fix the bundling error and save again."],
        },
      ],
    });
  });

  test("normalizes Rolldown error location and frame into detailed diagnostics", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      watchFactory() {
        return {
          on(event: string, listener: (...args: unknown[]) => void) {
            listeners.set(event, listener);
            return this;
          },
          off() {
            return this;
          },
          clear() {},
          async close() {},
        };
      },
    });

    const buildPromise = adapter.nextSourceSnapshot();
    adapter.start();
    listeners.get("event")?.({
      code: "ERROR",
      error: {
        message: "Unexpected token",
        id: "/project/src/main.tsx",
        loc: { line: 3, column: 8 },
        frame: "1 | import x\n2 | \n3 | const = broken\n  |        ^",
      },
      result: {
        close: async () => undefined,
      },
    });

    await expect(buildPromise).resolves.toEqual({
      status: "diagnostic",
      diagnostics: [
        {
          severity: "error",
          code: "deckjsx.node.dev.bundleFailed",
          title: "Bundle failed.",
          message: "Unexpected token",
          primary: {
            file: "/project/src/main.tsx",
            line: 3,
            column: 8,
            sourceLine: "const = broken",
            spanLength: 1,
          },
          labels: [{ message: "while bundling this source" }],
          help: ["Fix the bundling error and save again."],
        },
      ],
    });
  });
});

describe("@deckjsx/node dev compiler", () => {
  test("runs one compilation, retains only the tracked output slot, and emits events", async () => {
    const events: string[] = [];
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      outputs: ["output.pptx", "components.pptx"],
      sourceProvider: {
        start() {
          events.push("sourceProvider:start");
        },
        async nextSourceSnapshot() {
          return {
            status: "executable",
            code: "generated code",
            moduleIds: ["/project/src/main.tsx"],
            watchFiles: ["/project/src/main.tsx"],
            changedSourceIds: ["/project/src/main.tsx"],
          };
        },
        async close() {
          events.push("sourceProvider:close");
        },
      },
      entryHost: {
        async execute(input) {
          expect(input.code).toBe("generated code");
          await recordRenderedWrite("/project/output.pptx", { status: "created" });
          await recordRenderedWrite("/project/components.pptx", { status: "created" });
        },
      },
    });
    compiler.on((event) => events.push(event.type));

    compiler.start();
    const result = await compiler.runNextCompilation();

    expect(result.ok).toBe(true);
    expect(result.status).toBe("artifactUpdated");
    if (!result.ok) {
      throw new Error("expected compilation to succeed");
    }
    expect(result.compilation).toBe(1);
    expect(result.retainedSlots).toEqual([0]);
    expect(result.writes).toEqual([
      { path: "/project/output.pptx", tracked: true, result: { status: "created" } },
      { path: "/project/components.pptx", tracked: false, result: { status: "created" } },
    ]);
    expect(result.sourceSnapshot).toEqual({
      status: "executable",
      code: "generated code",
      moduleIds: ["/project/src/main.tsx"],
      watchFiles: ["/project/src/main.tsx"],
      changedSourceIds: ["/project/src/main.tsx"],
    });
    expect(result.artifactPlan).toEqual({
      status: "ready",
      writes: [
        { path: "/project/output.pptx", tracked: true, result: { status: "created" } },
        { path: "/project/components.pptx", tracked: false, result: { status: "created" } },
      ],
      retainedSlots: [0],
      diagnostics: [],
    });
    expect(result.graph.files).toEqual(["/project/src/main.tsx"]);
    expect(events).toEqual([
      "sourceProvider:start",
      "compilerStarted",
      "compilationStarted",
      "compilationFinished",
    ]);
  });

  test("coalesces invalidations that arrive while a compilation is running", async () => {
    let buildCount = 0;
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      sourceProvider: {
        start() {},
        async nextSourceSnapshot() {
          buildCount += 1;
          return {
            status: "executable",
            code: `generated ${buildCount}`,
            moduleIds: ["/project/src/main.tsx", "/project/src/queued.tsx"],
            watchFiles: ["/project/src/main.tsx", "/project/src/queued.tsx"],
            changedSourceIds: buildCount === 1 ? ["/project/src/main.tsx"] : [],
          };
        },
        async close() {},
      },
      entryHost: {
        async execute() {
          if (buildCount === 1) {
            compiler.invalidate(["/project/src/queued.tsx"]);
          }
          await recordRenderedWrite("/project/output.pptx", { status: "created" });
        },
      },
    });

    compiler.start();
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({ ok: true });
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({ ok: true });
  });

  test("captures observed asset files into the compiler graph for the current cycle", async () => {
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      sourceProvider: {
        start() {},
        async nextSourceSnapshot() {
          return {
            status: "executable",
            code: "generated code",
            moduleIds: ["/project/src/main.tsx"],
            watchFiles: ["/project/src/main.tsx"],
            changedSourceIds: ["/project/src/main.tsx"],
          };
        },
        async close() {},
      },
      entryHost: {
        async execute() {
          observeDeckjsxDevAssetFile("/project/assets/hero.png");
          await recordRenderedWrite("/project/output.pptx", { status: "created" });
        },
      },
    });

    compiler.start();
    const result = await compiler.runNextCompilation();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected compilation to succeed");
    }
    expect(result.graph.observedAssetFiles).toEqual(["/project/assets/hero.png"]);
    expect(result.graph.files).toEqual(["/project/assets/hero.png", "/project/src/main.tsx"]);
  });

  test("filters queued and build invalidations through the previous dev graph", async () => {
    let buildCount = 0;
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      sourceProvider: {
        start() {},
        async nextSourceSnapshot() {
          buildCount += 1;
          return {
            status: "executable",
            code: `generated ${buildCount}`,
            moduleIds: ["/project/src/main.tsx"],
            watchFiles: ["/project/src/main.tsx"],
            changedSourceIds:
              buildCount === 1
                ? ["/project/src/main.tsx"]
                : ["/project/src/main.tsx", "/project/output.pptx", "/project/src/orphan.tsx"],
          };
        },
        async close() {},
      },
      entryHost: {
        async execute() {
          await recordRenderedWrite("/project/output.pptx", { status: "created" });
        },
      },
    });

    compiler.start();
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({ ok: true });
    compiler.invalidate([
      "/project/src/main.tsx",
      "/project/output.pptx",
      "/project/src/orphan.tsx",
    ]);
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({ ok: true });
  });

  test("shares one in-flight compilation when runNextCompilation is called concurrently", async () => {
    let releaseBuild!: () => void;
    let nextSourceSnapshotCalls = 0;
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      sourceProvider: {
        start() {},
        async nextSourceSnapshot() {
          nextSourceSnapshotCalls += 1;
          await new Promise<void>((resolve) => {
            releaseBuild = resolve;
          });
          return {
            status: "executable",
            code: "generated code",
            moduleIds: ["/project/src/main.tsx"],
            watchFiles: ["/project/src/main.tsx"],
            changedSourceIds: ["/project/src/main.tsx"],
          };
        },
        async close() {},
      },
      entryHost: {
        async execute() {
          await recordRenderedWrite("/project/output.pptx", { status: "created" });
        },
      },
    });

    compiler.start();
    const first = compiler.runNextCompilation();
    const second = compiler.runNextCompilation();
    releaseBuild();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(nextSourceSnapshotCalls).toBe(1);
    expect(firstResult).toBe(secondResult);
    expect(firstResult).toMatchObject({ ok: true, compilation: 1 });
  });

  test("updates observed asset watches and reruns the retained executable build for asset changes", async () => {
    let buildCalls = 0;
    let secondBuildStarted = false;
    const watchedFiles: Array<readonly string[]> = [];
    let notifyAssetChange!: (filePath: string) => void;
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      createAssetFileWatcher(onChange) {
        notifyAssetChange = onChange;
        return {
          update(files) {
            watchedFiles.push(files);
          },
          close() {},
        } satisfies DevAssetFileWatcher;
      },
      sourceProvider: {
        start() {},
        async nextSourceSnapshot() {
          buildCalls += 1;
          if (buildCalls > 1) {
            secondBuildStarted = true;
            await new Promise<never>(() => undefined);
          }
          return {
            status: "executable",
            code: "generated code",
            moduleIds: ["/project/src/main.tsx"],
            watchFiles: ["/project/src/main.tsx"],
            changedSourceIds: ["/project/src/main.tsx"],
          };
        },
        async close() {},
      },
      entryHost: {
        async execute() {
          observeDeckjsxDevAssetFile("/project/assets/hero.png");
          await recordRenderedWrite("/project/output.pptx", { status: "created" });
        },
      },
    });

    compiler.start();
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({ ok: true });
    const nextCompilation = compiler.runNextCompilation();
    notifyAssetChange("/project/assets/hero.png");
    await expect(nextCompilation).resolves.toMatchObject({ ok: true, compilation: 2 });

    expect(secondBuildStarted).toBe(true);
    expect(watchedFiles).toEqual([["/project/assets/hero.png"], ["/project/assets/hero.png"]]);
  });

  test("queues observed asset invalidations that arrive while entry code is running", async () => {
    let buildCalls = 0;
    let thirdBuildStarted = false;
    const seenCode: string[] = [];
    let notifyAssetChange!: (filePath: string) => void;
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      createAssetFileWatcher(onChange) {
        notifyAssetChange = onChange;
        return {
          update() {},
          close() {},
        } satisfies DevAssetFileWatcher;
      },
      sourceProvider: {
        start() {},
        async nextSourceSnapshot() {
          buildCalls += 1;
          if (buildCalls > 2) {
            thirdBuildStarted = true;
            await new Promise<never>(() => undefined);
          }
          return {
            status: "executable",
            code: `generated ${buildCalls}`,
            moduleIds: ["/project/src/main.tsx"],
            watchFiles: ["/project/src/main.tsx"],
            changedSourceIds: ["/project/src/main.tsx"],
          };
        },
        async close() {},
      },
      entryHost: {
        async execute(input) {
          seenCode.push(input.code);
          observeDeckjsxDevAssetFile("/project/assets/hero.png");
          if (input.code === "generated 2") {
            notifyAssetChange("/project/assets/hero.png");
          }
          await recordRenderedWrite("/project/output.pptx", { status: "created" });
        },
      },
    });

    compiler.start();
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({ ok: true });
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({ ok: true });
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({ ok: true });

    expect(thirdBuildStarted).toBe(false);
    expect(seenCode).toEqual(["generated 1", "generated 2", "generated 2"]);
  });

  test("waits for Rolldown output instead of cached rerun for public source invalidations", async () => {
    let buildCalls = 0;
    let releaseSecondBuild!: () => void;
    const seenCode: string[] = [];
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      sourceProvider: {
        start() {},
        async nextSourceSnapshot() {
          buildCalls += 1;
          if (buildCalls === 2) {
            await new Promise<void>((resolve) => {
              releaseSecondBuild = resolve;
            });
          }
          return {
            status: "executable",
            code: `generated ${buildCalls}`,
            moduleIds: ["/project/src/main.tsx"],
            watchFiles: ["/project/src/main.tsx"],
            changedSourceIds: ["/project/src/main.tsx"],
          };
        },
        async close() {},
      },
      entryHost: {
        async execute(input) {
          seenCode.push(input.code);
          await recordRenderedWrite("/project/output.pptx", { status: "created" });
        },
      },
    });

    compiler.start();
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({ ok: true });
    const nextCompilation = compiler.runNextCompilation();
    compiler.invalidate(["/project/src/main.tsx"]);
    await Promise.resolve();
    expect(seenCode).toEqual(["generated 1"]);
    releaseSecondBuild();
    await expect(nextCompilation).resolves.toMatchObject({ ok: true, compilation: 2 });

    expect(seenCode).toEqual(["generated 1", "generated 2"]);
  });

  test("keeps the compiler resident when bundle diagnostics are reported", async () => {
    const diagnostics: unknown[] = [];
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      sourceProvider: {
        start() {},
        async nextSourceSnapshot() {
          return {
            status: "diagnostic",
            diagnostics: [
              {
                severity: "error",
                code: "deckjsx.node.dev.bundleFailed",
                title: "Bundle failed.",
                message: "bundle exploded",
                primary: {
                  file: "/project/src/main.tsx",
                },
              },
            ],
          };
        },
        async close() {},
      },
      entryHost: {
        async execute() {
          throw new Error("host should not run");
        },
      },
    });
    compiler.on((event) => {
      if (event.type === "diagnostic") {
        diagnostics.push(event.diagnostic);
      }
    });

    compiler.start();
    await expect(compiler.runNextCompilation()).resolves.toEqual({
      ok: false,
      status: "bundleFailed",
      compilation: 1,
      sourceSnapshot: {
        status: "diagnostic",
        diagnostics: [
          {
            severity: "error",
            code: "deckjsx.node.dev.bundleFailed",
            title: "Bundle failed.",
            message: "bundle exploded",
            primary: {
              file: "/project/src/main.tsx",
            },
            phase: "bundle",
            compilation: 1,
          },
        ],
      },
      diagnostics: [
        {
          severity: "error",
          code: "deckjsx.node.dev.bundleFailed",
          title: "Bundle failed.",
          message: "bundle exploded",
          primary: {
            file: "/project/src/main.tsx",
          },
          phase: "bundle",
          compilation: 1,
        },
      ],
    });
    expect(diagnostics).toEqual([
      {
        severity: "error",
        code: "deckjsx.node.dev.bundleFailed",
        title: "Bundle failed.",
        message: "bundle exploded",
        primary: {
          file: "/project/src/main.tsx",
        },
        phase: "bundle",
        compilation: 1,
      },
    ]);
  });

  test("completes failed entry cycles so late writes cannot mutate observed writes", async () => {
    let failedCycleToken: ArtifactWriteToken | undefined;
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      sourceProvider: {
        start() {},
        async nextSourceSnapshot() {
          return {
            status: "executable",
            code: "generated code",
            moduleIds: ["/project/src/main.tsx"],
            watchFiles: ["/project/src/main.tsx"],
            changedSourceIds: ["/project/src/main.tsx"],
          };
        },
        async close() {},
      },
      entryHost: {
        async execute() {
          const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
          deck.slide({ name: "Failed" }, () => jsx("p", { children: "Failed" }));
          failedCycleToken = getArtifactWriteToken(await deck.render(pptx()));
          throw new Error("entry exploded after claiming a render slot");
        },
      },
    });

    compiler.start();
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({
      ok: false,
      status: "entryFailed",
      diagnostics: [
        {
          code: "deckjsx.node.dev.entryFailed",
          message: "entry exploded after claiming a render slot",
          phase: "entry",
          compilation: 1,
        },
      ],
    });

    expect(() =>
      recordArtifactWrite(failedCycleToken, {
        path: "/project/output.pptx",
        result: { status: "created" },
      }),
    ).toThrow("Incremental artifact cycle 1 has already completed.");
  });

  test("blocks failed tracked output writes without retaining draft slot artifacts", async () => {
    let buildCount = 0;
    const compiler = createDeckjsxDevCompiler({
      cwd: "/project",
      entry: "src/main.tsx",
      out: "output.pptx",
      sourceProvider: {
        start() {},
        async nextSourceSnapshot() {
          buildCount += 1;
          return {
            status: "executable",
            code: `generated ${buildCount}`,
            moduleIds: ["/project/src/main.tsx"],
            watchFiles: ["/project/src/main.tsx"],
            changedSourceIds: ["/project/src/main.tsx"],
          };
        },
        async close() {},
      },
      entryHost: {
        async execute() {
          await recordRenderedWrite(
            "/project/output.pptx",
            buildCount === 2
              ? {
                  status: "failed",
                  diagnostics: [
                    {
                      code: "deckjsx.node.write.failed",
                      message: "write failed",
                    },
                  ],
                }
              : { status: "created" },
          );
        },
      },
    });

    compiler.start();
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({
      ok: true,
      status: "artifactUpdated",
      retainedSlots: [0],
    });
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({
      ok: false,
      status: "outputBlocked",
      retainedSlots: [],
      diagnostics: [
        {
          code: "deckjsx.node.dev.outputWriteFailed",
          title: "Output write failed.",
          message: "output.pptx",
          primary: {
            file: "/project/output.pptx",
          },
          phase: "output",
          compilation: 2,
        },
      ],
    });
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({
      ok: true,
      status: "artifactUpdated",
      retainedSlots: [0],
    });
  });
});

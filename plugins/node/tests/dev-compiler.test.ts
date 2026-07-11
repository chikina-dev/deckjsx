import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
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
} from "@/src/tracked-output-coordinator.ts";
import { createDevArtifactPlanApplier } from "@/src/dev-artifact-plan-applier.ts";
import {
  createDevModuleGraphSnapshot,
  filterChangedSourceIdsForDevGraph,
} from "@/src/dev-module-graph.ts";
import { createDevChangeScheduler } from "@/src/dev-change-scheduler.ts";
import { createEntryExecutionHost } from "@/src/entry-execution-host.ts";
import { bundleFailedDiagnosticFromError } from "@/src/dev-diagnostics.ts";
import {
  createRolldownWatchAdapter,
  createRolldownWatchOptions,
} from "@/src/rolldown-watch-adapter.ts";
import { createDeckjsxDevCompiler } from "@/src/dev-compiler.ts";
import { observeDeckjsxDevAssetFile } from "@/src/dev-asset-observer.ts";
import {
  createDevAssetFileWatcher,
  type DevAssetFileWatcher,
} from "@/src/dev-asset-file-watcher.ts";

const textDecoder = new TextDecoder();

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
      "/project/.deckjsx-lock",
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
  test("clears retained slots when an artifact plan is blocked", () => {
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
        inspectArtifacts() {
          return {
            retainedSlots() {
              return [];
            },
            graphNode() {
              return undefined;
            },
            projectionForSlot() {
              return undefined;
            },
            firstProjection() {
              return undefined;
            },
          };
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

    expect(retainedSlots).toEqual([[0, 2], []]);
  });
});

describe("@deckjsx/node dev module graph", () => {
  test("combines module ids, watch files, and observed assets while filtering generated outputs", () => {
    const graph = createDevModuleGraphSnapshot({
      cwd: "/project",
      moduleIds: ["/project/src/main.tsx", "/project/src/component.tsx"],
      watchFiles: [
        "/project/src/main.tsx",
        "/project/output.pptx",
        "/project/.deckjsx-lock",
        "/project/.output.pptx.deckjsx-lock",
      ],
      observedAssetFiles: ["/project/assets/hero.png"],
      ignoredFiles: [
        "/project/output.pptx",
        "/project/.deckjsx-lock",
        "/project/.output.pptx.deckjsx-lock",
      ],
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

  test("awaits promise-like default exports from generated async entry wrappers", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-host-async-"));
    const report = path.join(project, "async.txt");
    const host = createEntryExecutionHost({ cwd: project });

    await host.execute({
      code: [
        'import { writeFile } from "node:fs/promises";',
        `export default new Promise((resolve) => setTimeout(resolve, 0)).then(() => writeFile(${JSON.stringify(report)}, "done"));`,
      ].join("\n"),
    });

    await expect(
      import("node:fs/promises").then((fs) => fs.readFile(report, "utf8")),
    ).resolves.toBe("done");
  });

  test("does not rewrite export tokens inside generated module literals", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-host-export-literal-"));
    const report = path.join(project, "literal.txt");
    const host = createEntryExecutionHost({ cwd: project });

    await host.execute({
      code: [
        'import { writeFile } from "node:fs/promises";',
        `await writeFile(${JSON.stringify(report)}, "export default ");`,
      ].join("\n"),
    });

    await expect(readFile(report, "utf8")).resolves.toBe("export default ");
  });

  test("executes generated modules with deckjsx external re-exports", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-host-reexports-"));
    const host = createEntryExecutionHost({ cwd: project });

    await expect(
      host.execute({
        code: 'export * from "deckjsx";',
      }),
    ).resolves.toBeUndefined();
  });

  test("executes generated modules with deckjsx package imports without writing a bundle file", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-host-imports-"));
    const report = path.join(project, "imports.txt");
    const host = createEntryExecutionHost({ cwd: project });

    await host.execute({
      code: [
        'import { writeFile } from "node:fs/promises";',
        'import { Deck } from "deckjsx";',
        'import { jsx } from "deckjsx/jsx-runtime";',
        `await writeFile(${JSON.stringify(report)}, [typeof Deck, typeof jsx].join(","));`,
      ].join("\n"),
    });

    await expect(
      import("node:fs/promises").then((fs) => fs.readFile(report, "utf8")),
    ).resolves.toBe("function,function");
  });

  test("executes generated modules with pptx and pdf adapter imports", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-host-adapter-imports-"));
    const report = path.join(project, "adapter-imports.txt");
    const host = createEntryExecutionHost({ cwd: project });

    await host.execute({
      code: [
        'import { writeFile } from "node:fs/promises";',
        'import { pdf, pptx } from "deckjsx/adapter";',
        `await writeFile(${JSON.stringify(report)}, [typeof pptx, typeof pdf].join(","));`,
      ].join("\n"),
    });

    await expect(readFile(report, "utf8")).resolves.toBe("function,function");
  });

  test("executes generated modules with node Font Asset registration imports", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-host-font-imports-"));
    const report = path.join(project, "font-imports.txt");
    const host = createEntryExecutionHost({ cwd: project });

    await host.execute({
      code: [
        'import { writeFile } from "node:fs/promises";',
        'import { nodeFontAssets } from "@deckjsx/node";',
        `await writeFile(${JSON.stringify(report)}, typeof nodeFontAssets);`,
      ].join("\n"),
    });

    await expect(readFile(report, "utf8")).resolves.toBe("function");
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

  test("serializes generated module execution so cwd stays local to each host", async () => {
    const firstProject = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-host-first-"));
    const secondProject = await mkdtemp(path.join(tmpdir(), "deckjsx-entry-host-second-"));
    const firstReport = path.join(firstProject, "cwd.txt");
    const secondReport = path.join(secondProject, "cwd.txt");
    const firstRealProject = await realpath(firstProject);
    const secondRealProject = await realpath(secondProject);
    const gateKey = `__deckjsx_entry_host_gate_${process.pid}_${Date.now()}`;
    const startedKey = `__deckjsx_entry_host_started_${process.pid}_${Date.now()}`;
    let releaseGate!: () => void;
    (globalThis as Record<string, unknown>)[gateKey] = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    (globalThis as Record<string, unknown>)[startedKey] = 0;
    const firstHost = createEntryExecutionHost({ cwd: firstProject });
    const secondHost = createEntryExecutionHost({ cwd: secondProject });

    try {
      const first = firstHost.execute({
        code: gatedCwdReportModule({ report: firstReport, gateKey, startedKey }),
      });
      await waitForStartedCount(startedKey, 1);
      const second = secondHost.execute({
        code: gatedCwdReportModule({ report: secondReport, gateKey, startedKey }),
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      releaseGate();

      await Promise.all([first, second]);

      await expect(readFile(firstReport, "utf8")).resolves.toBe(firstRealProject);
      await expect(readFile(secondReport, "utf8")).resolves.toBe(secondRealProject);
    } finally {
      delete (globalThis as Record<string, unknown>)[gateKey];
      delete (globalThis as Record<string, unknown>)[startedKey];
    }
  });
});

function gatedCwdReportModule(input: {
  readonly report: string;
  readonly gateKey: string;
  readonly startedKey: string;
}): string {
  return [
    'import { writeFile } from "node:fs/promises";',
    `globalThis[${JSON.stringify(input.startedKey)}] = (globalThis[${JSON.stringify(input.startedKey)}] ?? 0) + 1;`,
    `await globalThis[${JSON.stringify(input.gateKey)}];`,
    `await writeFile(${JSON.stringify(input.report)}, process.cwd());`,
  ].join("\n");
}

async function waitForStartedCount(key: string, count: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (((globalThis as Record<string, unknown>)[key] as number) >= count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Timed out waiting for ${key} to reach ${count}.`);
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 5_000);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

describe("@deckjsx/node dev diagnostics", () => {
  test("normalizes OXC parse frames embedded in Rolldown error messages", () => {
    expect(
      bundleFailedDiagnosticFromError(
        [
          "[PARSE_ERROR] Unexpected token",
          "   ╭─[ main.tsx:9:20 ]",
          "   │",
          " 9 │   <p style={{ left: }}>",
          "   │                    ┬",
          "   │                    ╰──",
          "───╯",
        ].join("\n"),
        "/project/src/main.tsx",
      ),
    ).toEqual({
      severity: "error",
      code: "deckjsx.node.dev.bundleFailed",
      title: "Bundle failed.",
      message: "[PARSE_ERROR] Unexpected token",
      primary: {
        file: "/project/src/main.tsx",
        line: 9,
        column: 20,
        sourceLine: "  <p style={{ left: }}>",
        spanLength: 1,
      },
      labels: [{ message: "while bundling this source" }],
      help: ["Fix the bundling error and save again."],
    });
  });
});

describe("@deckjsx/node rolldown watch adapter", () => {
  test("releases every pending snapshot and shares concurrent close completion", async () => {
    let finishWatcherClose: (() => void) | undefined;
    let watcherCloseCalls = 0;
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      watchFactory() {
        return {
          on() {
            return this;
          },
          off() {
            return this;
          },
          clear() {},
          close() {
            watcherCloseCalls += 1;
            return new Promise<void>((resolve) => {
              finishWatcherClose = resolve;
            });
          },
        };
      },
    });
    adapter.start();
    const firstSnapshot = adapter.nextSourceSnapshot();
    const secondSnapshot = adapter.nextSourceSnapshot();
    const firstClose = adapter.close();
    const secondClose = adapter.close();

    await expect(firstSnapshot).resolves.toMatchObject({
      status: "diagnostic",
      diagnostics: [{ code: "deckjsx.node.dev.closed" }],
    });
    await expect(secondSnapshot).resolves.toMatchObject({
      status: "diagnostic",
      diagnostics: [{ code: "deckjsx.node.dev.closed" }],
    });
    expect(watcherCloseCalls).toBe(1);
    let secondCloseSettled = false;
    void secondClose.finally(() => {
      secondCloseSettled = true;
    });
    await Promise.resolve();
    expect(secondCloseSettled).toBe(false);

    finishWatcherClose?.();
    await Promise.all([firstClose, secondClose]);
  });

  test("does not start a Rolldown watcher after the adapter is closed", async () => {
    let watchStarts = 0;
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      watchFactory() {
        watchStarts += 1;
        return createNoopWatcher();
      },
    });

    await adapter.close();
    adapter.start();

    expect(watchStarts).toBe(0);
  });

  test("waits for an in-flight bundle event to release its result during close", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    let finishGenerate: (() => void) | undefined;
    let resultCloseCalls = 0;
    let watcherCloseCalls = 0;
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      watchFactory() {
        return {
          on(event: string, listener: (...args: unknown[]) => void) {
            listeners.set(event, listener);
            return this;
          },
          off(event: string, listener: (...args: unknown[]) => void) {
            if (listeners.get(event) === listener) {
              listeners.delete(event);
            }
            return this;
          },
          clear() {},
          async close() {
            watcherCloseCalls += 1;
          },
        };
      },
    });
    adapter.start();
    const pendingSnapshot = adapter.nextSourceSnapshot();
    listeners.get("event")?.({
      code: "BUNDLE_END",
      output: [],
      result: {
        generate() {
          return new Promise<{ readonly output: readonly unknown[] }>((resolve) => {
            finishGenerate = () =>
              resolve({
                output: [
                  {
                    type: "chunk",
                    code: "generated",
                    moduleIds: ["/project/src/main.tsx"],
                    isEntry: true,
                  },
                ],
              });
          });
        },
        async close() {
          resultCloseCalls += 1;
        },
      },
    });
    const closing = adapter.close();
    let closeSettled = false;
    void closing.finally(() => {
      closeSettled = true;
    });

    await expect(pendingSnapshot).resolves.toMatchObject({
      status: "diagnostic",
      diagnostics: [{ code: "deckjsx.node.dev.closed" }],
    });
    await Promise.resolve();
    expect(closeSettled).toBe(false);
    expect(watcherCloseCalls).toBe(1);

    finishGenerate?.();
    await closing;
    expect(resultCloseCalls).toBe(1);
    await expect(adapter.nextSourceSnapshot()).resolves.toMatchObject({
      status: "diagnostic",
      diagnostics: [{ code: "deckjsx.node.dev.closed" }],
    });
  });

  test("recovers the default rebuild provider after its initial bundle fails", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "deckjsx-rolldown-recovery-"));
    const entryPath = path.join(cwd, "entry.ts");
    await writeFile(entryPath, "export const broken = ;\n");
    const adapter = createRolldownWatchAdapter({ cwd, entry: "entry.ts" });

    try {
      adapter.start();
      await expect(adapter.nextSourceSnapshot()).resolves.toMatchObject({
        status: "diagnostic",
        diagnostics: [{ code: "deckjsx.node.dev.bundleFailed" }],
      });

      const recoveredSnapshot = adapter.nextSourceSnapshot();
      await writeFile(entryPath, "export const recovered = true;\n");

      await expect(
        withTimeout(recoveredSnapshot, "Timed out waiting for Rolldown recovery."),
      ).resolves.toMatchObject({
        status: "executable",
        changedSourceIds: [entryPath],
      });
    } finally {
      await adapter.close();
      await rm(cwd, { force: true, recursive: true });
    }
  });

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

  test("does not configure filesystem output for Rolldown dev bundles", () => {
    const options = createRolldownWatchOptions({
      cwd: "/project",
      entry: "/project/src/main.tsx",
      onBuildStart() {},
      onModuleId() {},
      onWatchChange() {},
    });

    expect("output" in options).toBe(false);
  });

  test("filters deckjsx media source transform hooks to JavaScript and TypeScript modules", () => {
    const options = createRolldownWatchOptions({
      cwd: "/project",
      entry: "/project/src/main.tsx",
      onBuildStart() {},
      onModuleId() {},
      onWatchChange() {},
    });

    const plugins = Array.isArray(options.plugins) ? options.plugins : [];
    expect(
      plugins.find(
        (plugin) =>
          typeof plugin === "object" &&
          plugin !== null &&
          "name" in plugin &&
          plugin.name === "@deckjsx/node/media-source-origin",
      ),
    ).toMatchObject({
      transform: {
        filter: {
          id: { include: expect.any(RegExp) },
        },
        handler: expect.any(Function),
      },
    });
  });

  test("does not override a deckjsx jsxImportSource already declared in tsconfig", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "deckjsx-watch-options-"));
    await writeFile(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { jsxImportSource: "deckjsx" } }),
    );

    const options = createRolldownWatchOptions({
      cwd,
      entry: "main.tsx",
      onBuildStart() {},
      onModuleId() {},
      onWatchChange() {},
    }) as { readonly transform?: { readonly jsx?: { readonly importSource?: string } } };

    expect(options.transform?.jsx?.importSource).toBeUndefined();
    await rm(cwd, { force: true, recursive: true });
  });

  test("does not override a deckjsx jsxImportSource inherited from a parent tsconfig", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deckjsx-watch-options-"));
    const cwd = path.join(root, "slides");
    await mkdir(cwd);
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { jsxImportSource: "deckjsx" } }),
    );

    const options = createRolldownWatchOptions({
      cwd,
      entry: "main.tsx",
      onBuildStart() {},
      onModuleId() {},
      onWatchChange() {},
    }) as { readonly transform?: { readonly jsx?: { readonly importSource?: string } } };

    expect(options.transform?.jsx?.importSource).toBeUndefined();
    await rm(root, { force: true, recursive: true });
  });

  test("defaults TSX JSX imports to deckjsx when tsconfig does not declare an import source", () => {
    const options = createRolldownWatchOptions({
      cwd: "/project",
      entry: "main.tsx",
      onBuildStart() {},
      onModuleId() {},
      onWatchChange() {},
    }) as { readonly transform?: { readonly jsx?: { readonly importSource?: string } } };

    expect(options.transform?.jsx?.importSource).toBe("deckjsx");
  });

  test("starts multiple watch adapters without per-compiler output directories", async () => {
    const outputOptions: unknown[] = [];
    const adapters = [
      createRolldownWatchAdapter({
        cwd: "/project",
        entry: "src/main.tsx",
        watchFactory(options) {
          outputOptions.push((options as { readonly output?: unknown }).output);
          return createNoopWatcher();
        },
      }),
      createRolldownWatchAdapter({
        cwd: "/project",
        entry: "src/main.tsx",
        watchFactory(options) {
          outputOptions.push((options as { readonly output?: unknown }).output);
          return createNoopWatcher();
        },
      }),
    ];

    adapters.forEach((adapter) => adapter.start());
    await Promise.all(adapters.map((adapter) => adapter.close()));

    expect(outputOptions).toEqual([undefined, undefined]);
  });

  test("does not run an initial rebuild when a watch factory owns bundle events", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    let buildFactoryCalls = 0;
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
      async buildFactory() {
        buildFactoryCalls += 1;
        return {
          output: [
            {
              type: "chunk",
              code: "rebuild output",
              moduleIds: ["/project/src/main.tsx"],
              isEntry: true,
            },
          ],
        };
      },
    });

    adapter.start();
    const buildPromise = adapter.nextSourceSnapshot();
    await Promise.resolve();
    expect(buildFactoryCalls).toBe(0);

    listeners.get("event")?.({
      code: "BUNDLE_END",
      output: [],
      result: {
        output: [
          {
            type: "chunk",
            code: "watch output",
            moduleIds: ["/project/src/main.tsx"],
            isEntry: true,
          },
        ],
      },
    });

    await expect(buildPromise).resolves.toMatchObject({
      status: "executable",
      code: "watch output",
    });
    await adapter.close();
  });

  test("rebuilds through Rolldown when a watched source file changes", async () => {
    const watchedFiles = new Map<string, () => void>();
    let buildCount = 0;
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      async buildFactory() {
        buildCount += 1;
        const code = `generated ${buildCount}`;
        return {
          watchFiles: ["/project/src/main.tsx"],
          output: [
            {
              type: "chunk",
              code,
              moduleIds: ["/project/src/main.tsx"],
              isEntry: true,
            },
          ],
          close: async () => undefined,
        };
      },
      fileWatcherFactory(filePath, onChange) {
        watchedFiles.set(filePath, onChange);
        return {
          close() {
            watchedFiles.delete(filePath);
          },
        };
      },
    });

    adapter.start();
    await expect(adapter.nextSourceSnapshot()).resolves.toEqual({
      status: "executable",
      code: "generated 1",
      moduleIds: ["/project/src/main.tsx"],
      watchFiles: ["/project/src/main.tsx"],
      changedSourceIds: [],
    });

    const nextSnapshot = adapter.nextSourceSnapshot();
    watchedFiles.get("/project/src/main.tsx")?.();

    await expect(nextSnapshot).resolves.toEqual({
      status: "executable",
      code: "generated 2",
      moduleIds: ["/project/src/main.tsx"],
      watchFiles: ["/project/src/main.tsx"],
      changedSourceIds: ["/project/src/main.tsx"],
    });
    await adapter.close();
  });

  test("does not recreate source watchers when a rebuild finishes after close", async () => {
    const watchedFiles = new Map<string, () => void>();
    let finishBuild:
      | ((
          result: Awaited<
            ReturnType<
              NonNullable<Parameters<typeof createRolldownWatchAdapter>[0]["buildFactory"]>
            >
          >,
        ) => void)
      | undefined;
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      buildFactory() {
        return new Promise((resolve) => {
          finishBuild = resolve;
        });
      },
      fileWatcherFactory(filePath, onChange) {
        watchedFiles.set(filePath, onChange);
        return {
          close() {
            watchedFiles.delete(filePath);
          },
        };
      },
    });

    adapter.start();
    const firstSnapshot = adapter.nextSourceSnapshot();
    await adapter.close();

    await expect(firstSnapshot).resolves.toMatchObject({
      status: "diagnostic",
      diagnostics: [
        {
          code: "deckjsx.node.dev.closed",
        },
      ],
    });
    finishBuild?.({
      watchFiles: ["/project/src/main.tsx"],
      output: [
        {
          type: "chunk",
          code: "generated after close",
          moduleIds: ["/project/src/main.tsx"],
          isEntry: true,
        },
      ],
      close: async () => undefined,
    });
    await Promise.resolve();

    expect(watchedFiles.size).toBe(0);
  });

  test("ignores delayed source watcher callbacks after close", async () => {
    let delayedChange: (() => void) | undefined;
    let buildCount = 0;
    let watcherCloseCalls = 0;
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      async buildFactory() {
        buildCount += 1;
        return {
          watchFiles: ["/project/src/main.tsx"],
          output: [
            {
              type: "chunk",
              code: "generated",
              moduleIds: ["/project/src/main.tsx"],
              isEntry: true,
            },
          ],
        };
      },
      fileWatcherFactory(_filePath, onChange) {
        delayedChange = onChange;
        return {
          close() {
            watcherCloseCalls += 1;
          },
        };
      },
    });

    adapter.start();
    await adapter.nextSourceSnapshot();
    await Promise.all([adapter.close(), adapter.close()]);
    delayedChange?.();
    await new Promise((resolve) => setTimeout(resolve, 75));

    expect(buildCount).toBe(1);
    expect(watcherCloseCalls).toBe(1);
    await expect(adapter.nextSourceSnapshot()).resolves.toMatchObject({
      status: "diagnostic",
      diagnostics: [{ code: "deckjsx.node.dev.closed" }],
    });
  });

  test("ignores delayed callbacks from source files removed from the watch set", async () => {
    const callbacks = new Map<string, () => void>();
    const closeCalls = new Map<string, number>();
    let buildCount = 0;
    const adapter = createRolldownWatchAdapter({
      cwd: "/project",
      entry: "src/main.tsx",
      async buildFactory() {
        buildCount += 1;
        return {
          watchFiles:
            buildCount === 1
              ? ["/project/src/main.tsx", "/project/src/removed.ts"]
              : ["/project/src/main.tsx"],
          output: [
            {
              type: "chunk",
              code: `generated ${buildCount}`,
              moduleIds: ["/project/src/main.tsx"],
              isEntry: true,
            },
          ],
        };
      },
      fileWatcherFactory(filePath, onChange) {
        callbacks.set(filePath, onChange);
        return {
          close() {
            closeCalls.set(filePath, (closeCalls.get(filePath) ?? 0) + 1);
          },
        };
      },
    });

    adapter.start();
    await adapter.nextSourceSnapshot();
    const removedCallback = callbacks.get("/project/src/removed.ts");
    const secondSnapshot = adapter.nextSourceSnapshot();
    callbacks.get("/project/src/main.tsx")?.();
    await secondSnapshot;

    removedCallback?.();
    await new Promise((resolve) => setTimeout(resolve, 75));

    expect(buildCount).toBe(2);
    expect(closeCalls.get("/project/src/removed.ts")).toBe(1);
    await adapter.close();
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
      watchFactory() {
        return watcher;
      },
    });

    const buildPromise = adapter.nextSourceSnapshot();
    adapter.start();
    listeners.get("change")?.("/project/src/component.tsx", { event: "update" });
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

  test("rejects malformed Rolldown chunks at the source boundary", async () => {
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
      output: [],
      result: {
        output: [
          {
            type: "chunk",
            code: "entry chunk",
            moduleIds: ["/project/src/main.tsx", 42],
            isEntry: true,
          },
        ],
      },
    });

    await expect(buildPromise).resolves.toMatchObject({
      status: "diagnostic",
      diagnostics: [
        {
          code: "deckjsx.node.dev.bundleMissingChunk",
        },
      ],
    });
    await adapter.close();
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

describe("@deckjsx/node dev asset file watcher", () => {
  test("suppresses stale callbacks and closes each registration once", () => {
    const registrations: Array<{
      readonly filePath: string;
      readonly onChange: () => void;
      closeCalls: number;
    }> = [];
    const changes: string[] = [];
    const watcher = createDevAssetFileWatcher(
      (filePath) => changes.push(filePath),
      (filePath, onChange) => {
        const registration = { filePath, onChange, closeCalls: 0 };
        registrations.push(registration);
        return {
          close() {
            registration.closeCalls += 1;
          },
        };
      },
    );

    watcher.update(["/project/assets/hero.png"]);
    watcher.update([]);
    registrations[0]?.onChange();
    watcher.update(["/project/assets/hero.png"]);
    registrations[1]?.onChange();
    watcher.close();
    watcher.close();
    registrations[1]?.onChange();
    watcher.update(["/project/assets/ignored.png"]);

    expect(changes).toEqual(["/project/assets/hero.png"]);
    expect(registrations.map((registration) => registration.closeCalls)).toEqual([1, 1]);
    expect(registrations).toHaveLength(2);
  });

  test("does not lose a change reported while a watcher is being registered", () => {
    const changes: string[] = [];
    const watcher = createDevAssetFileWatcher(
      (filePath) => changes.push(filePath),
      (_filePath, onChange) => {
        onChange();
        return { close() {} };
      },
    );

    watcher.update(["/project/assets/hero.png"]);
    watcher.close();

    expect(changes).toEqual(["/project/assets/hero.png"]);
  });

  test("observes creation and later changes of an initially missing local asset", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "deckjsx-asset-watch-"));
    const assetPath = path.join(cwd, "assets", "hero.png");
    const changes: string[] = [];
    let notifyChange!: () => void;
    const nextChange = (message: string) =>
      withTimeout(
        new Promise<void>((resolve) => {
          notifyChange = resolve;
        }),
        message,
      );
    const watcher = createDevAssetFileWatcher((filePath) => {
      changes.push(filePath);
      notifyChange?.();
    });

    try {
      await mkdir(path.dirname(assetPath));
      watcher.update([assetPath]);
      const created = nextChange("Timed out waiting for asset creation.");
      await writeFile(assetPath, "created");
      await created;
      await new Promise((resolve) => setTimeout(resolve, 20));

      const changesAfterCreation = changes.length;
      const changed = nextChange("Timed out waiting for the created asset to change.");
      await writeFile(assetPath, "changed");
      await changed;

      expect(changes.length).toBeGreaterThan(changesAfterCreation);
      expect(new Set(changes)).toEqual(new Set([assetPath]));
    } finally {
      watcher.close();
      await rm(cwd, { force: true, recursive: true });
    }
  }, 10_000);
});

describe("@deckjsx/node dev compiler", () => {
  test("creates a tracked PDF through a real Rolldown compilation", async () => {
    const cwd = await mkdtemp(path.join(process.cwd(), ".deckjsx-dev-smoke-"));
    const outputPath = path.join(cwd, "output.pdf");
    await mkdir(path.join(cwd, "node_modules", "@deckjsx"), { recursive: true });
    await symlink(path.resolve("../.."), path.join(cwd, "node_modules", "deckjsx"), "dir");
    await symlink(
      path.resolve("plugins/node"),
      path.join(cwd, "node_modules", "@deckjsx", "node"),
      "dir",
    );
    await writeFile(
      path.join(cwd, "entry.cts"),
      [
        'import { write } from "@deckjsx/node";',
        'import { Deck } from "deckjsx";',
        'import { pdf } from "deckjsx/adapter";',
        'import { jsx } from "deckjsx/jsx-runtime";',
        "module.exports = (async () => {",
        '  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });',
        '  deck.slide({ name: "PDF dev smoke" }, () => jsx("p", { style: { position: "absolute", left: 1, top: 1, width: 5, height: 0.5 }, children: "PDF dev smoke" }));',
        '  await write(await deck.render(pdf()), "output.pdf");',
        "})();",
      ].join("\n"),
    );

    const compiler = createDeckjsxDevCompiler({ cwd, entry: "entry.cts", out: "output.pdf" });
    try {
      compiler.start();
      const result = await compiler.runNextCompilation();

      if (!result.ok) {
        throw new Error(
          `expected PDF dev compilation to succeed: ${JSON.stringify(result.diagnostics)}`,
        );
      }
      expect(result.status).toBe("artifactUpdated");
      expect(result.diagnostics).toEqual([]);
      const output = await readFile(outputPath);
      expect(output.subarray(0, 8).toString()).toBe("%PDF-1.7");
      expect(result.writes).toEqual([
        {
          path: outputPath,
          tracked: true,
          result: expect.objectContaining({ ok: true, status: "written", strategy: "write-file" }),
        },
      ]);
    } finally {
      await compiler.close();
      await rm(cwd, { force: true, recursive: true });
    }
  });

  test("creates the tracked output on the first real Rolldown compilation", async () => {
    const cwd = await mkdtemp(path.join(process.cwd(), ".deckjsx-dev-smoke-"));
    const outputPath = path.join(cwd, "output.pptx");
    await mkdir(path.join(cwd, "node_modules", "@deckjsx"), { recursive: true });
    await symlink(path.resolve("../.."), path.join(cwd, "node_modules", "deckjsx"), "dir");
    await symlink(
      path.resolve("plugins/node"),
      path.join(cwd, "node_modules", "@deckjsx", "node"),
      "dir",
    );
    await writeFile(
      path.join(cwd, "entry.cts"),
      [
        'import { write } from "@deckjsx/node";',
        'import { Deck } from "deckjsx";',
        'import { pptx } from "deckjsx/adapter";',
        'import { jsx } from "deckjsx/jsx-runtime";',
        "module.exports = (async () => {",
        '  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });',
        '  deck.slide({ name: "Dev smoke" }, () => jsx("main", { style: { width: 9, height: 4.5, display: "flex", flexDirection: "column", gap: 0.15, padding: 0.5 }, children: jsx("p", { style: { width: 5, height: 0.5 }, children: "dev smoke" }) }));',
        '  await write(await deck.render(pptx()), "output.pptx");',
        "})();",
      ].join("\n"),
    );

    const compiler = createDeckjsxDevCompiler({
      cwd,
      entry: "entry.cts",
      out: "output.pptx",
    });
    try {
      compiler.start();
      const result = await compiler.runNextCompilation();

      if (!result.ok) {
        throw new Error(
          `expected first real Rolldown compilation to succeed: ${JSON.stringify(result.diagnostics)}`,
        );
      }
      expect(result.status).toBe("artifactUpdated");
      await expect(access(outputPath)).resolves.toBeUndefined();
      await expect(stat(outputPath)).resolves.toEqual(
        expect.objectContaining({
          size: expect.any(Number),
        }),
      );
      expect(result.writes).toEqual([
        {
          path: outputPath,
          tracked: true,
          result: expect.objectContaining({ status: "created" }),
        },
      ]);
    } finally {
      await compiler.close();
      await rm(cwd, { force: true, recursive: true });
    }
  });

  test("updates composed multi-Deck output through real dev compilations", async () => {
    const cwd = await mkdtemp(path.join(process.cwd(), ".deckjsx-dev-smoke-"));
    const entryPath = path.join(cwd, "entry.cts");
    const outputPath = path.join(cwd, "output.pptx");
    const entrySource = (childColor: string) =>
      [
        'import { write } from "@deckjsx/node";',
        'import { Deck, StyleSheet } from "deckjsx";',
        'import { pptx } from "deckjsx/adapter";',
        'import { jsx } from "deckjsx/jsx-runtime";',
        "module.exports = (async () => {",
        '  const parent = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });',
        '  const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });',
        '  parent.useStyles(new StyleSheet({ classes: { note: { target: "p.note", style: { color: "#FF0000" } } } }));',
        `  child.useStyles(new StyleSheet({ classes: { note: { target: "p.note", style: { color: "${childColor}" } } } }));`,
        '  parent.slide({ name: "Parent" }, () => jsx("p", { className: "note", style: { position: "absolute", left: 1, top: 1, width: 4, height: 0.6 }, children: "Parent note" }));',
        '  child.slide({ name: "Child" }, () => jsx("p", { className: "note", style: { position: "absolute", left: 1, top: 1, width: 4, height: 0.6 }, children: "Child note" }));',
        '  parent.mount("child", child);',
        '  await write(await parent.render(pptx({ inspection: "none" })), "output.pptx");',
        "})();",
      ].join("\n");
    const childSlideXml = async () => {
      const zip = unzipSync(await readFile(outputPath));
      return textDecoder.decode(zip["ppt/slides/slide2.xml"]);
    };

    await mkdir(path.join(cwd, "node_modules", "@deckjsx"), { recursive: true });
    await symlink(path.resolve("../.."), path.join(cwd, "node_modules", "deckjsx"), "dir");
    await symlink(
      path.resolve("plugins/node"),
      path.join(cwd, "node_modules", "@deckjsx", "node"),
      "dir",
    );
    await writeFile(entryPath, entrySource("#0000FF"));

    const compiler = createDeckjsxDevCompiler({
      cwd,
      entry: "entry.cts",
      out: "output.pptx",
    });
    try {
      compiler.start();
      const first = await compiler.runNextCompilation();
      if (!first.ok) {
        throw new Error(
          `expected first multi-Deck dev compilation to succeed: ${JSON.stringify(first.diagnostics)}`,
        );
      }
      expect(await childSlideXml()).toContain('<a:srgbClr val="0000FF"/>');

      await writeFile(entryPath, entrySource("#00AA00"));
      compiler.invalidate([entryPath]);
      const second = await compiler.runNextCompilation();
      if (!second.ok) {
        throw new Error(
          `expected second multi-Deck dev compilation to succeed: ${JSON.stringify(second.diagnostics)}`,
        );
      }

      const secondChildSlideXml = await childSlideXml();
      expect(second.status).toBe("artifactUpdated");
      expect(secondChildSlideXml).toContain("Child note");
      expect(secondChildSlideXml).toContain('<a:srgbClr val="00AA00"/>');
      expect(secondChildSlideXml).not.toContain('<a:srgbClr val="0000FF"/>');
    } finally {
      await compiler.close();
      await rm(cwd, { force: true, recursive: true });
    }
  });

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

  test("retains executable source and observed asset watches when output is blocked", async () => {
    let sourceSnapshotCalls = 0;
    let executionCount = 0;
    let notifyAssetChange!: (filePath: string) => void;
    const watchedFiles: Array<readonly string[]> = [];
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
          sourceSnapshotCalls += 1;
          if (sourceSnapshotCalls > 1) {
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
          executionCount += 1;
          observeDeckjsxDevAssetFile("/project/assets/hero.png");
          await recordRenderedWrite(
            "/project/output.pptx",
            executionCount === 1
              ? {
                  status: "failed",
                  diagnostics: [{ code: "deckjsx.node.write.failed", message: "write failed" }],
                }
              : { status: "created" },
          );
        },
      },
    });

    compiler.start();
    await expect(compiler.runNextCompilation()).resolves.toMatchObject({
      ok: false,
      status: "outputBlocked",
    });
    const recovered = compiler.runNextCompilation();
    notifyAssetChange("/project/assets/hero.png");
    await expect(recovered).resolves.toMatchObject({
      ok: true,
      status: "artifactUpdated",
      compilation: 2,
    });

    expect(sourceSnapshotCalls).toBe(2);
    expect(watchedFiles).toEqual([["/project/assets/hero.png"], ["/project/assets/hero.png"]]);
    await compiler.close();
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

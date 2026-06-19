import { readFileSync, watch as watchFileSystem, type FSWatcher } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { rolldown, watch, type OutputChunk, type Plugin, type WatchOptions } from "rolldown";
import { isDeckjsxRuntimeExternalId } from "./dev-executor";
import {
  createDiagnosticSourceSnapshot,
  createExecutableSourceSnapshot,
  type DeckjsxDevSourceSnapshot,
} from "./dev-source-snapshot";
import type { DevSourceProvider } from "./dev-source-provider";
import { transformDeckjsxMediaSourceOrigins } from "./media-source-transform";
import {
  bundleFailedDiagnosticFromError,
  bundleMissingChunkDiagnostic,
  type DeckjsxDevDiagnostic,
} from "./dev-diagnostics";

export type RolldownWatchSourceSnapshot = DeckjsxDevSourceSnapshot;

type RolldownWatchResult = {
  readonly output?: readonly unknown[];
  readonly watchFiles?: Promise<readonly string[]> | readonly string[];
  generate?(options?: object): Promise<{ readonly output: readonly unknown[] }>;
  close?(): Promise<void> | void;
};

type RolldownWatchEvent =
  | {
      readonly code: "BUNDLE_END";
      readonly output: readonly string[];
      readonly result: RolldownWatchResult;
    }
  | {
      readonly code: "ERROR";
      readonly error: unknown;
      readonly result?: { close(): Promise<void> | void };
    }
  | {
      readonly code: "START" | "BUNDLE_START" | "END";
    };

type RolldownWatcherLike = {
  on(
    event: string,
    listener: (...args: readonly unknown[]) => void | Promise<void>,
  ): RolldownWatcherLike;
  off?(
    event: string,
    listener: (...args: readonly unknown[]) => void | Promise<void>,
  ): RolldownWatcherLike;
  clear?(event: string): void;
  close(): Promise<void> | void;
};

export type RolldownWatchAdapter = DevSourceProvider;

export type RolldownWatchAdapterOptions = {
  readonly cwd: string;
  readonly entry: string;
  readonly watchFactory?: (options: WatchOptions) => RolldownWatcherLike;
  readonly buildFactory?: (options: WatchOptions) => Promise<RolldownWatchResult>;
  readonly fileWatcherFactory?: (
    filePath: string,
    onChange: () => void,
  ) => { readonly close: () => void };
};

type PendingSourceSnapshot = {
  resolve(result: RolldownWatchSourceSnapshot): void;
};

let watchOutputSerial = 0;

export function createRolldownWatchAdapter(
  options: RolldownWatchAdapterOptions,
): RolldownWatchAdapter {
  if (!options.watchFactory) {
    return createRolldownRebuildAdapter(options);
  }

  return createRolldownEventWatchAdapter(options);
}

function createRolldownRebuildAdapter(options: RolldownWatchAdapterOptions): RolldownWatchAdapter {
  const cwd = path.resolve(options.cwd);
  const entry = path.resolve(cwd, options.entry);
  const outputDirectory = createWatchOutputDirectory(cwd);
  const buildFactory = options.buildFactory ?? rolldown;
  const createFileWatcher = options.fileWatcherFactory ?? createNodeFileWatcher;
  const changedSourceIds = new Set<string>();
  const queuedSourceSnapshots: RolldownWatchSourceSnapshot[] = [];
  const pendingSourceSnapshots: PendingSourceSnapshot[] = [];
  const sourceWatchers = new Map<string, { readonly close: () => void }>();
  let started = false;
  let closed = false;
  let rebuildRunning = false;
  let rebuildQueued = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    start() {
      if (started) {
        return;
      }
      started = true;
      void rebuild([]);
    },
    nextSourceSnapshot() {
      const queued = queuedSourceSnapshots.shift();
      if (queued) {
        return Promise.resolve(queued);
      }
      return new Promise((resolve) => pendingSourceSnapshots.push({ resolve }));
    },
    async close() {
      closed = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      closeSourceWatchers();
      await rm(outputDirectory, { force: true, recursive: true });
    },
  };

  async function rebuild(sourceIds: readonly string[]): Promise<void> {
    if (closed) {
      return;
    }
    rebuildRunning = true;
    try {
      const snapshot = await buildSourceSnapshot({
        cwd,
        entry,
        outputDirectory,
        buildFactory,
        changedSourceIds: sourceIds,
      });
      if (snapshot.status === "executable") {
        updateSourceWatchers(snapshot.watchFiles.length ? snapshot.watchFiles : snapshot.moduleIds);
      }
      emitSourceSnapshot(snapshot);
    } finally {
      rebuildRunning = false;
      if (rebuildQueued) {
        rebuildQueued = false;
        scheduleRebuild();
      }
    }
  }

  function scheduleSourceChange(filePath: string): void {
    changedSourceIds.add(path.resolve(cwd, filePath));
    if (rebuildRunning) {
      rebuildQueued = true;
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      scheduleRebuild();
    }, 50);
  }

  function scheduleRebuild(): void {
    const sourceIds = [...changedSourceIds].sort();
    changedSourceIds.clear();
    void rebuild(sourceIds);
  }

  function emitSourceSnapshot(result: RolldownWatchSourceSnapshot): void {
    const pending = pendingSourceSnapshots.shift();
    if (pending) {
      pending.resolve(result);
      return;
    }
    queuedSourceSnapshots.push(result);
  }

  function updateSourceWatchers(filePaths: readonly string[]): void {
    const nextFiles = new Set(
      filePaths.map((filePath) => path.resolve(cwd, filePath)).filter(isWatchableSourceFile),
    );
    for (const [filePath, watcher] of sourceWatchers) {
      if (!nextFiles.has(filePath)) {
        watcher.close();
        sourceWatchers.delete(filePath);
      }
    }
    for (const filePath of nextFiles) {
      if (sourceWatchers.has(filePath)) {
        continue;
      }
      try {
        sourceWatchers.set(
          filePath,
          createFileWatcher(filePath, () => scheduleSourceChange(filePath)),
        );
      } catch {
        // Rolldown may report virtual or transient files. A later rebuild can refresh the watch set.
      }
    }
  }

  function closeSourceWatchers(): void {
    for (const watcher of sourceWatchers.values()) {
      watcher.close();
    }
    sourceWatchers.clear();
  }

  function isWatchableSourceFile(filePath: string): boolean {
    const resolved = path.resolve(cwd, filePath);
    const relative = path.relative(cwd, resolved);
    return (
      relative !== "" &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative) &&
      !relative.split(path.sep).includes("node_modules") &&
      !relative.startsWith(`.deckjsx${path.sep}`)
    );
  }
}

function createRolldownEventWatchAdapter(
  options: RolldownWatchAdapterOptions,
): RolldownWatchAdapter {
  const cwd = path.resolve(options.cwd);
  const entry = path.resolve(cwd, options.entry);
  const outputDirectory = createWatchOutputDirectory(cwd);
  const changedSourceIds: string[] = [];
  const watchModuleIds: string[] = [];
  const queuedSourceSnapshots: RolldownWatchSourceSnapshot[] = [];
  const pendingSourceSnapshots: PendingSourceSnapshot[] = [];
  let watcher: RolldownWatcherLike | undefined;
  let initialSourceSnapshot: Promise<RolldownWatchSourceSnapshot> | undefined;
  let started = false;

  const emitSourceSnapshot = (result: RolldownWatchSourceSnapshot) => {
    const pending = pendingSourceSnapshots.shift();
    if (pending) {
      pending.resolve(result);
      return;
    }
    queuedSourceSnapshots.push(result);
  };
  const onEvent = async (event: RolldownWatchEvent) => {
    try {
      if (event.code === "BUNDLE_END") {
        emitSourceSnapshot(
          await sourceSnapshotFromBundleEnd({
            result: event.result,
            outputFiles: event.output,
            changedSourceIds: consumeChangedSourceIds(),
            moduleIds: consumeWatchModuleIds(),
          }),
        );
        return;
      }
      if (event.code === "ERROR") {
        await event.result?.close();
        emitSourceSnapshot(
          createDiagnosticSourceSnapshot([diagnosticFromRolldownError(event.error, entry)]),
        );
      }
    } catch (error) {
      emitSourceSnapshot(
        createDiagnosticSourceSnapshot([diagnosticFromRolldownError(error, entry)]),
      );
    }
  };

  return {
    start() {
      if (started) {
        return;
      }
      started = true;
      const watchOptions = createRolldownWatchOptions({
        cwd,
        entry,
        outputDirectory,
        onWatchChange(id) {
          changedSourceIds.push(path.resolve(cwd, id));
        },
        onBuildStart() {
          watchModuleIds.length = 0;
        },
        onModuleId(id) {
          watchModuleIds.push(path.resolve(cwd, id));
        },
      });
      watcher = (options.watchFactory ?? watch)(watchOptions);
      watcher.on("event", (event) => onEvent(event as RolldownWatchEvent));

      if (!options.watchFactory || options.buildFactory) {
        initialSourceSnapshot = initialBuildSnapshot({
          cwd,
          entry,
          outputDirectory,
          buildFactory: options.buildFactory ?? rolldown,
        });
      }
    },
    nextSourceSnapshot() {
      if (initialSourceSnapshot) {
        const snapshot = initialSourceSnapshot;
        initialSourceSnapshot = undefined;
        return snapshot;
      }
      const queued = queuedSourceSnapshots.shift();
      if (queued) {
        return Promise.resolve(queued);
      }
      return new Promise((resolve) => pendingSourceSnapshots.push({ resolve }));
    },
    async close() {
      await watcher?.close();
      await rm(outputDirectory, { force: true, recursive: true });
    },
  };

  function consumeChangedSourceIds(): readonly string[] {
    const ids = [...new Set(changedSourceIds)].sort();
    changedSourceIds.length = 0;
    return ids;
  }

  function consumeWatchModuleIds(): readonly string[] {
    return [...new Set(watchModuleIds)].sort();
  }
}

function createNodeFileWatcher(
  filePath: string,
  onChange: () => void,
): { readonly close: () => void } {
  const watcher: FSWatcher = watchFileSystem(filePath, { persistent: true }, onChange);
  return {
    close() {
      watcher.close();
    },
  };
}

async function buildSourceSnapshot(input: {
  readonly cwd: string;
  readonly entry: string;
  readonly outputDirectory: string;
  readonly buildFactory: (options: WatchOptions) => Promise<RolldownWatchResult>;
  readonly changedSourceIds: readonly string[];
}): Promise<RolldownWatchSourceSnapshot> {
  const moduleIds: string[] = [];
  try {
    const result = await input.buildFactory(
      createRolldownWatchOptions({
        cwd: input.cwd,
        entry: input.entry,
        outputDirectory: input.outputDirectory,
        onWatchChange() {},
        onBuildStart() {
          moduleIds.length = 0;
        },
        onModuleId(id) {
          moduleIds.push(path.resolve(input.cwd, id));
        },
      }),
    );
    return await sourceSnapshotFromBundleEnd({
      result,
      outputFiles: [input.outputDirectory],
      changedSourceIds: input.changedSourceIds,
      moduleIds,
    });
  } catch (error) {
    return createDiagnosticSourceSnapshot([diagnosticFromRolldownError(error, input.entry)]);
  }
}

async function initialBuildSnapshot(input: {
  readonly cwd: string;
  readonly entry: string;
  readonly outputDirectory: string;
  readonly buildFactory: (options: WatchOptions) => Promise<RolldownWatchResult>;
}): Promise<RolldownWatchSourceSnapshot> {
  return buildSourceSnapshot({
    ...input,
    changedSourceIds: [],
  });
}

export function createRolldownWatchOptions(input: {
  readonly cwd: string;
  readonly entry: string;
  readonly outputDirectory?: string;
  readonly onWatchChange: (id: string) => void;
  readonly onBuildStart: () => void;
  readonly onModuleId: (id: string) => void;
}): WatchOptions {
  const outputDirectory = input.outputDirectory
    ? path.resolve(input.cwd, input.outputDirectory)
    : path.join(input.cwd, ".deckjsx", "dev");
  return {
    input: input.entry,
    cwd: input.cwd,
    platform: "node",
    external: isDeckjsxRuntimeExternalId,
    output: {
      dir: outputDirectory,
      entryFileNames: "rolldown-watch-output.mjs",
      format: "esm",
      codeSplitting: false,
      sourcemap: false,
    },
    plugins: [
      deckjsxWatchChangePlugin({
        onBuildStart: input.onBuildStart,
        onModuleId: input.onModuleId,
        onWatchChange: input.onWatchChange,
      }),
      deckjsxMediaSourceOriginPlugin(),
    ],
    transform: {
      jsx: {
        runtime: "automatic",
        ...(tsconfigUsesDeckjsxJsxImportSource(input.cwd) ? {} : { importSource: "deckjsx" }),
      },
    },
  };
}

function tsconfigUsesDeckjsxJsxImportSource(cwd: string): boolean {
  try {
    return /"jsxImportSource"\s*:\s*"deckjsx"/.test(
      readFileSync(path.join(cwd, "tsconfig.json"), "utf8"),
    );
  } catch {
    return false;
  }
}

function createWatchOutputDirectory(cwd: string): string {
  watchOutputSerial += 1;
  return path.join(
    cwd,
    ".deckjsx",
    "dev",
    `watch-${process.pid}-${Date.now()}-${watchOutputSerial}`,
  );
}

async function sourceSnapshotFromBundleEnd(input: {
  readonly result: RolldownWatchResult;
  readonly outputFiles: readonly string[];
  readonly changedSourceIds: readonly string[];
  readonly moduleIds: readonly string[];
}): Promise<RolldownWatchSourceSnapshot> {
  const { result } = input;
  try {
    const generated = result.output
      ? { output: result.output }
      : result.generate
        ? await result.generate({
            format: "esm",
            codeSplitting: false,
            sourcemap: false,
          })
        : undefined;
    if (!generated) {
      const output = await readRolldownWatchOutput(input.outputFiles);
      if (output) {
        return createExecutableSourceSnapshot({
          cwd: path.dirname(input.outputFiles[0] ?? process.cwd()),
          code: awaitableGeneratedEntryCode(output.code),
          moduleIds: input.moduleIds,
          watchFiles: input.moduleIds,
          changedSourceIds: input.changedSourceIds,
        });
      }
    }
    if (!generated) {
      return createDiagnosticSourceSnapshot([
        bundleMissingChunkDiagnostic({
          message:
            "Rolldown did not provide an executable chunk or output file for the deckjsx entry.",
          notes: [
            `resultKeys=${Object.keys(result).join(",")}`,
            `resultProtoKeys=${Object.getOwnPropertyNames(Object.getPrototypeOf(result) ?? {}).join(",")}`,
            `outputFiles=${input.outputFiles.join(",")}`,
          ],
        }),
      ]);
    }
    const chunks = generated.output.filter(isOutputChunk);
    const chunk = chunks.find((item) => item.isEntry) ?? chunks[0];
    if (!chunk) {
      return createDiagnosticSourceSnapshot([
        bundleMissingChunkDiagnostic({
          message: "Rolldown did not generate an executable chunk for the deckjsx entry.",
          notes: [
            `resultKeys=${Object.keys(result).join(",")}`,
            `resultProtoKeys=${Object.getOwnPropertyNames(Object.getPrototypeOf(result) ?? {}).join(",")}`,
            `outputTypes=${generated.output.map(outputDescription).join(",")}`,
            `outputFiles=${input.outputFiles.join(",")}`,
          ],
        }),
      ]);
    }
    const watchFiles = result.watchFiles ? await result.watchFiles : [];
    return createExecutableSourceSnapshot({
      code: awaitableGeneratedEntryCode(chunk.code),
      moduleIds: [
        ...new Set([...input.moduleIds, ...chunks.flatMap((item) => item.moduleIds)]),
      ].sort(),
      watchFiles: [...new Set(watchFiles.map((file) => path.resolve(file)))].sort(),
      changedSourceIds: input.changedSourceIds,
    });
  } finally {
    await result.close?.();
  }
}

function awaitableGeneratedEntryCode(code: string): string {
  const commonJsMinHelper =
    "var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);";
  if (!code.includes(commonJsMinHelper)) {
    return code;
  }
  return `${code.replace(
    commonJsMinHelper,
    [
      "var __deckjsxCommonJSPending = [];",
      "var __commonJSMin = (cb, mod) => () => {",
      "\tif (!mod) {",
      "\t\tconst result = cb((mod = { exports: {} }).exports, mod);",
      '\t\tif (result && typeof result.then === "function") __deckjsxCommonJSPending.push(result);',
      "\t\tcb = null;",
      "\t}",
      "\treturn mod.exports;",
      "};",
    ].join("\n"),
  )}\nawait Promise.all(__deckjsxCommonJSPending);\n`;
}

function deckjsxWatchChangePlugin(input: {
  readonly onBuildStart: () => void;
  readonly onModuleId: (id: string) => void;
  readonly onWatchChange: (id: string) => void;
}): Plugin {
  return {
    name: "@deckjsx/node/watch-change",
    buildStart() {
      input.onBuildStart();
    },
    moduleParsed(info) {
      input.onModuleId(info.id);
    },
    watchChange(id) {
      input.onWatchChange(id);
    },
  };
}

function deckjsxMediaSourceOriginPlugin(): Plugin {
  return {
    name: "@deckjsx/node/media-source-origin",
    transform(code, id) {
      const transformed = transformDeckjsxMediaSourceOrigins(code, id);
      return transformed ? { code: transformed, map: null } : undefined;
    },
  };
}

function isOutputChunk(value: unknown): value is OutputChunk {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "chunk" &&
    "code" in value &&
    typeof value.code === "string" &&
    "moduleIds" in value &&
    Array.isArray(value.moduleIds)
  );
}

function outputDescription(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return typeof value;
  }
  const type = "type" in value ? String(value.type) : "missing-type";
  return `${type}:${Object.keys(value).join("|")}`;
}

async function readRolldownWatchOutput(
  outputFiles: readonly string[],
): Promise<{ readonly code: string } | undefined> {
  const candidates = outputFiles.flatMap((file) =>
    file.endsWith(".mjs") || file.endsWith(".js")
      ? [file]
      : [path.join(file, "rolldown-watch-output.mjs")],
  );
  for (const candidate of candidates) {
    try {
      return { code: await readFile(candidate, "utf8") };
    } catch {
      // Try the next output candidate; Rolldown may report either a file or directory.
    }
  }
  return undefined;
}

function diagnosticFromRolldownError(error: unknown, fallbackFile: string): DeckjsxDevDiagnostic {
  return bundleFailedDiagnosticFromError(error, fallbackFile);
}

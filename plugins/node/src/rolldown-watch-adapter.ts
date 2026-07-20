import { unwatchFile, watchFile, type StatsListener } from "node:fs";
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
import { deckjsxJsxTransformOptionsForCwd } from "./jsx-transform-options";

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
  readonly entry: string | readonly string[];
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
  const entry = resolveWatchEntry(cwd, options.entry);
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
  let closePromise: Promise<void> | undefined;

  return {
    start() {
      if (started || closed) {
        return;
      }
      started = true;
      void rebuild([]);
    },
    nextSourceSnapshot() {
      if (closed) {
        return Promise.resolve(closedSourceSnapshot());
      }
      const queued = queuedSourceSnapshots.shift();
      if (queued) {
        return Promise.resolve(queued);
      }
      return new Promise((resolve) => pendingSourceSnapshots.push({ resolve }));
    },
    close() {
      closePromise ??= closeAdapter();
      return closePromise;
    },
  };

  async function closeAdapter(): Promise<void> {
    closed = true;
    rebuildQueued = false;
    changedSourceIds.clear();
    queuedSourceSnapshots.length = 0;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    resolvePendingSourceSnapshots(pendingSourceSnapshots, closedSourceSnapshot());
    closeSourceWatchers();
  }

  async function rebuild(sourceIds: readonly string[]): Promise<void> {
    if (closed) {
      return;
    }
    rebuildRunning = true;
    try {
      const snapshot = await buildSourceSnapshot({
        cwd,
        entry,
        buildFactory,
        changedSourceIds: sourceIds,
      });
      if (closed) {
        return;
      }
      updateSourceWatchers(
        snapshot.status === "executable"
          ? snapshot.watchFiles.length
            ? snapshot.watchFiles
            : snapshot.moduleIds
          : [
              ...entryPaths(entry),
              ...sourceWatchers.keys(),
              ...snapshot.diagnostics.flatMap((diagnostic) =>
                diagnostic.primary?.file ? [diagnostic.primary.file] : [],
              ),
            ],
      );
      emitSourceSnapshot(snapshot);
    } finally {
      rebuildRunning = false;
      if (!closed && rebuildQueued) {
        rebuildQueued = false;
        scheduleRebuild();
      }
    }
  }

  function scheduleSourceChange(filePath: string): void {
    if (closed) {
      return;
    }
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
    if (closed) {
      return;
    }
    const sourceIds = [...changedSourceIds].sort();
    changedSourceIds.clear();
    void rebuild(sourceIds);
  }

  function emitSourceSnapshot(result: RolldownWatchSourceSnapshot): void {
    if (closed) {
      return;
    }
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
        sourceWatchers.delete(filePath);
        watcher.close();
      }
    }
    for (const filePath of nextFiles) {
      if (sourceWatchers.has(filePath)) {
        continue;
      }
      try {
        let ready = false;
        let changedWhileRegistering = false;
        let registration: { readonly close: () => void } | undefined;
        const watcher = createFileWatcher(filePath, () => {
          if (!ready) {
            changedWhileRegistering = true;
            return;
          }
          if (!closed && sourceWatchers.get(filePath) === registration) {
            scheduleSourceChange(filePath);
          }
        });
        if (closed) {
          watcher.close();
          continue;
        }
        let active = true;
        registration = {
          close() {
            if (!active) {
              return;
            }
            active = false;
            watcher.close();
          },
        };
        sourceWatchers.set(filePath, registration);
        ready = true;
        if (changedWhileRegistering && sourceWatchers.get(filePath) === registration) {
          scheduleSourceChange(filePath);
        }
      } catch {
        // Rolldown may report virtual or transient files. A later rebuild can refresh the watch set.
      }
    }
  }

  function closeSourceWatchers(): void {
    const watchers = [...sourceWatchers.values()];
    sourceWatchers.clear();
    for (const watcher of watchers) {
      watcher.close();
    }
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
  const entry = resolveWatchEntry(cwd, options.entry);
  const changedSourceIds: string[] = [];
  const watchModuleIds: string[] = [];
  const queuedSourceSnapshots: RolldownWatchSourceSnapshot[] = [];
  const pendingSourceSnapshots: PendingSourceSnapshot[] = [];
  let watcher: RolldownWatcherLike | undefined;
  let initialSourceSnapshot: Promise<RolldownWatchSourceSnapshot> | undefined;
  let started = false;
  let closed = false;
  let skipInitialWatchBundleEnd = false;
  let closePromise: Promise<void> | undefined;
  let changeListener: ((...args: readonly unknown[]) => void) | undefined;
  let eventListener: ((...args: readonly unknown[]) => void) | undefined;
  const eventTasks = new Set<Promise<void>>();

  const emitSourceSnapshot = (result: RolldownWatchSourceSnapshot) => {
    if (closed) {
      return;
    }
    const pending = pendingSourceSnapshots.shift();
    if (pending) {
      pending.resolve(result);
      return;
    }
    queuedSourceSnapshots.push(result);
  };
  const onEvent = async (event: RolldownWatchEvent) => {
    if (closed) {
      return;
    }
    try {
      if (event.code === "BUNDLE_END") {
        const changedSourceIds = consumeChangedSourceIds();
        const moduleIds = consumeWatchModuleIds();
        if (skipInitialWatchBundleEnd && changedSourceIds.length === 0) {
          skipInitialWatchBundleEnd = false;
          await event.result.close?.();
          return;
        }
        skipInitialWatchBundleEnd = false;
        emitSourceSnapshot(
          await sourceSnapshotFromBundleEnd({
            result: event.result,
            changedSourceIds,
            moduleIds,
          }),
        );
        return;
      }
      if (event.code === "ERROR") {
        await event.result?.close();
        emitSourceSnapshot(
          createDiagnosticSourceSnapshot([
            diagnosticFromRolldownError(event.error, entryDiagnosticPath(entry)),
          ]),
        );
      }
    } catch (error) {
      emitSourceSnapshot(
        createDiagnosticSourceSnapshot([
          diagnosticFromRolldownError(error, entryDiagnosticPath(entry)),
        ]),
      );
    }
  };

  return {
    start() {
      if (started || closed) {
        return;
      }
      started = true;
      const watchOptions = createRolldownWatchOptions({
        cwd,
        entry,
        onWatchChange(id) {
          if (!closed) {
            changedSourceIds.push(path.resolve(cwd, id));
          }
        },
        onBuildStart() {
          if (!closed) {
            watchModuleIds.length = 0;
          }
        },
        onModuleId(id) {
          if (!closed) {
            watchModuleIds.push(path.resolve(cwd, id));
          }
        },
      });
      watcher = (options.watchFactory ?? watch)(watchOptions);
      changeListener = (id) => {
        if (closed) {
          return;
        }
        if (typeof id === "string") {
          changedSourceIds.push(path.resolve(cwd, id));
        }
      };
      eventListener = (event) => {
        if (closed) {
          return;
        }
        const watchEvent = rolldownWatchEventFromUnknown(event);
        if (!watchEvent) {
          emitSourceSnapshot(
            createDiagnosticSourceSnapshot([
              diagnosticFromRolldownError(
                new Error("Rolldown emitted a malformed watch event."),
                entryDiagnosticPath(entry),
              ),
            ]),
          );
          return;
        }
        const task = onEvent(watchEvent);
        eventTasks.add(task);
        void task.then(
          () => {
            eventTasks.delete(task);
          },
          () => {
            eventTasks.delete(task);
          },
        );
      };
      watcher.on("change", changeListener);
      watcher.on("event", eventListener);

      if (!options.watchFactory) {
        skipInitialWatchBundleEnd = true;
        initialSourceSnapshot = initialBuildSnapshot({
          cwd,
          entry,
          buildFactory: options.buildFactory ?? rolldown,
        });
      }
    },
    nextSourceSnapshot() {
      if (closed) {
        return Promise.resolve(closedSourceSnapshot());
      }
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
    close() {
      closePromise ??= closeAdapter();
      return closePromise;
    },
  };

  async function closeAdapter(): Promise<void> {
    closed = true;
    changedSourceIds.length = 0;
    watchModuleIds.length = 0;
    queuedSourceSnapshots.length = 0;
    resolvePendingSourceSnapshots(pendingSourceSnapshots, closedSourceSnapshot());
    if (watcher && changeListener) {
      watcher.off?.("change", changeListener);
    }
    if (watcher && eventListener) {
      watcher.off?.("event", eventListener);
    }
    if (watcher && !watcher.off) {
      watcher.clear?.("change");
      watcher.clear?.("event");
    }

    let watcherCloseError: unknown;
    try {
      await watcher?.close();
    } catch (error) {
      watcherCloseError = error;
    }
    const taskResults = await Promise.allSettled(eventTasks);
    const taskErrors = taskResults.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (watcherCloseError !== undefined || taskErrors.length > 0) {
      throw new AggregateError(
        [...(watcherCloseError === undefined ? [] : [watcherCloseError]), ...taskErrors],
        "Failed to close the Rolldown watch adapter.",
      );
    }
  }

  function consumeChangedSourceIds(): readonly string[] {
    const ids = [...new Set(changedSourceIds)].sort();
    changedSourceIds.length = 0;
    return ids;
  }

  function consumeWatchModuleIds(): readonly string[] {
    return [...new Set(watchModuleIds)].sort();
  }
}

function resolvePendingSourceSnapshots(
  pendingSourceSnapshots: PendingSourceSnapshot[],
  snapshot: RolldownWatchSourceSnapshot,
): void {
  for (const pending of pendingSourceSnapshots.splice(0)) {
    pending.resolve(snapshot);
  }
}

function closedSourceSnapshot(): RolldownWatchSourceSnapshot {
  return createDiagnosticSourceSnapshot([
    {
      severity: "error",
      code: "deckjsx.node.dev.closed",
      title: "Dev source provider closed.",
    },
  ]);
}

function createNodeFileWatcher(
  filePath: string,
  onChange: () => void,
): { readonly close: () => void } {
  let active = true;
  const listener: StatsListener = (current, previous) => {
    if (active && (current.nlink !== 0 || previous.nlink !== 0)) {
      onChange();
    }
  };
  watchFile(filePath, { persistent: true, interval: 100 }, listener);
  return {
    close() {
      if (!active) {
        return;
      }
      active = false;
      unwatchFile(filePath, listener);
    },
  };
}

async function buildSourceSnapshot(input: {
  readonly cwd: string;
  readonly entry: string | readonly string[];
  readonly buildFactory: (options: WatchOptions) => Promise<RolldownWatchResult>;
  readonly changedSourceIds: readonly string[];
}): Promise<RolldownWatchSourceSnapshot> {
  const moduleIds: string[] = [];
  try {
    const result = await input.buildFactory(
      createRolldownWatchOptions({
        cwd: input.cwd,
        entry: input.entry,
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
      changedSourceIds: input.changedSourceIds,
      moduleIds,
    });
  } catch (error) {
    return createDiagnosticSourceSnapshot([
      diagnosticFromRolldownError(error, entryDiagnosticPath(input.entry)),
    ]);
  }
}

async function initialBuildSnapshot(input: {
  readonly cwd: string;
  readonly entry: string | readonly string[];
  readonly buildFactory: (options: WatchOptions) => Promise<RolldownWatchResult>;
}): Promise<RolldownWatchSourceSnapshot> {
  return buildSourceSnapshot({
    ...input,
    changedSourceIds: [],
  });
}

export function createRolldownWatchOptions(input: {
  readonly cwd: string;
  readonly entry: string | readonly string[];
  readonly onWatchChange: (id: string) => void;
  readonly onBuildStart: () => void;
  readonly onModuleId: (id: string) => void;
}): WatchOptions {
  return {
    input: typeof input.entry === "string" ? input.entry : VIRTUAL_MULTI_ENTRY_ID,
    cwd: input.cwd,
    platform: "node",
    external: isDeckjsxRuntimeExternalId,
    plugins: [
      ...(typeof input.entry === "string" ? [] : [multiEntryPlugin(input.entry)]),
      deckjsxWatchChangePlugin({
        onBuildStart: input.onBuildStart,
        onModuleId: input.onModuleId,
        onWatchChange: input.onWatchChange,
      }),
      deckjsxMediaSourceOriginPlugin(),
    ],
    transform: {
      jsx: deckjsxJsxTransformOptionsForCwd(input.cwd),
    },
  };
}

const VIRTUAL_MULTI_ENTRY_ID = "\0deckjsx:multi-entry";

function resolveWatchEntry(
  cwd: string,
  entry: string | readonly string[],
): string | readonly string[] {
  return typeof entry === "string"
    ? path.resolve(cwd, entry)
    : Object.freeze(entry.map((item) => path.resolve(cwd, item)));
}

function entryPaths(entry: string | readonly string[]): readonly string[] {
  return typeof entry === "string" ? [entry] : entry;
}

function entryDiagnosticPath(entry: string | readonly string[]): string {
  return entryPaths(entry)[0] ?? VIRTUAL_MULTI_ENTRY_ID;
}

function multiEntryPlugin(entries: readonly string[]): Plugin {
  return {
    name: "@deckjsx/node/multi-entry",
    resolveId(id) {
      return id === VIRTUAL_MULTI_ENTRY_ID ? VIRTUAL_MULTI_ENTRY_ID : undefined;
    },
    load(id) {
      if (id !== VIRTUAL_MULTI_ENTRY_ID) return undefined;
      return multiEntryModule(entries);
    },
  };
}

function multiEntryModule(entries: readonly string[]): string {
  const imports = entries.map(
    (entry, index) => `import * as entry${index} from ${JSON.stringify(entry)};`,
  );
  const completions = entries.map((_entry, index) => `Promise.resolve(entry${index}.default)`);
  return [...imports, `export default Promise.all([${completions.join(", ")}]);`].join("\n");
}

async function sourceSnapshotFromBundleEnd(input: {
  readonly result: RolldownWatchResult;
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
      return createDiagnosticSourceSnapshot([
        bundleMissingChunkDiagnostic({
          message: "Rolldown did not provide an executable chunk for the deckjsx entry.",
          notes: [
            `resultKeys=${Object.keys(result).join(",")}`,
            `resultProtoKeys=${Object.getOwnPropertyNames(Object.getPrototypeOf(result) ?? {}).join(",")}`,
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
    transform: {
      filter: {
        id: { include: /\.[cm]?[jt]sx(?:\?.*)?$/ },
      },
      handler(code, id) {
        const transformed = transformDeckjsxMediaSourceOrigins(code, id);
        return transformed ? { code: transformed, map: null } : undefined;
      },
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
    Array.isArray(value.moduleIds) &&
    value.moduleIds.every((moduleId) => typeof moduleId === "string") &&
    (!("isEntry" in value) || typeof value.isEntry === "boolean")
  );
}

function rolldownWatchEventFromUnknown(value: unknown): RolldownWatchEvent | undefined {
  if (!isRecord(value) || typeof value.code !== "string") {
    return undefined;
  }
  if (value.code === "BUNDLE_END") {
    return Array.isArray(value.output) &&
      value.output.every((output) => typeof output === "string") &&
      isRolldownWatchResult(value.result)
      ? {
          code: value.code,
          output: value.output,
          result: value.result,
        }
      : undefined;
  }
  if (value.code === "ERROR") {
    return isClosableRolldownResult(value.result)
      ? { code: value.code, error: value.error, result: value.result }
      : { code: value.code, error: value.error };
  }
  return value.code === "START" || value.code === "BUNDLE_START" || value.code === "END"
    ? { code: value.code }
    : undefined;
}

function isRolldownWatchResult(value: unknown): value is RolldownWatchResult {
  return (
    isRecord(value) &&
    (!("output" in value) || Array.isArray(value.output)) &&
    (!("watchFiles" in value) ||
      Array.isArray(value.watchFiles) ||
      (isRecord(value.watchFiles) && typeof value.watchFiles.then === "function")) &&
    (!("generate" in value) || typeof value.generate === "function") &&
    (!("close" in value) || typeof value.close === "function")
  );
}

function isClosableRolldownResult(value: unknown): value is { close(): Promise<void> | void } {
  return isRecord(value) && typeof value.close === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function outputDescription(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return typeof value;
  }
  const type = "type" in value ? String(value.type) : "missing-type";
  return `${type}:${Object.keys(value).join("|")}`;
}

function diagnosticFromRolldownError(error: unknown, fallbackFile: string): DeckjsxDevDiagnostic {
  return bundleFailedDiagnosticFromError(error, fallbackFile);
}

import path from "node:path";
import {
  createIncrementalArtifactSession,
  type IncrementalArtifactSession,
  type RenderExecutionContext,
} from "deckjsx/integration";
import { createDevChangeScheduler } from "./dev-change-scheduler";
import { createDevAssetFileWatcher, type DevAssetFileWatcher } from "./dev-asset-file-watcher";
import { createEntryExecutionHost, type EntryExecutionHost } from "./entry-execution-host";
import { createRolldownWatchAdapter } from "./rolldown-watch-adapter";
import type { DevSourceProvider } from "./dev-source-provider";
import type { DeckjsxDevExecutionSnapshot } from "./dev-source-snapshot";
import type { DeckjsxDevDiagnostic } from "./dev-diagnostics";
import type { NodeDevInspectionStore } from "./dev-inspection-store";
import { runDeckjsxDevCompilation, type DeckjsxDevCompilationResult } from "./dev-compilation";

/**
 * Options for the `@deckjsx/node/dev` incremental compiler.
 *
 * The compiler bundles one deckjsx entry module, executes it in Node, writes tracked render outputs,
 * and emits events for CLI or editor integrations. Most callers provide `entry`, `cwd`, and `out`;
 * the remaining fields are integration hooks for tests, custom source providers, or embedded tools.
 */
export type DeckjsxDevCompilerOptions = {
  /** Entry module path, resolved relative to `cwd` when it is not absolute. */
  readonly entry: string;
  /** Additional entry modules executed in the same bundled Host cycle. */
  readonly entries?: readonly string[];
  /** Working directory for bundling, execution, file watching, and output path resolution. */
  readonly cwd?: string;
  /** Primary render output path, resolved relative to `cwd` when it is not absolute. */
  readonly out?: string;
  /** Additional output paths that may be retained or tracked during incremental dev cycles. */
  readonly outputs?: readonly string[];
  /** Optional source provider. When omitted, `@deckjsx/node` creates a Rolldown watch provider. */
  readonly sourceProvider?: DevSourceProvider;
  /** Optional entry executor used by tests or embedded runtimes. */
  readonly entryHost?: EntryExecutionHost;
  /** Optional asset watcher factory used to invalidate renders when local media files change. */
  readonly createAssetFileWatcher?: (onChange: (filePath: string) => void) => DevAssetFileWatcher;
  /** Optional incremental artifact session shared with a host integration. */
  readonly session?: IncrementalArtifactSession;
  /** Optional in-memory inspection store used by the interactive dev console. */
  readonly inspectionStore?: NodeDevInspectionStore;
  /** Host Configuration context applied before Deck-local Plugins. */
  readonly renderExecutionContext?: RenderExecutionContext;
  /** Dynamic Host Session snapshot used when config changes during resident execution. */
  readonly executionSnapshot?: () => DeckjsxDevExecutionSnapshot | undefined;
};

/** Event emitted by the `@deckjsx/node/dev` compiler lifecycle. */
export type DeckjsxDevCompilerEvent =
  | {
      /** The compiler was started and source watching is active. */
      readonly type: "compilerStarted";
    }
  | {
      /** A compilation cycle began. */
      readonly type: "compilationStarted";
      /** Monotonic compilation number for this compiler instance. */
      readonly compilation: number;
      /** Source module ids or asset file paths that triggered this cycle. */
      readonly changedSourceIds: readonly string[];
    }
  | {
      /** A compilation cycle finished with an artifact update or diagnostics. */
      readonly type: "compilationFinished";
      readonly result: DeckjsxDevCompilationResult;
    }
  | {
      /** A diagnostic was emitted outside the normal compilation result stream. */
      readonly type: "diagnostic";
      readonly diagnostic: DeckjsxDevDiagnostic;
    }
  | {
      /** The compiler closed and released source providers/watchers. */
      readonly type: "compilerClosed";
    };

/**
 * Incremental deckjsx compiler used by `deckjsx dev` and editor-like integrations.
 *
 * Listeners receive lifecycle events until `close()` resolves. `start()` begins source watching,
 * `invalidate()` schedules changes, and `runNextCompilation()` awaits the next compilation result.
 */
export type DeckjsxDevCompiler = {
  /** Subscribe to compiler events. The returned function removes the listener. */
  on(listener: (event: DeckjsxDevCompilerEvent) => void): () => void;
  /** Start the compiler and source provider. Calling it more than once is ignored. */
  start(): void;
  /** Queue source or asset ids for the next compilation cycle. */
  invalidate(changedSourceIds: readonly string[]): void;
  /** Run and await the next compilation cycle. */
  runNextCompilation(): Promise<DeckjsxDevCompilationResult>;
  /** Close watchers and source providers. */
  close(): Promise<void>;
};

/**
 * Create an incremental compiler for Node-based deckjsx development.
 *
 * @param options - Compiler entry, output, source provider, and integration hooks.
 * @returns A compiler instance that can be started, invalidated, awaited, and closed.
 */
export function createDeckjsxDevCompiler(options: DeckjsxDevCompilerOptions): DeckjsxDevCompiler {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const sourceProvider =
    options.sourceProvider ??
    createRolldownWatchAdapter({
      cwd,
      entry: options.entries && options.entries.length > 1 ? options.entries : options.entry,
    });
  const entryHost = options.entryHost ?? createEntryExecutionHost({ cwd });
  const scheduler = createDevChangeScheduler({
    cwd,
    nextSourceSnapshot: () => sourceProvider.nextSourceSnapshot(),
  });
  const assetWatcher = (options.createAssetFileWatcher ?? createDevAssetFileWatcher)((filePath) =>
    scheduler.invalidateAssets([filePath]),
  );
  const session = options.session ?? createIncrementalArtifactSession();
  const listeners = new Set<(event: DeckjsxDevCompilerEvent) => void>();
  let compilation = 0;
  let started = false;
  let closed = false;
  let currentCompilation: Promise<DeckjsxDevCompilationResult> | undefined;

  const emit = (event: DeckjsxDevCompilerEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  return {
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || closed) {
        return;
      }
      started = true;
      sourceProvider.start();
      emit({ type: "compilerStarted" });
    },
    invalidate(changedSourceIds) {
      scheduler.invalidateSources(changedSourceIds);
    },
    async runNextCompilation() {
      if (currentCompilation) {
        return currentCompilation;
      }

      currentCompilation = runCompilation().finally(() => {
        currentCompilation = undefined;
      });
      return currentCompilation;
    },
    async close() {
      if (closed) return;
      closed = true;
      assetWatcher.close();
      await sourceProvider.close();
      emit({ type: "compilerClosed" });
    },
  };

  async function runCompilation(): Promise<DeckjsxDevCompilationResult> {
    compilation += 1;
    const sourceSnapshot = await scheduler.nextSourceSnapshot();
    const hostExecution =
      (sourceSnapshot.status === "executable" ? sourceSnapshot.execution : undefined) ??
      options.executionSnapshot?.();
    const changedSourceIds = scheduler.consumeChangedSourceIds(sourceSnapshot);
    emit({
      type: "compilationStarted",
      compilation,
      changedSourceIds,
    });

    const result = await runDeckjsxDevCompilation({
      cwd,
      entry: hostExecution?.entry ?? options.entry,
      out: hostExecution?.out ?? options.out,
      outputs: hostExecution?.outputs ?? options.outputs,
      compilation,
      sourceSnapshot,
      changedSourceIds,
      entryHost,
      session,
      inspectionStore: options.inspectionStore,
      renderExecutionContext:
        hostExecution?.renderExecutionContext ?? options.renderExecutionContext,
    });
    result.diagnostics.forEach((diagnostic) => emit({ type: "diagnostic", diagnostic }));
    emit({ type: "compilationFinished", result });
    if (result.status === "artifactUpdated" || result.status === "outputBlocked") {
      scheduler.commitExecutableSnapshot({
        graph: result.graph,
        sourceSnapshot: result.sourceSnapshot,
      });
      assetWatcher.update(result.graph.observedAssetFiles);
    }
    return result;
  }
}

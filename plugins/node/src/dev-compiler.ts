import path from "node:path";
import {
  createIncrementalArtifactSession,
  type IncrementalArtifactSession,
} from "deckjsx/integration";
import { createDevChangeScheduler } from "./dev-change-scheduler";
import { createDevAssetFileWatcher, type DevAssetFileWatcher } from "./dev-asset-file-watcher";
import { createEntryExecutionHost, type EntryExecutionHost } from "./entry-execution-host";
import { createRolldownWatchAdapter } from "./rolldown-watch-adapter";
import type { DevSourceProvider } from "./dev-source-provider";
import type { DeckjsxDevDiagnostic } from "./dev-diagnostics";
import { runDeckjsxDevCompilation, type DeckjsxDevCompilationResult } from "./dev-compilation";

export type DeckjsxDevCompilerOptions = {
  readonly entry: string;
  readonly cwd?: string;
  readonly out: string;
  readonly outputs?: readonly string[];
  readonly sourceProvider?: DevSourceProvider;
  readonly entryHost?: EntryExecutionHost;
  readonly createAssetFileWatcher?: (onChange: (filePath: string) => void) => DevAssetFileWatcher;
  readonly session?: IncrementalArtifactSession;
};

export type DeckjsxDevCompilerEvent =
  | {
      readonly type: "compilerStarted";
    }
  | {
      readonly type: "compilationStarted";
      readonly compilation: number;
      readonly changedSourceIds: readonly string[];
    }
  | {
      readonly type: "compilationFinished";
      readonly result: DeckjsxDevCompilationResult;
    }
  | {
      readonly type: "diagnostic";
      readonly diagnostic: DeckjsxDevDiagnostic;
    }
  | {
      readonly type: "compilerClosed";
    };

export type DeckjsxDevCompiler = {
  on(listener: (event: DeckjsxDevCompilerEvent) => void): () => void;
  start(): void;
  invalidate(changedSourceIds: readonly string[]): void;
  runNextCompilation(): Promise<DeckjsxDevCompilationResult>;
  close(): Promise<void>;
};

export function createDeckjsxDevCompiler(options: DeckjsxDevCompilerOptions): DeckjsxDevCompiler {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const sourceProvider =
    options.sourceProvider ??
    createRolldownWatchAdapter({
      cwd,
      entry: options.entry,
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
      if (started) {
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
      assetWatcher.close();
      await sourceProvider.close();
      emit({ type: "compilerClosed" });
    },
  };

  async function runCompilation(): Promise<DeckjsxDevCompilationResult> {
    compilation += 1;
    const sourceSnapshot = await scheduler.nextSourceSnapshot();
    const changedSourceIds = scheduler.consumeChangedSourceIds(sourceSnapshot);
    emit({
      type: "compilationStarted",
      compilation,
      changedSourceIds,
    });

    const result = await runDeckjsxDevCompilation({
      cwd,
      entry: options.entry,
      out: options.out,
      outputs: options.outputs,
      compilation,
      sourceSnapshot,
      changedSourceIds,
      entryHost,
      session,
    });
    result.diagnostics.forEach((diagnostic) => emit({ type: "diagnostic", diagnostic }));
    emit({ type: "compilationFinished", result });
    if (result.status === "artifactUpdated") {
      scheduler.commitExecutableSnapshot({
        graph: result.graph,
        sourceSnapshot: result.sourceSnapshot,
      });
      assetWatcher.update(result.graph.observedAssetFiles);
    }
    return result;
  }
}

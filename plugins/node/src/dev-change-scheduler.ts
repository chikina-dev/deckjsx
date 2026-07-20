import path from "node:path";
import { filterChangedSourceIdsForDevGraph, type DevModuleGraphSnapshot } from "./dev-module-graph";
import {
  isExecutableSourceSnapshot,
  type DeckjsxDevExecutableSourceSnapshot,
  type DeckjsxDevSourceSnapshot,
} from "./dev-source-snapshot";

export type ExecutableSourceSnapshot = DeckjsxDevExecutableSourceSnapshot;

export type DevChangeScheduler = {
  invalidateSources(changedSourceIds: readonly string[]): void;
  invalidateAssets(changedSourceIds: readonly string[]): void;
  nextSourceSnapshot(): Promise<DeckjsxDevSourceSnapshot>;
  consumeChangedSourceIds(snapshot: DeckjsxDevSourceSnapshot): readonly string[];
  commitExecutableSnapshot(input: {
    readonly graph: DevModuleGraphSnapshot;
    readonly sourceSnapshot: ExecutableSourceSnapshot;
  }): void;
};

type QueuedInvalidation = {
  readonly kind: "source" | "asset";
  readonly id: string;
};

export function createDevChangeScheduler(input: {
  readonly cwd: string;
  readonly nextSourceSnapshot: () => Promise<DeckjsxDevSourceSnapshot>;
}): DevChangeScheduler {
  const cwd = path.resolve(input.cwd);
  const queuedInvalidations: QueuedInvalidation[] = [];
  let pendingSourceSnapshot: Promise<DeckjsxDevSourceSnapshot> | undefined;
  let invalidationWakeup: (() => void) | undefined;
  let lastExecutableSourceSnapshot: ExecutableSourceSnapshot | undefined;
  let lastGraph: DevModuleGraphSnapshot | undefined;

  return {
    invalidateSources(changedSourceIds) {
      queueInvalidations("source", changedSourceIds);
    },
    invalidateAssets(changedSourceIds) {
      queueInvalidations("asset", changedSourceIds);
      if (lastExecutableSourceSnapshot && hasOnlyAssetInvalidations()) {
        invalidationWakeup?.();
        invalidationWakeup = undefined;
      }
    },
    async nextSourceSnapshot() {
      if (lastExecutableSourceSnapshot && hasOnlyAssetInvalidations()) {
        return cachedBuild();
      }

      const sourceSnapshot = nextSourceSnapshot().then((snapshot) => ({
        source: "provider" as const,
        snapshot,
      }));
      if (!lastExecutableSourceSnapshot) {
        return await takeSourceSnapshot();
      }

      const invalidation = new Promise<{ readonly source: "invalidation" }>((resolve) => {
        invalidationWakeup = () => {
          resolve({ source: "invalidation" });
        };
      });
      const next = await Promise.race([sourceSnapshot, invalidation]);
      invalidationWakeup = undefined;
      if (next.source === "provider") {
        pendingSourceSnapshot = undefined;
        return next.snapshot;
      }
      if (hasSourceInvalidations()) {
        return await takeSourceSnapshot();
      }
      return cachedBuild();
    },
    consumeChangedSourceIds(snapshot) {
      const ids = [
        ...queuedInvalidations.map((invalidation) => invalidation.id),
        ...(isExecutableSourceSnapshot(snapshot) ? snapshot.changedSourceIds : []),
      ];
      queuedInvalidations.length = 0;
      return normalizeChangedSourceIds(ids);
    },
    commitExecutableSnapshot({ graph, sourceSnapshot }) {
      lastGraph = graph;
      lastExecutableSourceSnapshot = {
        code: sourceSnapshot.code,
        moduleIds: sourceSnapshot.moduleIds,
        watchFiles: sourceSnapshot.watchFiles,
        changedSourceIds: [],
        status: "executable",
        ...(sourceSnapshot.execution ? { execution: sourceSnapshot.execution } : {}),
      };
    },
  };

  function queueInvalidations(
    kind: QueuedInvalidation["kind"],
    changedSourceIds: readonly string[],
  ): void {
    const normalizedChangedSourceIds = normalizeChangedSourceIds(changedSourceIds);
    for (const id of normalizedChangedSourceIds) {
      queuedInvalidations.push({ kind, id });
    }
  }

  function hasOnlyAssetInvalidations(): boolean {
    return (
      queuedInvalidations.length > 0 && queuedInvalidations.every(({ kind }) => kind === "asset")
    );
  }

  function hasSourceInvalidations(): boolean {
    return queuedInvalidations.some(({ kind }) => kind === "source");
  }

  function cachedBuild(): ExecutableSourceSnapshot {
    return {
      ...lastExecutableSourceSnapshot!,
      changedSourceIds: [],
    };
  }

  async function takeSourceSnapshot(): Promise<DeckjsxDevSourceSnapshot> {
    const snapshot = await nextSourceSnapshot();
    pendingSourceSnapshot = undefined;
    return snapshot;
  }

  function nextSourceSnapshot(): Promise<DeckjsxDevSourceSnapshot> {
    pendingSourceSnapshot ??= input.nextSourceSnapshot();
    return pendingSourceSnapshot;
  }

  function normalizeChangedSourceIds(changedSourceIds: readonly string[]): readonly string[] {
    const normalized = [...new Set(changedSourceIds.map((id) => path.resolve(cwd, id)))].sort();
    if (!lastGraph) {
      return normalized;
    }
    return filterChangedSourceIdsForDevGraph({
      graph: lastGraph,
      changedSourceIds: normalized,
    });
  }
}

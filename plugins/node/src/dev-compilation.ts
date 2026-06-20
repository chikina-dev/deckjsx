import path from "node:path";
import type { IncrementalArtifactSession } from "deckjsx/integration";
import type { RenderExecutionContext } from "deckjsx/integration";
import { createDevModuleGraphSnapshot, type DevModuleGraphSnapshot } from "./dev-module-graph";
import { withDeckjsxDevAssetObserver } from "./dev-asset-observer";
import { createDevArtifactPlanApplier } from "./dev-artifact-plan-applier";
import {
  createNodeDevInspectionAuthoringObserver,
  createNodeDevInspectionPlugin,
  type NodeDevAuthoringRuntimeObserver,
} from "./dev-inspection-plugin";
import type { NodeDevInspectionBoundary, NodeDevInspectionStore } from "./dev-inspection-store";
import type { EntryExecutionHost } from "./entry-execution-host";
import {
  devOutputIgnoreFiles,
  planDevArtifactUpdate,
  type DeckjsxDevArtifactPlan,
  type DeckjsxDevWriteRecord,
} from "./tracked-output-coordinator";
import {
  annotateDevDiagnostics,
  entryFailedDiagnostic,
  type DeckjsxDevDiagnostic,
} from "./dev-diagnostics";
import {
  isExecutableSourceSnapshot,
  type DeckjsxDevExecutableSourceSnapshot,
  type DeckjsxDevSourceSnapshot,
} from "./dev-source-snapshot";

const AUTHORING_RUNTIME_OBSERVERS = Symbol.for("deckjsx.authoringRuntimeObservers");

type RenderExecutionContextWithNodeDevObservers = RenderExecutionContext & {
  readonly [AUTHORING_RUNTIME_OBSERVERS]?: readonly NodeDevAuthoringRuntimeObserver[];
};

export type DeckjsxDevCompilationStatus =
  | "artifactUpdated"
  | "bundleFailed"
  | "entryFailed"
  | "outputBlocked";

export type DeckjsxDevCompilationResult =
  | {
      readonly ok: true;
      readonly status: "artifactUpdated";
      readonly compilation: number;
      readonly sourceSnapshot: DeckjsxDevExecutableSourceSnapshot;
      readonly artifactPlan: DeckjsxDevArtifactPlan & { readonly status: "ready" };
      readonly graph: DevModuleGraphSnapshot;
      readonly writes: readonly DeckjsxDevWriteRecord[];
      readonly retainedSlots: readonly number[];
      readonly diagnostics: readonly DeckjsxDevDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly status: "outputBlocked";
      readonly compilation: number;
      readonly sourceSnapshot: DeckjsxDevExecutableSourceSnapshot;
      readonly artifactPlan: DeckjsxDevArtifactPlan & { readonly status: "blocked" };
      readonly graph: DevModuleGraphSnapshot;
      readonly writes: readonly DeckjsxDevWriteRecord[];
      readonly retainedSlots: readonly number[];
      readonly diagnostics: readonly DeckjsxDevDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly status: "bundleFailed";
      readonly compilation: number;
      readonly sourceSnapshot: DeckjsxDevSourceSnapshot;
      readonly diagnostics: readonly DeckjsxDevDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly status: "entryFailed";
      readonly compilation: number;
      readonly sourceSnapshot: DeckjsxDevExecutableSourceSnapshot;
      readonly diagnostics: readonly DeckjsxDevDiagnostic[];
    };

export type RunDeckjsxDevCompilationInput = {
  readonly cwd: string;
  readonly entry: string;
  readonly out: string;
  readonly outputs?: readonly string[];
  readonly compilation: number;
  readonly sourceSnapshot: DeckjsxDevSourceSnapshot;
  readonly changedSourceIds: readonly string[];
  readonly entryHost: EntryExecutionHost;
  readonly session: IncrementalArtifactSession;
  readonly inspectionStore?: NodeDevInspectionStore;
};

export async function runDeckjsxDevCompilation(
  input: RunDeckjsxDevCompilationInput,
): Promise<DeckjsxDevCompilationResult> {
  input.inspectionStore?.beginAttempt({ compilation: input.compilation });
  if (!isExecutableSourceSnapshot(input.sourceSnapshot)) {
    const diagnostics = annotateDevDiagnostics(input.sourceSnapshot.diagnostics, {
      phase: "bundle",
      compilation: input.compilation,
    });
    input.inspectionStore?.finishAttempt({ devStatus: "bundleFailed", boundary: "bundle" });
    return {
      ok: false,
      status: "bundleFailed",
      compilation: input.compilation,
      sourceSnapshot: {
        ...input.sourceSnapshot,
        diagnostics,
      },
      diagnostics,
    };
  }

  const sourceSnapshot = {
    ...input.sourceSnapshot,
    changedSourceIds: input.changedSourceIds,
  } satisfies DeckjsxDevExecutableSourceSnapshot;
  const observedAssetFiles = new Set<string>();
  const cycle = input.session.beginCycle(
    cycleOptionsForCompilation({
      changedSourceIds: input.changedSourceIds,
      inspectionStore: input.inspectionStore,
    }),
  );
  try {
    await cycle.run(async () => {
      await withDeckjsxDevAssetObserver(
        (filePath) => {
          observedAssetFiles.add(path.resolve(input.cwd, filePath));
        },
        async () => {
          await input.entryHost.execute({ code: sourceSnapshot.code });
        },
      );
    });
  } catch (error) {
    try {
      cycle.complete();
    } catch {
      // Preserve the original entry failure diagnostic; completion is best-effort cleanup here.
    }
    const diagnostics = annotateDevDiagnostics(
      [entryFailedDiagnostic({ error, file: path.resolve(input.cwd, input.entry) })],
      {
        phase: "entry",
        compilation: input.compilation,
      },
    );
    input.inspectionStore?.finishAttempt({ devStatus: "entryFailed", boundary: "entry" });
    return {
      ok: false,
      status: "entryFailed",
      compilation: input.compilation,
      sourceSnapshot,
      diagnostics,
    };
  }

  const cycleResult = cycle.complete();
  const artifactPlan = planDevArtifactUpdate({
    cwd: input.cwd,
    out: input.out,
    outputs: input.outputs,
    writes: cycleResult.writes,
  });
  const annotatedArtifactPlan = {
    ...artifactPlan,
    diagnostics: annotateDevDiagnostics(artifactPlan.diagnostics, {
      phase: "output",
      compilation: input.compilation,
    }),
  } satisfies DeckjsxDevArtifactPlan;
  createDevArtifactPlanApplier({ session: input.session }).apply(annotatedArtifactPlan);
  const graph = createDevModuleGraphSnapshot({
    cwd: input.cwd,
    moduleIds: sourceSnapshot.moduleIds,
    watchFiles: sourceSnapshot.watchFiles,
    observedAssetFiles: [...observedAssetFiles],
    ignoredFiles: devOutputIgnoreFiles({
      cwd: input.cwd,
      out: input.out,
      outputs: input.outputs,
    }),
  });
  const resultBase = {
    compilation: input.compilation,
    sourceSnapshot,
    artifactPlan: annotatedArtifactPlan,
    graph,
    writes: annotatedArtifactPlan.writes,
    retainedSlots: annotatedArtifactPlan.retainedSlots,
    diagnostics: annotatedArtifactPlan.diagnostics,
  };
  if (annotatedArtifactPlan.status === "ready") {
    const readyArtifactPlan = {
      ...annotatedArtifactPlan,
      status: "ready" as const,
    };
    input.inspectionStore?.finishAttempt({
      devStatus: "artifactUpdated",
      boundary: boundaryForCompilationStatus("artifactUpdated"),
    });
    return {
      ok: true,
      status: "artifactUpdated",
      ...resultBase,
      artifactPlan: readyArtifactPlan,
    };
  }
  const blockedArtifactPlan = {
    ...annotatedArtifactPlan,
    status: "blocked" as const,
  };
  input.inspectionStore?.finishAttempt({
    devStatus: "outputBlocked",
    boundary: boundaryForCompilationStatus("outputBlocked"),
  });
  return {
    ok: false,
    status: "outputBlocked",
    ...resultBase,
    artifactPlan: blockedArtifactPlan,
  };
}

function cycleOptionsForCompilation(input: {
  readonly changedSourceIds: readonly string[];
  readonly inspectionStore?: NodeDevInspectionStore;
}): {
  readonly sourceInvalidation?: { readonly changedSourceIds: readonly string[] };
  readonly renderExecutionContext?: RenderExecutionContext;
} {
  return {
    ...(input.changedSourceIds.length > 0
      ? { sourceInvalidation: { changedSourceIds: input.changedSourceIds } }
      : {}),
    ...(input.inspectionStore
      ? { renderExecutionContext: renderExecutionContextForInspection(input.inspectionStore) }
      : {}),
  };
}

function renderExecutionContextForInspection(
  inspectionStore: NodeDevInspectionStore,
): RenderExecutionContextWithNodeDevObservers {
  return {
    [AUTHORING_RUNTIME_OBSERVERS]: [
      createNodeDevInspectionAuthoringObserver({ store: inspectionStore }),
    ],
    plugins: [createNodeDevInspectionPlugin({ store: inspectionStore })],
  };
}

function boundaryForCompilationStatus(
  status: DeckjsxDevCompilationStatus,
): NodeDevInspectionBoundary {
  return status === "artifactUpdated" ? "projection" : "output";
}

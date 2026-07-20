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

/** Status of one `@deckjsx/node/dev` compilation cycle. */
export type DeckjsxDevCompilationStatus =
  | "artifactUpdated"
  | "bundleFailed"
  | "entryFailed"
  | "outputBlocked";

/**
 * Result of one `@deckjsx/node/dev` compilation cycle.
 *
 * Successful cycles update the artifact plan and tracked outputs. Failed cycles keep diagnostics
 * structured by phase so CLIs and editor integrations can render actionable feedback.
 */
export type DeckjsxDevCompilationResult =
  | {
      /** The deck rendered and all tracked output writes were accepted. */
      readonly ok: true;
      readonly status: "artifactUpdated";
      /** Monotonic compilation number from the compiler instance. */
      readonly compilation: number;
      /** Executable bundled source snapshot used for this cycle. */
      readonly sourceSnapshot: DeckjsxDevExecutableSourceSnapshot;
      /** Ready artifact plan for the successful output update. */
      readonly artifactPlan: DeckjsxDevArtifactPlan & { readonly status: "ready" };
      /** Module graph and watch-file summary used for future invalidation. */
      readonly graph: DevModuleGraphSnapshot;
      /** Write records reported by the render integration. */
      readonly writes: readonly DeckjsxDevWriteRecord[];
      /** Output slots retained from a previous cycle. */
      readonly retainedSlots: readonly number[];
      /** Non-fatal diagnostics emitted during the cycle. */
      readonly diagnostics: readonly DeckjsxDevDiagnostic[];
    }
  | {
      /** The deck rendered, but the requested tracked outputs could not all be updated. */
      readonly ok: false;
      readonly status: "outputBlocked";
      readonly compilation: number;
      readonly sourceSnapshot: DeckjsxDevExecutableSourceSnapshot;
      /** Blocked artifact plan explaining the output conflict. */
      readonly artifactPlan: DeckjsxDevArtifactPlan & { readonly status: "blocked" };
      readonly graph: DevModuleGraphSnapshot;
      readonly writes: readonly DeckjsxDevWriteRecord[];
      readonly retainedSlots: readonly number[];
      readonly diagnostics: readonly DeckjsxDevDiagnostic[];
    }
  | {
      /** Bundling failed before the entry module could run. */
      readonly ok: false;
      readonly status: "bundleFailed";
      readonly compilation: number;
      readonly sourceSnapshot: DeckjsxDevSourceSnapshot;
      readonly diagnostics: readonly DeckjsxDevDiagnostic[];
    }
  | {
      /** The bundled entry executed but failed before producing a usable render result. */
      readonly ok: false;
      readonly status: "entryFailed";
      readonly compilation: number;
      readonly sourceSnapshot: DeckjsxDevExecutableSourceSnapshot;
      readonly diagnostics: readonly DeckjsxDevDiagnostic[];
    };

export type RunDeckjsxDevCompilationInput = {
  readonly cwd: string;
  readonly entry: string;
  readonly out?: string;
  readonly outputs?: readonly string[];
  readonly compilation: number;
  readonly sourceSnapshot: DeckjsxDevSourceSnapshot;
  readonly changedSourceIds: readonly string[];
  readonly entryHost: EntryExecutionHost;
  readonly session: IncrementalArtifactSession;
  readonly inspectionStore?: NodeDevInspectionStore;
  readonly renderExecutionContext?: RenderExecutionContext;
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
  const sourceDiagnostics = (sourceSnapshot.diagnostics ?? []).map((diagnostic) => ({
    ...diagnostic,
    compilation: diagnostic.compilation ?? input.compilation,
  }));
  const observedAssetFiles = new Set<string>();
  const cycle = input.session.beginCycle(
    cycleOptionsForCompilation({
      changedSourceIds: input.changedSourceIds,
      inspectionStore: input.inspectionStore,
      renderExecutionContext: input.renderExecutionContext,
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
    const diagnostics = [
      ...sourceDiagnostics,
      ...annotateDevDiagnostics(
        [entryFailedDiagnostic({ error, file: path.resolve(input.cwd, input.entry) })],
        {
          phase: "entry",
          compilation: input.compilation,
        },
      ),
    ];
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
    diagnostics: [...sourceDiagnostics, ...annotatedArtifactPlan.diagnostics],
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
  readonly renderExecutionContext?: RenderExecutionContext;
}): {
  readonly sourceInvalidation?: { readonly changedSourceIds: readonly string[] };
  readonly renderExecutionContext?: RenderExecutionContext;
} {
  return {
    ...(input.changedSourceIds.length > 0
      ? { sourceInvalidation: { changedSourceIds: input.changedSourceIds } }
      : {}),
    ...((input.inspectionStore || input.renderExecutionContext) && {
      renderExecutionContext: mergeDevRenderExecutionContexts(
        input.renderExecutionContext,
        input.inspectionStore
          ? renderExecutionContextForInspection(input.inspectionStore)
          : undefined,
      ),
    }),
  };
}

function mergeDevRenderExecutionContexts(
  base: RenderExecutionContext | undefined,
  inspection: RenderExecutionContextWithNodeDevObservers | undefined,
): RenderExecutionContextWithNodeDevObservers {
  return {
    ...base,
    ...inspection,
    plugins: [...(base?.plugins ?? []), ...(inspection?.plugins ?? [])],
    ...(inspection?.[AUTHORING_RUNTIME_OBSERVERS]
      ? { [AUTHORING_RUNTIME_OBSERVERS]: inspection[AUTHORING_RUNTIME_OBSERVERS] }
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

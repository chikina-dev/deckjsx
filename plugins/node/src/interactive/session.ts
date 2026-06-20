import type { DeckjsxDevCompiler } from "../dev-compiler";
import type { NodeDevInspectionStore } from "../dev-inspection-store";
import type { IncrementalArtifactSession } from "deckjsx/integration";
import {
  createInteractiveInspectorModel,
  type InteractiveCommand,
  type InteractiveInspectorModel,
  type InteractiveResponse,
} from "./inspector-model";
import type { InteractiveDiagnosticSnapshot } from "./diagnostic-snapshot";

export type { InteractiveCommand, InteractiveResponse } from "./inspector-model";

export type InteractiveDevSession = {
  dispatch(command: InteractiveCommand): Promise<InteractiveResponse>;
  close(): void;
};

export function createInteractiveDevSession(input: {
  readonly compiler: DeckjsxDevCompiler;
  readonly artifactSession?: IncrementalArtifactSession;
  readonly inspectionStore?: NodeDevInspectionStore;
  readonly diagnostics?: InteractiveDiagnosticSnapshot;
  readonly now?: () => number;
  readonly createInspectorModel?: (input: {
    readonly artifactSession?: IncrementalArtifactSession;
    readonly inspectionStore?: NodeDevInspectionStore;
    readonly diagnostics?: InteractiveDiagnosticSnapshot;
    readonly now?: () => number;
  }) => InteractiveInspectorModel;
}): InteractiveDevSession {
  const inspectorModel = (input.createInspectorModel ?? createInteractiveInspectorModel)({
    artifactSession: input.artifactSession,
    inspectionStore: input.inspectionStore,
    diagnostics: input.diagnostics,
    now: input.now,
  });
  const unsubscribe = input.compiler.on((event) => {
    inspectorModel.applyCompilerEvent(event);
  });

  return {
    dispatch(command) {
      return inspectorModel.dispatch(command);
    },
    close() {
      unsubscribe();
    },
  };
}

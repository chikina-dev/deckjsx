import type { Diagnostics } from "../diagnostics";
import type { StageArtifactStatus, StageName, StageSummary } from "./contract";

export function resultOk(diagnostics: Diagnostics): boolean {
  return !diagnostics.hasErrors;
}

export function stageSummary<TStage extends StageName, TArtifact extends StageArtifactStatus>(
  stage: TStage,
  diagnostics: Diagnostics,
  artifact: TArtifact,
): StageSummary<TArtifact> & { readonly stage: TStage } {
  return {
    stage,
    ok: resultOk(diagnostics),
    diagnostics,
    artifact,
  };
}

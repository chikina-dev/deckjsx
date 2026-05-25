import type { Diagnostics } from "./diagnostics";

export type ProjectionFormat = "pptx";

export type OutputFormat = ProjectionFormat | "pdf";

export type StageName = "compile" | "project" | "render";

export type StageArtifactStatus = "available" | "partial" | "missing";

export type StageSummary = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly artifact: StageArtifactStatus;
};

export type CompileStageSummary = StageSummary & {
  readonly stage: "compile";
};

export type ProjectStageSummary = StageSummary & {
  readonly stage: "project";
};

export type RenderStageSummary = StageSummary & {
  readonly stage: "render";
};

export type CompileStages = {
  readonly compile: CompileStageSummary;
};

export type ProjectStages = CompileStages & {
  readonly project: ProjectStageSummary;
};

export type RenderStages = ProjectStages & {
  readonly render: RenderStageSummary;
};

export type RenderedArtifact<TFormat extends OutputFormat = OutputFormat> = {
  readonly format: TFormat;
  readonly mediaType: string;
  readonly extension: string;
  readonly bytes: Uint8Array;
};

export type WrittenOutput = {
  readonly path: string;
};

export function resultOk(diagnostics: Diagnostics): boolean {
  return !diagnostics.hasErrors;
}

export function stageSummary<TStage extends StageName>(
  stage: TStage,
  diagnostics: Diagnostics,
  artifact: StageArtifactStatus,
): StageSummary & { readonly stage: TStage } {
  return {
    stage,
    ok: resultOk(diagnostics),
    diagnostics,
    artifact,
  };
}

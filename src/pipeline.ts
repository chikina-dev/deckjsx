import type { Diagnostics } from "./diagnostics";

export type ProjectionFormat = "pptx";

export type OutputFormat = ProjectionFormat | "pdf";

export type StageName = "compile" | "project" | "render";

export type StageArtifactStatus = "available" | "partial" | "missing";

export type InspectionDetailLevel = "details" | "none" | "summary";

export type ProjectOptions = {
  readonly inspection?: InspectionDetailLevel;
};

export type StageSummary<TArtifact extends StageArtifactStatus = StageArtifactStatus> = {
  readonly ok: boolean;
  readonly diagnostics: Diagnostics;
  readonly artifact: TArtifact;
};

export type CompileStageSummary<TArtifact extends StageArtifactStatus = StageArtifactStatus> =
  StageSummary<TArtifact> & {
    readonly stage: "compile";
  };

export type ProjectStageSummary<TArtifact extends StageArtifactStatus = StageArtifactStatus> =
  StageSummary<TArtifact> & {
    readonly stage: "project";
  };

export type RenderStageSummary<TArtifact extends StageArtifactStatus = StageArtifactStatus> =
  StageSummary<TArtifact> & {
    readonly stage: "render";
  };

export type CompileStages<TCompileArtifact extends StageArtifactStatus = StageArtifactStatus> = {
  readonly compile: CompileStageSummary<TCompileArtifact>;
};

export type ProjectStages<
  TCompileArtifact extends StageArtifactStatus = StageArtifactStatus,
  TProjectArtifact extends StageArtifactStatus = StageArtifactStatus,
> = CompileStages<TCompileArtifact> & {
  readonly project: ProjectStageSummary<TProjectArtifact>;
};

export type RenderStages<
  TCompileArtifact extends StageArtifactStatus = StageArtifactStatus,
  TProjectArtifact extends StageArtifactStatus = StageArtifactStatus,
  TRenderArtifact extends StageArtifactStatus = StageArtifactStatus,
> = ProjectStages<TCompileArtifact, TProjectArtifact> & {
  readonly render: RenderStageSummary<TRenderArtifact>;
};

export type RenderedArtifact<TFormat extends OutputFormat = OutputFormat> = {
  readonly format: TFormat;
  readonly mediaType: string;
  readonly extension: string;
  readonly bytes: Uint8Array;
};

export type RenderAssemblyExpectedEntrySummary = {
  readonly path: string;
  readonly packagePartId?: string;
  readonly orderKey?: string;
  readonly requirement: "conditional" | "optional" | "required";
  readonly required: boolean;
  readonly requirementCondition?: string;
  readonly requirementDependencies?: readonly string[];
  readonly requirementReason?: string;
  readonly compression: "default" | "store";
};

export type RenderAssemblyFinalEntrySummary = {
  readonly status: "failed" | "missing" | "rebuilt" | "reused";
  readonly byteLength?: number;
  readonly reason?: string;
  readonly reasonDetails?: RenderAssemblyReasonDetails;
  readonly message?: string;
};

export type RenderAssemblyFingerprintDelta = {
  readonly previous?: string;
  readonly current?: string;
};

export type RenderAssemblyBuildSummary = {
  readonly partFingerprint: string;
  readonly writerFingerprint: string;
  readonly emitterFingerprint?: string;
  readonly dependencyFingerprintCount: number;
  readonly dependencyFingerprints?: readonly {
    readonly packagePartId: string;
    readonly fingerprint: string;
  }[];
  readonly mediaByteFingerprint?: string;
  readonly mediaByteFingerprintSource?: "byteHash" | "loadedAssetHash" | "projectedMetadataHash";
  readonly diagnosticCodes: readonly string[];
};

export type RenderAssemblyReasonDetails =
  | {
      readonly kind: "buildArtifactFingerprintMatched";
      readonly matchedBuild: RenderAssemblyBuildSummary;
    }
  | {
      readonly kind: "dependencyFingerprintChanged";
      readonly dependencyFingerprints: {
        readonly previous: RenderAssemblyBuildSummary["dependencyFingerprints"];
        readonly current: RenderAssemblyBuildSummary["dependencyFingerprints"];
      };
    }
  | {
      readonly kind: "emitterFingerprintChanged";
      readonly emitterFingerprint: RenderAssemblyFingerprintDelta;
    }
  | {
      readonly kind: "mediaBytesChanged";
      readonly mediaByteFingerprint: RenderAssemblyFingerprintDelta;
      readonly mediaByteFingerprintSource?: {
        readonly previous?: RenderAssemblyBuildSummary["mediaByteFingerprintSource"];
        readonly current?: RenderAssemblyBuildSummary["mediaByteFingerprintSource"];
      };
    }
  | {
      readonly kind: "missingArtifact";
      readonly currentBuild?: RenderAssemblyBuildSummary;
    }
  | {
      readonly kind: "orderKeyChanged";
      readonly orderKey: RenderAssemblyFingerprintDelta;
    }
  | {
      readonly kind: "packagePartIdChanged";
      readonly packagePartId: RenderAssemblyFingerprintDelta;
    }
  | {
      readonly kind: "partEmitterFailed" | "mediaEmitterFailed";
      readonly message?: string;
    }
  | {
      readonly kind: "partEmitterReturnedNoBytes" | "mediaBytesMissing";
    }
  | {
      readonly kind: "partFingerprintChanged";
      readonly partFingerprint: RenderAssemblyFingerprintDelta;
    }
  | {
      readonly kind: "pathChanged";
      readonly path: RenderAssemblyFingerprintDelta;
    }
  | {
      readonly kind: "writerFingerprintChanged";
      readonly writerFingerprint: RenderAssemblyFingerprintDelta;
    }
  | {
      readonly kind: "custom";
      readonly reason: string;
    };

export type RenderAssemblyPlanEntrySummary = RenderAssemblyExpectedEntrySummary &
  RenderAssemblyFinalEntrySummary & {
    readonly expected: RenderAssemblyExpectedEntrySummary;
    readonly final: RenderAssemblyFinalEntrySummary;
    readonly build?: RenderAssemblyBuildSummary;
    readonly previousBuild?: RenderAssemblyBuildSummary;
  };

export type RenderAssemblyPlanSummary = {
  readonly entries: readonly RenderAssemblyPlanEntrySummary[];
  readonly entryCount: number;
  readonly rebuiltCount: number;
  readonly reusedCount: number;
  readonly missingCount: number;
  readonly failedCount: number;
};

export type RenderOutputSideEffectStatus =
  | "failed"
  | "notRequested"
  | "skipped"
  | "unavailable"
  | "written";

export type RenderOutputSideEffectReason =
  | "artifactMissing"
  | "noOutputRequested"
  | "outputWriteFailed"
  | "runtimeOutputUnavailable";

export type RenderOutputSideEffectSummary = {
  readonly requested: boolean;
  readonly status: RenderOutputSideEffectStatus;
  readonly path?: string;
  readonly reason?: RenderOutputSideEffectReason;
  readonly message?: string;
  readonly runtime?: {
    readonly kind: "node";
    readonly available: boolean;
    readonly reason?: string;
  };
};

export type RenderInspectionSummary = {
  readonly assembly?: RenderAssemblyPlanSummary;
  readonly output?: RenderOutputSideEffectSummary;
};

export type WrittenOutput = {
  readonly path: string;
};

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

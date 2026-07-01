import type { Diagnostics } from "../diagnostics";
import type {
  RenderPatchPlan,
  RenderPatchPlanPart,
  RenderPatchPlanPartKind,
} from "../patchable-pptx";

/** Document model format produced by `deck.project()`. */
export type ProjectionFormat = "pptx" | "pdf";

/** Runtime artifact format produced by `deck.render(...)`. */
export type OutputFormat = ProjectionFormat;

/** Pipeline stage names exposed in compile/project/render result summaries. */
export type StageName = "compile" | "project" | "render";

/**
 * Availability of a stage artifact.
 *
 * `available` means the stage produced a complete artifact, `partial` means an artifact exists but
 * the stage also has error diagnostics, and `missing` means callers must not read that stage's
 * artifact property.
 */
export type StageArtifactStatus = "available" | "partial" | "missing";

/**
 * Amount of inspection summary work requested from project/render.
 *
 * Use `none` on hot paths that only need the projected model or rendered bytes.
 */
export type InspectionDetailLevel = "details" | "none" | "summary";

/** Options accepted by `deck.project(...)`. */
export type ProjectOptions = {
  /** Projection format to produce for this project call. */
  readonly format?: ProjectionFormat;
  /** Controls optional inspection summaries. Defaults to the normal summary level. */
  readonly inspection?: InspectionDetailLevel;
};

/**
 * Public summary for one pipeline stage.
 *
 * `ok` mirrors whether that stage diagnostics contain errors. `artifact` tells callers whether the
 * stage artifact may be read, may be read only as partial output for inspection, or is absent.
 */
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

/**
 * Runtime-neutral bytes produced by `deck.render(...)`.
 *
 * `deck.render(pptx())` returns this value in `RenderResult.artifact`; use an integration package
 * such as `@deckjsx/node` to write the bytes to disk.
 */
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

export type RenderInspectionSummary = {
  readonly assembly?: RenderAssemblyPlanSummary;
};

export type { RenderPatchPlan, RenderPatchPlanPart, RenderPatchPlanPartKind };

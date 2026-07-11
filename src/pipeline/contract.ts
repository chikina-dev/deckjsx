import type { Diagnostics } from "../diagnostics";

/** Document model format produced by `deck.project()`. */
export type ProjectionFormat = "pptx" | "pdf";

/** Extensible runtime artifact format produced by `deck.render(...)`. */
export type OutputFormat = ProjectionFormat | (string & {});

/** Pipeline stage names exposed in compile/project/render result summaries. */
export type StageName = "compile" | "project" | "render";

/**
 * Availability of a pipeline stage artifact.
 *
 * `available` means the artifact is complete, `partial` means an artifact exists with error
 * diagnostics and should be treated as inspection/debug output, and `missing` means the
 * corresponding result property is intentionally absent.
 */
export type StageArtifactStatus = "available" | "partial" | "missing";

/**
 * Amount of inspection summary work requested from project/render.
 *
 * Use `none` for hot paths that only need the projected model or rendered bytes. `summary` keeps
 * the public result lightweight; detailed inspection remains behind `deckjsx/inspect` and
 * integration APIs.
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
 * `ok` reports whether that stage diagnostics contain errors. `artifact` tells callers whether the
 * stage artifact can be read (`available`), can only be used as partial diagnostic output
 * (`partial`), or is absent (`missing`).
 */
export type StageSummary<TArtifact extends StageArtifactStatus = StageArtifactStatus> = {
  /** Whether this stage completed without error diagnostics. */
  readonly ok: boolean;
  /** Diagnostics produced by this stage. */
  readonly diagnostics: Diagnostics;
  /** Availability of this stage's artifact in the enclosing result. */
  readonly artifact: TArtifact;
};

/** Compile-stage summary with a literal `stage` discriminator. */
export type CompileStageSummary<TArtifact extends StageArtifactStatus = StageArtifactStatus> =
  StageSummary<TArtifact> & {
    readonly stage: "compile";
  };

/** Project-stage summary with a literal `stage` discriminator. */
export type ProjectStageSummary<TArtifact extends StageArtifactStatus = StageArtifactStatus> =
  StageSummary<TArtifact> & {
    readonly stage: "project";
  };

/** Render-stage summary with a literal `stage` discriminator. */
export type RenderStageSummary<TArtifact extends StageArtifactStatus = StageArtifactStatus> =
  StageSummary<TArtifact> & {
    readonly stage: "render";
  };

/**
 * Stage map returned by `deck.compile()`.
 *
 * The generic captures whether a compile graph artifact is present, partial, or missing so callers
 * can narrow result handling without reaching into internal pipeline objects.
 */
export type CompileStages<TCompileArtifact extends StageArtifactStatus = StageArtifactStatus> = {
  readonly compile: CompileStageSummary<TCompileArtifact>;
};

/**
 * Stage map returned by `deck.project()`.
 *
 * The compile and project artifact states are tracked separately because projection may fail even
 * when compile produced an inspectable graph.
 */
export type ProjectStages<
  TCompileArtifact extends StageArtifactStatus = StageArtifactStatus,
  TProjectArtifact extends StageArtifactStatus = StageArtifactStatus,
> = CompileStages<TCompileArtifact> & {
  readonly project: ProjectStageSummary<TProjectArtifact>;
};

/**
 * Stage map returned by `deck.render(...)`.
 *
 * Render results preserve compile, project, and render artifact states independently. This lets
 * tools explain whether a failure came from authoring, projection, or output generation while
 * keeping internal artifact collection types out of the public API.
 */
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
 * Use an integration package such as `@deckjsx/node` to write these bytes to disk. The core
 * package keeps rendering and filesystem output separate.
 */
export type RenderedArtifact<TFormat extends OutputFormat = OutputFormat> = {
  /** Output format represented by this artifact. */
  readonly format: TFormat;
  /** MIME media type for the rendered bytes. */
  readonly mediaType: string;
  /** Recommended filename extension without a leading dot. */
  readonly extension: string;
  /** Rendered artifact bytes. */
  readonly bytes: Uint8Array;
};

/** Kind of PPTX package part that can participate in render patch planning. */
export type RenderPatchPlanPartKind = "manifest" | "media" | "xml";

/**
 * Public patch-plan record for one rendered package part.
 *
 * Patch plans are produced by `deck.render(...)` and consumed by integrations such as
 * `@deckjsx/node`. They are inspection and update hints, not authoring input. Callers should treat
 * fingerprints and byte lengths as opaque values used to decide whether an existing artifact can be
 * updated in place.
 */
export type RenderPatchPlanPart = {
  /** Stable package-part identity used by the render pipeline. */
  readonly packagePartId: string;
  /** Package path inside the rendered artifact. */
  readonly path: string;
  /** Broad kind of part, used by integrations to choose a patch strategy. */
  readonly patchableKind: RenderPatchPlanPartKind;
  /** Reserved byte capacity for in-place patching when the writer supports it. */
  readonly reservedCapacity: number;
  /** Logical payload size before package-level storage details. */
  readonly logicalByteLength: number;
  /** Stored byte size in the rendered artifact. */
  readonly storedByteLength: number;
  /** Opaque fingerprint for detecting whether this part changed. */
  readonly fingerprint: string;
  /** Whether this part was rebuilt or reused during the render that produced the plan. */
  readonly buildStatus?: "rebuilt" | "reused";
  /** Public reason string explaining the build status when available. */
  readonly buildReason?: string;
};

/**
 * Public render patch plan for integrations that can update existing artifacts.
 *
 * The core package never writes to disk. A patch plan lets a host integration compare rendered
 * parts with an existing file and choose between in-place updates and replacement. The shape is
 * versioned and intentionally limited to stable, runtime-neutral metadata.
 */
export type RenderPatchPlan = {
  /** Discriminator for deckjsx render patch plans. */
  readonly kind: "deckjsx.renderPatchPlan";
  /** Patch plan schema version. */
  readonly version: 1;
  /** Path of the deckjsx patch manifest inside the package. */
  readonly manifestPath: "ppt/deckjsx/patch-manifest.json";
  /** Optional source invalidation summary for development tooling. */
  readonly sourceInvalidation?: {
    readonly changedSourceIds: readonly string[];
  };
  /** Package parts that may be inspected or patched by an integration. */
  readonly parts: readonly RenderPatchPlanPart[];
};

/** Expected package entry metadata used by render inspection summaries. */
export type RenderAssemblyExpectedEntrySummary = {
  /** Package path for this entry. */
  readonly path: string;
  /** Stable package-part identity when the entry is part-backed. */
  readonly packagePartId?: string;
  /** Ordering key used by deterministic package assembly. */
  readonly orderKey?: string;
  /** Whether the entry is required, optional, or conditionally required. */
  readonly requirement: "conditional" | "optional" | "required";
  /** Convenience boolean for required entries. */
  readonly required: boolean;
  /** Human-readable condition for conditional entries. */
  readonly requirementCondition?: string;
  /** Package-part ids or feature inputs that make this entry required. */
  readonly requirementDependencies?: readonly string[];
  /** Public explanation for why the entry is expected. */
  readonly requirementReason?: string;
};

/** Final package entry state after render assembly. */
export type RenderAssemblyFinalEntrySummary = {
  /** Whether the entry failed, was missing, was rebuilt, or was reused. */
  readonly status: "failed" | "missing" | "rebuilt" | "reused";
  /** Final byte length when bytes were produced or reused. */
  readonly byteLength?: number;
  /** Short public reason string for the final state. */
  readonly reason?: string;
  /** Structured reason details for common rebuild/reuse decisions. */
  readonly reasonDetails?: RenderAssemblyReasonDetails;
  /** Additional user-facing detail when available. */
  readonly message?: string;
};

/** Previous/current fingerprint pair used in assembly reason details. */
export type RenderAssemblyFingerprintDelta = {
  readonly previous?: string;
  readonly current?: string;
};

/**
 * Public build fingerprint summary for one package part.
 *
 * The values are opaque and intended for inspection, diagnostics, and integration cache decisions.
 * They are not authoring inputs and should not be parsed by user code.
 */
export type RenderAssemblyBuildSummary = {
  /** Opaque fingerprint for the logical package part payload. */
  readonly partFingerprint: string;
  /** Opaque fingerprint for the writer implementation that emitted this part. */
  readonly writerFingerprint: string;
  /** Opaque fingerprint for the part-specific emitter, when the writer provides one. */
  readonly emitterFingerprint?: string;
  /** Number of dependency fingerprints that contributed to this part. */
  readonly dependencyFingerprintCount: number;
  /** Opaque fingerprints for package parts or inputs this part depends on. */
  readonly dependencyFingerprints?: readonly {
    /** Stable package-part identity of the dependency. */
    readonly packagePartId: string;
    /** Opaque dependency fingerprint captured during render. */
    readonly fingerprint: string;
  }[];
  /** Opaque fingerprint of media bytes that affected this part, when applicable. */
  readonly mediaByteFingerprint?: string;
  /** Source used to derive `mediaByteFingerprint`. */
  readonly mediaByteFingerprintSource?: "byteHash" | "loadedAssetHash" | "projectedMetadataHash";
  /** Diagnostic codes that affected this part during the build. */
  readonly diagnosticCodes: readonly string[];
};

/**
 * Structured explanation for why an assembly entry was rebuilt, reused, missing, or failed.
 *
 * These details are intentionally high level. They expose stable public causes without leaking
 * writer internals, serialized XML, compression settings, or raw artifact bytes.
 */
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

/**
 * Public inspection summary for one package entry.
 *
 * `expected` and `final` keep the normalized expectation/result shapes available even though their
 * fields are also flattened onto the entry for convenient display.
 */
export type RenderAssemblyPlanEntrySummary = RenderAssemblyExpectedEntrySummary &
  RenderAssemblyFinalEntrySummary & {
    /** Normalized expected entry metadata. */
    readonly expected: RenderAssemblyExpectedEntrySummary;
    /** Normalized final entry state. */
    readonly final: RenderAssemblyFinalEntrySummary;
    /** Current build fingerprint summary when the entry was emitted or reused. */
    readonly build?: RenderAssemblyBuildSummary;
    /** Previous build fingerprint summary when render reuse inspected an earlier artifact. */
    readonly previousBuild?: RenderAssemblyBuildSummary;
  };

/** Public render assembly summary returned when render inspection is requested. */
export type RenderAssemblyPlanSummary = {
  /** Per-entry render assembly decisions in package order. */
  readonly entries: readonly RenderAssemblyPlanEntrySummary[];
  /** Total number of package entries considered by assembly. */
  readonly entryCount: number;
  /** Number of entries rebuilt for this render. */
  readonly rebuiltCount: number;
  /** Number of entries reused from a previous artifact. */
  readonly reusedCount: number;
  /** Number of expected entries that were not available. */
  readonly missingCount: number;
  /** Number of entries whose assembly failed. */
  readonly failedCount: number;
};

/**
 * Lightweight render inspection summary.
 *
 * The summary is optional and controlled by project/render inspection options. It is intended for
 * development tooling, tests, and performance diagnostics; rendering bytes do not require it.
 */
export type RenderInspectionSummary = {
  readonly assembly?: RenderAssemblyPlanSummary;
};

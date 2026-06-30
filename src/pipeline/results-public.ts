import type { Diagnostics } from "../diagnostics";
import type {
  CompileStages,
  OutputFormat,
  ProjectStages,
  ProjectionFormat,
  RenderedArtifact,
  RenderInspectionSummary,
  RenderPatchPlan,
  RenderStages,
  StageArtifactStatus,
} from "./contract";

/** Stage artifact states where an inspectable artifact exists. */
export type PresentStageArtifactStatus = Exclude<StageArtifactStatus, "missing">;

/** Public source location summary attached to compiled authoring nodes. */
export type CompiledAuthorSourceOrigin = {
  readonly kind: "mounted" | "root";
  readonly sourceKey?: string;
  readonly sourceIdentity?: string;
};

/**
 * Public origin summary attached to compiled authoring nodes.
 *
 * This is diagnostic provenance, not a stable source-map replacement. Unknown component metadata is
 * preserved as `unknown` so integrations can display it without making the root API depend on
 * dev-runtime internals.
 */
export type CompiledAuthorNodeOrigin = {
  readonly kind: "authored" | "implicit";
  readonly path: string;
  readonly source?: CompiledAuthorSourceOrigin;
  readonly sourceSpan?: {
    readonly file?: string;
    readonly line?: number;
    readonly column?: number;
  };
  readonly componentProvenance?: {
    readonly stack?: readonly unknown[];
    readonly [property: string]: unknown;
  };
  readonly reason?: string;
};

/** Public class reference captured from compiled style authoring. */
export type CompiledStyleClassRef = {
  readonly name: string;
  readonly index: number;
};

/**
 * Public authored style capture for a compiled graph style entry.
 *
 * Style values are intentionally exposed as `unknown`: compile results are inspection output, while
 * authored TSX, StyleSheet, and Theme inputs remain the typed authoring boundary.
 */
export type CompiledAuthoredStyle = {
  readonly style?: {
    readonly position?: unknown;
    readonly color?: unknown;
    readonly [property: string]: unknown;
  };
  readonly classRefs?: readonly CompiledStyleClassRef[];
};

/** Public style entity summary captured during compile. */
export type CompiledStyleEntity = {
  readonly id: string;
  readonly target: string;
  readonly authored: CompiledAuthoredStyle;
};

/** Public semantic role summary for compiled authoring nodes. */
export type CompiledAuthorNodeRole = {
  readonly kind?: string;
  readonly [property: string]: unknown;
};

/**
 * Shared public node summary fields.
 *
 * The root API keeps node payloads lightweight and read-only. Detailed graph contracts remain in
 * `deckjsx/inspect` for tooling that intentionally depends on lower-level model shapes.
 */
export type CompiledAuthorNodeBase = {
  readonly id: string;
  readonly origin: CompiledAuthorNodeOrigin;
  readonly authoredTag?: string;
  readonly role?: CompiledAuthorNodeRole;
  readonly key?: unknown;
  readonly styleRef?: string;
  readonly templateAreaRef?: object;
  readonly name?: string;
  readonly text?: string;
  readonly implicit?: boolean;
  readonly children?: readonly unknown[];
  readonly inlineChildren?: readonly unknown[];
  readonly assetRef?: string;
  readonly posterAssetRef?: string;
  readonly shape?: string;
  readonly cellKind?: string;
  readonly sectionKind?: string;
  readonly colSpan?: number;
  readonly rowSpan?: number;
};

/** Public node summary captured during compile. */
export type CompiledAuthorNode =
  | (CompiledAuthorNodeBase & { readonly kind: "textRun"; readonly text: string })
  | (CompiledAuthorNodeBase & {
      readonly kind:
        | "container"
        | "document"
        | "image"
        | "shape"
        | "slide"
        | "table"
        | "tableCell"
        | "tableRow"
        | "tableSection"
        | "text"
        | "video";
      readonly text?: string;
    });

/**
 * Public asset summary captured during compile.
 *
 * Asset sources are included for diagnostics and integration inspection. They are not a loader API;
 * provide asset loading through integration plugins such as `@deckjsx/node` or custom loaders.
 */
export type CompiledAssetEntity = {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly sourceField?: string;
  readonly source: {
    readonly kind: "data" | "path" | "url";
    readonly data?: string;
    readonly path?: string;
    readonly url?: string;
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly resolution?: string;
};

/** Public resolved style source summary captured during compile. */
export type CompiledResolvedStyleSource = {
  readonly layer: "class" | "default" | "inherited" | "style" | "theme";
  readonly className?: string;
  readonly [property: string]: unknown;
};

/** Public resolved value and winning source for one style property. */
export type CompiledResolvedStyleProperty = {
  readonly value?: unknown;
  readonly source: CompiledResolvedStyleSource;
};

/** Public trace of candidate values considered for one resolved style property. */
export type CompiledResolvedStylePropertyTrace = {
  readonly property: string;
  readonly candidates: readonly unknown[];
};

/** Public resolved style summary captured during compile. */
export type CompiledResolvedStyle = {
  readonly style: {
    readonly position?: unknown;
    readonly color?: unknown;
    readonly [property: string]: unknown;
  };
  readonly appliedClasses: readonly CompiledResolvedStyleSource[];
  readonly properties: Readonly<Record<string, CompiledResolvedStyleProperty>>;
  readonly propertyTraces: Readonly<Record<string, CompiledResolvedStylePropertyTrace>>;
};

/**
 * Lightweight public graph handle returned by `deck.compile()`.
 *
 * The runtime value contains deckjsx semantic graph details, but the root authoring API exposes a
 * stable compile-inspection shape instead of the full internal graph contract. Use
 * `deckjsx/inspect` for detailed graph traversal types.
 */
export type CompiledAuthorGraph = {
  readonly documentId: string;
  readonly nodes: ReadonlyMap<PropertyKey, CompiledAuthorNode>;
  readonly styles: ReadonlyMap<PropertyKey, CompiledStyleEntity>;
  readonly assets: ReadonlyMap<PropertyKey, CompiledAssetEntity>;
  readonly templates: ReadonlyMap<string, unknown>;
};

/**
 * Lightweight public style resolution handle returned by `deck.compile()`.
 *
 * Detailed resolved style maps remain available from `deckjsx/inspect`; the root authoring result
 * exposes a small read-only summary that supports common diagnostics and tests without pulling the
 * full internal style graph into every authoring import.
 */
export type CompiledStyleResolution = ReadonlyMap<PropertyKey, CompiledResolvedStyle>;

/**
 * Lightweight public projection handle returned by `deck.project()`.
 *
 * The runtime value may contain adapter-specific implementation details, but the root authoring
 * API exposes only the stable projection format. Use `deck.render(...)` for output bytes,
 * `summary` for inspection data, and lower-level inspection/integration APIs when detailed package
 * models are intentionally required.
 */
export type ProjectedDocumentModel = {
  readonly format: ProjectionFormat;
};

/**
 * Lightweight project inspection summary exposed by the root authoring API.
 *
 * Detailed PPTX inspection output is adapter-specific and intentionally kept behind lower-level
 * inspection/integration surfaces so ordinary authoring imports do not instantiate the full package
 * model type graph.
 */
export type ProjectInspectionSummary = {
  readonly format: ProjectionFormat;
};

/**
 * Result returned by `deck.compile()`.
 *
 * Check `ok` first for the normal success path. When `graph` is present, compilation produced an
 * inspectable semantic graph artifact; when it is absent, `diagnostics` and `stages.compile`
 * explain why no graph can be read.
 */
export type CompileResult = CompileResultWithGraph | CompileResultWithoutGraph;

/** Successful or inspectable compile result with graph artifacts. */
export type CompileResultWithGraph = {
  /** Whether compile diagnostics contain no errors. */
  readonly ok: boolean;
  /** Compile diagnostics for public authoring, style, graph, and theme validation. */
  readonly diagnostics: Diagnostics;
  /** Compile stage status and diagnostics. */
  readonly stages: CompileStages<PresentStageArtifactStatus>;
  /** Lightweight public semantic graph summary. */
  readonly graph: CompiledAuthorGraph;
  /** Lightweight public resolved style summary. */
  readonly resolvedStyles: CompiledStyleResolution;
};

/** Compile result without a graph artifact. */
export type CompileResultWithoutGraph = {
  /** Always false when the compile graph is missing. */
  readonly ok: boolean;
  /** Compile diagnostics explaining why graph artifacts are absent. */
  readonly diagnostics: Diagnostics;
  /** Compile stage status with `artifact: "missing"`. */
  readonly stages: CompileStages<"missing">;
  /** Absent when compilation cannot produce a graph artifact. */
  readonly graph?: undefined;
  /** Absent when compilation cannot produce resolved style artifacts. */
  readonly resolvedStyles?: undefined;
};

/**
 * Result returned by `deck.project()`.
 *
 * Projection runs compile first, then turns the graph into the configured document model. When
 * `projection` is absent, callers should use `diagnostics` and `stages` to report the failure. The
 * root API exposes a lightweight projection handle; detailed PPTX models live under inspection and
 * integration surfaces.
 */
export type ProjectResult = ProjectResultWithProjection | ProjectResultWithoutProjection;

/** Project result with a projected document model. */
export type ProjectResultWithProjection = {
  /** Whether all stages completed without error diagnostics. */
  readonly ok: boolean;
  /** Combined diagnostics from compile and project. */
  readonly diagnostics: Diagnostics;
  /** Compile and project stage statuses. */
  readonly stages: ProjectStages<StageArtifactStatus, PresentStageArtifactStatus>;
  /** Projection format that was requested and produced. */
  readonly format: ProjectionFormat;
  /** Lightweight projected document model. */
  readonly projection: ProjectedDocumentModel;
  /** Optional lightweight inspection summary. */
  readonly summary?: ProjectInspectionSummary;
};

/** Project result without a projected document model. */
export type ProjectResultWithoutProjection = {
  /** Always false when the projection artifact is missing. */
  readonly ok: boolean;
  /** Combined diagnostics explaining why projection is absent. */
  readonly diagnostics: Diagnostics;
  /** Stage statuses with `project.artifact: "missing"`. */
  readonly stages: ProjectStages<StageArtifactStatus, "missing">;
  /** Projection format that was requested. */
  readonly format: ProjectionFormat;
  /** Absent when projection cannot produce a document model. */
  readonly projection?: undefined;
  /** Absent when projection cannot produce a document model. */
  readonly summary?: undefined;
};

/**
 * Result returned by `deck.render(...)`.
 *
 * Render runs compile and project before invoking a writer adapter. When `artifact` is present it
 * contains runtime-neutral bytes; filesystem writes belong to integration packages such as
 * `@deckjsx/node`. When `artifact` is absent, inspect `diagnostics` and `stages`.
 */
export type RenderResult = RenderResultWithArtifact | RenderResultWithoutArtifact;

/** Render result with runtime-neutral output bytes. */
export type RenderResultWithArtifact = {
  /** Whether compile, project, and render completed without error diagnostics. */
  readonly ok: boolean;
  /** Combined diagnostics from compile, project, and render. */
  readonly diagnostics: Diagnostics;
  /** Compile, project, and render stage statuses. */
  readonly stages: RenderStages<
    StageArtifactStatus,
    StageArtifactStatus,
    PresentStageArtifactStatus
  >;
  /** Output artifact format. */
  readonly format: OutputFormat;
  /** Runtime-neutral rendered bytes. */
  readonly artifact: RenderedArtifact;
  /** Optional patch plan for integrations that can update existing artifacts. */
  readonly patchPlan?: RenderPatchPlan;
  /** Optional lightweight render inspection summary. */
  readonly summary?: RenderInspectionSummary;
};

/** Render result without output bytes. */
export type RenderResultWithoutArtifact = {
  /** Always false when the rendered artifact is missing. */
  readonly ok: boolean;
  /** Combined diagnostics explaining why render output is absent. */
  readonly diagnostics: Diagnostics;
  /** Stage statuses with `render.artifact: "missing"`. */
  readonly stages: RenderStages<StageArtifactStatus, StageArtifactStatus, "missing">;
  /** Output format that was requested. */
  readonly format: OutputFormat;
  /** Absent when render cannot produce output bytes. */
  readonly artifact?: undefined;
  /** Absent when render cannot produce output bytes. */
  readonly patchPlan?: undefined;
  /** Absent when render cannot produce output bytes. */
  readonly summary?: undefined;
};

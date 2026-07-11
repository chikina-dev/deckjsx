import type { Diagnostics } from "../diagnostics";
import type {
  InspectionDetailLevel,
  OutputFormat,
  ProjectionFormat,
  RenderedArtifact,
  RenderInspectionSummary,
  RenderPatchPlan,
} from "../pipeline/contract";

/**
 * Public render options for deckjsx's built-in PPTX writer.
 *
 * These options configure render-time inspection output only; authored layout, style, Theme, and
 * StyleSheet input remains on the Deck authoring surface. Use `deck.render(pptx({ inspection:
 * "none" }))` when a hot path only needs artifact bytes.
 */
export type PptxRenderOptions = {
  /** Amount of inspection metadata included in the render result. */
  readonly inspection?: InspectionDetailLevel;
};

/**
 * Public render options for deckjsx's built-in PDF writer.
 *
 * This first PDF slice only exposes render-time inspection options. Full PDF projection and
 * rendering controls will grow behind this adapter contract later.
 */
export type PdfRenderOptions = {
  /** Amount of inspection metadata included in the render result. */
  readonly inspection?: InspectionDetailLevel;
};

/**
 * Render options accepted by `Deck#render()` when no explicit Writer Adapter is supplied.
 *
 * The current built-in writers share the same inspection-only option shape.
 */
export type RenderOptions = PptxRenderOptions | PdfRenderOptions;

/**
 * Result returned by a Writer Adapter implementation.
 *
 * Adapter results keep diagnostics and artifacts separate: ordinary authoring, projection, or
 * adapter failures are reported through diagnostics instead of requiring deckjsx users to catch
 * thrown errors, while successful renders provide a runtime-neutral artifact that integration
 * packages such as `@deckjsx/node` can write.
 */
export type WriterAdapterResult<TFormat extends OutputFormat = OutputFormat> = {
  /** Diagnostics produced while adapting the projected document model to the output format. */
  readonly diagnostics: Diagnostics;
  /** Rendered artifact bytes and metadata when adapter execution succeeds. */
  readonly artifact?: RenderedArtifact<TFormat>;
  /** Patch plan metadata used by runtime writers that can update existing artifacts. */
  readonly patchPlan?: RenderPatchPlan;
  /** Optional render inspection summary for callers that requested inspection metadata. */
  readonly summary?: RenderInspectionSummary;
};

/**
 * Opaque render context reserved for writer adapters.
 *
 * Public authors normally do not construct this object. It is provided so adapter implementations
 * can receive stable context without exposing internal pipeline state as part of the authoring API.
 */
export type WriterRenderContext = {
  readonly kind: "deckjsx.writerRenderContext";
};

type ProjectionModelFormat<TProjection> = TProjection extends {
  readonly format: infer TFormat extends ProjectionFormat;
}
  ? TFormat
  : ProjectionFormat;

/**
 * Public low-level contract for output writers.
 *
 * Most authors should call `deck.render(pptx())` or `deck.render()` rather than implementing this
 * interface. Custom adapters are expected to accept a projected document model, return diagnostics
 * for representable failures, and produce a `RenderedArtifact` only when the target format is valid.
 *
 * @typeParam TProjection - Projection model accepted by the adapter.
 * @typeParam TFormat - Output artifact format produced by the adapter.
 */
export type WriterAdapter<TProjection = unknown, TFormat extends OutputFormat = OutputFormat> = {
  /** Stable marker used to distinguish writer adapters from plain render options. */
  readonly kind: "deckjsx.writerAdapter";
  /** Human-readable adapter name used by diagnostics and inspection. */
  readonly name: string;
  /** Projection format consumed by this adapter. */
  readonly projectionFormat: ProjectionModelFormat<TProjection>;
  /** Artifact format produced by this adapter. */
  readonly format: TFormat;
  /** Adapter-specific render options captured when the adapter is created. */
  readonly options: RenderOptions;
  /**
   * Render a projected document model into an output artifact.
   *
   * Implementations should report expected authoring/projection failures in `diagnostics`.
   * Thrown adapter failures are treated as Integration Boundary failures by the pipeline.
   */
  render(
    projection: TProjection,
    context?: WriterRenderContext,
  ): Promise<WriterAdapterResult<TFormat>>;
};

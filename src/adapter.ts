import type { Diagnostics } from "./diagnostics";
import type { PptxPackageModel } from "./projection/pptx/model";
import type {
  InspectionDetailLevel,
  OutputFormat,
  ProjectionFormat,
  RenderedArtifact,
  RenderInspectionSummary,
} from "./pipeline";
import { pptxWriterContext } from "./adapter-context";
import { renderPptxPackage } from "./writers/pptx";

export type PptxRenderOptions = {
  readonly output?: string;
  readonly inspection?: InspectionDetailLevel;
};

export type RenderOptions = PptxRenderOptions;

export type WriterAdapterResult<TFormat extends OutputFormat = OutputFormat> = {
  readonly diagnostics: Diagnostics;
  readonly artifact?: RenderedArtifact<TFormat>;
  readonly summary?: RenderInspectionSummary;
  readonly outputSideEffect?: {
    readonly path: string;
    readonly failure?: {
      readonly message: string;
    };
  };
};

export type WriterRenderContext = {
  readonly kind: "deckjsx.writerRenderContext";
};

export type WriterAdapter<
  TProjection = PptxPackageModel,
  TFormat extends OutputFormat = OutputFormat,
> = {
  readonly kind: "deckjsx.writerAdapter";
  readonly name: string;
  readonly projectionFormat: ProjectionFormat;
  readonly format: TFormat;
  readonly options: RenderOptions;
  render(
    projection: TProjection,
    context?: WriterRenderContext,
  ): Promise<WriterAdapterResult<TFormat>>;
};

export function pptx(options: PptxRenderOptions = {}): WriterAdapter<PptxPackageModel, "pptx"> {
  return {
    kind: "deckjsx.writerAdapter",
    name: "pptx",
    projectionFormat: "pptx",
    format: "pptx",
    options,
    async render(projection, context) {
      return renderPptxPackage(projection, options, pptxWriterContext(context));
    },
  };
}

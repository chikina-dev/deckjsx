import type { Diagnostics } from "./diagnostics";
import type { PptxPackageModel } from "./projection/pptx";
import type { OutputFormat, ProjectionFormat, RenderedArtifact } from "./pipeline";
import { renderPptxPackageWithPptxGenjs } from "./writers/pptxgenjs";

export type RenderOptions = {
  readonly output?: string;
};

export type WriterAdapterResult<TFormat extends OutputFormat = OutputFormat> = {
  readonly diagnostics: Diagnostics;
  readonly artifact?: RenderedArtifact<TFormat>;
};

export type WriterAdapter<TProjection = unknown, TFormat extends OutputFormat = OutputFormat> = {
  readonly kind: "deckjsx.writerAdapter";
  readonly name: string;
  readonly projectionFormat: ProjectionFormat;
  readonly format: TFormat;
  readonly options: RenderOptions;
  render(projection: TProjection): Promise<WriterAdapterResult<TFormat>>;
};

export function pptxgenjs(options: RenderOptions = {}): WriterAdapter<PptxPackageModel, "pptx"> {
  return {
    kind: "deckjsx.writerAdapter",
    name: "pptxgenjs",
    projectionFormat: "pptx",
    format: "pptx",
    options,
    async render(projection) {
      return renderPptxPackageWithPptxGenjs(projection);
    },
  };
}

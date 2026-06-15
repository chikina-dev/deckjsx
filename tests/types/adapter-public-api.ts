import { pptx } from "deckjsx/adapter";
import type { PptxRenderOptions, WriterAdapter, WriterRenderContext } from "deckjsx/adapter";
import type { ProjectionFormat } from "deckjsx";
import type { PptxPackageModel } from "deckjsx/inspect";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

// @ts-expect-error core render no longer accepts path output.
const adapterWithOutput = pptx({ output: "deck.pptx" });
void adapterWithOutput;

const adapter = pptx({ inspection: "summary" });
adapter satisfies WriterAdapter<PptxPackageModel>;
adapter.projectionFormat satisfies ProjectionFormat;
adapter.format satisfies "pptx";

const renderOptions = {
  inspection: "summary",
} satisfies PptxRenderOptions;
void renderOptions;

const projectionFormat = "pptx" satisfies ProjectionFormat;
void projectionFormat;

const projectionFormatTypeAssertions = {
  pdfIsNotAProjectionFormat: true,
} satisfies {
  pdfIsNotAProjectionFormat: Assert<
    IsAssignable<"pdf", ProjectionFormat> extends true ? false : true
  >;
};
void projectionFormatTypeAssertions;

declare const renderContext: WriterRenderContext;
renderContext.kind satisfies "deckjsx.writerRenderContext";

// @ts-expect-error WriterRenderContext is intentionally opaque to public adapter authors.
void renderContext.assetsById;

// @ts-expect-error WriterRenderContext must not expose internal build artifact storage.
void renderContext.pptxBuildArtifactsByPartId;

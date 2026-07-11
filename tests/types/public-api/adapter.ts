import { pdf, pptx } from "deckjsx/adapter";
import type {
  PdfRenderOptions,
  PptxRenderOptions,
  WriterAdapter,
  WriterRenderContext,
} from "deckjsx/adapter";
import { Deck, type Diagnostics, type OutputFormat, type ProjectionFormat } from "deckjsx";
import type { PdfDocumentModel, PptxPackageModel } from "deckjsx/inspect";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

// @ts-expect-error core render no longer accepts path output.
const adapterWithOutput = pptx({ output: "deck.pptx" });
void adapterWithOutput;

const adapter = pptx({ inspection: "summary" });
adapter satisfies WriterAdapter<PptxPackageModel>;
adapter.projectionFormat satisfies ProjectionFormat;
adapter.format satisfies "pptx";

const pdfAdapter = pdf({ inspection: "summary" });
pdfAdapter satisfies WriterAdapter;
pdfAdapter.projectionFormat satisfies ProjectionFormat;
pdfAdapter.format satisfies "pdf";

const renderOptions = {
  inspection: "summary",
} satisfies PptxRenderOptions;
void renderOptions;

const pdfRenderOptions = {
  inspection: "summary",
} satisfies PdfRenderOptions;
void pdfRenderOptions;

const projectionFormat = "pptx" satisfies ProjectionFormat;
void projectionFormat;

const pdfProjectionFormat = "pdf" satisfies ProjectionFormat;
void pdfProjectionFormat;

const projectionFormatTypeAssertions = {
  pdfIsAProjectionFormat: true,
  htmlIsNotAProjectionFormat: true,
  htmlIsAnOutputFormat: true,
} satisfies {
  pdfIsAProjectionFormat: Assert<IsAssignable<"pdf", ProjectionFormat>>;
  htmlIsNotAProjectionFormat: Assert<IsAssignable<IsAssignable<"html", ProjectionFormat>, false>>;
  htmlIsAnOutputFormat: Assert<IsAssignable<"html", OutputFormat>>;
};
void projectionFormatTypeAssertions;

const noDiagnostics = {
  items: [],
  hasErrors: false,
  hasWarnings: false,
} satisfies Diagnostics;

const htmlAdapter = {
  kind: "deckjsx.writerAdapter",
  name: "html",
  projectionFormat: "pptx",
  format: "html",
  options: {},
  async render(projection: PptxPackageModel) {
    projection.format satisfies "pptx";
    return {
      diagnostics: noDiagnostics,
      artifact: {
        format: "html",
        mediaType: "text/html",
        extension: "html",
        bytes: new Uint8Array(),
      },
    };
  },
} satisfies WriterAdapter<PptxPackageModel, "html">;

const customFormat = "html" satisfies OutputFormat;
void customFormat;

const htmlDeck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
const htmlRender = htmlDeck.render(htmlAdapter);
void (htmlRender satisfies Promise<import("deckjsx").RenderResult<"html">>);
declare const htmlRenderResult: Awaited<typeof htmlRender>;
htmlRenderResult.format satisfies "html";
if (htmlRenderResult.artifact) {
  htmlRenderResult.artifact.format satisfies "html";
}

const mismatchedPptxProjectionAdapter = {
  ...htmlAdapter,
  // @ts-expect-error a PPTX projection model cannot declare PDF as its projection format.
  projectionFormat: "pdf",
} satisfies WriterAdapter<PptxPackageModel, "html">;
void mismatchedPptxProjectionAdapter;

const mismatchedPdfProjectionAdapter = {
  kind: "deckjsx.writerAdapter",
  name: "pdf-to-html",
  // @ts-expect-error a PDF projection model cannot declare PPTX as its projection format.
  projectionFormat: "pptx",
  format: "html",
  options: {},
  async render(_projection: PdfDocumentModel) {
    return { diagnostics: noDiagnostics };
  },
} satisfies WriterAdapter<PdfDocumentModel, "html">;
void mismatchedPdfProjectionAdapter;

declare const renderContext: WriterRenderContext;
renderContext.kind satisfies "deckjsx.writerRenderContext";

// @ts-expect-error WriterRenderContext is intentionally opaque to public adapter authors.
void renderContext.assetsById;

// @ts-expect-error WriterRenderContext must not expose internal build artifact storage.
void renderContext.pptxBuildArtifactsByPartId;

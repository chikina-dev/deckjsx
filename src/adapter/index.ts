import type { PptxPackageModel } from "../projection/pptx/model";
import type { PdfDocumentModel } from "../projection/pdf/model";
import type { PdfRenderOptions, PptxRenderOptions, WriterAdapter } from "./public";
import { pptxWriterContext, writerContext } from "./context";
import { renderPdfDocument } from "../writers/pdf";
import { renderPptxPackage } from "../writers/pptx";
import { pptxMediaAssetLoadRequirements } from "../writers/pptx";
import { pdfImageAssetLoadRequirements } from "../writers/pdf";
import { registerAdapterAssetRequirements } from "./asset-requirements";

export type {
  PdfRenderOptions,
  PptxRenderOptions,
  RenderOptions,
  WriterAdapter,
  WriterAdapterResult,
  WriterRenderContext,
} from "./public";

/**
 * Create the built-in PPTX writer adapter.
 *
 * Pass the returned adapter to `deck.render(pptx())` when you want explicit PPTX rendering options.
 * Calling `deck.render()` without an adapter uses the same public writer target. The adapter only
 * consumes projected PPTX document models; authored JSX, style, Theme, and StyleSheet input remain
 * validated at the normal authoring boundary before render starts.
 *
 * @param options - PPTX render options such as inspection detail level.
 * @returns A Writer Adapter that renders projected PPTX models into `.pptx` artifact bytes.
 */
export function pptx(options: PptxRenderOptions = {}): WriterAdapter<PptxPackageModel, "pptx"> {
  const adapter: WriterAdapter<PptxPackageModel, "pptx"> = {
    kind: "deckjsx.writerAdapter",
    name: "pptx",
    projectionFormat: "pptx",
    format: "pptx",
    options,
    async render(projection, context) {
      return renderPptxPackage(projection, options, pptxWriterContext(context));
    },
  };
  return registerAdapterAssetRequirements(adapter, (projection, context) =>
    projection.format === "pptx"
      ? pptxMediaAssetLoadRequirements({
          projection,
          assetsById: context.assetsById,
          buildArtifactsByPartId: context.pptxBuildArtifactsByPartId,
        })
      : [],
  );
}

/**
 * Create the built-in PDF writer adapter.
 *
 * This adapter accepts projected PDF page models and emits minimal structurally valid PDF document
 * bytes with catalog, page tree, page objects, content streams, and cross-reference metadata.
 *
 * @param options - PDF render options such as inspection detail level.
 * @returns A Writer Adapter that renders projected PDF models into `.pdf` artifact bytes.
 */
export function pdf(options: PdfRenderOptions = {}): WriterAdapter<PdfDocumentModel, "pdf"> {
  const adapter: WriterAdapter<PdfDocumentModel, "pdf"> = {
    kind: "deckjsx.writerAdapter",
    name: "pdf",
    projectionFormat: "pdf",
    format: "pdf",
    options,
    async render(projection, context) {
      return renderPdfDocument(projection, options, writerContext(context));
    },
  };
  return registerAdapterAssetRequirements(adapter, (projection, context) =>
    projection.format === "pdf"
      ? pdfImageAssetLoadRequirements({ projection, assetsById: context.assetsById })
      : [],
  );
}

import { createDiagnostics } from "../diagnostics";
import type { RenderedArtifact } from "../pipeline/public";
import type { PdfDocumentModel } from "../projection/pdf/model";
import type { PdfRenderOptions } from "../adapter/public";

const PDF_PLACEHOLDER_BYTES = new TextEncoder().encode("%PDF-1.7\n%%deckjsx\n");

export type PdfWriterResult = {
  readonly diagnostics: ReturnType<typeof createDiagnostics>;
  readonly artifact?: RenderedArtifact<"pdf">;
};

export async function renderPdfDocument(
  _projection: PdfDocumentModel,
  _options: PdfRenderOptions = {},
): Promise<PdfWriterResult> {
  return {
    diagnostics: createDiagnostics(),
    artifact: {
      format: "pdf",
      mediaType: "application/pdf",
      extension: "pdf",
      bytes: PDF_PLACEHOLDER_BYTES,
    },
  };
}

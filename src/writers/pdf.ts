import { createDiagnostics } from "../diagnostics";
import type { RenderedArtifact } from "../pipeline/public";
import type { PdfDocumentModel } from "../projection/pdf/model";
import { validatePdfPageModel } from "../projection/pdf/validation";
import type { PdfRenderOptions } from "../adapter/public";
import { writePdfDocument } from "./pdf/document";

export type PdfWriterResult = {
  readonly diagnostics: ReturnType<typeof createDiagnostics>;
  readonly artifact?: RenderedArtifact<"pdf">;
};

export async function renderPdfDocument(
  projection: PdfDocumentModel,
  _options: PdfRenderOptions = {},
): Promise<PdfWriterResult> {
  const diagnostics = validatePdfPageModel(projection);
  if (diagnostics.hasErrors) {
    return { diagnostics };
  }

  return {
    diagnostics: createDiagnostics(diagnostics.items),
    artifact: {
      format: "pdf",
      mediaType: "application/pdf",
      extension: "pdf",
      bytes: writePdfDocument(projection),
    },
  };
}

export const renderPdfPageModel = renderPdfDocument;

import { pdf, pptx, type RenderOptions, type WriterAdapter } from ".";
import type {
  ProjectInspectionAdapterLimitation,
  PptxPackageModel,
} from "../projection/pptx/model";
import type { PdfDocumentModel } from "../projection/pdf/model";
import type { ProjectionFormat } from "../pipeline/public";

export function defaultWriterAdapterFor(
  format: ProjectionFormat,
  options: RenderOptions,
): WriterAdapter<PptxPackageModel, "pptx"> | WriterAdapter<PdfDocumentModel, "pdf"> {
  switch (format) {
    case "pptx":
      return pptx(options);
    case "pdf":
      return pdf(options);
  }
}

export function defaultAdapterLimitationsFor(
  format: ProjectionFormat,
): readonly ProjectInspectionAdapterLimitation[] {
  switch (format) {
    case "pptx":
      return [];
    case "pdf":
      return [];
  }
}

type WriterAdapterInput = RenderOptions | WriterAdapter | undefined;

function isObject(value: WriterAdapterInput): value is Exclude<WriterAdapterInput, undefined> {
  return typeof value === "object" && value !== null;
}

export function isWriterAdapter(value: WriterAdapterInput): value is WriterAdapter {
  if (!isObject(value) || !("kind" in value)) {
    return false;
  }

  return (
    value.kind === "deckjsx.writerAdapter" &&
    typeof value.name === "string" &&
    (value.projectionFormat === "pptx" || value.projectionFormat === "pdf") &&
    typeof value.format === "string" &&
    typeof value.options === "object" &&
    value.options !== null &&
    typeof value.render === "function"
  );
}

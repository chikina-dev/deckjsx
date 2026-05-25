import { pptxgenjs, type RenderOptions, type WriterAdapter } from "./adapter";
import type { ProjectInspectionAdapterLimitation, PptxPackageModel } from "./projection/pptx";
import type { ProjectionFormat } from "./pipeline";

export function defaultWriterAdapterFor(
  format: ProjectionFormat,
  options: RenderOptions,
): WriterAdapter<PptxPackageModel, "pptx"> {
  switch (format) {
    case "pptx":
      return pptxgenjs(options);
  }
}

export function defaultAdapterLimitationsFor(
  format: ProjectionFormat,
): readonly ProjectInspectionAdapterLimitation[] {
  switch (format) {
    case "pptx":
      return [
        {
          adapter: "pptxgenjs",
          code: "W_PPTXGENJS_TEMPORARY_ADAPTER",
          message:
            "The pptxgenjs adapter consumes the Pptx Package Model directly, but it cannot serialize every projected package-part detail yet.",
        },
      ];
  }
}

export function isWriterAdapter(value: unknown): value is WriterAdapter {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "deckjsx.writerAdapter" &&
    typeof (value as { name?: unknown }).name === "string" &&
    (value as { projectionFormat?: unknown }).projectionFormat === "pptx" &&
    typeof (value as { format?: unknown }).format === "string" &&
    typeof (value as { options?: unknown }).options === "object" &&
    (value as { options?: unknown }).options !== null &&
    typeof (value as { render?: unknown }).render === "function"
  );
}

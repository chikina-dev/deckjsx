import { pdf, pptx, type RenderOptions, type WriterAdapter } from ".";
import { isWriterAdapter, isWriterAdapterLike } from "./guard";
import { createDiagnostics, diagnostic, type Diagnostics } from "../diagnostics";
import type {
  ProjectInspectionAdapterLimitation,
  PptxPackageModel,
} from "../projection/pptx/model";
import type { PdfDocumentModel } from "../projection/pdf/model";
import type { OutputFormat, ProjectionFormat } from "../pipeline/public";

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

function invalidWriterAdapterDiagnostics(value: WriterAdapterInput): Diagnostics | undefined {
  if (!isWriterAdapterLike(value) || isWriterAdapter(value)) {
    return undefined;
  }

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_RENDER_INVALID_WRITER_ADAPTER",
      title: "writer adapter shape is invalid",
      message:
        "render() received a value that looks like a Writer Adapter, but it does not satisfy the deckjsx.writerAdapter runtime contract.",
      labels: [
        {
          path: "render.adapter",
          message:
            'expected kind, name, projectionFormat="pptx" or "pdf", format, options, and render(projection)',
          severity: "primary",
        },
      ],
    }),
  ]);
}

export function selectWriterAdapter(input: {
  renderInput: RenderOptions | WriterAdapter | undefined;
  projectionFormat: ProjectionFormat;
}):
  | { readonly ok: true; readonly adapter: WriterAdapter }
  | { readonly ok: false; readonly diagnostics: Diagnostics; readonly format: OutputFormat } {
  const invalidAdapterDiagnostics = invalidWriterAdapterDiagnostics(input.renderInput);

  if (invalidAdapterDiagnostics) {
    return {
      ok: false,
      diagnostics: invalidAdapterDiagnostics,
      format: input.projectionFormat,
    };
  }

  return {
    ok: true,
    adapter: isWriterAdapter(input.renderInput)
      ? input.renderInput
      : defaultWriterAdapterFor(input.projectionFormat, input.renderInput ?? {}),
  };
}

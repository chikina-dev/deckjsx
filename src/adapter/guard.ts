import type { RenderOptions, WriterAdapter } from "./public";

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
    value.format.trim().length > 0 &&
    typeof value.options === "object" &&
    value.options !== null &&
    typeof value.render === "function"
  );
}

export function isWriterAdapterLike(value: WriterAdapterInput): boolean {
  return (
    isObject(value) &&
    (("kind" in value && value.kind === "deckjsx.writerAdapter") ||
      "projectionFormat" in value ||
      "render" in value ||
      ("name" in value && "format" in value))
  );
}

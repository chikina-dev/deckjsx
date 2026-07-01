export type PdfDocumentId = `pdf:document:${string}`;
export type PdfPageId = `pdf:page:${string}:${number}`;
export type PdfResourceKind = "font" | "image";
export type PdfResourceId = `pdf:resource:${PdfResourceKind}:${string}`;

function identitySegment(value: string): string {
  const segment = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return segment || "unnamed";
}

export function pdfDocumentId(sourceId: string): PdfDocumentId {
  return `pdf:document:${identitySegment(sourceId)}`;
}

export function pdfPageId(slideId: string, index: number): PdfPageId {
  return `pdf:page:${identitySegment(slideId)}:${index}`;
}

export function pdfResourceId(kind: PdfResourceKind, sourceId: string): PdfResourceId {
  return `pdf:resource:${kind}:${identitySegment(sourceId)}`;
}

import type {
  PdfDocumentMetadata,
  PdfFontResource,
  PdfPage,
  PdfPageModel,
  PdfResourceDictionary,
} from "../../projection/pdf/model";
import { renderPdfContentStream } from "./content";
import { pdfLiteralString, pdfName, pdfNumber, type PdfIndirectObject } from "./objects";

const PDF_HEADER = "%PDF-1.7\n";

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function pageObjectId(pageIndex: number): number {
  return 4 + pageIndex * 2;
}

function contentObjectId(pageIndex: number): number {
  return pageObjectId(pageIndex) + 1;
}

function baseFontName(font: PdfFontResource): string {
  return font.family ?? font.name ?? "Helvetica";
}

function pageFonts(page: PdfPage, resources: PdfResourceDictionary): readonly PdfFontResource[] {
  const pageFontIds = new Set(page.resources.fonts);
  return resources.fonts.filter((font) => pageFontIds.has(font.id));
}

function fontResourceDictionary(page: PdfPage, resources: PdfResourceDictionary): string {
  const fonts = pageFonts(page, resources);
  if (fonts.length === 0) {
    return "/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >>";
  }

  const entries = fonts.map((font) => {
    return `${pdfName(font.name)} << /Type /Font /Subtype /Type1 /BaseFont ${pdfName(
      baseFontName(font),
    )} >>`;
  });

  return `/Font << ${entries.join(" ")} >>`;
}

function pageMediaBox(page: PdfPage): string {
  const left = page.mediaBox.x;
  const bottom = page.mediaBox.y;
  const right = page.mediaBox.x + page.mediaBox.width;
  const top = page.mediaBox.y + page.mediaBox.height;

  return `[${pdfNumber(left)} ${pdfNumber(bottom)} ${pdfNumber(right)} ${pdfNumber(top)}]`;
}

function infoDictionary(metadata: PdfDocumentMetadata): string {
  const entries = [
    `/Producer ${pdfLiteralString(metadata.producer ?? "deckjsx")}`,
    ...(metadata.title ? [`/Title ${pdfLiteralString(metadata.title)}`] : []),
    ...(metadata.author ? [`/Author ${pdfLiteralString(metadata.author)}`] : []),
    ...(metadata.subject ? [`/Subject ${pdfLiteralString(metadata.subject)}`] : []),
  ];

  return `<< ${entries.join(" ")} >>`;
}

export function contentStreamObject(id: number, stream: string): PdfIndirectObject {
  const streamBytes = /[\r\n]$/.test(stream) ? stream : `${stream}\n`;

  return {
    id,
    body: `<< /Length ${byteLength(streamBytes)} >>\nstream\n${streamBytes}endstream`,
  };
}

function pageObject(input: {
  readonly id: number;
  readonly page: PdfPage;
  readonly contentObjectId: number;
  readonly resources: PdfResourceDictionary;
}): PdfIndirectObject {
  return {
    id: input.id,
    body: [
      "<<",
      "/Type /Page",
      "/Parent 2 0 R",
      `/MediaBox ${pageMediaBox(input.page)}`,
      `/Resources << ${fontResourceDictionary(input.page, input.resources)} >>`,
      `/Contents ${input.contentObjectId} 0 R`,
      ">>",
    ].join(" "),
  };
}

function buildObjects(model: PdfPageModel): readonly PdfIndirectObject[] {
  const pageRefs = model.pages.map((_, pageIndex) => `${pageObjectId(pageIndex)} 0 R`);
  const objects: PdfIndirectObject[] = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    {
      id: 2,
      body: `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${model.pages.length} >>`,
    },
    { id: 3, body: infoDictionary(model.metadata) },
  ];

  model.pages.forEach((page, pageIndex) => {
    const contentId = contentObjectId(pageIndex);
    objects.push(
      pageObject({
        id: pageObjectId(pageIndex),
        page,
        contentObjectId: contentId,
        resources: model.resources,
      }),
      contentStreamObject(contentId, renderPdfContentStream(page, model.resources)),
    );
  });

  return objects;
}

export function writePdfDocument(model: PdfPageModel): Uint8Array {
  const objects = buildObjects(model);
  let document = PDF_HEADER;
  let position = byteLength(document);
  const offsets = new Map<number, number>();

  objects.forEach((object) => {
    const objectBytes = `${object.id} 0 obj\n${object.body}\nendobj\n`;
    offsets.set(object.id, position);
    document += objectBytes;
    position += byteLength(objectBytes);
  });

  const startxref = position;
  const maxObjectId = Math.max(0, ...objects.map((object) => object.id));
  const xrefEntries = ["0000000000 65535 f "];

  for (let id = 1; id <= maxObjectId; id += 1) {
    const offset = offsets.get(id) ?? 0;
    xrefEntries.push(`${offset.toString().padStart(10, "0")} 00000 n `);
  }

  document += [
    "xref",
    `0 ${maxObjectId + 1}`,
    ...xrefEntries,
    "trailer",
    `<< /Size ${maxObjectId + 1} /Root 1 0 R /Info 3 0 R >>`,
    "startxref",
    String(startxref),
    "%%EOF",
    "",
  ].join("\n");

  return new TextEncoder().encode(document);
}

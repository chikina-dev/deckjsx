import type { PdfFontResource, PdfPage, PdfResourceDictionary } from "../../projection/pdf/model";
import { pdfLiteralString, pdfName, pdfNumber } from "./objects";

function fontById(
  resources: PdfResourceDictionary,
  id: string | undefined,
): PdfFontResource | undefined {
  if (!id) {
    return undefined;
  }

  return resources.fonts.find((font) => font.id === id);
}

function firstPageFont(
  page: PdfPage,
  resources: PdfResourceDictionary,
): PdfFontResource | undefined {
  const pageFontIds = new Set(page.resources.fonts);
  return resources.fonts.find((font) => pageFontIds.has(font.id));
}

function textFont(input: {
  readonly page: PdfPage;
  readonly resources: PdfResourceDictionary;
  readonly fontId?: string;
}): PdfFontResource | undefined {
  return (
    fontById(input.resources, input.fontId) ??
    firstPageFont(input.page, input.resources) ??
    input.resources.fonts[0]
  );
}

function rgbColor(input: { readonly r: number; readonly g: number; readonly b: number }): string {
  return `${pdfNumber(input.r)} ${pdfNumber(input.g)} ${pdfNumber(input.b)} rg`;
}

export function renderPdfContentStream(page: PdfPage, resources: PdfResourceDictionary): string {
  const lines: string[] = [];

  page.content.forEach((operation) => {
    switch (operation.op) {
      case "setFillColor":
        lines.push(rgbColor(operation.color));
        break;
      case "text": {
        const font = textFont({ page, resources, fontId: operation.fontId });
        const resourceName = pdfName(font?.name ?? "F1");
        const fontSize = operation.fontSize ?? 12;
        const baselineY = page.mediaBox.height - operation.y - fontSize;

        lines.push("BT");
        if (operation.color) {
          lines.push(rgbColor(operation.color));
        }
        lines.push(`${resourceName} ${pdfNumber(fontSize)} Tf`);
        lines.push(`1 0 0 1 ${pdfNumber(operation.x)} ${pdfNumber(baselineY)} Tm`);
        lines.push(`${pdfLiteralString(operation.text)} Tj`);
        lines.push("ET");
        break;
      }
      case "image":
        break;
    }
  });

  return `${lines.join("\n")}\n`;
}

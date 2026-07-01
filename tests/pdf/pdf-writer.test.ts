import { describe, expect, test } from "vite-plus/test";
import { renderPdfPageModel } from "@/src/writers/pdf";
import { pdfDocumentId, pdfPageId, pdfResourceId } from "@/src/projection/pdf/identity";
import type { PdfPageModel } from "@/src/projection/pdf/model";

function decodePdf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function onePageModel(text: string): PdfPageModel {
  const fontId = pdfResourceId("font", "Helvetica");

  return {
    format: "pdf",
    version: "1.7",
    documentId: pdfDocumentId("writer-test"),
    metadata: { producer: "deckjsx" },
    pages: [
      {
        id: pdfPageId("slide:1", 0),
        index: 0,
        mediaBox: { x: 0, y: 0, width: 612, height: 792 },
        resources: { fonts: [fontId], images: [] },
        content: [{ op: "text", text, x: 72, y: 96, fontId, fontSize: 12 }],
      },
    ],
    resources: {
      fonts: [
        {
          id: fontId,
          name: "F1",
          family: "Helvetica",
          fallback: true,
        },
      ],
      images: [],
    },
    fallbacks: [],
  };
}

describe("PDF writer", () => {
  test("emits a minimal structurally valid PDF with one text operation", async () => {
    const result = await renderPdfPageModel(onePageModel("Hello PDF"), { inspection: "none" });

    expect(result.diagnostics.items).toEqual([]);
    expect(result.artifact).toMatchObject({
      format: "pdf",
      mediaType: "application/pdf",
      extension: "pdf",
    });

    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(pdf.startsWith("%PDF-1.7\n")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toContain("/Type /Pages");
    expect(pdf).toContain("/Type /Page");
    expect(pdf).toContain("xref");
    expect(pdf).toContain("trailer");
    expect(pdf).toContain("startxref");
    expect(pdf).toContain("%%EOF");
    expect(pdf).toContain("BT");
    expect(pdf).toContain("/F1 12 Tf");
    expect(pdf).toContain("(Hello PDF) Tj");
    expect(pdf).toContain("ET");
  });

  test("escapes text string delimiters in content streams", async () => {
    const result = await renderPdfPageModel(onePageModel("Hello (PDF) \\ writer"), {
      inspection: "none",
    });

    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("(Hello \\(PDF\\) \\\\ writer) Tj");
  });

  test("rejects text font references that are not declared on the page", async () => {
    const model = onePageModel("Hidden font");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [] },
          },
        ],
      },
      { inspection: "none" },
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_PAGE_MISSING_FONT_RESOURCE",
    );
  });
});

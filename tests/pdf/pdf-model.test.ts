import { describe, expect, test } from "vite-plus/test";
import { pdfDocumentId, pdfPageId, pdfResourceId } from "@/src/projection/pdf/identity";
import { PDF_SPECIFICATION_PROFILE } from "@/src/projection/pdf/profile";
import { validatePdfPageModel } from "@/src/projection/pdf/validation";
import type { PdfPageModel } from "@/src/projection/pdf/model";

describe("PDF Page Model", () => {
  test("declares the initial PDF specification profile", () => {
    expect(PDF_SPECIFICATION_PROFILE).toMatchObject({
      emittedVersion: "1.7",
      referenceVersion: "ISO 32000-2:2020",
      supports: {
        pages: true,
        contentStreams: true,
        resourceDictionaries: true,
        embeddedTrueTypeFonts: true,
        imageXObjects: true,
      },
    });
  });

  test("creates stable PDF identifiers", () => {
    expect(pdfDocumentId("deck:demo")).toBe("pdf:document:deck-demo");
    expect(pdfPageId("slide:1", 0)).toBe("pdf:page:slide-1:0");
    expect(pdfResourceId("font", "Inter Regular")).toBe("pdf:resource:font:inter-regular");
  });

  test("validates a minimal model", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: pdfPageId("slide:1", 0),
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [], images: [] },
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items).toEqual([]);
  });

  test("rejects duplicate page ids", () => {
    const page = {
      id: pdfPageId("slide:1", 0),
      index: 0,
      mediaBox: { x: 0, y: 0, width: 720, height: 405 },
      resources: { fonts: [], images: [] },
      content: [],
    } satisfies PdfPageModel["pages"][number];
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [page, page],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_DUPLICATE_PAGE_ID",
    );
  });

  test("rejects invalid page boxes", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: pdfPageId("slide:1", 0),
          index: 0,
          mediaBox: { x: 0, y: 0, width: 0, height: 405 },
          resources: { fonts: [], images: [] },
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_BOX",
    );
  });

  test("rejects unknown font and image resource ids", () => {
    const fontId = pdfResourceId("font", "Missing Font");
    const imageId = pdfResourceId("image", "Missing Image");
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: pdfPageId("slide:1", 0),
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [fontId], images: [imageId] },
          content: [
            { op: "text", text: "Missing font", x: 0, y: 0, fontId },
            { op: "image", imageId, box: { x: 0, y: 0, width: 10, height: 10 } },
          ],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "E_PDF_MODEL_UNKNOWN_FONT_RESOURCE",
        "E_PDF_MODEL_UNKNOWN_IMAGE_RESOURCE",
      ]),
    );
  });
});

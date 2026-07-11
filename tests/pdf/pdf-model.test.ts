import { describe, expect, test } from "vite-plus/test";
import { assetEntityId, graphNodeId } from "@/src/graph/identity";
import { pdfDocumentId, pdfPageId, pdfResourceId } from "@/src/projection/pdf/identity";
import { summarizePdfPageModel } from "@/src/projection/pdf/inspect";
import { contentOpsFromPdfVisuals } from "@/src/projection/pdf/lower";
import { PDF_SPECIFICATION_PROFILE } from "@/src/projection/pdf/profile";
import { validatePdfPageModel } from "@/src/projection/pdf/validation";
import type { PdfPageModel, PdfVisualElement } from "@/src/projection/pdf/model";

function uint16(value: number): readonly number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint32(value: number): readonly number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function tag(value: string): readonly number[] {
  return value.split("").map((character) => character.charCodeAt(0));
}

function minimalTrueTypeWithFormat12AB(): Uint8Array {
  const cmap = [
    ...uint16(0),
    ...uint16(1),
    ...uint16(3),
    ...uint16(10),
    ...uint32(12),
    ...uint16(12),
    ...uint16(0),
    ...uint32(28),
    ...uint32(0),
    ...uint32(1),
    ...uint32(65),
    ...uint32(66),
    ...uint32(1),
  ];
  const cmapOffset = 28;
  return new Uint8Array([
    ...uint32(0x00010000),
    ...uint16(1),
    ...uint16(0),
    ...uint16(0),
    ...uint16(0),
    ...tag("cmap"),
    ...uint32(0),
    ...uint32(cmapOffset),
    ...uint32(cmap.length),
    ...cmap,
  ]);
}

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
        transparency: true,
        blendModes: true,
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

  test("rejects malformed top-level document fields", () => {
    const model: PdfPageModel = {
      format: "pptx",
      version: "2.0",
      documentId: "",
      metadata: { producer: "deckjsx" },
      pages: [],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_DOCUMENT",
    );
  });

  test("rejects document ids outside the pdf document namespace", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: "deck:demo",
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
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_DOCUMENT",
    );
  });

  test("rejects non-object document models", () => {
    expect(validatePdfPageModel(null as never).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_DOCUMENT",
    );
  });

  test("rejects malformed global resource dictionaries", () => {
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
      resources: {
        fonts: "not-an-array",
        images: null,
        gradients: "not-an-array",
      },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_RESOURCES",
    );
  });

  test("rejects malformed page arrays", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: "not-an-array",
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGES",
    );
  });

  test("rejects empty page arrays", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGES",
    );
  });

  test("rejects malformed page entries", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [null],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE",
    );
  });

  test("rejects malformed fallback arrays", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [],
      resources: { fonts: [], images: [] },
      fallbacks: "not-an-array",
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_FALLBACKS",
    );
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

  test("stringifies malformed duplicate page ids in diagnostics", () => {
    const page = {
      id: 42,
      index: 0,
      mediaBox: { x: 0, y: 0, width: 720, height: 405 },
      resources: { fonts: [], images: [] },
      content: [],
    };
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [page, { ...page, index: 1 }],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    const duplicatePageId = validatePdfPageModel(model).items.find(
      (item) => item.code === "E_PDF_MODEL_DUPLICATE_PAGE_ID",
    );

    expect(duplicatePageId?.labels[0]?.message).toBe("42");
  });

  test("rejects invalid page ids", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: "",
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [], images: [] },
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_ID",
    );
  });

  test("rejects page ids outside the pdf page namespace", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: "slide:1",
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [], images: [] },
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_ID",
    );
  });

  test("rejects page ids whose encoded index does not match the page index", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: pdfPageId("slide:1", 7),
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [], images: [] },
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_ID",
    );
  });

  test("stringifies missing page ids in diagnostics", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [], images: [] },
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    const invalidPageId = validatePdfPageModel(model).items.find(
      (item) => item.code === "E_PDF_MODEL_INVALID_PAGE_ID",
    );

    expect(invalidPageId?.labels[0]?.message).toBe("undefined");
  });

  test("rejects duplicate global resource ids", () => {
    const fontId = pdfResourceId("font", "Helvetica");
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
          resources: { fonts: [fontId], images: [] },
          content: [{ op: "text", text: "Duplicate resource id", x: 0, y: 0, fontId }],
        },
      ],
      resources: {
        fonts: [
          { id: fontId, name: "F1", family: "Helvetica" },
          { id: fontId, name: "F2", family: "Helvetica" },
        ],
        images: [],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_DUPLICATE_RESOURCE_ID",
    );
  });

  test("rejects empty global resource ids", () => {
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
      resources: {
        fonts: [{ id: "", name: "F1", family: "Helvetica" }],
        images: [],
      },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_FONT_RESOURCE",
    );
  });

  test("rejects global resource ids with the wrong kind", () => {
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
      resources: {
        fonts: [{ id: pdfResourceId("image", "Helvetica"), name: "F1", family: "Helvetica" }],
        images: [],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_FONT_RESOURCE",
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

  test("rejects missing page boxes", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: pdfPageId("slide:1", 0),
          index: 0,
          resources: { fonts: [], images: [] },
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_BOX",
    );
  });

  test("rejects invalid page indexes", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: pdfPageId("slide:1", 0),
          index: 1,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [], images: [] },
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_INDEX",
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

  test("rejects malformed page resource references", () => {
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
          resources: {
            fonts: [""],
            images: [42],
            gradients: [{ id: "not-a-resource-id" }],
          },
          content: [],
        },
      ],
      resources: { fonts: [], images: [], gradients: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_RESOURCE_REFERENCE",
    );
  });

  test("rejects malformed page resource dictionaries", () => {
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
          resources: {
            fonts: "not-an-array",
            images: null,
            gradients: "not-an-array",
          },
          content: [],
        },
      ],
      resources: { fonts: [], images: [], gradients: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_RESOURCES",
    );
  });

  test("rejects content resources not declared on the page", () => {
    const fontId = pdfResourceId("font", "Helvetica");
    const imageId = pdfResourceId("image", "Chart");
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
          content: [
            { op: "text", text: "Global-only font", x: 0, y: 0, fontId },
            { op: "image", imageId, box: { x: 0, y: 0, width: 10, height: 10 } },
          ],
        },
      ],
      resources: {
        fonts: [{ id: fontId, name: "F1", family: "Helvetica" }],
        images: [{ id: imageId }],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "E_PDF_MODEL_PAGE_MISSING_FONT_RESOURCE",
        "E_PDF_MODEL_PAGE_MISSING_IMAGE_RESOURCE",
      ]),
    );
  });

  test("rejects text operations without a page-local font", () => {
    const fontId = pdfResourceId("font", "Helvetica");
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
          content: [{ op: "text", text: "Implicit global font", x: 0, y: 0 }],
        },
      ],
      resources: { fonts: [{ id: fontId, name: "F1", family: "Helvetica" }], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_TEXT_MISSING_FONT_RESOURCE",
    );
  });

  test("rejects duplicate page font resource names", () => {
    const fontId = pdfResourceId("font", "Helvetica");
    const duplicateFontId = pdfResourceId("font", "Helvetica Duplicate");
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
          resources: { fonts: [fontId, duplicateFontId], images: [] },
          content: [{ op: "text", text: "Duplicate font names", x: 0, y: 0, fontId }],
        },
      ],
      resources: {
        fonts: [
          { id: fontId, name: "F1", family: "Helvetica" },
          { id: duplicateFontId, name: "F1", family: "Helvetica" },
        ],
        images: [],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_DUPLICATE_PAGE_FONT_RESOURCE_NAME",
    );
  });

  test("rejects malformed font resources", () => {
    const fontId = pdfResourceId("font", "Broken Font");
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
          resources: { fonts: [fontId], images: [] },
          content: [{ op: "text", text: "Broken font", x: 0, y: 0, fontId }],
        },
      ],
      resources: {
        fonts: [
          {
            id: fontId,
            name: "",
            family: 42,
            weight: Number.NaN,
            style: "oblique",
            encoding: "utf8",
            fallback: "yes",
            sourceKey: 42,
            data: "not bytes",
          },
        ],
        images: [],
      },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_FONT_RESOURCE",
    );
  });

  test("rejects duplicate page image resource names", () => {
    const imageId = pdfResourceId("image", "Chart");
    const duplicateImageId = pdfResourceId("image", "Chart Duplicate");
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
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
          resources: { fonts: [], images: [imageId, duplicateImageId] },
          content: [{ op: "image", imageId, box: { x: 0, y: 0, width: 10, height: 10 } }],
        },
      ],
      resources: {
        fonts: [],
        images: [
          {
            id: imageId,
            name: "Im1",
            mediaType: "image/jpeg",
            width: 1,
            height: 1,
            data: jpegBytes,
          },
          {
            id: duplicateImageId,
            name: "Im1",
            mediaType: "image/jpeg",
            width: 1,
            height: 1,
            data: jpegBytes,
          },
        ],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_DUPLICATE_PAGE_IMAGE_RESOURCE_NAME",
    );
  });

  test("rejects duplicate page gradient resource names", () => {
    const gradientId = pdfResourceId("gradient", "Background");
    const duplicateGradientId = pdfResourceId("gradient", "Background Duplicate");
    const gradient = {
      name: "P1",
      kind: "linear-gradient" as const,
      angle: 90,
      box: { x: 0, y: 0, width: 720, height: 405 },
      stops: [
        { color: { r: 1, g: 0, b: 0 }, position: 0 },
        { color: { r: 0, g: 0, b: 1 }, position: 1 },
      ],
    };
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
          resources: { fonts: [], images: [], gradients: [gradientId, duplicateGradientId] },
          content: [
            {
              op: "fillLinearGradientRect",
              gradientId,
              box: { x: 0, y: 0, width: 720, height: 405 },
            },
          ],
        },
      ],
      resources: {
        fonts: [],
        images: [],
        gradients: [
          { id: gradientId, ...gradient },
          { id: duplicateGradientId, ...gradient },
        ],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_DUPLICATE_PAGE_GRADIENT_RESOURCE_NAME",
    );
  });

  test("rejects malformed gradient resources", () => {
    const gradientId = pdfResourceId("gradient", "Broken Background");
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
          resources: { fonts: [], images: [], gradients: [gradientId] },
          content: [
            {
              op: "fillLinearGradientRect",
              gradientId,
              box: { x: 0, y: 0, width: 720, height: 405 },
            },
          ],
        },
      ],
      resources: {
        fonts: [],
        images: [],
        gradients: [
          {
            id: gradientId,
            name: "",
            kind: "linear-gradient",
            angle: Number.NaN,
            box: { x: 0, y: 0, width: 0, height: 405 },
            stops: [{ color: { r: 1, g: 0, b: 0 }, position: 0 }],
          },
        ],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_GRADIENT_RESOURCE",
    );
  });

  test("rejects gradient stops outside the interpolation range", () => {
    const gradientId = pdfResourceId("gradient", "Out Of Range Background");
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
          resources: { fonts: [], images: [], gradients: [gradientId] },
          content: [
            {
              op: "fillLinearGradientRect",
              gradientId,
              box: { x: 0, y: 0, width: 720, height: 405 },
            },
          ],
        },
      ],
      resources: {
        fonts: [],
        images: [],
        gradients: [
          {
            id: gradientId,
            name: "P1",
            kind: "linear-gradient",
            angle: 90,
            box: { x: 0, y: 0, width: 720, height: 405 },
            stops: [
              { color: { r: 1, g: 0, b: 0 }, position: -0.1 },
              { color: { r: 0, g: 0, b: 1 }, position: 1.1 },
            ],
          },
        ],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_GRADIENT_RESOURCE",
    );
  });

  test("rejects radial gradient resources with non-positive radii", () => {
    const gradientId = pdfResourceId("gradient", "Collapsed Background");
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
          resources: { fonts: [], images: [], gradients: [gradientId] },
          content: [
            {
              op: "fillRadialGradientRect",
              gradientId,
              box: { x: 0, y: 0, width: 720, height: 405 },
            },
          ],
        },
      ],
      resources: {
        fonts: [],
        images: [],
        gradients: [
          {
            id: gradientId,
            name: "Collapsed Background",
            kind: "radial-gradient",
            shape: "ellipse",
            center: { x: 0.5, y: 0.5 },
            radius: { x: 0, y: -1 },
            box: { x: 0, y: 0, width: 720, height: 405 },
            stops: [
              { color: { r: 1, g: 0, b: 0 }, position: 0 },
              { color: { r: 0, g: 0, b: 1 }, position: 1 },
            ],
          },
        ],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_GRADIENT_RESOURCE",
    );
  });

  test("rejects image operations with unembeddable image resources", () => {
    const imageId = pdfResourceId("image", "Chart");
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
          resources: { fonts: [], images: [imageId] },
          content: [{ op: "image", imageId, box: { x: 0, y: 0, width: 10, height: 10 } }],
        },
      ],
      resources: { fonts: [], images: [{ id: imageId }] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_UNEMBEDDABLE_IMAGE_RESOURCE",
    );
  });

  test("rejects deferred data image resources without embeddable bytes", () => {
    const imageId = pdfResourceId("image", "Deferred Data Image");
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
          resources: { fonts: [], images: [imageId] },
          content: [{ op: "image", imageId, box: { x: 0, y: 0, width: 10, height: 10 } }],
        },
      ],
      resources: {
        fonts: [],
        images: [
          {
            id: imageId,
            name: "ImData",
            assetEntityId: assetEntityId(["deferred-data"]),
            source: { kind: "data", data: "data:image/png;base64,broken" },
            sourceField: "data",
            mediaType: "image/png",
          },
        ],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_UNEMBEDDABLE_IMAGE_RESOURCE",
    );
  });

  test("rejects deferred path image resources without resource names", () => {
    const imageId = pdfResourceId("image", "Deferred Path Image");
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
          resources: { fonts: [], images: [imageId] },
          content: [{ op: "image", imageId, box: { x: 0, y: 0, width: 10, height: 10 } }],
        },
      ],
      resources: {
        fonts: [],
        images: [
          {
            id: imageId,
            assetEntityId: assetEntityId(["deferred-path"]),
            source: { kind: "path", path: "/public/deferred.png" },
            sourceField: "src",
          },
        ],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_UNEMBEDDABLE_IMAGE_RESOURCE",
    );
  });

  test("accepts WinAnsi metadata strings", () => {
    const fontId = pdfResourceId("font", "Helvetica");
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx", title: "Café" },
      pages: [
        {
          id: pdfPageId("slide:1", 0),
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [fontId], images: [] },
          content: [{ op: "text", text: "Cafe", x: 0, y: 0, fontId }],
        },
      ],
      resources: { fonts: [{ id: fontId, name: "F1", family: "Helvetica" }], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).not.toContain(
      "E_PDF_MODEL_UNSUPPORTED_METADATA_ENCODING",
    );
  });

  test("rejects malformed metadata fields", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx", title: 42 },
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
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_METADATA",
    );
  });

  test("rejects malformed metadata date fields", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx", creationDate: 42, modificationDate: false },
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
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_METADATA",
    );
  });

  test("rejects unparsable metadata date strings", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: {
        producer: "deckjsx",
        creationDate: "not a date",
        modificationDate: "2026-99-99T99:99:99Z",
      },
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

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_METADATA",
    );
  });

  test("rejects malformed fallback entries", () => {
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
      fallbacks: [{ code: 42, message: 42, pageId: 42 }],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_FALLBACK",
    );
  });

  test("accepts fallback origin metadata", () => {
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
      fallbacks: [
        {
          code: "W_PDF_UNSUPPORTED_SEMANTIC",
          message: "Unsupported semantic",
          pageId: pdfPageId("slide:1", 0),
          nodeId: "node:1",
          kind: "text",
          origin: { graphNodeIds: [graphNodeId(["node", "1"])] },
        },
      ],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).not.toContain(
      "E_PDF_MODEL_INVALID_FALLBACK",
    );
  });

  test("rejects malformed fallback origins", () => {
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
      fallbacks: [
        {
          code: "W_PDF_UNSUPPORTED_SEMANTIC",
          message: "Bad fallback origin",
          pageId: pdfPageId("slide:1", 0),
          nodeId: "node:1",
          kind: "text",
          origin: { graphNodeIds: [""] },
        },
      ],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_FALLBACK",
    );
  });

  test("rejects malformed structured fallback semantics", () => {
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
      fallbacks: [
        {
          code: "W_PDF_UNSUPPORTED_SEMANTIC",
          message: "Invalid semantic",
          pageId: pdfPageId("slide:1", 0),
          nodeId: "node:1",
          semantic: {
            feature: "magic",
            property: "filter",
            value: "blur(2px)",
            reason: "unsupported",
          },
        },
      ],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_FALLBACK",
    );
  });

  test("rejects text outside WinAnsiEncoding", () => {
    const fontId = pdfResourceId("font", "Helvetica");
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx", subject: "Deck 😀" },
      pages: [
        {
          id: pdfPageId("slide:1", 0),
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [fontId], images: [] },
          content: [{ op: "text", text: "Café 😀", x: 0, y: 0, fontId }],
        },
      ],
      resources: { fonts: [{ id: fontId, name: "F1", family: "Helvetica" }], images: [] },
      fallbacks: [],
    };

    const diagnostics = validatePdfPageModel(model).items;
    expect(diagnostics.map((item) => item.code)).toEqual(["E_PDF_MODEL_UNSUPPORTED_TEXT_ENCODING"]);
    expect(diagnostics[0]?.message).toBe(
      'PDF text outside WinAnsiEncoding must declare textEncoding "utf16be" and use an Identity-H font resource.',
    );
  });

  test("rejects text visual outside WinAnsiEncoding", () => {
    const fontId = pdfResourceId("font", "Helvetica");
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
          resources: { fonts: [fontId], images: [] },
          visuals: [
            {
              kind: "text",
              text: "Visual 😀",
              box: { x: 0, y: 0, width: 100, height: 40 },
              fontId,
              style: { fontSize: 12 },
              paintOrder: { siblingOrder: 0, generatedLayerRole: "authored" },
            },
          ],
          content: [],
        },
      ],
      resources: { fonts: [{ id: fontId, name: "F1", family: "Helvetica" }], images: [] },
      fallbacks: [],
    };

    const diagnostics = validatePdfPageModel(model).items;
    expect(diagnostics.map((item) => item.code)).toContain("E_PDF_MODEL_UNSUPPORTED_TEXT_ENCODING");
    expect(diagnostics[0]?.message).toBe(
      'PDF text outside WinAnsiEncoding must declare textEncoding "utf16be" and use an Identity-H font resource.',
    );
  });

  test("warns when text visual glyphs are missing from embedded fonts", () => {
    const fontId = pdfResourceId("font", "Subset Font");
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
          resources: { fonts: [fontId], images: [] },
          visuals: [
            {
              kind: "text",
              text: "C",
              box: { x: 0, y: 0, width: 100, height: 40 },
              fontId,
              style: { fontSize: 12 },
              paintOrder: { siblingOrder: 0, generatedLayerRole: "authored" },
            },
          ],
          content: [],
        },
      ],
      resources: {
        fonts: [
          {
            id: fontId,
            name: "FSubset",
            family: "Subset",
            data: minimalTrueTypeWithFormat12AB(),
          },
        ],
        images: [],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_UNRESOLVED_FONT_GLYPH",
    );
  });

  test("rejects malformed and unknown content operations", () => {
    const imageId = pdfResourceId("image", "Chart");
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
          resources: { fonts: [], images: [imageId] },
          content: [
            { op: "setFillColor", color: { r: 1, g: 0 } },
            { op: "text", text: 42, x: 0, y: 0 },
            { op: "image", imageId, box: { x: 0, y: 0, width: 0, height: 10 } },
            { op: "clip" },
          ] as never,
        },
      ],
      resources: { fonts: [], images: [{ id: imageId }] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toEqual(
      expect.arrayContaining(["E_PDF_MODEL_INVALID_CONTENT_OP"]),
    );
  });

  test("reports malformed content operations with unserializable diagnostic values", () => {
    const operation: Record<string, unknown> = { op: "clip" };
    operation.self = operation;
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
          content: [operation],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    const invalidOperation = validatePdfPageModel(model).items.find(
      (item) => item.code === "E_PDF_MODEL_INVALID_CONTENT_OP",
    );

    expect(invalidOperation?.labels[0]?.message).toBe("[object Object]");
  });

  test("rejects malformed page content arrays", () => {
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
          content: "not-an-array",
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_CONTENT",
    );
  });

  test("rejects malformed page annotation arrays", () => {
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
          annotations: "not-an-array",
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_ANNOTATIONS",
    );
  });

  test("rejects link annotations with control characters in urls", () => {
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
          annotations: [
            {
              kind: "link",
              box: { x: 10, y: 10, width: 100, height: 20 },
              url: "https://example.com/\nnext",
            },
          ],
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_ANNOTATION",
    );
  });

  test("rejects link annotations with unescaped spaces in urls", () => {
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
          annotations: [
            {
              kind: "link",
              box: { x: 10, y: 10, width: 100, height: 20 },
              url: "https://example.com/a b",
            },
          ],
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_ANNOTATION",
    );
  });

  test("rejects link annotations with empty mailto urls", () => {
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
          annotations: [
            {
              kind: "link",
              box: { x: 10, y: 10, width: 100, height: 20 },
              url: "mailto:",
            },
          ],
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_ANNOTATION",
    );
  });

  test("rejects link annotations with hostless http urls", () => {
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
          annotations: [
            {
              kind: "link",
              box: { x: 10, y: 10, width: 100, height: 20 },
              url: "https://?q=1",
            },
          ],
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_ANNOTATION",
    );
  });

  test("rejects link annotations outside the page media box", () => {
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
          annotations: [
            {
              kind: "link",
              box: { x: 700, y: 390, width: 50, height: 20 },
              url: "https://example.com/docs",
            },
          ],
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_ANNOTATION",
    );
  });

  test("accepts link annotations inside non-zero origin page media boxes", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: pdfPageId("slide:1", 0),
          index: 0,
          mediaBox: { x: 10, y: 20, width: 720, height: 405 },
          resources: { fonts: [], images: [] },
          annotations: [
            {
              kind: "link",
              box: { x: 0, y: 0, width: 100, height: 20 },
              url: "https://example.com/docs",
            },
          ],
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).not.toContain(
      "E_PDF_MODEL_INVALID_ANNOTATION",
    );
  });

  test("rejects malformed page visual arrays", () => {
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
          visuals: "not-an-array",
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as never;

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_PAGE_VISUALS",
    );
  });

  test("rejects color channels outside the pdf rgb range", () => {
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
          content: [{ op: "setFillColor", color: { r: 1.1, g: 0, b: -0.1 } }],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_CONTENT_OP",
    );
  });

  test("rejects malformed text operation transform fields", () => {
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
          content: [
            {
              op: "text",
              text: "Bad transform",
              x: 0,
              y: 0,
              flipH: "yes",
              rotationBox: { x: 0, y: 0, width: 0, height: 10 },
            },
          ] as never,
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_CONTENT_OP",
    );
  });

  test("rejects malformed pdf visual elements", () => {
    const fontId = pdfResourceId("font", "Helvetica");
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
          resources: { fonts: [fontId], images: [] },
          visuals: [
            {
              kind: "text",
              text: 42,
              box: { x: 0, y: 0, width: 100, height: 40 },
              fontId,
              style: { fontSize: 12 },
              paintOrder: { siblingOrder: 0, generatedLayerRole: "authored" },
            },
            {
              kind: "text",
              text: "Bad box",
              box: { x: 0, y: 0, width: 0, height: 40 },
              fontId,
              style: { fontSize: 12 },
              paintOrder: { siblingOrder: 1, generatedLayerRole: "authored" },
            },
            { kind: "shape" },
          ] as never,
          content: [{ op: "text", text: "Valid content", x: 0, y: 0, fontId }],
        },
      ],
      resources: { fonts: [{ id: fontId, name: "F1", family: "Helvetica" }], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toEqual(
      expect.arrayContaining(["E_PDF_MODEL_INVALID_VISUAL_ELEMENT"]),
    );
  });

  test("rejects malformed pdf visual element origins", () => {
    const fontId = pdfResourceId("font", "Helvetica");
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
          resources: { fonts: [fontId], images: [] },
          visuals: [
            {
              kind: "text",
              text: "Bad origin",
              box: { x: 0, y: 0, width: 100, height: 40 },
              fontId,
              style: { fontSize: 12 },
              origin: { graphNodeIds: [""] },
              paintOrder: { siblingOrder: 0, generatedLayerRole: "authored" },
            },
          ] as never,
          content: [{ op: "text", text: "Valid content", x: 0, y: 0, fontId }],
        },
      ],
      resources: { fonts: [{ id: fontId, name: "F1", family: "Helvetica" }], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_VISUAL_ELEMENT",
    );
  });

  test("rejects malformed shape visual radius fields", () => {
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
          visuals: [
            {
              kind: "shape",
              shape: "roundRect",
              box: { x: 0, y: 0, width: 100, height: 40 },
              paintOrder: { siblingOrder: 0, generatedLayerRole: "background" },
            },
            {
              kind: "shape",
              shape: "rect",
              box: { x: 0, y: 0, width: 100, height: 40 },
              radius: 8,
              paintOrder: { siblingOrder: 1, generatedLayerRole: "background" },
            },
          ] as never,
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_VISUAL_ELEMENT",
    );
  });

  test("rejects malformed image visual fit metadata", () => {
    const imageId = pdfResourceId("image", "photo");
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
          resources: { fonts: [], images: [imageId] },
          visuals: [
            {
              kind: "image",
              imageId,
              box: { x: 0, y: 0, width: 100, height: 40 },
              fit: "crop",
              objectPosition: { x: 0.5, y: 0.5 },
              paintOrder: { siblingOrder: 0, generatedLayerRole: "authored" },
            },
            {
              kind: "image",
              imageId,
              box: { x: 120, y: 0, width: 100, height: 40 },
              fit: "contain",
              objectPosition: { x: Number.NaN, y: 0.5 },
              paintOrder: { siblingOrder: 1, generatedLayerRole: "authored" },
            },
          ] as never,
          content: [],
        },
      ],
      resources: {
        fonts: [],
        images: [{ id: imageId, name: "Im1", mediaType: "image/jpeg", width: 1, height: 1 }],
      },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_VISUAL_ELEMENT",
    );
  });

  test("rejects malformed text visual hyperlink and encoding fields", () => {
    const fontId = pdfResourceId("font", "Helvetica");
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
          resources: { fonts: [fontId], images: [] },
          visuals: [
            {
              kind: "text",
              text: "Bad link",
              textEncoding: "utf8",
              box: { x: 0, y: 0, width: 100, height: 40 },
              fontId,
              style: { fontSize: 12 },
              hyperlink: { url: "javascript:alert(1)", tooltip: 42 },
              hyperlinkBox: { x: 0, y: 0, width: 0, height: 20 },
              paintOrder: { siblingOrder: 0, generatedLayerRole: "authored" },
            },
          ] as never,
          content: [{ op: "text", text: "Valid content", x: 0, y: 0, fontId }],
        },
      ],
      resources: { fonts: [{ id: fontId, name: "F1", family: "Helvetica" }], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_VISUAL_ELEMENT",
    );
  });

  test("rejects text visual hyperlink boxes outside the page media box", () => {
    const fontId = pdfResourceId("font", "Helvetica");
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
          resources: { fonts: [fontId], images: [] },
          visuals: [
            {
              kind: "text",
              text: "Bad link box",
              box: { x: 0, y: 0, width: 100, height: 40 },
              fontId,
              style: { fontSize: 12 },
              hyperlink: { url: "https://example.com/docs" },
              hyperlinkBox: { x: 700, y: 390, width: 50, height: 20 },
              paintOrder: { siblingOrder: 0, generatedLayerRole: "authored" },
            },
          ],
          content: [{ op: "text", text: "Valid content", x: 0, y: 0, fontId }],
        },
      ],
      resources: { fonts: [{ id: fontId, name: "F1", family: "Helvetica" }], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_VISUAL_ELEMENT",
    );
  });

  test("rejects text visual hyperlink fallback boxes outside the page media box", () => {
    const fontId = pdfResourceId("font", "Helvetica");
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
          resources: { fonts: [fontId], images: [] },
          visuals: [
            {
              kind: "text",
              text: "Bad fallback link box",
              box: { x: 700, y: 390, width: 50, height: 20 },
              fontId,
              style: { fontSize: 12 },
              hyperlink: { url: "https://example.com/docs" },
              paintOrder: { siblingOrder: 0, generatedLayerRole: "authored" },
            },
          ],
          content: [{ op: "text", text: "Valid content", x: 0, y: 0, fontId }],
        },
      ],
      resources: { fonts: [{ id: fontId, name: "F1", family: "Helvetica" }], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_INVALID_VISUAL_ELEMENT",
    );
  });
});

describe("PDF inspection paint order", () => {
  test("matches lowered content order and keeps exact paint-order ties stable", () => {
    const fontId = pdfResourceId("font", "Helvetica");
    const textVisual = (
      text: string,
      sourceIndex: number,
      paintOrder: PdfVisualElement["paintOrder"],
    ): PdfVisualElement => ({
      kind: "text",
      text,
      box: { x: sourceIndex * 10, y: 0, width: 80, height: 20 },
      fontId,
      style: { fontSize: 12 },
      paintOrder,
      origin: { graphNodeIds: [graphNodeId(["inspection", text])] },
    });
    const visuals: readonly PdfVisualElement[] = [
      textVisual("later-z", 0, {
        zIndex: 2,
        siblingOrder: 0,
        generatedLayerRole: "authored",
      }),
      textVisual("tie-first", 1, {
        zIndex: 0,
        siblingOrder: 1,
        generatedLayerRole: "authored",
      }),
      textVisual("background", 2, {
        zIndex: 0,
        siblingOrder: 2,
        generatedLayerRole: "background",
      }),
      textVisual("tie-second", 3, {
        zIndex: 0,
        siblingOrder: 1,
        generatedLayerRole: "authored",
      }),
    ];
    const content = contentOpsFromPdfVisuals(visuals);
    const pageId = pdfPageId("slide:inspection", 0);
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:inspection"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: pageId,
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [fontId], images: [] },
          visuals,
          content,
        },
      ],
      resources: { fonts: [{ id: fontId, name: "F1", family: "Helvetica" }], images: [] },
      fallbacks: [],
    };

    const summary = summarizePdfPageModel(model, { includeDetails: true });
    const contentTextOrder = content.flatMap((operation) =>
      operation.op === "text" ? [operation.text] : [],
    );
    const inspectedTextOrder = summary.slides[0]?.elements.flatMap((element) =>
      element.textPreview ? [element.textPreview] : [],
    );

    expect(inspectedTextOrder).toEqual(contentTextOrder);
    expect(inspectedTextOrder).toEqual(["tie-first", "tie-second", "background", "later-z"]);
    expect(summary.slides[0]?.elements.map((element) => element.paintOrderIndex)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(summary.slides[0]?.elements.map((element) => element.id)).toEqual([
      `${pageId}:element:1`,
      `${pageId}:element:3`,
      `${pageId}:element:2`,
      `${pageId}:element:0`,
    ]);
    expect(
      summary.details?.composedPaintOrder[0]?.entries.map((entry) => entry.siblingPath),
    ).toEqual([[1], [3], [2], [0]]);
  });

  test("reports every semantic visual once when lowering expands one visual into multiple ops", () => {
    const visuals: readonly PdfVisualElement[] = [
      {
        kind: "shape",
        shape: "rect",
        box: { x: 10, y: 10, width: 100, height: 50 },
        fill: { color: { r: 1, g: 0, b: 0 } },
        stroke: { color: { r: 0, g: 0, b: 0 }, width: 1 },
        paintOrder: { siblingOrder: 0, generatedLayerRole: "authored" },
        origin: { graphNodeIds: [graphNodeId(["inspection", "shape"])] },
      },
      {
        kind: "line",
        from: { x: 0, y: 0 },
        to: { x: 20, y: 20 },
        stroke: { color: { r: 0, g: 0, b: 1 }, width: 1 },
        paintOrder: { siblingOrder: 1, generatedLayerRole: "authored" },
        origin: { graphNodeIds: [graphNodeId(["inspection", "line"])] },
      },
    ];
    const content = contentOpsFromPdfVisuals(visuals);
    const pageId = pdfPageId("slide:expanded-visual", 0);
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:expanded-visual"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: pageId,
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [], images: [] },
          visuals,
          content,
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    const summary = summarizePdfPageModel(model, { includeDetails: true });
    const elements = summary.slides[0]?.elements ?? [];
    const detailedElements = summary.details?.composedPaintOrder[0]?.entries ?? [];

    expect(content.length).toBeGreaterThan(visuals.length);
    expect(elements).toHaveLength(2);
    expect(detailedElements).toHaveLength(2);
    expect(new Set(elements.map((element) => element.id)).size).toBe(2);
    expect(elements.map((element) => element.kind)).toEqual(["shape", "line"]);
  });
});

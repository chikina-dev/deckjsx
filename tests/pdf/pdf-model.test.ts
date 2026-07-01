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

  test("rejects unsupported image operations", () => {
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
      "E_PDF_MODEL_UNSUPPORTED_IMAGE_OPERATION",
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
});

import { zlibSync } from "fflate";
import { describe, expect, test } from "vite-plus/test";
import { pdfDocumentId, pdfPageId, pdfResourceId } from "@/src/projection/pdf/identity";
import { pdfEmbeddableJpegImage } from "@/src/projection/pdf/jpeg";
import type { PdfPageModel } from "@/src/projection/pdf/model";
import { pdfEmbeddablePngImage } from "@/src/projection/pdf/png";
import { renderPdfPageModel } from "@/src/writers/pdf";

const VALID_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";

function bytesFromBase64(value: string): Uint8Array {
  return Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));
}

function uint32(value: number): readonly number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function pngChunk(type: string, data: Uint8Array): readonly number[] {
  const payload = new Uint8Array([
    ...type.split("").map((character) => character.charCodeAt(0)),
    ...data,
  ]);
  let crc = 0xffffffff;
  payload.forEach((byte) => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  });
  return [...uint32(data.byteLength), ...payload, ...uint32((crc ^ 0xffffffff) >>> 0)];
}

function rgbPngBytes(
  input: {
    readonly width?: number;
    readonly height?: number;
    readonly rows?: Uint8Array;
    readonly idat?: Uint8Array;
  } = {},
): Uint8Array {
  const width = input.width ?? 1;
  const height = input.height ?? 1;
  const rows = input.rows ?? new Uint8Array([0, 0x33, 0x66, 0x99]);
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk("IHDR", new Uint8Array([...uint32(width), ...uint32(height), 8, 2, 0, 0, 0])),
    ...pngChunk("IDAT", input.idat ?? zlibSync(rows)),
    ...pngChunk("IEND", new Uint8Array()),
  ]);
}

function imageModel(input: {
  readonly mediaType: "image/jpeg" | "image/png";
  readonly data: Uint8Array;
  readonly width?: number;
  readonly height?: number;
}): PdfPageModel {
  const imageId = pdfResourceId("image", "validation-image");
  return {
    format: "pdf",
    version: "1.7",
    documentId: pdfDocumentId("image-input-validation"),
    metadata: { producer: "deckjsx" },
    pages: [
      {
        id: pdfPageId("slide:1", 0),
        index: 0,
        mediaBox: { x: 0, y: 0, width: 100, height: 100 },
        resources: { fonts: [], images: [imageId] },
        content: [{ op: "image", imageId, box: { x: 0, y: 0, width: 10, height: 10 } }],
      },
    ],
    resources: {
      fonts: [],
      images: [
        {
          id: imageId,
          name: "Im1",
          mediaType: input.mediaType,
          width: input.width ?? 1,
          height: input.height ?? 1,
          data: input.data,
        },
      ],
    },
    fallbacks: [],
  };
}

describe("PDF image input validation", () => {
  test("accepts complete JPEG and PNG inputs", async () => {
    const jpeg = bytesFromBase64(VALID_JPEG_BASE64);
    const png = rgbPngBytes();

    expect(pdfEmbeddableJpegImage(jpeg)).toMatchObject({ width: 1, height: 1 });
    expect(pdfEmbeddablePngImage(png)).toMatchObject({ width: 1, height: 1 });

    const jpegResult = await renderPdfPageModel(
      imageModel({ mediaType: "image/jpeg", data: jpeg }),
    );
    const pngResult = await renderPdfPageModel(imageModel({ mediaType: "image/png", data: png }));
    expect(jpegResult.diagnostics.items).toEqual([]);
    expect(jpegResult.artifact?.bytes.byteLength).toBeGreaterThan(0);
    expect(pngResult.diagnostics.items).toEqual([]);
    expect(pngResult.artifact?.bytes.byteLength).toBeGreaterThan(0);
  });

  test("rejects fake, truncated, malformed, and trailing JPEG data", () => {
    const valid = bytesFromBase64(VALID_JPEG_BASE64);
    const invalidSegmentLength = valid.slice();
    invalidSegmentLength[4] = 0xff;
    invalidSegmentLength[5] = 0xff;
    const zeroHeight = valid.slice();
    const frameOffset = zeroHeight.findIndex(
      (byte, index) => byte === 0xff && zeroHeight[index + 1] === 0xc0,
    );
    zeroHeight[frameOffset + 5] = 0;
    zeroHeight[frameOffset + 6] = 0;

    const cases = [
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0xff, 0xd9]),
      valid.slice(0, -1),
      invalidSegmentLength,
      zeroHeight,
      new Uint8Array([...valid, 0]),
    ];

    cases.forEach((bytes) => expect(pdfEmbeddableJpegImage(bytes)).toBeUndefined());
  });

  test("returns diagnostics and no artifact for invalid JPEG structure or dimensions", async () => {
    const truncated = bytesFromBase64(VALID_JPEG_BASE64).slice(0, -2);
    const invalidResult = await renderPdfPageModel(
      imageModel({ mediaType: "image/jpeg", data: truncated }),
    );
    const mismatchResult = await renderPdfPageModel(
      imageModel({
        mediaType: "image/jpeg",
        data: bytesFromBase64(VALID_JPEG_BASE64),
        width: 2,
      }),
    );

    for (const result of [invalidResult, mismatchResult]) {
      expect(result.diagnostics.items.map((item) => item.code)).toContain(
        "E_PDF_MODEL_UNEMBEDDABLE_IMAGE_RESOURCE",
      );
      expect(result.artifact).toBeUndefined();
    }
  });

  test("rejects invalid PNG CRCs, termination, dimensions, and compressed scanlines", () => {
    const valid = rgbPngBytes();
    const invalidCrc = valid.slice();
    invalidCrc[29] = invalidCrc[29]! ^ 0xff;
    const invalidChunkLength = valid.slice();
    invalidChunkLength.set([0xff, 0xff, 0xff, 0xff], 33);
    const compressedRows = zlibSync(new Uint8Array([0, 0x33, 0x66, 0x99]));

    const cases = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      valid.slice(0, -1),
      valid.slice(0, -12),
      invalidCrc,
      invalidChunkLength,
      new Uint8Array([...valid, 0]),
      rgbPngBytes({ width: 0x7fffffff }),
      rgbPngBytes({ width: 2, rows: new Uint8Array([0, 0x33, 0x66, 0x99]) }),
      rgbPngBytes({ idat: new Uint8Array([0x78, 0x9c, 0x00]) }),
      rgbPngBytes({ idat: new Uint8Array([...compressedRows, 0]) }),
    ];

    cases.forEach((bytes) => expect(pdfEmbeddablePngImage(bytes)).toBeUndefined());
  });

  test("returns diagnostics and no artifact for a malformed PNG", async () => {
    const invalidCrc = rgbPngBytes();
    invalidCrc[29] = invalidCrc[29]! ^ 0xff;
    const invalidResult = await renderPdfPageModel(
      imageModel({ mediaType: "image/png", data: invalidCrc }),
    );
    const mismatchResult = await renderPdfPageModel(
      imageModel({ mediaType: "image/png", data: rgbPngBytes(), width: 2 }),
    );

    for (const result of [invalidResult, mismatchResult]) {
      expect(result.diagnostics.items.map((item) => item.code)).toContain(
        "E_PDF_MODEL_UNEMBEDDABLE_IMAGE_RESOURCE",
      );
      expect(result.artifact).toBeUndefined();
    }
  });
});

import { describe, expect, test } from "vite-plus/test";
import { zlibSync } from "fflate";
import { pdfImageAssetLoadRequirements, renderPdfPageModel } from "@/src/writers/pdf";
import { contentOpsFromPdfVisuals } from "@/src/projection/pdf/lower";
import { pdfGraphicsStateName, renderPdfContentStream } from "@/src/writers/pdf/content";
import { contentStreamObject, pdfXrefEntries, writePdfDocument } from "@/src/writers/pdf/document";
import {
  pdfLiteralString,
  pdfName,
  pdfNumber,
  pdfTextString,
  pdfUtf16BeHex,
} from "@/src/writers/pdf/objects";
import { assetEntityId, graphNodeId } from "@/src/graph/identity";
import { createDiagnostics } from "@/src/diagnostics";
import { pdfDocumentId, pdfPageId, pdfResourceId } from "@/src/projection/pdf/identity";
import type {
  PdfContentOp,
  PdfGradientResource,
  PdfImageResource,
  PdfPageModel,
} from "@/src/projection/pdf/model";

function decodePdf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function byteSequenceIndex(bytes: Uint8Array, sequence: Uint8Array): number {
  for (let index = 0; index <= bytes.byteLength - sequence.byteLength; index += 1) {
    if (sequence.every((byte, offset) => bytes[index + offset] === byte)) {
      return index;
    }
  }

  return -1;
}

function byteString(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(bytes.slice(start, start + length));
}

function streamBytesByLength(bytes: Uint8Array, length: number): Uint8Array | undefined {
  const marker = new TextEncoder().encode(`/Length ${length}\n>>\nstream\n`);
  const markerIndex = byteSequenceIndex(bytes, marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const streamStart = markerIndex + marker.byteLength;
  return bytes.slice(streamStart, streamStart + length);
}

function jpegImageResource(id: PdfImageResource["id"], name: string): PdfImageResource {
  return {
    id,
    name,
    mediaType: "image/jpeg",
    width: 1,
    height: 1,
    data: validJpegBytes(),
  };
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

function oneGradientModel(gradient: PdfGradientResource, content: PdfContentOp): PdfPageModel {
  const model = onePageModel("Gradient page");
  return {
    ...model,
    pages: [
      {
        ...model.pages[0],
        resources: { fonts: [], images: [], gradients: [gradient.id] },
        content: [content],
      },
    ],
    resources: { fonts: [], images: [], gradients: [gradient] },
  };
}

function uint16(value: number): readonly number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function int16(value: number): readonly number[] {
  return uint16(value < 0 ? 0x10000 + value : value);
}

function uint32(value: number): readonly number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function tag(value: string): readonly number[] {
  return value.split("").map((character) => character.charCodeAt(0));
}

function paddedTable(bytes: readonly number[]): readonly number[] {
  const padding = (4 - (bytes.length % 4)) % 4;
  return [...bytes, ...Array.from({ length: padding }, () => 0)];
}

function pngChunk(type: string, data: Uint8Array): readonly number[] {
  const payload = new Uint8Array([...tag(type), ...data]);
  let crc = 0xffffffff;
  payload.forEach((byte) => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  });
  return [...uint32(data.byteLength), ...payload, ...uint32((crc ^ 0xffffffff) >>> 0)];
}

function validJpegBytes(): Uint8Array {
  const base64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function rgbaPngBytes(input: {
  readonly width: number;
  readonly height: number;
  readonly rows: Uint8Array;
  readonly bitDepth?: 1 | 2 | 4 | 8 | 16;
  readonly colorType?: 0 | 2 | 3 | 4 | 6;
  readonly interlace?: 0 | 1;
  readonly palette?: Uint8Array;
  readonly transparency?: Uint8Array;
}): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk(
      "IHDR",
      new Uint8Array([
        ...uint32(input.width),
        ...uint32(input.height),
        input.bitDepth ?? 0x08,
        input.colorType ?? 0x06,
        0x00,
        0x00,
        input.interlace ?? 0x00,
      ]),
    ),
    ...(input.palette ? pngChunk("PLTE", input.palette) : []),
    ...(input.transparency ? pngChunk("tRNS", input.transparency) : []),
    ...pngChunk("IDAT", zlibSync(input.rows)),
    ...pngChunk("IEND", new Uint8Array()),
  ]);
}

function minimalTrueTypeWithABWidths(): Uint8Array {
  const head = paddedTable([
    ...uint32(0x00010000),
    ...uint32(0),
    ...uint32(0),
    ...uint32(0x5f0f3cf5),
    ...uint16(0),
    ...uint16(1000),
    ...Array.from({ length: 16 }, () => 0),
    ...int16(-50),
    ...int16(-200),
    ...int16(900),
    ...int16(1000),
    ...Array.from({ length: 10 }, () => 0),
  ]);
  const hhea = paddedTable([
    ...uint32(0x00010000),
    ...int16(800),
    ...int16(-200),
    ...Array.from({ length: 26 }, () => 0),
    ...uint16(3),
  ]);
  const hmtx = paddedTable([
    ...uint16(500),
    ...int16(0),
    ...uint16(600),
    ...int16(0),
    ...uint16(700),
    ...int16(0),
  ]);
  const format4 = [
    ...uint16(4),
    ...uint16(40),
    ...uint16(0),
    ...uint16(4),
    ...uint16(4),
    ...uint16(1),
    ...uint16(0),
    ...uint16(66),
    ...uint16(0xffff),
    ...uint16(0),
    ...uint16(65),
    ...uint16(0xffff),
    ...int16(-64),
    ...uint16(1),
    ...uint16(0),
    ...uint16(0),
  ];
  const cmap = paddedTable([
    ...uint16(0),
    ...uint16(1),
    ...uint16(3),
    ...uint16(1),
    ...uint32(12),
    ...format4,
  ]);
  const tables = [
    { name: "cmap", bytes: cmap },
    { name: "head", bytes: head },
    { name: "hhea", bytes: hhea },
    { name: "hmtx", bytes: hmtx },
  ];
  const directoryLength = 12 + tables.length * 16;
  let offset = directoryLength;
  const records = tables.flatMap((table) => {
    const record = [
      ...tag(table.name),
      ...uint32(0),
      ...uint32(offset),
      ...uint32(table.bytes.length),
    ];
    offset += table.bytes.length;
    return record;
  });

  return new Uint8Array([
    ...uint32(0x00010000),
    ...uint16(tables.length),
    ...uint16(64),
    ...uint16(2),
    ...uint16(0),
    ...records,
    ...tables.flatMap((table) => table.bytes),
  ]);
}

describe("PDF writer", () => {
  test("escapes PDF names by UTF-8 byte", () => {
    expect(pdfName("Café/😀")).toBe("/Caf#C3#A9#2F#F0#9F#98#80");
    expect(pdfName("")).toBe("/Unnamed");
  });

  test("normalizes PDF numeric literals", () => {
    expect(pdfNumber(Number.NaN)).toBe("0");
    expect(pdfNumber(Number.POSITIVE_INFINITY)).toBe("0");
    expect(pdfNumber(-0.00001)).toBe("0");
    expect(pdfNumber(12.34001)).toBe("12.34");
  });

  test("octal escapes control bytes in PDF literal strings", () => {
    expect(pdfLiteralString("A\nB\rC\tD\u0000E\u007f")).toBe("(A\\012B\\015C\\011D\\000E\\177)");
  });

  test("replaces unpaired surrogates in UTF-16BE PDF text strings", () => {
    expect(pdfTextString("Deck \uD800")).toBe("<FEFF004400650063006B0020FFFD>");
    expect(pdfTextString("\uDC00 tip")).toBe("<FEFFFFFD0020007400690070>");
  });

  test("replaces unpaired surrogates in UTF-16BE content strings", () => {
    expect(pdfUtf16BeHex("Deck \uD800")).toBe("<004400650063006B0020FFFD>");
    expect(pdfUtf16BeHex("\uDC00 tip")).toBe("<FFFD0020007400690070>");
  });

  test("separates content stream bytes from endstream", () => {
    expect(contentStreamObject(7, "BT").body).toBe("<< /Length 3 >>\nstream\nBT\nendstream");
  });

  test("measures content stream length in bytes", () => {
    expect(contentStreamObject(7, "あ").body).toBe("<< /Length 4 >>\nstream\nあ\nendstream");
  });

  test("rejects invalid content stream object ids", () => {
    expect(() => contentStreamObject(0, "BT")).toThrow(
      "PDF indirect object ids must be positive integers.",
    );
    expect(() => contentStreamObject(1.5, "BT")).toThrow(
      "PDF indirect object ids must be positive integers.",
    );
  });

  test("marks missing xref object ids as free entries", () => {
    expect(pdfXrefEntries(new Map([[1, 17]]), 3)).toEqual([
      "0000000000 65535 f ",
      "0000000017 00000 n ",
      "0000000000 00000 f ",
      "0000000000 00000 f ",
    ]);
  });

  test("rejects invalid xref maximum object ids", () => {
    expect(() => pdfXrefEntries(new Map(), -1)).toThrow(
      "PDF xref maximum object id must be a non-negative integer.",
    );
    expect(() => pdfXrefEntries(new Map(), 1.5)).toThrow(
      "PDF xref maximum object id must be a non-negative integer.",
    );
  });

  test("rejects invalid xref offsets", () => {
    expect(() => pdfXrefEntries(new Map([[1, -1]]), 1)).toThrow(
      "PDF xref offsets must be non-negative integers.",
    );
    expect(() => pdfXrefEntries(new Map([[1, 1.5]]), 1)).toThrow(
      "PDF xref offsets must be non-negative integers.",
    );
  });

  test("rejects xref offsets that exceed the fixed field width", () => {
    expect(() => pdfXrefEntries(new Map([[1, 10_000_000_000]]), 1)).toThrow(
      "PDF xref offsets must fit in 10 decimal digits.",
    );
  });

  test("rejects invalid xref offset object ids", () => {
    expect(() => pdfXrefEntries(new Map([[0, 17]]), 1)).toThrow(
      "PDF xref offset object ids must be positive integers.",
    );
    expect(() => pdfXrefEntries(new Map([[1.5, 17]]), 1)).toThrow(
      "PDF xref offset object ids must be positive integers.",
    );
  });

  test("rejects xref offset object ids beyond the maximum object id", () => {
    expect(() => pdfXrefEntries(new Map([[4, 17]]), 3)).toThrow(
      "PDF xref offset object ids must not exceed the maximum object id.",
    );
  });

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

  test("emits TrueType kerning adjustments with a PDF TJ array", async () => {
    const model = onePageModel("AB");
    const fontId = model.pages[0]?.resources.fonts[0];
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "text",
                text: "AB",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
                kerningAdjustments: [-120],
              },
            ],
          },
        ],
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("[(A) 120 (B)] TJ");
    expect(pdf).not.toContain("(AB) Tj");
  });

  test("emits a binary marker comment after the PDF header", async () => {
    const result = await renderPdfPageModel(onePageModel("Hello PDF"), { inspection: "none" });
    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const firstLineEnd = bytes.indexOf(0x0a);
    const secondLineEnd = bytes.indexOf(0x0a, firstLineEnd + 1);
    const secondLine = bytes.slice(firstLineEnd + 1, secondLineEnd);

    expect(result.diagnostics.items).toEqual([]);
    expect(decodePdf(bytes.slice(0, firstLineEnd + 1))).toBe("%PDF-1.7\n");
    expect(secondLine[0]).toBe(0x25);
    expect(secondLine.slice(1).some((byte) => byte >= 0x80)).toBe(true);
  });

  test("emits xref offsets that point to indirect objects", async () => {
    const result = await renderPdfPageModel(onePageModel("Hello PDF"), { inspection: "none" });
    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const startxref = Number(pdf.match(/startxref\n(\d+)\n%%EOF/u)?.[1]);
    const xref = decodePdf(bytes.slice(startxref)).match(
      /^xref\n0 (\d+)\n((?:\d{10} \d{5} [fn] \n)+)/u,
    );

    expect(result.diagnostics.items).toEqual([]);
    expect(byteString(bytes, startxref, 4)).toBe("xref");
    expect(xref).not.toBeNull();

    const entries = xref?.[2]?.trimEnd().split("\n") ?? [];
    entries.slice(1).forEach((entry, index) => {
      const objectId = index + 1;
      const offset = Number(entry.slice(0, 10));
      const status = entry.at(-1);

      if (status === "n") {
        expect(byteString(bytes, offset, `${objectId} 0 obj`.length)).toBe(`${objectId} 0 obj`);
      }
    });
  });

  test("emits a deterministic trailer document id", async () => {
    const first = await renderPdfPageModel(onePageModel("Hello PDF"), { inspection: "none" });
    const second = await renderPdfPageModel(onePageModel("Hello PDF"), { inspection: "none" });
    const firstPdf = decodePdf(first.artifact?.bytes ?? new Uint8Array());
    const secondPdf = decodePdf(second.artifact?.bytes ?? new Uint8Array());

    const firstTrailerId = firstPdf.match(/\/ID \[<([0-9A-F]{32})> <\1>\]/u)?.[0];
    const secondTrailerId = secondPdf.match(/\/ID \[<([0-9A-F]{32})> <\1>\]/u)?.[0];

    expect(first.diagnostics.items).toEqual([]);
    expect(firstTrailerId).toBeDefined();
    expect(secondTrailerId).toBe(firstTrailerId);
  });

  test("escapes text string delimiters in content streams", async () => {
    const result = await renderPdfPageModel(onePageModel("Hello (PDF) \\ writer"), {
      inspection: "none",
    });

    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("(Hello \\(PDF\\) \\\\ writer) Tj");
  });

  test("renders visual-only text elements by lowering them to content operations", async () => {
    const model = onePageModel("ignored");
    const fontId = model.resources.fonts[0]!.id;
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [],
            visuals: [
              {
                kind: "text",
                text: "Visual only",
                box: { x: 72, y: 96, width: 180, height: 24 },
                fontId,
                style: { fontSize: 12 },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("(Visual only) Tj");
  });

  test("clips gradient fills and shape strokes before rotated child transforms", () => {
    const gradientId = pdfResourceId("gradient", "Clipped rotated shape");
    const gradient: PdfGradientResource = {
      id: gradientId,
      name: "GClip",
      kind: "linear-gradient",
      angle: 90,
      box: { x: 96, y: 96, width: 120, height: 80 },
      stops: [
        { position: 0, color: { r: 1, g: 0, b: 0 } },
        { position: 1, color: { r: 0, g: 0, b: 1 } },
      ],
    };
    const clipBox = { x: 72, y: 96, width: 80, height: 80 };
    const content = contentOpsFromPdfVisuals([
      {
        kind: "shape",
        shape: "rect",
        box: gradient.box,
        clipBox,
        rotation: 90,
        fill: { kind: "linear-gradient", gradientId, angle: 90, stops: gradient.stops },
        stroke: { color: { r: 0, g: 0, b: 0 }, width: 2 },
        paintOrder: { siblingOrder: 0 },
      },
    ]);

    expect(content).toContainEqual(
      expect.objectContaining({ op: "fillLinearGradientRect", clipBox }),
    );
    expect(content).toContainEqual(expect.objectContaining({ op: "strokeRect", clipBox }));

    const model = oneGradientModel(gradient, content[0]!);
    const stream = renderPdfContentStream({ ...model.pages[0]!, content }, model.resources);
    const clipToken = "72 616 80 80 re\nW\nn";
    const firstClip = stream.indexOf(clipToken);
    const firstTransform = stream.indexOf(" cm", firstClip);
    const gradientPaint = stream.indexOf("/Pattern cs", firstTransform);
    const secondClip = stream.indexOf(clipToken, gradientPaint);
    const secondTransform = stream.indexOf(" cm", secondClip);
    const strokePaint = stream.indexOf("\nS\n", secondTransform);

    expect(firstClip).toBeGreaterThanOrEqual(0);
    expect(firstTransform).toBeGreaterThan(firstClip);
    expect(gradientPaint).toBeGreaterThan(firstTransform);
    expect(secondClip).toBeGreaterThan(gradientPaint);
    expect(secondTransform).toBeGreaterThan(secondClip);
    expect(strokePaint).toBeGreaterThan(secondTransform);
  });

  test("merges explicit content operations with lowered visual elements", async () => {
    const model = onePageModel("ignored");
    const fontId = model.resources.fonts[0]!.id;
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "text",
                text: "Existing content",
                x: 72,
                y: 72,
                fontId,
                fontSize: 12,
              },
            ],
            visuals: [
              {
                kind: "text",
                text: "Visual extra",
                box: { x: 72, y: 96, width: 180, height: 24 },
                fontId,
                style: { fontSize: 12 },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("(Existing content) Tj");
    expect(pdf).toContain("(Visual extra) Tj");
  });

  test("encodes WinAnsi text as PDF literal string octal escapes", async () => {
    const result = await renderPdfPageModel(onePageModel("Bullet •"), {
      inspection: "none",
    });
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("(Bullet \\225) Tj");
    expect(pdf).toContain("/Encoding /WinAnsiEncoding");
  });

  test("encodes Unicode text operations as UTF-16BE hex strings with Identity-H fonts", async () => {
    const fontId = pdfResourceId("font", "Unicode Japanese");
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: "こんにちは",
                textEncoding: "utf16be",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FUnicode",
              family: "HeiseiKakuGo-W5",
              encoding: "identity-h",
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/Subtype /Type0");
    expect(pdf).toContain("/Encoding /Identity-H");
    expect(pdf).toMatch(/\/ToUnicode \d+ 0 R/u);
    expect(pdf).toContain("/Adobe-Identity-UCS");
    expect(pdf).toContain("beginbfchar");
    expect(pdf).toContain("<3053> <3053>");
    expect(pdf).toContain("<306F> <306F>");
    expect(pdf).toContain("<30533093306B3061306F> Tj");
    expect(pdf).not.toContain("(?????) Tj");
  });

  test("emits ToUnicode maps for implicit first-page Identity-H text fonts", async () => {
    const fontId = pdfResourceId("font", "Unicode Japanese");
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: "こんにちは",
                textEncoding: "utf16be",
                x: 72,
                y: 96,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FUnicode",
              family: "HeiseiKakuGo-W5",
              encoding: "identity-h",
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/Subtype /Type0");
    expect(pdf).toContain("/Encoding /Identity-H");
    expect(pdf).toMatch(/\/ToUnicode \d+ 0 R/u);
    expect(pdf).toContain("/Adobe-Identity-UCS");
    expect(pdf).toContain("beginbfchar");
    expect(pdf).toContain("<3053> <3053>");
    expect(pdf).toContain("<30533093306B3061306F> Tj");
  });

  test("uses compact CIDs for implicit first-page embedded Identity-H fonts", async () => {
    const fontId = pdfResourceId("font", "Implicit Embedded Unicode");
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: "A",
                textEncoding: "utf16be",
                x: 72,
                y: 96,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FImplicitUnicode",
              family: "Inter",
              encoding: "identity-h",
              data: minimalTrueTypeWithABWidths(),
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("<0001> <0041>");
    expect(pdf).toContain("<0001> Tj");
    expect(pdf).not.toContain("<0041> Tj");
  });

  test("reloads a reused PDF image asset id when its source changes", () => {
    const imageId = pdfResourceId("image", "Deferred image");
    const entityId = assetEntityId(["shared-image"]);
    const model = onePageModel("ignored");
    const projection: PdfPageModel = {
      ...model,
      pages: [
        {
          ...model.pages[0]!,
          resources: { fonts: [], images: [imageId] },
          content: [{ op: "image", imageId, box: { x: 0, y: 0, width: 10, height: 10 } }],
        },
      ],
      resources: {
        fonts: [],
        images: [
          {
            id: imageId,
            name: "ImDeferred",
            assetEntityId: entityId,
            source: { kind: "path", path: "./new.png" },
            sourceField: "src",
          },
        ],
      },
    };
    const cached = new Map([
      [
        entityId,
        {
          assetEntityId: entityId,
          source: { kind: "path" as const, path: "./old.png" },
          sourceField: "src" as const,
          load: { ok: true as const, bytes: new Uint8Array([1]), byteLength: 1 },
          diagnostics: createDiagnostics(),
        },
      ],
    ]);

    expect(pdfImageAssetLoadRequirements({ projection, assetsById: cached })).toEqual([
      expect.objectContaining({
        assetEntityId: entityId,
        source: { kind: "path", path: "./new.png" },
        sourceField: "src",
      }),
    ]);
  });

  test("splits large ToUnicode bfchar maps into PDF-sized blocks", async () => {
    const fontId = pdfResourceId("font", "Unicode Cyrillic");
    const unicodeText = Array.from({ length: 101 }, (_, index) =>
      String.fromCharCode(0x0400 + index),
    ).join("");
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: unicodeText,
                textEncoding: "utf16be",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FUnicode",
              family: "HeiseiKakuGo-W5",
              encoding: "identity-h",
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).not.toContain("101 beginbfchar");
    expect(pdf).toContain("100 beginbfchar");
    expect(pdf).toContain("1 beginbfchar");
    expect(pdf).toContain("<0400> <0400>");
    expect(pdf).toContain("<0464> <0464>");
  });

  test("omits ToUnicode maps for empty Unicode text operations", async () => {
    const fontId = pdfResourceId("font", "Unicode Empty");
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: "",
                textEncoding: "utf16be",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FUnicode",
              family: "HeiseiKakuGo-W5",
              encoding: "identity-h",
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).not.toContain("/ToUnicode");
    expect(pdf).not.toContain("beginbfchar");
  });

  test("embeds Identity-H TrueType font bytes as CIDFontType2 descendants", async () => {
    const fontId = pdfResourceId("font", "Embedded Unicode Inter");
    const fontBytes = minimalTrueTypeWithABWidths();
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: "A",
                textEncoding: "utf16be",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FInterUnicode",
              family: "Inter",
              encoding: "identity-h",
              data: fontBytes,
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/Subtype /Type0");
    expect(pdf).toContain("/Encoding /Identity-H");
    expect(pdf).toContain("/Subtype /CIDFontType2");
    expect(pdf).toMatch(/\/CIDToGIDMap \d+ 0 R/u);
    expect(pdf).toMatch(/\/FontDescriptor << .*\/FontFile2 \d+ 0 R.*>>/u);
    expect(pdf).toContain(`/Length ${fontBytes.byteLength}`);
    expect(pdf).toContain("/ToUnicode");
    expect(pdf).toContain("<0001> <0041>");
    expect(pdf).toContain("<0001> Tj");
    expect(pdf).not.toContain("/Subtype /CIDFontType0");
  });

  test("emits used CID widths for embedded Identity-H TrueType fonts", async () => {
    const fontId = pdfResourceId("font", "Embedded Unicode Widths");
    const fontBytes = minimalTrueTypeWithABWidths();
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: "AB",
                textEncoding: "utf16be",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FInterUnicode",
              family: "Inter",
              encoding: "identity-h",
              data: fontBytes,
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/Subtype /CIDFontType2");
    expect(pdf).toContain("/DW 550");
    expect(pdf).toContain("/W [1 [600] 2 [700]]");
  });

  test("encodes embedded Identity-H TrueType text with compact CIDs", async () => {
    const fontId = pdfResourceId("font", "Embedded Unicode Compact CIDs");
    const fontBytes = minimalTrueTypeWithABWidths();
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: "AB",
                textEncoding: "utf16be",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FInterUnicode",
              family: "Inter",
              encoding: "identity-h",
              data: fontBytes,
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const cidToGidBytes = streamBytesByLength(bytes, 6);

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("<00010002> Tj");
    expect(pdf).toContain("<0001> <0041>");
    expect(pdf).toContain("<0002> <0042>");
    expect(pdf).toContain("/W [1 [600] 2 [700]]");
    expect(cidToGidBytes).toBeDefined();
    expect(cidToGidBytes?.[2]).toBe(0);
    expect(cidToGidBytes?.[3]).toBe(1);
    expect(cidToGidBytes?.[4]).toBe(0);
    expect(cidToGidBytes?.[5]).toBe(2);
  });

  test("emits CIDSet streams for embedded Identity-H TrueType font subsets", async () => {
    const fontId = pdfResourceId("font", "Embedded Unicode CIDSet");
    const fontBytes = minimalTrueTypeWithABWidths();
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: "A",
                textEncoding: "utf16be",
                glyphs: [{ glyphId: 2, unicode: "A" }],
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FInterUnicode",
              family: "Inter",
              encoding: "identity-h",
              data: fontBytes,
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const cidSetBytes = streamBytesByLength(bytes, 1);

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toMatch(/\/CIDSet \d+ 0 R/u);
    expect(cidSetBytes).toBeDefined();
    expect(cidSetBytes?.[0]).toBe(0x40);
  });

  test("rejects direct embedded PDF font models that cannot map used glyphs", async () => {
    const fontId = pdfResourceId("font", "Embedded Missing Glyph");
    const fontBytes = minimalTrueTypeWithABWidths();
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: "C",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FMissingGlyph",
              family: "Inter",
              data: fontBytes,
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PDF_UNRESOLVED_FONT_GLYPH",
        severity: "error",
        message: expect.stringContaining("C"),
      }),
    );
    expect(result.artifact).toBeUndefined();
  });

  test("emits CIDToGIDMap streams for embedded Identity-H TrueType fonts", async () => {
    const fontId = pdfResourceId("font", "Embedded Unicode Glyph Map");
    const fontBytes = minimalTrueTypeWithABWidths();
    const model = onePageModel("ignored");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [
              {
                op: "text",
                text: "AB",
                textEncoding: "utf16be",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FInterUnicode",
              family: "Inter",
              encoding: "identity-h",
              data: fontBytes,
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const cidToGidBytes = streamBytesByLength(bytes, 6);

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toMatch(/\/CIDToGIDMap \d+ 0 R/u);
    expect(pdf).not.toContain("/CIDToGIDMap /Identity");
    expect(cidToGidBytes).toBeDefined();
    expect(cidToGidBytes?.[2]).toBe(0);
    expect(cidToGidBytes?.[3]).toBe(1);
    expect(cidToGidBytes?.[4]).toBe(0);
    expect(cidToGidBytes?.[5]).toBe(2);
  });

  test("embeds TrueType font bytes as FontFile2 streams", async () => {
    const fontId = pdfResourceId("font", "Embedded Inter");
    const fontBytes = minimalTrueTypeWithABWidths();
    const model = onePageModel("Embedded");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [fontId], images: [] },
            content: [{ op: "text", text: "AB", x: 72, y: 96, fontId, fontSize: 12 }],
          },
        ],
        resources: {
          fonts: [
            {
              id: fontId,
              name: "FInter",
              family: "Inter",
              data: fontBytes,
            },
          ],
          images: [],
        },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/Subtype /TrueType");
    expect(pdf).toMatch(/\/FontDescriptor << .*\/FontFile2 \d+ 0 R.*>>/u);
    expect(pdf).toContain("/FontBBox [-50 -200 900 1000]");
    expect(pdf).toContain("/Ascent 800");
    expect(pdf).toContain("/Descent -200");
    expect(pdf).toContain("/CapHeight 800");
    expect(pdf).toContain("/FirstChar 32");
    expect(pdf).toContain("/LastChar 255");
    const widths = pdf
      .match(/\/Widths \[([^\]]+)\]/u)?.[1]
      ?.trim()
      .split(/\s+/u)
      .map(Number);
    expect(widths).toHaveLength(224);
    expect(widths?.[65 - 32]).toBe(600);
    expect(widths?.[66 - 32]).toBe(700);
    expect(pdf).toContain(`/Length ${fontBytes.byteLength}`);
    expect(pdf).toContain("(AB) Tj");
  });

  test("resets unspecified text color to default black", async () => {
    const model = onePageModel("Red text");
    const fontId = model.pages[0]!.resources.fonts[0]!;
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "text",
                text: "Red text",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
                color: { r: 1, g: 0, b: 0 },
              },
              {
                op: "text",
                text: "Default text",
                x: 72,
                y: 120,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toMatch(/1 0 0 rg[\s\S]*\(Red text\) Tj[\s\S]*0 0 0 rg[\s\S]*\(Default text\) Tj/u);
  });

  test("encodes Unicode metadata as UTF-16BE PDF text strings", async () => {
    const model = onePageModel("Metadata page");
    const result = await renderPdfPageModel(
      {
        ...model,
        metadata: { ...model.metadata, title: "Deck 😀" },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/Title <FEFF004400650063006B0020D83DDE00>");
  });

  test("emits normalized PDF document date metadata", async () => {
    const model = onePageModel("Dated metadata page");
    const result = await renderPdfPageModel(
      {
        ...model,
        metadata: {
          ...model.metadata,
          creationDate: "2026-07-05T08:09:10.000Z",
          modificationDate: "2026-07-05T17:09:10+09:00",
        },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/CreationDate (D:20260705080910Z)");
    expect(pdf).toContain("/ModDate (D:20260705170910+09'00')");
  });

  test("rejects direct writes with invalid document date metadata", () => {
    const model = onePageModel("Invalid dated metadata page");

    expect(() =>
      writePdfDocument({
        ...model,
        metadata: {
          ...model.metadata,
          creationDate: "not a date",
          modificationDate: "2026-99-99T99:99:99Z",
        },
      }),
    ).toThrow(
      "PDF document metadata must be an object whose title, author, subject, producer, creationDate, and modificationDate fields are strings when present.",
    );
  });

  test("rejects direct writes without pages", () => {
    const model = onePageModel("No pages");

    expect(() => writePdfDocument({ ...model, pages: [] })).toThrow(
      "PDF document models must include a non-empty pages array.",
    );
  });

  test("rejects direct writes with malformed page collections", () => {
    const model = onePageModel("Bad page collection");

    expect(() => writePdfDocument({ ...model, pages: "not-an-array" } as never)).toThrow(
      "PDF document models must include a non-empty pages array.",
    );
  });

  test("rejects direct writes with malformed page entries", () => {
    const model = onePageModel("Bad page entry");

    expect(() => writePdfDocument({ ...model, pages: [null] } as never)).toThrow(
      "PDF pages must be object entries with page model fields.",
    );
  });

  test("rejects direct writes with malformed document models", () => {
    expect(() => writePdfDocument(null as never)).toThrow(
      'PDF document models must declare format "pdf", version "1.7", and a non-empty document id.',
    );
  });

  test("rejects direct writes with invalid PDF document headers", () => {
    const model = onePageModel("Bad document header");

    expect(() => writePdfDocument({ ...model, format: "pptx" } as never)).toThrow(
      'PDF document models must declare format "pdf", version "1.7", and a non-empty document id.',
    );
  });

  test("rejects direct writes with document ids outside the pdf namespace", () => {
    const model = onePageModel("Bad document id");

    expect(() => writePdfDocument({ ...model, documentId: "deck:demo" } as never)).toThrow(
      "PDF document ids must start with pdf:document:.",
    );
  });

  test("rejects direct writes with malformed metadata objects", () => {
    const model = onePageModel("Bad metadata object");

    expect(() => writePdfDocument({ ...model, metadata: "not-an-object" } as never)).toThrow(
      "PDF document metadata must be an object whose title, author, subject, producer, creationDate, and modificationDate fields are strings when present.",
    );
  });

  test("rejects direct writes with non-string metadata fields", () => {
    const model = onePageModel("Bad metadata field");

    expect(() =>
      writePdfDocument({
        ...model,
        metadata: { ...model.metadata, title: 42 },
      } as never),
    ).toThrow(
      "PDF document metadata must be an object whose title, author, subject, producer, creationDate, and modificationDate fields are strings when present.",
    );
  });

  test("rejects direct writes with malformed fallback collections", () => {
    const model = onePageModel("Bad fallbacks");

    expect(() => writePdfDocument({ ...model, fallbacks: "not-an-array" } as never)).toThrow(
      "PDF document models must include a fallbacks array.",
    );
  });

  test("rejects direct writes with malformed fallback entries", () => {
    const model = onePageModel("Bad fallback entry");

    expect(() =>
      writePdfDocument({
        ...model,
        fallbacks: [{ code: "", message: 42 }],
      } as never),
    ).toThrow(
      "PDF fallback entries must include non-empty string code and message fields, with an optional string page id.",
    );
  });

  test("accepts direct writes with fallback origin metadata", () => {
    const model = onePageModel("Fallback origin");

    expect(() =>
      writePdfDocument({
        ...model,
        fallbacks: [
          {
            code: "W_PDF_UNSUPPORTED_SEMANTIC",
            message: "Unsupported semantic",
            pageId: model.pages[0]!.id,
            nodeId: "node:1",
            kind: "text",
            origin: { graphNodeIds: [graphNodeId(["node", "1"])] },
          },
        ],
      }),
    ).not.toThrow();
  });

  test("rejects direct writes with malformed fallback origins", () => {
    const model = onePageModel("Bad fallback origin");

    expect(() =>
      writePdfDocument({
        ...model,
        fallbacks: [
          {
            code: "W_PDF_UNSUPPORTED_SEMANTIC",
            message: "Bad fallback origin",
            pageId: model.pages[0]!.id,
            nodeId: "node:1",
            kind: "text",
            origin: { graphNodeIds: [""] },
          },
        ],
      } as never),
    ).toThrow(
      "PDF fallback entries must include non-empty string code and message fields, with an optional string page id.",
    );
  });

  test("rejects direct writes with page ids outside the pdf namespace", () => {
    const model = onePageModel("Bad page id");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [{ ...model.pages[0]!, id: "slide:1" }],
      } as never),
    ).toThrow("PDF page ids must start with pdf:page:.");
  });

  test("rejects direct writes with page ids containing whitespace", () => {
    const model = onePageModel("Bad page id whitespace");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [{ ...model.pages[0]!, id: "pdf:page:slide 1:0" }],
      } as never),
    ).toThrow("PDF page ids must not contain whitespace or control characters.");
  });

  test("rejects direct writes with duplicate page ids", () => {
    const model = onePageModel("Duplicate page id");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [model.pages[0]!, model.pages[0]!],
      }),
    ).toThrow("Each PDF page must have a stable, unique id.");
  });

  test("rejects direct writes with page ids that encode a different page index", () => {
    const model = onePageModel("Bad page id index");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [{ ...model.pages[0]!, id: pdfPageId("slide:1", 7) }],
      }),
    ).toThrow("PDF page ids must encode their zero-based page index.");
  });

  test("rejects direct writes with page indexes that do not match page order", () => {
    const model = onePageModel("Bad page order");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [{ ...model.pages[0]!, index: 7, id: pdfPageId("slide:1", 7) }],
      }),
    ).toThrow("PDF page indexes must match their page order.");
  });

  test("rejects direct writes with non-positive page media box dimensions", () => {
    const model = onePageModel("Bad page size");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            mediaBox: { x: 0, y: 0, width: 0, height: 792 },
          },
        ],
      }),
    ).toThrow("PDF page media boxes must have finite coordinates and positive dimensions.");
  });

  test("rejects direct writes with non-finite page media box coordinates", () => {
    const model = onePageModel("Bad page origin");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            mediaBox: { x: Number.NaN, y: 0, width: 612, height: 792 },
          },
        ],
      }),
    ).toThrow("PDF page media boxes must have finite coordinates and positive dimensions.");
  });

  test("rejects direct writes with malformed page media box objects", () => {
    const model = onePageModel("Bad page media box object");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            mediaBox: Object.assign([], { x: 0, y: 0, width: 612, height: 792 }),
          },
        ],
      } as never),
    ).toThrow("PDF page media boxes must have finite coordinates and positive dimensions.");
  });

  test("rejects direct writes with malformed global resource dictionaries", () => {
    const model = onePageModel("Bad global resources");

    expect(() =>
      writePdfDocument({
        ...model,
        resources: { fonts: model.resources.fonts, images: "not-an-array" },
      } as never),
    ).toThrow(
      "PDF resource dictionaries must include font and image resource arrays, with an optional gradient resource array.",
    );
  });

  test("rejects direct writes with malformed global resource dictionary objects", () => {
    const model = onePageModel("Bad global resource object");

    expect(() =>
      writePdfDocument({
        ...model,
        resources: Object.assign([], { fonts: model.resources.fonts, images: [] }),
      } as never),
    ).toThrow(
      "PDF resource dictionaries must include font and image resource arrays, with an optional gradient resource array.",
    );
  });

  test("rejects direct writes with malformed font resource entries", () => {
    const model = onePageModel("Bad font resource entry");

    expect(() =>
      writePdfDocument({
        ...model,
        resources: { ...model.resources, fonts: [null] },
      } as never),
    ).toThrow(
      "PDF font resources must include a non-empty resource name and valid optional family, weight, style, encoding, fallback, source key, and font bytes.",
    );
  });

  test("rejects direct writes with duplicate global resource ids", () => {
    const model = onePageModel("Duplicate global resource id");
    const [font] = model.resources.fonts;

    expect(() =>
      writePdfDocument({
        ...model,
        resources: {
          ...model.resources,
          fonts: [font!, { ...font!, name: "F2" }],
        },
      }),
    ).toThrow("Each PDF resource id must be unique across the global PDF resource dictionary.");
  });

  test("rejects direct writes with global resource ids in the wrong namespace", () => {
    const model = onePageModel("Wrong resource id kind");
    const [font] = model.resources.fonts;

    expect(() =>
      writePdfDocument({
        ...model,
        resources: {
          ...model.resources,
          fonts: [{ ...font!, id: pdfResourceId("image", "Helvetica") }],
        },
      }),
    ).toThrow(
      "PDF font resources must include a non-empty resource name and valid optional family, weight, style, encoding, fallback, source key, and font bytes.",
    );
  });

  test("rejects direct writes with font resources missing names", () => {
    const model = onePageModel("Font resource name missing");
    const [font] = model.resources.fonts;

    expect(() =>
      writePdfDocument({
        ...model,
        resources: {
          ...model.resources,
          fonts: [{ ...font!, name: "" }],
        },
      }),
    ).toThrow(
      "PDF font resources must include a non-empty resource name and valid optional family, weight, style, encoding, fallback, source key, and font bytes.",
    );
  });

  test("rejects direct writes with invalid font resource encodings", () => {
    const model = onePageModel("Font resource encoding invalid");
    const [font] = model.resources.fonts;

    expect(() =>
      writePdfDocument({
        ...model,
        resources: {
          ...model.resources,
          fonts: [{ ...font!, encoding: "mac-roman" as never }],
        },
      }),
    ).toThrow(
      "PDF font resources must include a non-empty resource name and valid optional family, weight, style, encoding, fallback, source key, and font bytes.",
    );
  });

  test("rejects direct writes with image resource ids missing suffixes", () => {
    const imageId = "pdf:resource:image:" as never;
    const model = onePageModel("Image resource id missing suffix");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: model.pages[0]!.resources.fonts, images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          ...model.resources,
          images: [jpegImageResource(imageId, "Im1")],
        },
      }),
    ).toThrow(
      "PDF image resources must include supported JPEG or RGB PNG bytes, a matching mediaType, positive width and height, and a resource name.",
    );
  });

  test("rejects direct writes with malformed page resource dictionaries", () => {
    const model = onePageModel("Bad page resources");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: "not-an-array", images: [] },
          },
        ],
      } as never),
    ).toThrow(
      "PDF page resource dictionaries must include font and image reference arrays, with an optional gradient reference array.",
    );
  });

  test("rejects direct writes with malformed page resource dictionary objects", () => {
    const model = onePageModel("Bad page resource object");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: Object.assign([], {
              fonts: model.pages[0]!.resources.fonts,
              images: [],
            }),
          },
        ],
      } as never),
    ).toThrow(
      "PDF page resource dictionaries must include font and image reference arrays, with an optional gradient reference array.",
    );
  });

  test("rejects direct writes with page resource references in the wrong namespace", () => {
    const model = onePageModel("Bad page resource reference");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [pdfResourceId("image", "Helvetica")], images: [] },
          },
        ],
      }),
    ).toThrow("PDF page resource references must be non-empty resource id strings.");
  });

  test("rejects direct writes with page resource references missing suffixes", () => {
    const model = onePageModel("Bad page resource id suffix");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: ["pdf:resource:font:" as never], images: [] },
            content: [],
          },
        ],
      }),
    ).toThrow("PDF page resource references must be non-empty resource id strings.");
  });

  test("rejects direct writes with page resource references missing from global resources", () => {
    const missingFontId = pdfResourceId("font", "Missing font");
    const model = onePageModel("Unknown page resource reference");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [missingFontId], images: [] },
            content: [],
          },
        ],
      }),
    ).toThrow("The PDF page model references a resource id that is not declared globally.");
  });

  test("rejects direct writes with duplicate page font resource names", () => {
    const model = onePageModel("Duplicate page font names");
    const secondFontId = pdfResourceId("font", "Helvetica Duplicate");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [model.resources.fonts[0]!.id, secondFontId], images: [] },
            content: [],
          },
        ],
        resources: {
          ...model.resources,
          fonts: [model.resources.fonts[0]!, { id: secondFontId, name: "F1", family: "Helvetica" }],
        },
      }),
    ).toThrow("Each font resource name in a PDF page resource dictionary must be unique.");
  });

  test("rejects direct writes with text font references missing from the page", () => {
    const model = onePageModel("Text page resource miss");
    const fontId = model.resources.fonts[0]!.id;

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [], images: [] },
            content: [{ op: "text", text: "Hidden font", x: 72, y: 96, fontId, fontSize: 12 }],
          },
        ],
      }),
    ).toThrow(
      "The PDF content operation references a resource id that is not declared on the page.",
    );
  });

  test("rejects direct writes with image references missing from the page", () => {
    const imageId = pdfResourceId("image", "Hidden image");
    const model = onePageModel("Image page resource miss");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: model.pages[0]!.resources.fonts, images: [] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          ...model.resources,
          images: [jpegImageResource(imageId, "HiddenImage")],
        },
      }),
    ).toThrow(
      "The PDF content operation references a resource id that is not declared on the page.",
    );
  });

  test("rejects direct writes with image resources missing names", () => {
    const imageId = pdfResourceId("image", "Nameless image");
    const model = onePageModel("Nameless image resource");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: model.pages[0]!.resources.fonts, images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          ...model.resources,
          images: [
            {
              id: imageId,
              mediaType: "image/jpeg",
              width: 1,
              height: 1,
              data: validJpegBytes(),
            },
          ],
        },
      }),
    ).toThrow(
      "PDF image resources must include supported JPEG or RGB PNG bytes, a matching mediaType, positive width and height, and a resource name.",
    );
  });

  test("rejects direct writes with malformed page content collections", () => {
    const model = onePageModel("Bad page content");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [{ ...model.pages[0]!, content: "not-an-array" }],
      } as never),
    ).toThrow("PDF pages must include a content operation array.");
  });

  test("rejects direct writes with malformed content operation entries", () => {
    const model = onePageModel("Bad content operation entry");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [{ ...model.pages[0]!, content: [null] }],
      } as never),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with malformed text content operations", () => {
    const model = onePageModel("Bad text content operation");
    const fontId = model.resources.fonts[0]!.id;

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [{ op: "text", x: 72, y: 96, fontId, fontSize: 12 }],
          },
        ],
      } as never),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-positive text font sizes", () => {
    const model = onePageModel("Bad text font size");
    const fontId = model.resources.fonts[0]!.id;

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [{ op: "text", text: "Bad size", x: 72, y: 96, fontId, fontSize: 0 }],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-positive text boxes", () => {
    const model = onePageModel("Bad text box");
    const fontId = model.resources.fonts[0]!.id;

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "text",
                text: "Bad box",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
                box: { x: 72, y: 96, width: 120, height: 0 },
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-finite text character spacing", () => {
    const model = onePageModel("Bad text character spacing");
    const fontId = model.resources.fonts[0]!.id;

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "text",
                text: "Bad spacing",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
                charSpacing: Number.NaN,
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with invalid text content encodings", () => {
    const model = onePageModel("Bad text encoding");
    const fontId = model.resources.fonts[0]!.id;

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "text",
                text: "Bad encoding",
                textEncoding: "shift-jis" as never,
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with unsupported text content encodings", () => {
    const model = onePageModel("Unsupported text content encoding");
    const fontId = model.resources.fonts[0]!.id;

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [{ op: "text", text: "Hello 😀", x: 72, y: 96, fontId, fontSize: 12 }],
          },
        ],
      }),
    ).toThrow("PDF text must use WinAnsi text or utf16be text with an Identity-H font.");
  });

  test("rejects direct writes with invalid text colors", () => {
    const model = onePageModel("Bad text color");
    const fontId = model.resources.fonts[0]!.id;

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "text",
                text: "Bad color",
                x: 72,
                y: 96,
                fontId,
                fontSize: 12,
                color: { r: 0, g: -0.1, b: 0 },
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with invalid text font ids", () => {
    const model = onePageModel("Bad text font id");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "text",
                text: "Bad font id",
                x: 72,
                y: 96,
                fontId: 0,
                fontSize: 12,
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with unknown content operation kinds", () => {
    const model = onePageModel("Unknown content operation");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [{ ...model.pages[0]!, content: [{ op: "unknown" }] }],
      } as never),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with invalid color operations", () => {
    const model = onePageModel("Bad color operation");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [{ op: "setFillColor", color: { r: 2, g: 0, b: 0 } }],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with malformed color operation objects", () => {
    const model = onePageModel("Bad color object");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "setFillColor",
                color: Object.assign([], { r: 1, g: 0, b: 0 }),
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with invalid blend modes", () => {
    const model = onePageModel("Bad blend mode");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "fillRect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                blendMode: "burn",
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with malformed content boxes", () => {
    const model = onePageModel("Bad content box object");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "fillRect",
                box: Object.assign([], { x: 72, y: 96, width: 120, height: 80 }),
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-positive line width operations", () => {
    const model = onePageModel("Bad line width operation");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [{ op: "setLineWidth", width: 0 }],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-positive fill shape boxes", () => {
    const model = onePageModel("Bad fill box operation");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [{ op: "fillRect", box: { x: 72, y: 96, width: 120, height: 0 } }],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with invalid shape opacity", () => {
    const model = onePageModel("Bad shape opacity");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "fillRect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                opacity: 2,
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("uses distinct graphics state names for close opacity values", () => {
    const model = onePageModel("Close opacity values");
    const page = model.pages[0]!;
    const projection: PdfPageModel = {
      ...model,
      pages: [
        {
          ...page,
          content: [
            { op: "fillRect", box: { x: 10, y: 10, width: 20, height: 20 }, opacity: 0.4001 },
            { op: "fillRect", box: { x: 40, y: 10, width: 20, height: 20 }, opacity: 0.4004 },
          ],
        },
      ],
    };

    const firstName = pdfGraphicsStateName(0.4001);
    const secondName = pdfGraphicsStateName(0.4004);
    const bytes = decodePdf(writePdfDocument(projection));

    expect(firstName).not.toBe(secondName);
    expect(bytes).toContain(`/${firstName} << /Type /ExtGState`);
    expect(bytes).toContain(`/${secondName} << /Type /ExtGState`);
    expect(bytes).toContain(`/${firstName} gs`);
    expect(bytes).toContain(`/${secondName} gs`);
    expect(pdfGraphicsStateName(0.4)).toBe("GS400");
  });

  test("rejects direct writes with non-finite shape rotations", () => {
    const model = onePageModel("Bad shape rotation");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "fillRect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                rotation: Number.NaN,
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-boolean transform flips", () => {
    const model = onePageModel("Bad transform flip");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "fillRect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                flipH: "yes",
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-positive rotation boxes", () => {
    const model = onePageModel("Bad rotation box");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "fillRect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                rotationBox: { x: 72, y: 96, width: 120, height: 0 },
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with invalid round rectangle radii", () => {
    const model = onePageModel("Bad round rectangle radius");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "fillRoundRect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                radius: -1,
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-positive stroke shape line widths", () => {
    const model = onePageModel("Bad stroke shape line width");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "strokeRect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                lineWidth: 0,
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with invalid stroke dash styles", () => {
    const model = onePageModel("Bad stroke dash");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "strokeRect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                dash: "dots",
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-positive stroke line widths", () => {
    const model = onePageModel("Bad stroke line width");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "strokeLine",
                from: { x: 72, y: 96 },
                to: { x: 144, y: 96 },
                color: { r: 0, g: 0, b: 0 },
                lineWidth: 0,
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with malformed stroke line points", () => {
    const model = onePageModel("Bad stroke line points");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "strokeLine",
                from: { x: 72, y: Number.NaN },
                to: { x: 144, y: 96 },
                color: { r: 0, g: 0, b: 0 },
                lineWidth: 1,
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with malformed stroke line point objects", () => {
    const model = onePageModel("Bad stroke line point object");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "strokeLine",
                from: Object.assign([], { x: 72, y: 96 }),
                to: { x: 144, y: 96 },
                color: { r: 0, g: 0, b: 0 },
                lineWidth: 1,
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with invalid stroke line colors", () => {
    const model = onePageModel("Bad stroke line color");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "strokeLine",
                from: { x: 72, y: 96 },
                to: { x: 144, y: 96 },
                color: { r: 2, g: 0, b: 0 },
                lineWidth: 1,
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-positive gradient content boxes", () => {
    const gradientId = pdfResourceId("gradient", "Bad gradient box");
    const model = onePageModel("Bad gradient box");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: {
              fonts: model.pages[0]!.resources.fonts,
              images: [],
              gradients: [gradientId],
            },
            content: [
              {
                op: "fillLinearGradientRect",
                gradientId,
                box: { x: 72, y: 96, width: 120, height: 0 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          gradients: [
            {
              id: gradientId,
              name: "BadGradientBox",
              kind: "linear-gradient",
              angle: 0,
              box: { x: 72, y: 96, width: 120, height: 24 },
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0 } },
                { position: 1, color: { r: 0, g: 0, b: 1 } },
              ],
            },
          ],
        },
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with insufficient gradient resource stops", () => {
    const gradientId = pdfResourceId("gradient", "One stop gradient");
    const model = onePageModel("One stop gradient");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: {
              fonts: model.pages[0]!.resources.fonts,
              images: [],
              gradients: [gradientId],
            },
            content: [
              {
                op: "fillLinearGradientRect",
                gradientId,
                box: { x: 72, y: 96, width: 120, height: 80 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          gradients: [
            {
              id: gradientId,
              name: "OneStopGradient",
              kind: "linear-gradient",
              angle: 0,
              box: { x: 72, y: 96, width: 120, height: 80 },
              stops: [{ position: 0, color: { r: 1, g: 0, b: 0 } }],
            },
          ],
        },
      }),
    ).toThrow(
      "PDF gradient resources must include a non-empty resource name, a positive box, finite geometry, and at least two valid stops.",
    );
  });

  test("rejects direct writes with malformed gradient resource stops", () => {
    const gradientId = pdfResourceId("gradient", "Bad gradient stop");
    const model = onePageModel("Bad gradient stop");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: {
              fonts: model.pages[0]!.resources.fonts,
              images: [],
              gradients: [gradientId],
            },
            content: [
              {
                op: "fillLinearGradientRect",
                gradientId,
                box: { x: 72, y: 96, width: 120, height: 80 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          gradients: [
            {
              id: gradientId,
              name: "BadGradientStop",
              kind: "linear-gradient",
              angle: 0,
              box: { x: 72, y: 96, width: 120, height: 80 },
              stops: [
                Object.assign([], { position: 0, color: { r: 1, g: 0, b: 0 } }),
                { position: 1, color: { r: 0, g: 0, b: 1 } },
              ],
            },
          ],
        },
      } as never),
    ).toThrow(
      "PDF gradient resources must include a non-empty resource name, a positive box, finite geometry, and at least two valid stops.",
    );
  });

  test("rejects direct writes with invalid radial gradient geometry", () => {
    const gradientId = pdfResourceId("gradient", "Bad radial gradient");
    const model = onePageModel("Bad radial gradient");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: {
              fonts: model.pages[0]!.resources.fonts,
              images: [],
              gradients: [gradientId],
            },
            content: [
              {
                op: "fillRadialGradientRect",
                gradientId,
                box: { x: 72, y: 96, width: 120, height: 80 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          gradients: [
            {
              id: gradientId,
              name: "BadRadialGradient",
              kind: "radial-gradient",
              shape: "circle",
              center: { x: 0.5, y: 0.5 },
              radius: { x: 0, y: 0.5 },
              box: { x: 72, y: 96, width: 120, height: 80 },
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0 } },
                { position: 1, color: { r: 0, g: 0, b: 1 } },
              ],
            },
          ],
        },
      }),
    ).toThrow(
      "PDF gradient resources must include a non-empty resource name, a positive box, finite geometry, and at least two valid stops.",
    );
  });

  test("rejects direct writes with malformed radial gradient resource centers", () => {
    const gradientId = pdfResourceId("gradient", "Bad radial gradient center");
    const model = onePageModel("Bad radial gradient center");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: {
              fonts: model.pages[0]!.resources.fonts,
              images: [],
              gradients: [gradientId],
            },
            content: [
              {
                op: "fillRadialGradientRect",
                gradientId,
                box: { x: 72, y: 96, width: 120, height: 80 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          gradients: [
            {
              id: gradientId,
              name: "BadRadialGradientCenter",
              kind: "radial-gradient",
              shape: "circle",
              center: Object.assign([], { x: 0.5, y: 0.5 }),
              radius: { x: 0.5, y: 0.5 },
              box: { x: 72, y: 96, width: 120, height: 80 },
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0 } },
                { position: 1, color: { r: 0, g: 0, b: 1 } },
              ],
            },
          ],
        },
      } as never),
    ).toThrow(
      "PDF gradient resources must include a non-empty resource name, a positive box, finite geometry, and at least two valid stops.",
    );
  });

  test("rejects direct writes with malformed radial gradient resource radii", () => {
    const gradientId = pdfResourceId("gradient", "Bad radial gradient radius");
    const model = onePageModel("Bad radial gradient radius");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: {
              fonts: model.pages[0]!.resources.fonts,
              images: [],
              gradients: [gradientId],
            },
            content: [
              {
                op: "fillRadialGradientRect",
                gradientId,
                box: { x: 72, y: 96, width: 120, height: 80 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          gradients: [
            {
              id: gradientId,
              name: "BadRadialGradientRadius",
              kind: "radial-gradient",
              shape: "circle",
              center: { x: 0.5, y: 0.5 },
              radius: Object.assign([], { x: 0.5, y: 0.5 }),
              box: { x: 72, y: 96, width: 120, height: 80 },
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0 } },
                { position: 1, color: { r: 0, g: 0, b: 1 } },
              ],
            },
          ],
        },
      } as never),
    ).toThrow(
      "PDF gradient resources must include a non-empty resource name, a positive box, finite geometry, and at least two valid stops.",
    );
  });

  test("rejects direct writes with invalid gradient round rectangle radii", () => {
    const gradientId = pdfResourceId("gradient", "Bad gradient radius");
    const model = onePageModel("Bad gradient radius");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: {
              fonts: model.pages[0]!.resources.fonts,
              images: [],
              gradients: [gradientId],
            },
            content: [
              {
                op: "fillLinearGradientRoundRect",
                gradientId,
                box: { x: 72, y: 96, width: 120, height: 80 },
                radius: Number.NaN,
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          gradients: [
            {
              id: gradientId,
              name: "BadGradientRadius",
              kind: "linear-gradient",
              angle: 0,
              box: { x: 72, y: 96, width: 120, height: 80 },
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0 } },
                { position: 1, color: { r: 0, g: 0, b: 1 } },
              ],
            },
          ],
        },
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("allows direct writes with rectangle content radii", () => {
    const model = onePageModel("Rectangle radius");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "fillRect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                radius: 8,
              } as never,
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  test("allows direct writes with stroked rectangle content radii", () => {
    const model = onePageModel("Stroked rectangle radius");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            content: [
              {
                op: "strokeRect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                radius: 8,
              } as never,
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  test("rejects direct writes with non-positive image content boxes", () => {
    const imageId = pdfResourceId("image", "Bad image box");
    const model = onePageModel("Bad image box");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: model.pages[0]!.resources.fonts, images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 0, height: 80 } }],
          },
        ],
        resources: {
          ...model.resources,
          images: [jpegImageResource(imageId, "BadImageBox")],
        },
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with non-positive image clip boxes", () => {
    const imageId = pdfResourceId("image", "Bad image clip box");
    const model = onePageModel("Bad image clip box");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: model.pages[0]!.resources.fonts, images: [imageId] },
            content: [
              {
                op: "image",
                imageId,
                box: { x: 72, y: 96, width: 120, height: 80 },
                clipBox: { x: 72, y: 96, width: 0, height: 80 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          images: [jpegImageResource(imageId, "BadImageClipBox")],
        },
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with clip radii missing clip boxes", () => {
    const imageId = pdfResourceId("image", "Bad image clip radius");
    const model = onePageModel("Bad image clip radius");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: model.pages[0]!.resources.fonts, images: [imageId] },
            content: [
              {
                op: "image",
                imageId,
                box: { x: 72, y: 96, width: 120, height: 80 },
                clipRadius: 8,
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          images: [jpegImageResource(imageId, "BadImageClipRadius")],
        },
      }),
    ).toThrow(
      "PDF content operations must be valid setFillColor, text, or image operations with required fields.",
    );
  });

  test("rejects direct writes with malformed page annotation collections", () => {
    const model = onePageModel("Bad page annotations");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [{ ...model.pages[0]!, annotations: "not-an-array" }],
      } as never),
    ).toThrow("PDF page annotations must be an array when present.");
  });

  test("rejects direct writes with malformed page annotation entries", () => {
    const model = onePageModel("Bad page annotation entry");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [{ ...model.pages[0]!, annotations: [null] }],
      } as never),
    ).toThrow(
      "PDF annotations must be valid link annotations with a positive box and an external URL.",
    );
  });

  test("rejects direct writes with invalid link annotation urls", () => {
    const model = onePageModel("Bad annotation URL");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            annotations: [
              {
                kind: "link",
                box: { x: 72, y: 96, width: 120, height: 24 },
                url: "https://example.com/bad path",
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF annotations must be valid link annotations with a positive box and an external URL.",
    );
  });

  test("rejects direct writes with non-positive link annotation boxes", () => {
    const model = onePageModel("Bad annotation box");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            annotations: [
              {
                kind: "link",
                box: { x: 72, y: 96, width: 0, height: 24 },
                url: "https://example.com/docs",
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF annotations must be valid link annotations with a positive box and an external URL.",
    );
  });

  test("rejects direct writes with link annotation boxes outside the page", () => {
    const model = onePageModel("Off-page annotation box");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            annotations: [
              {
                kind: "link",
                box: { x: 600, y: 96, width: 24, height: 24 },
                url: "https://example.com/docs",
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF annotations must be valid link annotations with a positive box and an external URL.",
    );
  });

  test("rejects direct writes with malformed page visual collections", () => {
    const model = onePageModel("Bad page visuals");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [{ ...model.pages[0]!, visuals: "not-an-array" }],
      } as never),
    ).toThrow("PDF page visuals must be an array when present.");
  });

  test("rejects direct writes with invalid page visual elements", () => {
    const model = onePageModel("Bad page visual element");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              {
                kind: "text",
                text: "Bad visual",
                box: { x: 72, y: 96, width: 0, height: 24 },
                fontId: model.resources.fonts[0]!.id,
                style: {},
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with malformed visual element objects", () => {
    const model = onePageModel("Bad visual element object");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              Object.assign([], {
                kind: "text",
                text: "Array visual",
                box: { x: 72, y: 96, width: 120, height: 24 },
                fontId: model.resources.fonts[0]!.id,
                style: {},
                paintOrder: { siblingOrder: 0 },
              }),
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with malformed visual element origins", () => {
    const model = onePageModel("Bad visual element origin");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              {
                kind: "text",
                text: "Bad origin",
                box: { x: 72, y: 96, width: 120, height: 24 },
                fontId: model.resources.fonts[0]!.id,
                style: {},
                origin: { graphNodeIds: [""] },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with malformed visual text styles", () => {
    const model = onePageModel("Bad visual text style");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              {
                kind: "text",
                text: "Bad visual style",
                box: { x: 72, y: 96, width: 120, height: 24 },
                fontId: model.resources.fonts[0]!.id,
                style: [],
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with unsupported visual text encodings", () => {
    const model = onePageModel("Unsupported visual text encoding");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              {
                kind: "text",
                text: "Visual 😀",
                box: { x: 72, y: 96, width: 120, height: 24 },
                fontId: model.resources.fonts[0]!.id,
                style: {},
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      }),
    ).toThrow("PDF text must use WinAnsi text or utf16be text with an Identity-H font.");
  });

  test("rejects direct writes with malformed visual paint orders", () => {
    const model = onePageModel("Bad visual paint order");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              {
                kind: "text",
                text: "Bad paint order",
                box: { x: 72, y: 96, width: 120, height: 24 },
                fontId: model.resources.fonts[0]!.id,
                style: {},
                paintOrder: Object.assign([], { siblingOrder: 0 }),
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with malformed visual strokes", () => {
    const model = onePageModel("Bad visual stroke");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              {
                kind: "shape",
                shape: "rect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                stroke: Object.assign([], { color: { r: 1, g: 0, b: 0 }, width: 2 }),
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with malformed visual image fit metadata", () => {
    const model = onePageModel("Bad visual image fit");
    const imageId = pdfResourceId("image", "photo");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { ...model.pages[0]!.resources, images: [imageId] },
            visuals: [
              {
                kind: "image",
                imageId,
                box: { x: 72, y: 96, width: 120, height: 80 },
                fit: "crop",
                objectPosition: { x: 0.5, y: Number.NaN },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/jpeg",
              width: 1,
              height: 1,
              data: validJpegBytes(),
            },
          ],
        },
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with malformed solid visual fills", () => {
    const model = onePageModel("Bad visual fill");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              {
                kind: "shape",
                shape: "rect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                fill: Object.assign([], { color: { r: 1, g: 0, b: 0 } }),
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with malformed gradient visual fills", () => {
    const model = onePageModel("Bad gradient visual fill");
    const gradientId = pdfResourceId("gradient", "Bad visual fill");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { ...model.pages[0]!.resources, gradients: [gradientId] },
            visuals: [
              {
                kind: "shape",
                shape: "rect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                fill: Object.assign([], {
                  kind: "linear-gradient",
                  gradientId,
                  angle: 0,
                  stops: [
                    { position: 0, color: { r: 1, g: 0, b: 0 } },
                    { position: 1, color: { r: 0, g: 0, b: 1 } },
                  ],
                }),
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          gradients: [
            {
              id: gradientId,
              name: "Grad1",
              kind: "linear-gradient",
              box: { x: 72, y: 96, width: 120, height: 80 },
              angle: 0,
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0 } },
                { position: 1, color: { r: 0, g: 0, b: 1 } },
              ],
            },
          ],
        },
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with malformed visual hyperlinks", () => {
    const model = onePageModel("Bad visual hyperlink");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              {
                kind: "text",
                text: "Bad hyperlink",
                box: { x: 72, y: 96, width: 120, height: 24 },
                fontId: model.resources.fonts[0]!.id,
                style: {},
                hyperlink: Object.assign([], { url: "https://example.com/docs" }),
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with visual hyperlink fallback boxes outside the page", () => {
    const model = onePageModel("Bad visual hyperlink fallback box");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              {
                kind: "text",
                text: "Bad fallback link box",
                box: { x: 600, y: 780, width: 80, height: 24 },
                fontId: model.resources.fonts[0]!.id,
                style: {},
                hyperlink: { url: "https://example.com/docs" },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with malformed radial gradient visual centers", () => {
    const model = onePageModel("Bad radial visual center");
    const gradientId = pdfResourceId("gradient", "Bad radial visual center");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { ...model.pages[0]!.resources, gradients: [gradientId] },
            visuals: [
              {
                kind: "shape",
                shape: "rect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                fill: {
                  kind: "radial-gradient",
                  gradientId,
                  shape: "circle",
                  center: Object.assign([], { x: 0.5, y: 0.5 }),
                  radius: { x: 0.5, y: 0.5 },
                  stops: [
                    { position: 0, color: { r: 1, g: 0, b: 0 } },
                    { position: 1, color: { r: 0, g: 0, b: 1 } },
                  ],
                },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          gradients: [
            {
              id: gradientId,
              name: "Grad1",
              kind: "radial-gradient",
              box: { x: 72, y: 96, width: 120, height: 80 },
              shape: "circle",
              center: { x: 0.5, y: 0.5 },
              radius: { x: 0.5, y: 0.5 },
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0 } },
                { position: 1, color: { r: 0, g: 0, b: 1 } },
              ],
            },
          ],
        },
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with malformed radial gradient visual radii", () => {
    const model = onePageModel("Bad radial visual radius");
    const gradientId = pdfResourceId("gradient", "Bad radial visual radius");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { ...model.pages[0]!.resources, gradients: [gradientId] },
            visuals: [
              {
                kind: "shape",
                shape: "rect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                fill: {
                  kind: "radial-gradient",
                  gradientId,
                  shape: "circle",
                  center: { x: 0.5, y: 0.5 },
                  radius: Object.assign([], { x: 0.5, y: 0.5 }),
                  stops: [
                    { position: 0, color: { r: 1, g: 0, b: 0 } },
                    { position: 1, color: { r: 0, g: 0, b: 1 } },
                  ],
                },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
        resources: {
          ...model.resources,
          gradients: [
            {
              id: gradientId,
              name: "Grad1",
              kind: "radial-gradient",
              box: { x: 72, y: 96, width: 120, height: 80 },
              shape: "circle",
              center: { x: 0.5, y: 0.5 },
              radius: { x: 0.5, y: 0.5 },
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0 } },
                { position: 1, color: { r: 0, g: 0, b: 1 } },
              ],
            },
          ],
        },
      } as never),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with rectangle visual radii", () => {
    const model = onePageModel("Bad rectangle visual radius");

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            visuals: [
              {
                kind: "shape",
                shape: "rect",
                box: { x: 72, y: 96, width: 120, height: 80 },
                radius: 8,
                fill: { color: { r: 1, g: 0, b: 0 } },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "PDF visual elements must be valid text visual elements with frame, font, style, and paint order fields.",
    );
  });

  test("rejects direct writes with visual font references missing from the page", () => {
    const model = onePageModel("Visual page resource miss");
    const fontId = model.resources.fonts[0]!.id;

    expect(() =>
      writePdfDocument({
        ...model,
        pages: [
          {
            ...model.pages[0]!,
            resources: { fonts: [], images: [] },
            content: [],
            visuals: [
              {
                kind: "text",
                text: "Hidden visual font",
                box: { x: 72, y: 96, width: 120, height: 24 },
                fontId,
                style: { fontSize: 12 },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      }),
    ).toThrow("The PDF visual element references a resource id that is not declared on the page.");
  });

  test("encodes link annotation tooltips as PDF text strings", async () => {
    const model = onePageModel("Linked text");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            annotations: [
              {
                kind: "link",
                box: { x: 72, y: 96, width: 120, height: 24 },
                url: "https://example.com/docs",
                tooltip: "ヘルプ",
              },
            ],
          },
        ],
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/Contents <FEFF30D830EB30D7>");
    expect(pdf).toContain("/URI (https://example.com/docs)");
  });

  test("emits link annotations from visual-only text hyperlinks", async () => {
    const model = onePageModel("ignored");
    const fontId = model.resources.fonts[0]!.id;
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            content: [],
            visuals: [
              {
                kind: "text",
                text: "Visual link",
                box: { x: 72, y: 96, width: 120, height: 24 },
                hyperlink: { url: "https://example.com/visual", tooltip: "Visual tip" },
                fontId,
                style: { fontSize: 12 },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("(Visual link) Tj");
    expect(pdf).toContain("/Annots [");
    expect(pdf).toContain("/URI (https://example.com/visual)");
    expect(pdf).toContain("/Contents (Visual tip)");
  });

  test("merges explicit link annotations with visual text hyperlinks", async () => {
    const model = onePageModel("ignored");
    const fontId = model.resources.fonts[0]!.id;
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            content: [],
            annotations: [
              {
                kind: "link",
                box: { x: 72, y: 132, width: 120, height: 24 },
                url: "https://example.com/explicit",
              },
            ],
            visuals: [
              {
                kind: "text",
                text: "Visual link",
                box: { x: 72, y: 96, width: 120, height: 24 },
                hyperlink: { url: "https://example.com/visual" },
                fontId,
                style: { fontSize: 12 },
                paintOrder: { siblingOrder: 0 },
              },
            ],
          },
        ],
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/URI (https://example.com/explicit)");
    expect(pdf).toContain("/URI (https://example.com/visual)");
  });

  test("offsets link annotation rectangles by non-zero page media box origins", async () => {
    const model = onePageModel("Linked text");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            mediaBox: { x: 10, y: 20, width: 612, height: 792 },
            annotations: [
              {
                kind: "link",
                box: { x: 72, y: 96, width: 120, height: 24 },
                url: "https://example.com/docs",
              },
            ],
          },
        ],
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/MediaBox [10 20 622 812]");
    expect(pdf).toContain("/Rect [82 692 202 716]");
  });

  test("offsets text content by non-zero page media box origins", async () => {
    const model = onePageModel("Offset text");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            mediaBox: { x: 10, y: 20, width: 612, height: 792 },
          },
        ],
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/MediaBox [10 20 622 812]");
    expect(pdf).toContain("1 0 0 1 82 704 Tm");
  });

  test("preserves explicit 20%-80% gradient endpoint positions", () => {
    const gradientId = pdfResourceId("gradient", "Explicit Endpoints");
    const pdf = decodePdf(
      writePdfDocument(
        oneGradientModel(
          {
            id: gradientId,
            name: "G1",
            kind: "linear-gradient",
            angle: 90,
            box: { x: 72, y: 96, width: 120, height: 24 },
            stops: [
              { position: 0.2, color: { r: 1, g: 0, b: 0 } },
              { position: 0.8, color: { r: 0, g: 0, b: 1 } },
            ],
          },
          {
            op: "fillLinearGradientRect",
            gradientId,
            box: { x: 72, y: 96, width: 120, height: 24 },
          },
        ),
      ),
    );

    expect(pdf).toContain("/FunctionType 3");
    expect(pdf).toContain("/Bounds [0.2 0.8]");
    expect(pdf).toContain("/C0 [1 0 0] /C1 [1 0 0]");
    expect(pdf).toContain("/C0 [0 0 1] /C1 [0 0 1]");
  });

  test("emits monotonic stitching bounds for duplicate hard stops", () => {
    const gradientId = pdfResourceId("gradient", "Duplicate Hard Stop");
    const pdf = decodePdf(
      writePdfDocument(
        oneGradientModel(
          {
            id: gradientId,
            name: "G1",
            kind: "linear-gradient",
            angle: 90,
            box: { x: 72, y: 96, width: 120, height: 24 },
            stops: [
              { position: 1, color: { r: 1, g: 1, b: 1 } },
              { position: 0.5, color: { r: 0, g: 1, b: 0 } },
              { position: 0, color: { r: 1, g: 0, b: 0 } },
              { position: 0.5, color: { r: 0, g: 0, b: 1 } },
            ],
          },
          {
            op: "fillLinearGradientRect",
            gradientId,
            box: { x: 72, y: 96, width: 120, height: 24 },
          },
        ),
      ),
    );

    expect(pdf).toContain("/Bounds [0.5]");
    expect(pdf).not.toContain("/Bounds [0.5 0.5]");
    expect(pdf).toContain("/C0 [1 0 0] /C1 [0 1 0]");
    expect(pdf).toContain("/C0 [0 0 1] /C1 [1 1 1]");
  });

  test("preserves unequal ellipse radii in radial gradient geometry", () => {
    const gradientId = pdfResourceId("gradient", "Elliptical Radial Gradient");
    const pdf = decodePdf(
      writePdfDocument(
        oneGradientModel(
          {
            id: gradientId,
            name: "G1",
            kind: "radial-gradient",
            shape: "ellipse",
            center: { x: 0.25, y: 0.4 },
            radius: { x: 0.5, y: 0.25 },
            box: { x: 72, y: 96, width: 200, height: 100 },
            stops: [
              { position: 0, color: { r: 1, g: 0, b: 0 } },
              { position: 1, color: { r: 0, g: 0, b: 1 } },
            ],
          },
          {
            op: "fillRadialGradientRect",
            gradientId,
            box: { x: 72, y: 96, width: 200, height: 100 },
          },
        ),
      ),
    );

    expect(pdf).toContain("/ShadingType 3");
    expect(pdf).toContain("/Coords [0 0 0 0 0 1]");
    expect(pdf).toContain("/Matrix [100 0 0 25 122 656]");
  });

  test("offsets linear gradient coordinates by non-zero page media box origins", async () => {
    const gradientId = pdfResourceId("gradient", "Offset Gradient");
    const model = onePageModel("Gradient page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            mediaBox: { x: 10, y: 20, width: 612, height: 792 },
            resources: { fonts: [], images: [], gradients: [gradientId] },
            content: [
              {
                op: "fillLinearGradientRect",
                gradientId,
                box: { x: 72, y: 96, width: 120, height: 24 },
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
              name: "G1",
              kind: "linear-gradient",
              angle: 0,
              box: { x: 72, y: 96, width: 120, height: 24 },
              stops: [
                { position: 0, color: { r: 1, g: 0, b: 0 } },
                { position: 1, color: { r: 0, g: 0, b: 1 } },
              ],
            },
          ],
        },
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/MediaBox [10 20 622 812]");
    expect(pdf).toContain("/Coords [142 692 142 716]");
    expect(pdf).not.toContain("/Font <<");
  });

  test("percent-encodes Unicode link annotation URI strings", async () => {
    const model = onePageModel("Linked text");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            annotations: [
              {
                kind: "link",
                box: { x: 72, y: 96, width: 120, height: 24 },
                url: "https://example.com/😀?q=café",
              },
            ],
          },
        ],
      },
      { inspection: "none" },
    );
    const pdf = decodePdf(result.artifact?.bytes ?? new Uint8Array());

    expect(result.diagnostics.items).toEqual([]);
    expect(pdf).toContain("/URI (https://example.com/%F0%9F%98%80?q=caf%C3%A9)");
  });

  test("emits JPEG image XObjects with binary-safe stream bytes", async () => {
    const imageId = pdfResourceId("image", "Inline JPEG");
    const jpegBytes = validJpegBytes();
    const model = onePageModel("Image page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
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
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const streamStart = byteSequenceIndex(bytes, jpegBytes);

    expect(pdf).toContain("/XObject << /Im1");
    expect(pdf).toContain("/Subtype /Image");
    expect(pdf).toContain("/Filter /DCTDecode");
    expect(pdf).toContain("/Im1 Do");
    expect(streamStart).toBeGreaterThan(0);
  });

  test("emits RGB PNG image XObjects using FlateDecode and PNG predictors", async () => {
    const imageId = pdfResourceId("image", "Inline PNG");
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
      0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8,
      0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92, 0xef, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const idatBytes = new Uint8Array([
      0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00,
    ]);
    const model = onePageModel("PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 1,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const streamStart = bytes.findIndex((_, index) =>
      idatBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/Filter /FlateDecode");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 1 >>",
    );
    expect(pdf).toContain("/Im1 Do");
    expect(streamStart).toBeGreaterThan(0);
  });

  test("deinterlaces Adam7 RGB PNG image XObjects to RGB rows", async () => {
    const imageId = pdfResourceId("image", "Adam7 RGB PNG");
    const pngBytes = rgbaPngBytes({
      width: 1,
      height: 1,
      colorType: 2,
      interlace: 1,
      rows: new Uint8Array([0, 0xff, 0x00, 0x80]),
    });
    const rgbBytes = zlibSync(new Uint8Array([0, 0xff, 0x00, 0x80]));
    const model = onePageModel("Adam7 RGB PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 1,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const rgbStreamStart = bytes.findIndex((_, index) =>
      rgbBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 1 >>",
    );
    expect(pdf).toContain("/Im1 Do");
    expect(rgbStreamStart).toBeGreaterThan(0);
  });

  test("downsamples 16-bit RGB PNG image XObjects to 8-bit RGB rows", async () => {
    const imageId = pdfResourceId("image", "Sixteen Bit RGB PNG");
    const pngBytes = rgbaPngBytes({
      width: 2,
      height: 1,
      bitDepth: 16,
      colorType: 2,
      rows: new Uint8Array([
        0, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0xff, 0xff,
      ]),
    });
    const rgbBytes = zlibSync(new Uint8Array([0, 0xff, 0x00, 0x00, 0x00, 0x80, 0xff]));
    const model = onePageModel("Sixteen bit RGB PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 2,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const rgbStreamStart = bytes.findIndex((_, index) =>
      rgbBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(pdf).toContain("/Im1 Do");
    expect(rgbStreamStart).toBeGreaterThan(0);
  });

  test("emits grayscale PNG image XObjects with DeviceGray color space", async () => {
    const imageId = pdfResourceId("image", "Inline Gray PNG");
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x3a,
      0x7e, 0x9b, 0x55, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x68,
      0x00, 0x00, 0x00, 0x82, 0x00, 0x81, 0x77, 0xcd, 0x72, 0xb6, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const idatBytes = new Uint8Array([0x78, 0x9c, 0x63, 0x68, 0x00, 0x00, 0x00, 0x82, 0x00, 0x81]);
    const model = onePageModel("Gray PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 1,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const streamStart = bytes.findIndex((_, index) =>
      idatBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/ColorSpace /DeviceGray");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 1 >>",
    );
    expect(pdf).toContain("/Im1 Do");
    expect(streamStart).toBeGreaterThan(0);
  });

  test("expands 1-bit grayscale PNG image XObjects to 8-bit gray rows", async () => {
    const imageId = pdfResourceId("image", "One Bit Gray PNG");
    const pngBytes = rgbaPngBytes({
      width: 2,
      height: 1,
      bitDepth: 1,
      colorType: 0,
      rows: new Uint8Array([0, 0x40]),
    });
    const grayBytes = zlibSync(new Uint8Array([0, 0x00, 0xff]));
    const model = onePageModel("One bit gray PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 2,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const grayStreamStart = bytes.findIndex((_, index) =>
      grayBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/ColorSpace /DeviceGray");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(pdf).toContain("/Im1 Do");
    expect(grayStreamStart).toBeGreaterThan(0);
  });

  test("emits 1-bit grayscale PNG transparency chunks as soft masks", async () => {
    const imageId = pdfResourceId("image", "One Bit Transparent Gray PNG");
    const pngBytes = rgbaPngBytes({
      width: 2,
      height: 1,
      bitDepth: 1,
      colorType: 0,
      transparency: new Uint8Array([0x00, 0x01]),
      rows: new Uint8Array([0, 0x40]),
    });
    const grayBytes = zlibSync(new Uint8Array([0, 0x00, 0xff]));
    const alphaBytes = zlibSync(new Uint8Array([0, 0xff, 0x00]));
    const model = onePageModel("One bit transparent gray PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 2,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const grayStreamStart = bytes.findIndex((_, index) =>
      grayBytes.every((byte, offset) => bytes[index + offset] === byte),
    );
    const alphaStreamStart = bytes.findIndex((_, index) =>
      alphaBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/SMask");
    expect(pdf).toContain("/ColorSpace /DeviceGray");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(grayStreamStart).toBeGreaterThan(0);
    expect(alphaStreamStart).toBeGreaterThan(0);
  });

  test("emits RGBA PNG image XObjects with a soft mask", async () => {
    const imageId = pdfResourceId("image", "Inline RGBA PNG");
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8,
      0xcf, 0xc0, 0xd0, 0x00, 0x00, 0x04, 0x81, 0x01, 0x80, 0x2c, 0x55, 0xce, 0xb0, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const rgbBytes = new Uint8Array([
      0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00,
    ]);
    const alphaBytes = new Uint8Array([0x78, 0x9c, 0x63, 0x68, 0x00, 0x00, 0x00, 0x82, 0x00, 0x81]);
    const model = onePageModel("RGBA PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 1,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const rgbStreamStart = bytes.findIndex((_, index) =>
      rgbBytes.every((byte, offset) => bytes[index + offset] === byte),
    );
    const alphaStreamStart = bytes.findIndex((_, index) =>
      alphaBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/SMask");
    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain("/ColorSpace /DeviceGray");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 1 >>",
    );
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 1 >>",
    );
    expect(pdf).toContain("/Im1 Do");
    expect(rgbStreamStart).toBeGreaterThan(0);
    expect(alphaStreamStart).toBeGreaterThan(0);
  });

  test("downsamples 16-bit RGBA PNG image XObjects with soft masks", async () => {
    const imageId = pdfResourceId("image", "Sixteen Bit RGBA PNG");
    const pngBytes = rgbaPngBytes({
      width: 2,
      height: 1,
      bitDepth: 16,
      colorType: 6,
      rows: new Uint8Array([
        0, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x80, 0x00, 0xff, 0xff, 0xff,
        0xff,
      ]),
    });
    const rgbBytes = zlibSync(new Uint8Array([0, 0xff, 0x00, 0x00, 0x00, 0x80, 0xff]));
    const alphaBytes = zlibSync(new Uint8Array([0, 0x80, 0xff]));
    const model = onePageModel("Sixteen bit RGBA PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 2,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const rgbStreamStart = bytes.findIndex((_, index) =>
      rgbBytes.every((byte, offset) => bytes[index + offset] === byte),
    );
    const alphaStreamStart = bytes.findIndex((_, index) =>
      alphaBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/SMask");
    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain("/ColorSpace /DeviceGray");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(rgbStreamStart).toBeGreaterThan(0);
    expect(alphaStreamStart).toBeGreaterThan(0);
  });

  test("unfilters RGBA PNG rows before emitting soft masks", async () => {
    const imageId = pdfResourceId("image", "Filtered RGBA PNG");
    const pngBytes = rgbaPngBytes({
      width: 2,
      height: 1,
      rows: new Uint8Array([1, 10, 20, 30, 40, 40, 50, 60, 80]),
    });
    const rgbBytes = zlibSync(new Uint8Array([0, 10, 20, 30, 50, 70, 90]));
    const alphaBytes = zlibSync(new Uint8Array([0, 40, 120]));
    const model = onePageModel("Filtered RGBA PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 2,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const rgbStreamStart = bytes.findIndex((_, index) =>
      rgbBytes.every((byte, offset) => bytes[index + offset] === byte),
    );
    const alphaStreamStart = bytes.findIndex((_, index) =>
      alphaBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/SMask");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(rgbStreamStart).toBeGreaterThan(0);
    expect(alphaStreamStart).toBeGreaterThan(0);
  });

  test("emits grayscale alpha PNG image XObjects with a soft mask", async () => {
    const imageId = pdfResourceId("image", "Gray Alpha PNG");
    const pngBytes = rgbaPngBytes({
      width: 1,
      height: 1,
      colorType: 4,
      rows: new Uint8Array([0, 0x44, 0xaa]),
    });
    const grayBytes = zlibSync(new Uint8Array([0, 0x44]));
    const alphaBytes = zlibSync(new Uint8Array([0, 0xaa]));
    const model = onePageModel("Gray alpha PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 1,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const grayStreamStart = bytes.findIndex((_, index) =>
      grayBytes.every((byte, offset) => bytes[index + offset] === byte),
    );
    const alphaStreamStart = bytes.findIndex((_, index) =>
      alphaBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/SMask");
    expect(pdf).toContain("/ColorSpace /DeviceGray");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 1 >>",
    );
    expect(grayStreamStart).toBeGreaterThan(0);
    expect(alphaStreamStart).toBeGreaterThan(0);
  });

  test("expands indexed PNG image XObjects to RGB rows", async () => {
    const imageId = pdfResourceId("image", "Indexed PNG");
    const pngBytes = rgbaPngBytes({
      width: 2,
      height: 1,
      colorType: 3,
      palette: new Uint8Array([0xff, 0x00, 0x00, 0x00, 0x80, 0xff]),
      rows: new Uint8Array([0, 0, 1]),
    });
    const rgbBytes = zlibSync(new Uint8Array([0, 0xff, 0x00, 0x00, 0x00, 0x80, 0xff]));
    const model = onePageModel("Indexed PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 2,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const rgbStreamStart = bytes.findIndex((_, index) =>
      rgbBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(pdf).toContain("/Im1 Do");
    expect(rgbStreamStart).toBeGreaterThan(0);
  });

  test("expands 1-bit indexed PNG image XObjects to RGB rows", async () => {
    const imageId = pdfResourceId("image", "One Bit Indexed PNG");
    const pngBytes = rgbaPngBytes({
      width: 2,
      height: 1,
      bitDepth: 1,
      colorType: 3,
      palette: new Uint8Array([0xff, 0x00, 0x00, 0x00, 0x80, 0xff]),
      rows: new Uint8Array([0, 0x40]),
    });
    const rgbBytes = zlibSync(new Uint8Array([0, 0xff, 0x00, 0x00, 0x00, 0x80, 0xff]));
    const model = onePageModel("One bit indexed PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 2,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const rgbStreamStart = bytes.findIndex((_, index) =>
      rgbBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(pdf).toContain("/Im1 Do");
    expect(rgbStreamStart).toBeGreaterThan(0);
  });

  test("deinterlaces 1-bit Adam7 indexed PNG image XObjects to RGB rows", async () => {
    const imageId = pdfResourceId("image", "Adam7 One Bit Indexed PNG");
    const pngBytes = rgbaPngBytes({
      width: 2,
      height: 1,
      bitDepth: 1,
      colorType: 3,
      interlace: 1,
      palette: new Uint8Array([0xff, 0x00, 0x00, 0x00, 0x80, 0xff]),
      rows: new Uint8Array([0, 0x00, 0, 0x80]),
    });
    const rgbBytes = zlibSync(new Uint8Array([0, 0xff, 0x00, 0x00, 0x00, 0x80, 0xff]));
    const model = onePageModel("Adam7 one bit indexed PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 2,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const rgbStreamStart = bytes.findIndex((_, index) =>
      rgbBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(pdf).toContain("/Im1 Do");
    expect(rgbStreamStart).toBeGreaterThan(0);
  });

  test("emits indexed PNG transparency chunks as soft masks", async () => {
    const imageId = pdfResourceId("image", "Indexed Transparent PNG");
    const pngBytes = rgbaPngBytes({
      width: 2,
      height: 1,
      colorType: 3,
      palette: new Uint8Array([0xff, 0x00, 0x00, 0x00, 0x80, 0xff]),
      transparency: new Uint8Array([0xff, 0x40]),
      rows: new Uint8Array([0, 0, 1]),
    });
    const rgbBytes = zlibSync(new Uint8Array([0, 0xff, 0x00, 0x00, 0x00, 0x80, 0xff]));
    const alphaBytes = zlibSync(new Uint8Array([0, 0xff, 0x40]));
    const model = onePageModel("Indexed transparent PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 2,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const rgbStreamStart = bytes.findIndex((_, index) =>
      rgbBytes.every((byte, offset) => bytes[index + offset] === byte),
    );
    const alphaStreamStart = bytes.findIndex((_, index) =>
      alphaBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/SMask");
    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain("/ColorSpace /DeviceGray");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(rgbStreamStart).toBeGreaterThan(0);
    expect(alphaStreamStart).toBeGreaterThan(0);
  });

  test("emits truecolor PNG transparency chunks as soft masks", async () => {
    const imageId = pdfResourceId("image", "Transparent RGB PNG");
    const rows = new Uint8Array([0, 0xff, 0x00, 0x00, 0x00, 0x80, 0xff]);
    const pngBytes = rgbaPngBytes({
      width: 2,
      height: 1,
      colorType: 2,
      transparency: new Uint8Array([0x00, 0xff, 0x00, 0x00, 0x00, 0x00]),
      rows,
    });
    const rgbBytes = zlibSync(rows);
    const alphaBytes = zlibSync(new Uint8Array([0, 0x00, 0xff]));
    const model = onePageModel("Transparent RGB PNG page");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 120, height: 80 } }],
          },
        ],
        resources: {
          fonts: [],
          images: [
            {
              id: imageId,
              name: "Im1",
              mediaType: "image/png",
              width: 2,
              height: 1,
              data: pngBytes,
            },
          ],
        },
      },
      { inspection: "none" },
    );

    expect(result.diagnostics.items).toEqual([]);

    const bytes = result.artifact?.bytes ?? new Uint8Array();
    const pdf = decodePdf(bytes);
    const rgbStreamStart = bytes.findIndex((_, index) =>
      rgbBytes.every((byte, offset) => bytes[index + offset] === byte),
    );
    const alphaStreamStart = bytes.findIndex((_, index) =>
      alphaBytes.every((byte, offset) => bytes[index + offset] === byte),
    );

    expect(pdf).toContain("/SMask");
    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain("/ColorSpace /DeviceGray");
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(pdf).toContain(
      "/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 2 >>",
    );
    expect(rgbStreamStart).toBeGreaterThan(0);
    expect(alphaStreamStart).toBeGreaterThan(0);
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

  test("rejects text operations without a page-local font", async () => {
    const model = onePageModel("Implicit font");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [] },
            content: [{ op: "text", text: "Implicit font", x: 72, y: 96, fontSize: 12 }],
          },
        ],
      },
      { inspection: "none" },
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_TEXT_MISSING_FONT_RESOURCE",
    );
  });

  test("rejects duplicate page font resource names", async () => {
    const model = onePageModel("Duplicate font names");
    const secondFontId = pdfResourceId("font", "Helvetica Duplicate");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [model.pages[0].resources.fonts[0], secondFontId], images: [] },
          },
        ],
        resources: {
          fonts: [model.resources.fonts[0], { id: secondFontId, name: "F1", family: "Helvetica" }],
          images: [],
        },
      },
      { inspection: "none" },
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_DUPLICATE_PAGE_FONT_RESOURCE_NAME",
    );
  });

  test("rejects image operations with unembeddable image resources", async () => {
    const imageId = pdfResourceId("image", "Chart");
    const model = onePageModel("Image");
    const result = await renderPdfPageModel(
      {
        ...model,
        pages: [
          {
            ...model.pages[0],
            resources: { fonts: [], images: [imageId] },
            content: [{ op: "image", imageId, box: { x: 72, y: 96, width: 240, height: 120 } }],
          },
        ],
        resources: { fonts: [], images: [{ id: imageId }] },
      },
      { inspection: "none" },
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_UNEMBEDDABLE_IMAGE_RESOURCE",
    );
  });
});

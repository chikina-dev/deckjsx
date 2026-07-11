import { describe, expect, test } from "vite-plus/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pdf } from "@/src/adapter";
import { integrationContextId, type AssetLoader, type DeckPlugin } from "@/src/integration";
import type { PdfPageModel } from "@/src/projection/pdf/model";
import { Deck } from "@/tests/helpers";

const fontBytes = new Uint8Array([0, 1, 0, 0]);

function decodePdf(bytes: Uint8Array | undefined): string {
  return new TextDecoder().decode(bytes ?? new Uint8Array());
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

function minimalTrueTypeWithCmap(
  cmapSubtable: readonly number[],
  advanceWidths: readonly [number, number, number] = [500, 600, 700],
  extraTables: readonly { readonly name: string; readonly bytes: readonly number[] }[] = [],
): Uint8Array {
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
    ...uint16(advanceWidths[0]),
    ...int16(0),
    ...uint16(advanceWidths[1]),
    ...int16(0),
    ...uint16(advanceWidths[2]),
    ...int16(0),
  ]);
  const cmap = paddedTable([
    ...uint16(0),
    ...uint16(1),
    ...uint16(3),
    ...uint16(1),
    ...uint32(12),
    ...cmapSubtable,
  ]);
  const tables = [
    { name: "cmap", bytes: cmap },
    { name: "head", bytes: head },
    { name: "hhea", bytes: hhea },
    { name: "hmtx", bytes: hmtx },
    ...extraTables,
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

function minimalTrueTypeWithFormat4ABWidths(
  advanceWidths: readonly [number, number, number] = [500, 600, 700],
  extraTables: readonly { readonly name: string; readonly bytes: readonly number[] }[] = [],
): Uint8Array {
  return minimalTrueTypeWithCmap(
    [
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
    ],
    advanceWidths,
    extraTables,
  );
}

function minimalTrueTypeWithFormat4ABKerning(): Uint8Array {
  const kern = paddedTable([
    ...uint16(0),
    ...uint16(1),
    ...uint16(0),
    ...uint16(20),
    ...uint16(1),
    ...uint16(1),
    ...uint16(0),
    ...uint16(0),
    ...uint16(0),
    ...uint16(1),
    ...uint16(2),
    ...int16(-120),
  ]);

  return minimalTrueTypeWithFormat4ABWidths([500, 600, 700], [{ name: "kern", bytes: kern }]);
}

function minimalTrueTypeWithFormat4ABGposKerning(): Uint8Array {
  const coverage = [...uint16(1), ...uint16(1), ...uint16(1)];
  const pairPositioning = [
    ...uint16(1),
    ...uint16(18),
    ...uint16(4),
    ...uint16(0),
    ...uint16(1),
    ...uint16(12),
    ...uint16(1),
    ...uint16(2),
    ...int16(-120),
    ...coverage,
  ];
  const scriptList = [
    ...uint16(1),
    ...tag("DFLT"),
    ...uint16(8),
    ...uint16(4),
    ...uint16(0),
    ...uint16(0xffff),
    ...uint16(1),
    ...uint16(0),
  ];
  const featureList = [
    ...uint16(1),
    ...tag("kern"),
    ...uint16(8),
    ...uint16(0),
    ...uint16(1),
    ...uint16(0),
  ];
  const lookupList = [
    ...uint16(1),
    ...uint16(4),
    ...uint16(2),
    ...uint16(0),
    ...uint16(1),
    ...uint16(8),
    ...pairPositioning,
  ];
  const gpos = paddedTable([
    ...uint16(1),
    ...uint16(0),
    ...uint16(10),
    ...uint16(28),
    ...uint16(42),
    ...scriptList,
    ...featureList,
    ...lookupList,
  ]);
  return minimalTrueTypeWithFormat4ABWidths([500, 600, 700], [{ name: "GPOS", bytes: gpos }]);
}

function minimalTrueTypeWithFormat12Emoji(
  advanceWidths: readonly [number, number, number] = [500, 600, 700],
): Uint8Array {
  return minimalTrueTypeWithCmap(
    [
      ...uint16(12),
      ...uint16(0),
      ...uint32(28),
      ...uint32(0),
      ...uint32(1),
      ...uint32(0x1f600),
      ...uint32(0x1f600),
      ...uint32(1),
    ],
    advanceWidths,
  );
}

function minimalTrueTypeWithFormat12HiraganaA(): Uint8Array {
  return minimalTrueTypeWithCmap([
    ...uint16(12),
    ...uint16(0),
    ...uint32(28),
    ...uint32(0),
    ...uint32(1),
    ...uint32(0x3042),
    ...uint32(0x3042),
    ...uint32(1),
  ]);
}

function minimalTrueTypeWithFormat12AAndEmoji(): Uint8Array {
  return minimalTrueTypeWithCmap([
    ...uint16(12),
    ...uint16(0),
    ...uint32(40),
    ...uint32(0),
    ...uint32(2),
    ...uint32(65),
    ...uint32(65),
    ...uint32(1),
    ...uint32(0x1f600),
    ...uint32(0x1f600),
    ...uint32(2),
  ]);
}

function expectPdfPageModel(value: unknown): PdfPageModel {
  expect(value).toMatchObject({ format: "pdf" });
  return value as PdfPageModel;
}

const externalPdfTextOracleTest =
  commandAvailable("qpdf") && commandAvailable("pdftoppm") && commandAvailable("pdftotext")
    ? test
    : test.skip;

const shapingFontPath =
  process.env.DECKJSX_SHAPING_TEST_FONT ?? "/System/Library/Fonts/Supplemental/Geneva.ttf";
const shapingFontTest = existsSync(shapingFontPath) ? test : test.skip;
const shapingPositioningFontPath =
  process.env.DECKJSX_SHAPING_POSITIONING_TEST_FONT ??
  "/System/Library/Fonts/Supplemental/Arial.ttf";
const shapingPositioningFontTest = existsSync(shapingPositioningFontPath) ? test : test.skip;
const shapingRtlFontPath =
  process.env.DECKJSX_SHAPING_RTL_TEST_FONT ?? "/System/Library/Fonts/Supplemental/Arial.ttf";
const shapingRtlFontTest = existsSync(shapingRtlFontPath) ? test : test.skip;

function commandAvailable(command: string): boolean {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function withTemporaryPdf<T>(
  bytes: Uint8Array,
  callback: (path: string, directory: string) => T,
): T {
  const directory = mkdtempSync(join(tmpdir(), "deckjsx-pdf-font-oracle-"));
  const pdfPath = join(directory, "deck.pdf");

  try {
    writeFileSync(pdfPath, bytes);
    return callback(pdfPath, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("PDF font asset registration", () => {
  test("projects font registrations returned by an afterAsset hook", async () => {
    const bytes = minimalTrueTypeWithFormat4ABWidths();
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:after-asset-font",
      hooks: {
        afterAsset() {
          return {
            integrationContext: {
              id: integrationContextId("test:after-asset-font"),
              fontAssets: [
                {
                  key: "after-asset-regular",
                  family: "After Asset",
                  source: { kind: "bytes", bytes, mediaType: "font/ttf" },
                },
              ],
            },
          };
        },
      },
    });
    deck.slide({ name: "After asset font" }, () => <p style={{ fontFamily: "After Asset" }}>AB</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "After Asset",
        sourceKey: "after-asset-regular",
        data: bytes,
      }),
    );
  });

  test("embeds registered plugin font asset bytes in PDF font resources", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:inter-font",
      name: "test:inter-font",
      integration: {
        id: integrationContextId("test:inter-font"),
        fontAssets: [
          {
            key: "inter-regular",
            family: "Inter",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Registered Font" }, () => (
      <p style={{ fontFamily: "Inter", fontWeight: 400 }}>Hello</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Inter",
        fallback: false,
        sourceKey: "inter-regular",
        data: fontBytes,
        weight: 400,
        style: "normal",
      }),
    );
  });

  test("uses a registered font that matches the default PDF text family", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:default-aptos-font",
      name: "test:default-aptos-font",
      integration: {
        id: integrationContextId("test:default-aptos-font"),
        fontAssets: [
          {
            key: "aptos-regular",
            family: "Aptos",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat4ABWidths(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Default Aptos Font" }, () => <p>AB</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text" && op.text === "AB");
    const font = projection.resources.fonts.find(
      (resource) => resource.id === (textOp?.op === "text" ? textOp.fontId : undefined),
    );

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(font).toEqual(
      expect.objectContaining({
        family: "Aptos",
        fallback: false,
        sourceKey: "aptos-regular",
        data: minimalTrueTypeWithFormat4ABWidths(),
      }),
    );
  });

  test("carries registered TrueType kerning through projection and PDF output", async () => {
    const font = minimalTrueTypeWithFormat4ABKerning();
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:kerning-font",
      name: "test:kerning-font",
      integration: {
        id: integrationContextId("test:kerning-font"),
        fontAssets: [
          {
            key: "kerning-regular",
            family: "Kerning",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: font, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Kerning" }, () => <p style={{ fontFamily: "Kerning" }}>AB</p>);

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text" && op.text === "AB");
    const pdfBytes = decodePdf(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({ op: "text", text: "AB", kerningAdjustments: [-120] });
    expect(textOp).toMatchObject({ textEncoding: "utf16be" });
    expect(pdfBytes).toContain("[<0001> 120 <0002>] TJ");
    expect(pdfBytes).not.toContain("(AB) Tj");
  });

  test("carries OpenType GPOS kerning through projection and PDF output", async () => {
    const font = minimalTrueTypeWithFormat4ABGposKerning();
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:gpos-kerning-font",
      name: "test:gpos-kerning-font",
      integration: {
        id: integrationContextId("test:gpos-kerning-font"),
        fontAssets: [
          {
            key: "gpos-kerning-regular",
            family: "GPOS Kerning",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: font, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "GPOS Kerning" }, () => <p style={{ fontFamily: "GPOS Kerning" }}>AB</p>);

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text" && op.text === "AB");
    const pdfBytes = decodePdf(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({ op: "text", text: "AB", kerningAdjustments: [-120] });
    expect(textOp).toMatchObject({ textEncoding: "utf16be" });
    expect(pdfBytes).toContain("[<0001> 120 <0002>] TJ");
  });

  shapingPositioningFontTest("shapes pure WinAnsi runs for embedded fonts", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:fontkit-winansi-all-run",
      name: "test:fontkit-winansi-all-run",
      integration: {
        id: integrationContextId("test:fontkit-winansi-all-run"),
        fontAssets: [
          {
            key: "fontkit-winansi-all-run",
            family: "Fontkit WinAnsi",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: new Uint8Array(readFileSync(shapingPositioningFontPath)),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Fontkit WinAnsi" }, () => (
      <p style={{ fontFamily: "Fontkit WinAnsi" }}>AB</p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const font = projection.resources.fonts.find(
      (resource) => textOp?.op === "text" && resource.id === textOp.fontId,
    );
    const pdfBytes = decodePdf(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({ text: "AB", textEncoding: "utf16be" });
    expect(textOp?.op === "text" ? textOp.glyphs : undefined).toHaveLength(2);
    expect(font).toMatchObject({ encoding: "identity-h", fallback: false });
    expect(pdfBytes).toContain("/Encoding /Identity-H");
    expect(pdfBytes).toContain("<0001> <0041>");
    expect(pdfBytes).toContain("<0002> <0042>");
    expect(pdfBytes).not.toContain("(AB) Tj");
  });

  shapingFontTest(
    "converts OpenType ligature output through the deckjsx glyph format",
    async () => {
      const plugin: DeckPlugin = {
        kind: "deckjsx.plugin",
        id: "test:fontkit-ligature",
        name: "test:fontkit-ligature",
        integration: {
          id: integrationContextId("test:fontkit-ligature"),
          fontAssets: [
            {
              key: "fontkit-ligature",
              family: "Fontkit Ligature",
              weight: 400,
              style: "normal",
              source: {
                kind: "bytes",
                bytes: new Uint8Array(readFileSync(shapingFontPath)),
                mediaType: "font/ttf",
              },
            },
          ],
        },
      };
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.plugin(plugin);
      deck.slide({ name: "Fontkit Ligature" }, () => (
        <p style={{ fontFamily: "Fontkit Ligature" }}>fiあ</p>
      ));

      const result = await deck.project({ format: "pdf", inspection: "none" });
      const renderResult = await deck.render(pdf({ inspection: "none" }));
      const projection = expectPdfPageModel(result.projection);
      const textOp = projection.pages[0]?.content.find((op) => op.op === "text");

      expect(result.ok).toBe(true);
      expect(renderResult.ok).toBe(true);
      expect(textOp).toMatchObject({ text: "fiあ", textEncoding: "utf16be" });
      expect(textOp?.op === "text" ? textOp.glyphs?.[0] : undefined).toEqual(
        expect.objectContaining({ unicode: "fi" }),
      );
      expect(projection.fallbacks).not.toContainEqual(
        expect.objectContaining({ code: "W_FONT_SHAPING_FALLBACK" }),
      );
    },
  );

  shapingPositioningFontTest(
    "emits positioned mark glyphs through the deckjsx glyph format",
    async () => {
      const plugin: DeckPlugin = {
        kind: "deckjsx.plugin",
        id: "test:fontkit-mark-positioning",
        name: "test:fontkit-mark-positioning",
        integration: {
          id: integrationContextId("test:fontkit-mark-positioning"),
          fontAssets: [
            {
              key: "fontkit-mark-positioning",
              family: "Fontkit Mark Positioning",
              weight: 400,
              style: "normal",
              source: {
                kind: "bytes",
                bytes: new Uint8Array(readFileSync(shapingPositioningFontPath)),
                mediaType: "font/ttf",
              },
            },
          ],
        },
      };
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.plugin(plugin);
      deck.slide({ name: "Fontkit Mark Positioning" }, () => (
        <p style={{ fontFamily: "Fontkit Mark Positioning", fontSize: 48 }}>Á</p>
      ));

      const projectResult = await deck.project({ format: "pdf", inspection: "none" });
      const renderResult = await deck.render(pdf({ inspection: "none" }));
      const projection = expectPdfPageModel(projectResult.projection);
      const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
      const markGlyph =
        textOp?.op === "text" ? textOp.glyphs?.find((glyph) => glyph.unicode === "́") : undefined;

      expect(projectResult.ok).toBe(true);
      expect(renderResult.ok).toBe(true);
      expect(markGlyph).toEqual(
        expect.objectContaining({
          advanceWidth: 0,
          xOffset: expect.any(Number),
          yOffset: expect.any(Number),
        }),
      );
      expect(decodePdf(renderResult.artifact?.bytes).match(/ Tm/g)?.length).toBeGreaterThan(1);
      expect(projection.fallbacks).not.toContainEqual(
        expect.objectContaining({ code: "W_FONT_SHAPING_FALLBACK" }),
      );
    },
  );

  shapingRtlFontTest(
    "preserves logical RTL source in ActualText while emitting visual glyph order",
    async () => {
      const plugin: DeckPlugin = {
        kind: "deckjsx.plugin",
        id: "test:fontkit-rtl",
        name: "test:fontkit-rtl",
        integration: {
          id: integrationContextId("test:fontkit-rtl"),
          fontAssets: [
            {
              key: "fontkit-rtl",
              family: "Fontkit RTL",
              weight: 400,
              style: "normal",
              source: {
                kind: "bytes",
                bytes: new Uint8Array(readFileSync(shapingRtlFontPath)),
                mediaType: "font/ttf",
              },
            },
          ],
        },
      };
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.plugin(plugin);
      deck.slide({ name: "Fontkit RTL" }, () => (
        <p style={{ fontFamily: "Fontkit RTL", fontSize: 48 }}>אב</p>
      ));

      const projectResult = await deck.project({ format: "pdf", inspection: "none" });
      const renderResult = await deck.render(pdf({ inspection: "none" }));
      const projection = expectPdfPageModel(projectResult.projection);
      const textOp = projection.pages[0]?.content.find(
        (op) => op.op === "text" && op.text === "אב",
      );
      const pdfBytes = renderResult.artifact?.bytes;

      expect(projectResult.ok).toBe(true);
      expect(renderResult.ok).toBe(true);
      expect(textOp).toMatchObject({
        op: "text",
        text: "אב",
        textEncoding: "utf16be",
        actualText: "אב",
      });
      expect(textOp?.op === "text" ? textOp.glyphs?.[0]?.unicode : undefined).toBe("ב");
      expect(decodePdf(pdfBytes)).toContain("/ActualText <FEFF05D005D1>");
      expect(projection.fallbacks).not.toContainEqual(
        expect.objectContaining({ code: "W_FONT_SHAPING_FALLBACK" }),
      );

      if (externalPdfTextOracleTest === test) {
        withTemporaryPdf(pdfBytes ?? new Uint8Array(), (pdfPath) => {
          const extractedText = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
          expect(extractedText).toContain("א");
          expect(extractedText).toContain("ב");
        });
      }
    },
  );

  shapingRtlFontTest(
    "orders mixed RTL, Latin, and neutral text by Unicode bidi levels",
    async () => {
      const plugin: DeckPlugin = {
        kind: "deckjsx.plugin",
        id: "test:fontkit-mixed-bidi",
        name: "test:fontkit-mixed-bidi",
        integration: {
          id: integrationContextId("test:fontkit-mixed-bidi"),
          fontAssets: [
            {
              key: "fontkit-mixed-bidi",
              family: "Fontkit Mixed Bidi",
              weight: 400,
              style: "normal",
              source: {
                kind: "bytes",
                bytes: new Uint8Array(readFileSync(shapingRtlFontPath)),
                mediaType: "font/ttf",
              },
            },
          ],
        },
      };
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.plugin(plugin);
      deck.slide({ name: "Fontkit Mixed Bidi" }, () => (
        <p style={{ direction: "rtl", fontFamily: "Fontkit Mixed Bidi", fontSize: 48 }}>
          אב (abc) 12
        </p>
      ));

      const projectResult = await deck.project({ format: "pdf", inspection: "none" });
      const renderResult = await deck.render(pdf({ inspection: "none" }));
      const projection = expectPdfPageModel(projectResult.projection);
      const textOp = projection.pages[0]?.content.find(
        (op) => op.op === "text" && op.text === "אב (abc) 12",
      );

      expect(projectResult.ok).toBe(true);
      expect(renderResult.ok).toBe(true);
      expect(textOp).toMatchObject({
        op: "text",
        textEncoding: "utf16be",
        actualText: "אב (abc) 12",
      });
      expect(
        textOp?.op === "text" ? textOp.glyphs?.map((glyph) => glyph.unicode).join("") : undefined,
      ).toBe("12 (abc) בא");
      expect(projection.fallbacks).not.toContainEqual(
        expect.objectContaining({ code: "W_TEXT_BIDI_FALLBACK" }),
      );
    },
  );

  shapingRtlFontTest("segments RTL visual runs by OpenType script before shaping", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:fontkit-mixed-script",
      name: "test:fontkit-mixed-script",
      integration: {
        id: integrationContextId("test:fontkit-mixed-script"),
        fontAssets: [
          {
            key: "fontkit-mixed-script",
            family: "Fontkit Mixed Script",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: new Uint8Array(readFileSync(shapingRtlFontPath)),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Fontkit Mixed Script" }, () => (
      <p style={{ direction: "rtl", fontFamily: "Fontkit Mixed Script", fontSize: 48 }}>אב لا</p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "אב لا",
    );

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({ op: "text", actualText: "אב لا" });
    expect(textOp?.op === "text" ? textOp.glyphs : undefined).toContainEqual(
      expect.objectContaining({ unicode: "لا" }),
    );
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_FONT_SHAPING_FALLBACK" }),
    );
  });

  test("uses registered plugin font asset bytes for Unicode PDF text", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:inter-unicode-font",
      name: "test:inter-unicode-font",
      integration: {
        id: integrationContextId("test:inter-unicode-font"),
        fontAssets: [
          {
            key: "inter-unicode-regular",
            family: "Inter",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Registered Unicode Font" }, () => (
      <p style={{ fontFamily: "Inter", fontWeight: 400 }}>こんにちは</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const unicodeText = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "こんにちは",
    );
    const unicodeFontId = unicodeText?.op === "text" ? unicodeText.fontId : undefined;
    const unicodeFont = projection.resources.fonts.find((font) => font.id === unicodeFontId);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNRESOLVED_FONT_GLYPH",
    );
    expect(unicodeText).toEqual(
      expect.objectContaining({
        textEncoding: "utf16be",
      }),
    );
    expect(unicodeFont).toEqual(
      expect.objectContaining({
        family: "Inter",
        fallback: false,
        sourceKey: "inter-unicode-regular",
        data: fontBytes,
        encoding: "identity-h",
      }),
    );
    expect(projection.fallbacks).toContainEqual(
      expect.objectContaining({
        code: "W_FONT_SHAPING_FALLBACK",
        kind: "text",
      }),
    );
    expect(unicodeFont?.name).not.toBe("FUnicode");
  });

  test("uses registered TrueType glyph widths when wrapping PDF text", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:measured-font-widths",
      name: "test:measured-font-widths",
      integration: {
        id: integrationContextId("test:measured-font-widths"),
        fontAssets: [
          {
            key: "measured-regular",
            family: "Measured",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat4ABWidths(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Measured Font Widths" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "260pt",
          height: 3,
          fontFamily: "Measured",
          fontSize: 100,
          overflowWrap: "anywhere",
        }}
      >
        ABAB
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];

    expect(result.ok).toBe(true);
    expect(textOps).toHaveLength(1);
    expect(textOps[0]).toMatchObject({ op: "text", text: "ABAB", x: 72, y: 72 });
  });

  test("uses registered TrueType glyph widths for shared PPTX auto-height", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:shared-measured-font-widths",
      name: "test:shared-measured-font-widths",
      integration: {
        id: integrationContextId("test:shared-measured-font-widths"),
        fontAssets: [
          {
            key: "shared-measured-regular",
            family: "Shared Measured",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat4ABWidths(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Shared Measured Font Widths" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "240pt",
          fontFamily: "Shared Measured",
          fontSize: 100,
          overflowWrap: "anywhere",
        }}
      >
        ABAB
      </p>
    ));

    const result = await deck.project({ format: "pptx", inspection: "none" });
    const text = result.projection?.slides[0]?.payload.drawing.children.find(
      (child) => child.kind === "text" && child.content.text === "ABAB",
    );

    expect(result.ok).toBe(true);
    expect(text).toMatchObject({ kind: "text", frame: { heightEmu: 3_048_000 } });
  });

  test("uses Helvetica-Bold glyph widths for shared PPTX auto-height", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Shared Helvetica Bold Widths" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "80pt",
          fontSize: 100,
          fontWeight: 700,
          overflowWrap: "anywhere",
        }}
      >
        iii
      </p>
    ));

    const result = await deck.project({ format: "pptx", inspection: "none" });
    const text = result.projection?.slides[0]?.payload.drawing.children.find(
      (child) => child.kind === "text" && child.content.text === "iii",
    );

    expect(result.ok).toBe(true);
    expect(text).toMatchObject({ kind: "text", frame: { heightEmu: 3_048_000 } });
  });

  test("uses inline run font metrics for shared PPTX auto-height", async () => {
    const regular = minimalTrueTypeWithFormat4ABWidths([400, 400, 400]);
    const bold = minimalTrueTypeWithFormat4ABWidths([1000, 1000, 1000]);
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:shared-inline-measured-font-widths",
      name: "test:shared-inline-measured-font-widths",
      integration: {
        id: integrationContextId("test:shared-inline-measured-font-widths"),
        fontAssets: [
          {
            key: "shared-inline-regular",
            family: "Shared Inline",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: regular, mediaType: "font/ttf" },
          },
          {
            key: "shared-inline-bold",
            family: "Shared Inline",
            weight: 700,
            style: "normal",
            source: { kind: "bytes", bytes: bold, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Shared Inline Measured Font Widths" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "180pt",
          fontFamily: "Shared Inline",
          fontSize: 100,
          overflowWrap: "anywhere",
        }}
      >
        AA<span style={{ fontWeight: 700 }}>BB</span>
      </p>
    ));

    const result = await deck.project({ format: "pptx", inspection: "none" });
    const text = result.projection?.slides[0]?.payload.drawing.children.find(
      (child) => child.kind === "text" && child.content.text === "AABB",
    );

    expect(result.ok).toBe(true);
    expect(text).toMatchObject({ kind: "text", frame: { heightEmu: 3_048_000 } });
  });

  test("uses registered TrueType glyph widths for right-aligned PDF tabs", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:measured-tab-widths",
      name: "test:measured-tab-widths",
      integration: {
        id: integrationContextId("test:measured-tab-widths"),
        fontAssets: [
          {
            key: "measured-tab-regular",
            family: "Measured Tab",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat4ABWidths(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Measured Tab Widths" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 6,
          height: 2,
          fontFamily: "Measured Tab",
          fontSize: 100,
          tabStops: [{ position: "5in", alignment: "right" }],
        }}
      >
        {"AB\tAB"}
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];

    expect(result.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "AB", x: 72, y: 72 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "AB", x: 302, y: 72 });
  });

  test("uses following inline run font widths for right-aligned PDF tabs", async () => {
    const regularBytes = minimalTrueTypeWithFormat4ABWidths();
    const boldBytes = minimalTrueTypeWithFormat4ABWidths([500, 900, 1000]);
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:mixed-run-tab-widths",
      name: "test:mixed-run-tab-widths",
      integration: {
        id: integrationContextId("test:mixed-run-tab-widths"),
        fontAssets: [
          {
            key: "mixed-run-regular",
            family: "Mixed Run",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: regularBytes, mediaType: "font/ttf" },
          },
          {
            key: "mixed-run-bold",
            family: "Mixed Run",
            weight: 700,
            style: "normal",
            source: { kind: "bytes", bytes: boldBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Mixed Run Tab Widths" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 6,
          height: 2,
          fontFamily: "Mixed Run",
          fontSize: 100,
          tabStops: [{ position: "5in", alignment: "right" }],
        }}
      >
        {"AB\t"}
        <span style={{ fontWeight: 700 }}>AB</span>
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const boldFont = projection.resources.fonts.find(
      (resource) => resource.id === (textOps[1]?.op === "text" ? textOps[1].fontId : undefined),
    );

    expect(result.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "AB", x: 72, y: 72 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "AB", x: 242, y: 72 });
    expect(boldFont).toEqual(
      expect.objectContaining({ family: "Mixed Run", weight: 700, sourceKey: "mixed-run-bold" }),
    );
  });

  test("uses mixed inline run widths when shrinking PDF tabs", async () => {
    const regularBytes = minimalTrueTypeWithFormat4ABWidths();
    const boldBytes = minimalTrueTypeWithFormat4ABWidths([500, 900, 1000]);
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:mixed-run-shrink-widths",
      name: "test:mixed-run-shrink-widths",
      integration: {
        id: integrationContextId("test:mixed-run-shrink-widths"),
        fontAssets: [
          {
            key: "mixed-run-shrink-regular",
            family: "Mixed Run Shrink",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: regularBytes, mediaType: "font/ttf" },
          },
          {
            key: "mixed-run-shrink-bold",
            family: "Mixed Run Shrink",
            weight: 700,
            style: "normal",
            source: { kind: "bytes", bytes: boldBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Mixed Run Shrink Widths" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          fit: "shrink",
          fontFamily: "Mixed Run Shrink",
          fontSize: 100,
          tabStops: [{ position: "2in", alignment: "right" }],
        }}
      >
        {"AB\t"}
        <span style={{ fontWeight: 700 }}>AB</span>
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];

    expect(result.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "AB", x: 72, y: 72, fontSize: 45 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "AB", x: 130.5, y: 72, fontSize: 45 });
  });

  test("warns when an embedded Unicode PDF font cannot map used text glyphs", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:partial-unicode-font",
      name: "test:partial-unicode-font",
      integration: {
        id: integrationContextId("test:partial-unicode-font"),
        fontAssets: [
          {
            key: "partial-unicode-regular",
            family: "Partial Unicode",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat4ABWidths(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Missing Unicode Glyph" }, () => (
      <p style={{ fontFamily: "Partial Unicode", fontWeight: 400 }}>AΩ</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const unicodeText = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Ω",
    );

    expect(result.ok).toBe(false);
    expect(unicodeText).toEqual(
      expect.objectContaining({
        textEncoding: "utf16be",
      }),
    );
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PDF_UNRESOLVED_FONT_GLYPH",
        message: expect.stringContaining("Ω"),
      }),
    );
  });

  test("does not warn for non-BMP text covered by an embedded Unicode PDF font", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:emoji-unicode-font",
      name: "test:emoji-unicode-font",
      integration: {
        id: integrationContextId("test:emoji-unicode-font"),
        fontAssets: [
          {
            key: "emoji-unicode-regular",
            family: "Emoji Unicode",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12Emoji(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Registered Emoji Font" }, () => (
      <p style={{ fontFamily: "Emoji Unicode", fontWeight: 400 }}>😀</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const codes = result.diagnostics.items.map((item) => item.code);
    const unicodeText = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "😀",
    );
    const unicodeFontId = unicodeText?.op === "text" ? unicodeText.fontId : undefined;
    const unicodeFont = projection.resources.fonts.find((font) => font.id === unicodeFontId);

    expect(result.ok).toBe(true);
    expect(codes).not.toContain("W_PDF_NON_BMP_TEXT");
    expect(codes).not.toContain("E_PDF_UNRESOLVED_FONT_GLYPH");
    expect(unicodeText).toEqual(
      expect.objectContaining({
        textEncoding: "utf16be",
      }),
    );
    expect(unicodeFont).toEqual(
      expect.objectContaining({
        family: "Emoji Unicode",
        encoding: "identity-h",
        data: expect.any(Uint8Array),
      }),
    );
  });

  test("selects a unicodeRange matching registered PDF font for rendered Unicode text", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:unicode-range-font",
      name: "test:unicode-range-font",
      integration: {
        id: integrationContextId("test:unicode-range-font"),
        fontAssets: [
          {
            key: "range-latin-regular",
            family: "Range Font",
            weight: 400,
            style: "normal",
            unicodeRange: ["U+0041-005A"],
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat4ABWidths(),
              mediaType: "font/ttf",
            },
          },
          {
            key: "range-emoji-regular",
            family: "Range Font",
            weight: 400,
            style: "normal",
            unicodeRange: ["U+1F600"],
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12Emoji(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Unicode Range Font" }, () => (
      <p style={{ fontFamily: "Range Font", fontWeight: 400 }}>😀</p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const codes = renderResult.diagnostics.items.map((item) => item.code);
    const unicodeText = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "😀",
    );
    const unicodeFontId = unicodeText?.op === "text" ? unicodeText.fontId : undefined;
    const unicodeFont = projection.resources.fonts.find((font) => font.id === unicodeFontId);
    const pdfBytes = decodePdf(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(codes).not.toContain("E_PDF_UNRESOLVED_FONT_GLYPH");
    expect(codes).not.toContain("W_PDF_NON_BMP_TEXT");
    expect(unicodeFont).toEqual(
      expect.objectContaining({
        sourceKey: "range-emoji-regular",
        encoding: "identity-h",
      }),
    );
    expect(pdfBytes).toContain("/Subtype /CIDFontType2");
    expect(pdfBytes).toContain("/CIDSet");
    expect(pdfBytes).toContain("<0001> <D83DDE00>");
    expect(pdfBytes).toContain("<0001> Tj");
  });

  externalPdfTextOracleTest(
    "emits embedded non-BMP Unicode text that external readers can extract",
    async () => {
      const plugin: DeckPlugin = {
        kind: "deckjsx.plugin",
        id: "test:external-emoji-unicode-font",
        name: "test:external-emoji-unicode-font",
        integration: {
          id: integrationContextId("test:external-emoji-unicode-font"),
          fontAssets: [
            {
              key: "external-emoji-regular",
              family: "External Emoji",
              weight: 400,
              style: "normal",
              unicodeRange: ["U+1F600"],
              source: {
                kind: "bytes",
                bytes: minimalTrueTypeWithFormat12Emoji(),
                mediaType: "font/ttf",
              },
            },
          ],
        },
      };
      const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      deck.plugin(plugin);
      deck.slide({ name: "External Emoji PDF" }, () => (
        <p style={{ fontFamily: "External Emoji", fontWeight: 400 }}>😀</p>
      ));

      const result = await deck.render(pdf({ inspection: "none" }));
      const bytes = result.artifact?.bytes;

      expect(result.ok).toBe(true);
      expect(bytes).toBeDefined();

      withTemporaryPdf(bytes ?? new Uint8Array(), (pdfPath, directory) => {
        expect(() => execFileSync("qpdf", ["--check", pdfPath], { stdio: "pipe" })).not.toThrow();

        const text = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
        const renderPrefix = join(directory, "rendered");

        expect(text).toContain("😀");

        execFileSync("pdftoppm", ["-png", pdfPath, renderPrefix], { stdio: "pipe" });

        const pngBytes = readFileSync(`${renderPrefix}-1.png`);
        expect(Array.from(pngBytes.slice(0, 8))).toEqual([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
      });
    },
  );

  test("splits mixed text across unicodeRange matching registered PDF fonts", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:mixed-unicode-range-font",
      name: "test:mixed-unicode-range-font",
      integration: {
        id: integrationContextId("test:mixed-unicode-range-font"),
        fontAssets: [
          {
            key: "mixed-range-latin-regular",
            family: "Mixed Range Font",
            weight: 400,
            style: "normal",
            unicodeRange: ["U+0041-005A"],
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat4ABWidths(),
              mediaType: "font/ttf",
            },
          },
          {
            key: "mixed-range-emoji-regular",
            family: "Mixed Range Font",
            weight: 400,
            style: "normal",
            unicodeRange: ["U+1F600"],
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12Emoji(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Mixed Unicode Range Font" }, () => (
      <p style={{ fontFamily: "Mixed Range Font", fontWeight: 400 }}>A😀</p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const codes = renderResult.diagnostics.items.map((item) => item.code);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const asciiText = textOps.find((op) => op.op === "text" && op.text === "A");
    const emojiText = textOps.find((op) => op.op === "text" && op.text === "😀");
    const asciiFont = projection.resources.fonts.find(
      (font) => asciiText?.op === "text" && font.id === asciiText.fontId,
    );
    const emojiFont = projection.resources.fonts.find(
      (font) => emojiText?.op === "text" && font.id === emojiText.fontId,
    );
    const pdfBytes = decodePdf(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(codes).not.toContain("W_PDF_FONT_FALLBACK");
    expect(codes).not.toContain("E_PDF_UNRESOLVED_FONT_GLYPH");
    expect(codes).not.toContain("W_PDF_NON_BMP_TEXT");
    expect(textOps.map((op) => (op.op === "text" ? op.text : ""))).toEqual(["A", "😀"]);
    expect(asciiText).toEqual(expect.objectContaining({ text: "A", textEncoding: "utf16be" }));
    expect(emojiText).toEqual(expect.objectContaining({ text: "😀", textEncoding: "utf16be" }));
    expect(asciiFont).toEqual(
      expect.objectContaining({
        sourceKey: "mixed-range-latin-regular",
      }),
    );
    expect(emojiFont).toEqual(
      expect.objectContaining({
        sourceKey: "mixed-range-emoji-regular",
        encoding: "identity-h",
      }),
    );
    expect(asciiFont).toEqual(expect.objectContaining({ encoding: "identity-h" }));
    expect(pdfBytes).not.toContain("(A) Tj");
    expect(pdfBytes).toContain("<0001> <D83DDE00>");
    expect(pdfBytes).toContain("<0001> Tj");
  });

  test("uses later fontFamily candidates when the primary cmap lacks a Unicode glyph", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:family-list-fallback",
      name: "test:family-list-fallback",
      integration: {
        id: integrationContextId("test:family-list-fallback"),
        fontAssets: [
          {
            key: "family-list-primary",
            family: "Primary Latin",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat4ABWidths(),
              mediaType: "font/ttf",
            },
          },
          {
            key: "family-list-emoji",
            family: "Emoji Fallback",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12Emoji(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Family List Fallback" }, () => (
      <p style={{ fontFamily: '"Primary Latin", "Emoji Fallback"' }}>A😀</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOps =
      projection.pages[0]?.content.filter((operation) => operation.op === "text") ?? [];
    const sourceKeys = textOps.flatMap((operation) => {
      const font = projection.resources.fonts.find(
        (resource) => operation.op === "text" && resource.id === operation.fontId,
      );
      return font?.sourceKey ? [font.sourceKey] : [];
    });

    expect(result.ok).toBe(true);
    expect(textOps.map((operation) => (operation.op === "text" ? operation.text : ""))).toEqual([
      "A",
      "😀",
    ]);
    expect(sourceKeys).toEqual(["family-list-primary", "family-list-emoji"]);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
  });

  test("uses fallback family glyph widths for shared auto-height", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:family-list-fallback-layout",
      name: "test:family-list-fallback-layout",
      integration: {
        id: integrationContextId("test:family-list-fallback-layout"),
        fontAssets: [
          {
            key: "family-layout-primary",
            family: "Primary Latin",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat4ABWidths([500, 600, 700]),
              mediaType: "font/ttf",
            },
          },
          {
            key: "family-layout-emoji",
            family: "Emoji Fallback",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12Emoji([500, 300, 700]),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Family List Fallback Layout" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "100pt",
          fontFamily: '"Primary Latin", "Emoji Fallback"',
          fontSize: 100,
          overflowWrap: "anywhere",
        }}
      >
        A😀
      </p>
    ));

    const result = await deck.project({ format: "pptx", inspection: "none" });
    const text = result.projection?.slides[0]?.payload.drawing.children.find(
      (child) => child.kind === "text" && child.content.text === "A😀",
    );

    expect(result.ok).toBe(true);
    expect(text).toMatchObject({ kind: "text", frame: { heightEmu: 1_524_000 } });
  });

  test("splits mixed Unicode text across unicodeRange matching registered PDF fonts", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:mixed-unicode-only-range-font",
      name: "test:mixed-unicode-only-range-font",
      integration: {
        id: integrationContextId("test:mixed-unicode-only-range-font"),
        fontAssets: [
          {
            key: "mixed-range-hiragana-regular",
            family: "Mixed Unicode Only Range Font",
            weight: 400,
            style: "normal",
            unicodeRange: ["U+3040-309F"],
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12HiraganaA(),
              mediaType: "font/ttf",
            },
          },
          {
            key: "mixed-range-unicode-emoji-regular",
            family: "Mixed Unicode Only Range Font",
            weight: 400,
            style: "normal",
            unicodeRange: ["U+1F600"],
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12Emoji(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Mixed Unicode Only Range Font" }, () => (
      <p style={{ fontFamily: "Mixed Unicode Only Range Font", fontWeight: 400 }}>あ😀</p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const codes = renderResult.diagnostics.items.map((item) => item.code);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const hiraganaText = textOps.find((op) => op.op === "text" && op.text === "あ");
    const emojiText = textOps.find((op) => op.op === "text" && op.text === "😀");
    const hiraganaFont = projection.resources.fonts.find(
      (font) => hiraganaText?.op === "text" && font.id === hiraganaText.fontId,
    );
    const emojiFont = projection.resources.fonts.find(
      (font) => emojiText?.op === "text" && font.id === emojiText.fontId,
    );
    const pdfBytes = decodePdf(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(codes).not.toContain("W_PDF_FONT_FALLBACK");
    expect(codes).not.toContain("E_PDF_UNRESOLVED_FONT_GLYPH");
    expect(codes).not.toContain("W_PDF_NON_BMP_TEXT");
    expect(textOps.map((op) => (op.op === "text" ? op.text : ""))).toEqual(["あ", "😀"]);
    expect(hiraganaText).toEqual(expect.objectContaining({ text: "あ", textEncoding: "utf16be" }));
    expect(emojiText).toEqual(expect.objectContaining({ text: "😀", textEncoding: "utf16be" }));
    expect(hiraganaFont).toEqual(
      expect.objectContaining({
        sourceKey: "mixed-range-hiragana-regular",
        encoding: "identity-h",
      }),
    );
    expect(emojiFont).toEqual(
      expect.objectContaining({
        sourceKey: "mixed-range-unicode-emoji-regular",
        encoding: "identity-h",
      }),
    );
    expect(pdfBytes).toContain("<0001> <3042>");
    expect(pdfBytes).toContain("<0001> <D83DDE00>");
  });

  test("does not warn when whitespace separates unicodeRange matched PDF fonts", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:spaced-unicode-range-font",
      name: "test:spaced-unicode-range-font",
      integration: {
        id: integrationContextId("test:spaced-unicode-range-font"),
        fontAssets: [
          {
            key: "spaced-range-hiragana-regular",
            family: "Spaced Unicode Range Font",
            weight: 400,
            style: "normal",
            unicodeRange: ["U+3040-309F"],
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12HiraganaA(),
              mediaType: "font/ttf",
            },
          },
          {
            key: "spaced-range-emoji-regular",
            family: "Spaced Unicode Range Font",
            weight: 400,
            style: "normal",
            unicodeRange: ["U+1F600"],
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12Emoji(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Spaced Unicode Range Font" }, () => (
      <p style={{ fontFamily: "Spaced Unicode Range Font", fontWeight: 400 }}>あ 😀</p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const codes = renderResult.diagnostics.items.map((item) => item.code);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const spaceText = textOps.find((op) => op.op === "text" && op.text === " ");
    const spaceFont = projection.resources.fonts.find(
      (font) => spaceText?.op === "text" && font.id === spaceText.fontId,
    );

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(codes).not.toContain("W_PDF_FONT_FALLBACK");
    expect(codes).not.toContain("E_PDF_UNRESOLVED_FONT_GLYPH");
    expect(codes).not.toContain("W_PDF_NON_BMP_TEXT");
    expect(textOps.map((op) => (op.op === "text" ? op.text : ""))).toEqual(["あ", " ", "😀"]);
    expect(spaceFont).toEqual(
      expect.objectContaining({
        family: "Helvetica",
        fallback: true,
      }),
    );
  });

  test("does not warn when ASCII punctuation separates unicodeRange matched PDF fonts", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:punctuated-unicode-range-font",
      name: "test:punctuated-unicode-range-font",
      integration: {
        id: integrationContextId("test:punctuated-unicode-range-font"),
        fontAssets: [
          {
            key: "punctuated-range-hiragana-regular",
            family: "Punctuated Unicode Range Font",
            weight: 400,
            style: "normal",
            unicodeRange: ["U+3040-309F"],
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12HiraganaA(),
              mediaType: "font/ttf",
            },
          },
          {
            key: "punctuated-range-emoji-regular",
            family: "Punctuated Unicode Range Font",
            weight: 400,
            style: "normal",
            unicodeRange: ["U+1F600"],
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12Emoji(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Punctuated Unicode Range Font" }, () => (
      <p style={{ fontFamily: "Punctuated Unicode Range Font", fontWeight: 400 }}>あ, 😀</p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const codes = renderResult.diagnostics.items.map((item) => item.code);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const punctuationText = textOps.find((op) => op.op === "text" && op.text === ", ");
    const punctuationFont = projection.resources.fonts.find(
      (font) => punctuationText?.op === "text" && font.id === punctuationText.fontId,
    );

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(codes).not.toContain("W_PDF_FONT_FALLBACK");
    expect(codes).not.toContain("E_PDF_UNRESOLVED_FONT_GLYPH");
    expect(codes).not.toContain("W_PDF_NON_BMP_TEXT");
    expect(textOps.map((op) => (op.op === "text" ? op.text : ""))).toEqual(["あ", ", ", "😀"]);
    expect(punctuationFont).toEqual(
      expect.objectContaining({
        family: "Helvetica",
        fallback: true,
      }),
    );
  });

  test("uses Helvetica when an embedded font cannot map WinAnsi text glyphs", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:winansi-missing-glyph-font",
      name: "test:winansi-missing-glyph-font",
      integration: {
        id: integrationContextId("test:winansi-missing-glyph-font"),
        fontAssets: [
          {
            key: "winansi-missing-glyph-regular",
            family: "Emoji Only",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12Emoji(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Missing WinAnsi Glyph" }, () => (
      <p style={{ fontFamily: "Emoji Only", fontWeight: 400 }}>A</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text" && op.text === "A");
    const font = projection.resources.fonts.find(
      (resource) => textOp?.op === "text" && resource.id === textOp.fontId,
    );

    expect(result.ok).toBe(true);
    expect(font).toEqual(
      expect.objectContaining({
        family: "Helvetica",
        fallback: true,
      }),
    );
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_FONT_FALLBACK",
      }),
    );
  });

  test("splits mixed WinAnsi and Unicode text across PDF font resources", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:mixed-emoji-unicode-font",
      name: "test:mixed-emoji-unicode-font",
      integration: {
        id: integrationContextId("test:mixed-emoji-unicode-font"),
        fontAssets: [
          {
            key: "mixed-emoji-unicode-regular",
            family: "Mixed Emoji Unicode",
            weight: 400,
            style: "normal",
            source: {
              kind: "bytes",
              bytes: minimalTrueTypeWithFormat12AAndEmoji(),
              mediaType: "font/ttf",
            },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Mixed Emoji Font" }, () => (
      <p style={{ fontFamily: "Mixed Emoji Unicode", fontWeight: 400 }}>A😀</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const codes = result.diagnostics.items.map((item) => item.code);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const asciiText = textOps.find((op) => op.op === "text" && op.text === "A");
    const emojiText = textOps.find((op) => op.op === "text" && op.text === "😀");
    const asciiFont = projection.resources.fonts.find(
      (font) => asciiText?.op === "text" && font.id === asciiText.fontId,
    );
    const emojiFont = projection.resources.fonts.find(
      (font) => emojiText?.op === "text" && font.id === emojiText.fontId,
    );

    expect(result.ok).toBe(true);
    expect(codes).not.toContain("E_PDF_UNRESOLVED_FONT_GLYPH");
    expect(textOps.map((op) => (op.op === "text" ? op.text : ""))).toEqual(["A", "😀"]);
    expect(asciiText).toEqual(
      expect.objectContaining({
        text: "A",
      }),
    );
    expect(asciiText).toEqual(
      expect.objectContaining({
        text: "A",
        textEncoding: "utf16be",
      }),
    );
    expect(emojiText).toEqual(
      expect.objectContaining({
        text: "😀",
        textEncoding: "utf16be",
      }),
    );
    expect(asciiFont?.encoding).toBe("identity-h");
    expect(emojiFont).toEqual(
      expect.objectContaining({
        family: "Mixed Emoji Unicode",
        encoding: "identity-h",
      }),
    );
  });

  test("registered plugin font resource names cannot collide with default PDF font names", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:colliding-font-key",
      name: "test:colliding-font-key",
      integration: {
        id: integrationContextId("test:colliding-font-key"),
        fontAssets: [
          {
            key: "F1",
            family: "Inter",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Colliding Font Key" }, () => (
      <>
        <p>Default text</p>
        <p style={{ fontFamily: "Inter", fontWeight: 400 }}>Registered text</p>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const pageFontNames = projection.resources.fonts
      .filter((font) => projection.pages[0]?.resources.fonts.includes(font.id))
      .map((font) => font.name);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_MODEL_DUPLICATE_PAGE_FONT_RESOURCE_NAME",
    );
    expect(new Set(pageFontNames).size).toBe(pageFontNames.length);
    expect(pageFontNames).toEqual(["F1", "F2Unicode"]);
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Inter",
        fallback: false,
        name: "F2Unicode",
        encoding: "identity-h",
        sourceKey: "F1",
        data: fontBytes,
      }),
    );
  });

  test("registered plugin font resource ids do not collide with default or fallback-shaped keys", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:font-id-collisions",
      name: "test:font-id-collisions",
      integration: {
        id: integrationContextId("test:font-id-collisions"),
        fontAssets: [
          {
            key: "default-helvetica",
            family: "Inter",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
          {
            key: "fallback-missing-sans-700-normal",
            family: "Source Sans",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Font Id Collisions" }, () => (
      <>
        <p>Default text</p>
        <p style={{ fontFamily: "Inter" }}>Registered default-shaped key</p>
        <p style={{ fontFamily: "Source Sans" }}>Registered fallback-shaped key</p>
        <p style={{ fontFamily: "Missing Sans", fontWeight: 700 }}>Missing fallback</p>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const fontIds = projection.resources.fonts.map((font) => font.id);

    expect(result.ok).toBe(true);
    expect(new Set(fontIds).size).toBe(fontIds.length);
    expect(projection.resources.fonts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pdf:resource:font:default-helvetica",
          family: "Helvetica",
        }),
        expect.objectContaining({
          family: "Inter",
          fallback: false,
          sourceKey: "default-helvetica",
          data: fontBytes,
        }),
        expect.objectContaining({
          family: "Source Sans",
          fallback: false,
          sourceKey: "fallback-missing-sans-700-normal",
          data: fontBytes,
        }),
        expect.objectContaining({
          id: expect.stringMatching(
            /^pdf:resource:font:fallback-missing-sans-700-normal-[0-9a-f]{8}$/u,
          ),
          family: "Helvetica",
          fallback: true,
        }),
      ]),
    );
  });

  test("registered plugin font resource ids do not collide for families with the same slug", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:font-request-slug-collisions",
      name: "test:font-request-slug-collisions",
      integration: {
        id: integrationContextId("test:font-request-slug-collisions"),
        fontAssets: [
          {
            key: "a-space-b",
            family: "A B",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
          {
            key: "a-dash-b",
            family: "A-B",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Font Request Slug Collisions" }, () => (
      <>
        <p style={{ fontFamily: "A B" }}>Space family</p>
        <p style={{ fontFamily: "A-B" }}>Dash family</p>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const registeredFonts = projection.resources.fonts.filter(
      (font) => font.sourceKey === "a-space-b" || font.sourceKey === "a-dash-b",
    );
    const registeredWinAnsiFonts = registeredFonts.filter((font) => font.encoding !== "identity-h");
    const registeredUnicodeFonts = registeredFonts.filter((font) => font.encoding === "identity-h");
    const textFontIds = projection.pages[0]?.content
      .filter((op) => op.op === "text")
      .map((op) => op.fontId);

    expect(result.ok).toBe(true);
    expect(registeredFonts).toHaveLength(4);
    expect(registeredWinAnsiFonts).toHaveLength(2);
    expect(registeredUnicodeFonts).toHaveLength(2);
    expect(new Set(registeredFonts.map((font) => font.id)).size).toBe(4);
    expect(registeredWinAnsiFonts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: "A B",
          fallback: false,
          sourceKey: "a-space-b",
          data: fontBytes,
        }),
        expect.objectContaining({
          family: "A-B",
          fallback: false,
          sourceKey: "a-dash-b",
          data: fontBytes,
        }),
      ]),
    );
    expect(registeredUnicodeFonts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: "A B",
          fallback: false,
          sourceKey: "a-space-b",
          data: fontBytes,
          encoding: "identity-h",
        }),
        expect.objectContaining({
          family: "A-B",
          fallback: false,
          sourceKey: "a-dash-b",
          data: fontBytes,
          encoding: "identity-h",
        }),
      ]),
    );
    expect(textFontIds).toHaveLength(2);
    expect(new Set(textFontIds).size).toBe(2);
    expect(textFontIds).toEqual(
      expect.arrayContaining(registeredUnicodeFonts.map((font) => font.id)),
    );
  });

  test("registered inline span font asset keeps a PDF font fallback warning", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:inline-inter-font",
      name: "test:inline-inter-font",
      integration: {
        id: integrationContextId("test:inline-inter-font"),
        fontAssets: [
          {
            key: "inline-inter",
            family: "Inter",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Inline Font" }, () => (
      <p>
        Hi <span style={{ fontFamily: "Inter" }}>there</span>
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Inter",
        fallback: false,
        sourceKey: "inline-inter",
        data: fontBytes,
      }),
    );
  });

  test("missing inline span font family emits a PDF fallback warning", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing Inline Font" }, () => (
      <p>
        Hi <span style={{ fontFamily: "Missing Inline" }}>there</span>
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_FONT_FALLBACK",
        message:
          'PDF projection used Helvetica for missing font request family "Missing Inline", weight 400, style normal.',
      }),
    );
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Helvetica",
        fallback: true,
      }),
    );
  });

  test("missing font family projects with a nonblocking PDF fallback warning", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing Font" }, () => (
      <p style={{ fontFamily: "Missing Sans" }}>fallback</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PDF_FONT_FALLBACK", severity: "warning" }),
    );
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Helvetica",
        fallback: true,
      }),
    );
  });

  test("malformed plugin font asset registration is reported as an integration diagnostic", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:malformed-font",
      name: "test:malformed-font",
      integration: {
        id: integrationContextId("test:malformed-font"),
        fontAssets: [
          {
            key: "broken-weight",
            family: "Broken",
            weight: Number.NaN,
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    } as never;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Malformed Font" }, () => <p style={{ fontFamily: "Broken" }}>malformed</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        message: "Deck plugin integration.fontAssets must be an array of Font Asset Registrations.",
      }),
    );
  });

  test("embeds registered plugin font asset data URIs in PDF font resources", async () => {
    const fontDataUri = `data:font/ttf;base64,${Buffer.from(fontBytes).toString("base64")}`;
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:data-uri-font",
      name: "test:data-uri-font",
      integration: {
        id: integrationContextId("test:data-uri-font"),
        fontAssets: [
          {
            key: "data-uri-font",
            family: "Data URI Font",
            source: { kind: "data", data: fontDataUri },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Data URI Font" }, () => (
      <p style={{ fontFamily: "Data URI Font" }}>data</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("E_PLUGIN_INVALID");
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Data URI Font",
        fallback: false,
        sourceKey: "data-uri-font",
        data: fontBytes,
      }),
    );
  });

  test("loads registered plugin font asset paths before PDF font projection", async () => {
    let loadCount = 0;
    const loadContexts: { readonly sourceField: string; readonly path?: string }[] = [];
    const loader: AssetLoader = {
      resolverIdentity: "test:path-font-loader",
      async load({ source, sourceField }) {
        if (source.kind !== "path") {
          return undefined;
        }
        loadCount += 1;
        loadContexts.push({ sourceField, path: source.path });
        return {
          ok: true,
          value: {
            bytes: fontBytes,
            mediaType: "font/ttf",
            extension: "ttf",
            byteLength: fontBytes.byteLength,
          },
        };
      },
    };
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:path-font",
      name: "test:path-font",
      integration: {
        id: integrationContextId("test:path-font"),
        assetLoaders: [loader],
        fontAssets: [
          {
            key: "path-font",
            family: "Path Font",
            source: { kind: "path", path: "./PathFont.ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Path Font" }, () => <p style={{ fontFamily: "Path Font" }}>path</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(loadCount).toBe(1);
    expect(loadContexts).toEqual([{ sourceField: "font", path: "./PathFont.ttf" }]);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Path Font",
        fallback: false,
        sourceKey: "path-font",
        data: fontBytes,
      }),
    );
  });

  test("reports registered plugin font asset path loader failures before PDF font projection", async () => {
    const loader: AssetLoader = {
      resolverIdentity: "test:broken-path-font-loader",
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        throw new Error("font file is missing");
      },
    };
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:broken-path-font",
      name: "test:broken-path-font",
      integration: {
        id: integrationContextId("test:broken-path-font"),
        assetLoaders: [loader],
        fontAssets: [
          {
            key: "broken-path-font",
            family: "Broken Path Font",
            source: { kind: "path", path: "./MissingFont.ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Broken Path Font" }, () => (
      <p style={{ fontFamily: "Broken Path Font" }}>fallback</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PROJECT_ASSET_LOAD_FAILED",
        severity: "error",
        message: expect.stringContaining("font file is missing"),
      }),
    );
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_FONT_FALLBACK",
        severity: "warning",
        message: expect.stringContaining("Broken Path Font"),
      }),
    );
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Helvetica",
        fallback: true,
        sourceKey: "broken-path-font",
      }),
    );
  });

  test("font asset registration defaults match regular normal but not bold", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:default-font",
      name: "test:default-font",
      integration: {
        id: integrationContextId("test:default-font"),
        fontAssets: [
          {
            key: "default-font",
            family: "Default Font",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Default Font" }, () => (
      <>
        <p style={{ fontFamily: "Default Font" }}>regular</p>
        <p style={{ fontFamily: "Default Font", fontWeight: 700 }}>bold</p>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Default Font",
        fallback: false,
        sourceKey: "default-font",
        data: fontBytes,
        weight: 400,
        style: "normal",
      }),
    );
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_FONT_FALLBACK",
        message:
          'PDF projection used Helvetica for missing font request family "Default Font", weight 700, style normal.',
      }),
    );
  });

  test("missing same family at multiple weights creates distinct fallback diagnostics and resources", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing Weights" }, () => (
      <>
        <p style={{ fontFamily: "Missing Multi", fontWeight: 400 }}>regular</p>
        <p style={{ fontFamily: "Missing Multi", fontWeight: 700 }}>bold</p>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const fallbackFonts = projection.resources.fonts.filter((font) => font.fallback);
    const fallbackWarnings = result.diagnostics.items.filter(
      (item) => item.code === "W_PDF_FONT_FALLBACK",
    );

    expect(fallbackFonts).toHaveLength(2);
    expect(new Set(fallbackFonts.map((font) => font.id)).size).toBe(2);
    expect(fallbackWarnings).toHaveLength(2);
    expect(new Set(fallbackWarnings.map((warning) => warning.message)).size).toBe(2);
  });

  test("page font resources only include fonts referenced by that page content", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Regular" }, () => (
      <p style={{ fontFamily: "Missing Per Page", fontWeight: 400 }}>regular</p>
    ));
    deck.slide({ name: "Bold" }, () => (
      <p style={{ fontFamily: "Missing Per Page", fontWeight: 700 }}>bold</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(projection.resources.fonts).toHaveLength(2);
    expect(projection.pages).toHaveLength(2);
    expect(projection.pages[0]?.resources.fonts).toHaveLength(1);
    expect(projection.pages[1]?.resources.fonts).toHaveLength(1);
    expect(projection.pages[0]?.resources.fonts[0]).not.toBe(
      projection.pages[1]?.resources.fonts[0],
    );
  });
});

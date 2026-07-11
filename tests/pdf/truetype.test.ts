import { describe, expect, test } from "vite-plus/test";
import { pdfWinAnsiByte, pdfWinAnsiCodePoint } from "@/src/projection/pdf/text-encoding";
import { parseTrueTypeFontKerning, parseTrueTypeFontMetrics } from "@/src/writers/pdf/truetype";

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
  advanceWidths: readonly number[] = [500, 600, 700],
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
    ...uint16(advanceWidths.length),
  ]);
  const hmtx = paddedTable(advanceWidths.flatMap((width) => [...uint16(width), ...int16(0)]));
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

function minimalTrueTypeWithFormat4ABWidths(): Uint8Array {
  return minimalTrueTypeWithCmap([
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
  ]);
}

function minimalTrueTypeWithFormat12ABWidths(): Uint8Array {
  return minimalTrueTypeWithCmap([
    ...uint16(12),
    ...uint16(0),
    ...uint32(28),
    ...uint32(0),
    ...uint32(1),
    ...uint32(65),
    ...uint32(66),
    ...uint32(1),
  ]);
}

function minimalTrueTypeWithOs2CapHeight(): Uint8Array {
  const os2 = paddedTable([...uint16(2), ...Array.from({ length: 86 }, () => 0), ...int16(700)]);
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
    undefined,
    [{ name: "OS/2", bytes: os2 }],
  );
}

function minimalTrueTypeWithABKerning(): Uint8Array {
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
    undefined,
    [{ name: "kern", bytes: kern }],
  );
}

function minimalTrueTypeWithGposPairKerning(
  format: 1 | 2,
  adjustments: readonly number[] = [-120],
): Uint8Array {
  const coverage = [...uint16(1), ...uint16(1), ...uint16(1)];
  const valueFormat = uint16(4);
  const pairPositioningForAdjustment = (adjustment: number) =>
    format === 1
      ? [
          ...uint16(1),
          ...uint16(18),
          ...valueFormat,
          ...uint16(0),
          ...uint16(1),
          ...uint16(12),
          ...uint16(1),
          ...uint16(2),
          ...int16(adjustment),
          ...coverage,
        ]
      : [
          ...uint16(2),
          ...uint16(40),
          ...valueFormat,
          ...uint16(0),
          ...uint16(24),
          ...uint16(32),
          ...uint16(2),
          ...uint16(2),
          ...int16(0),
          ...int16(0),
          ...int16(0),
          ...int16(adjustment),
          ...uint16(1),
          ...uint16(1),
          ...uint16(1),
          ...uint16(1),
          ...uint16(1),
          ...uint16(2),
          ...uint16(1),
          ...uint16(1),
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
    ...uint16(adjustments.length),
    ...adjustments.flatMap((_, index) => uint16(index)),
  ];
  const lookupTables = adjustments.map((adjustment) => [
    ...uint16(2),
    ...uint16(0),
    ...uint16(1),
    ...uint16(8),
    ...pairPositioningForAdjustment(adjustment),
  ]);
  const lookupListOffset = 40 + adjustments.length * 2;
  const lookupListHeaderLength = 2 + adjustments.length * 2;
  const lookupOffsets: number[] = [];
  let lookupOffset = lookupListHeaderLength;
  lookupTables.forEach((table) => {
    lookupOffsets.push(lookupOffset);
    lookupOffset += table.length;
  });
  const lookupList = [
    ...uint16(adjustments.length),
    ...lookupOffsets.flatMap((offset) => uint16(offset)),
    ...lookupTables.flat(),
  ];
  const gpos = paddedTable([
    ...uint16(1),
    ...uint16(0),
    ...uint16(10),
    ...uint16(28),
    ...uint16(lookupListOffset),
    ...scriptList,
    ...featureList,
    ...lookupList,
  ]);
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
    undefined,
    [{ name: "GPOS", bytes: gpos }],
  );
}

function minimalTrueTypeWithCp1252EuroWidth(): Uint8Array {
  return minimalTrueTypeWithCmap(
    [
      ...uint16(12),
      ...uint16(0),
      ...uint32(40),
      ...uint32(0),
      ...uint32(2),
      ...uint32(0x80),
      ...uint32(0x80),
      ...uint32(1),
      ...uint32(0x20ac),
      ...uint32(0x20ac),
      ...uint32(2),
    ],
    [500, 600, 900],
  );
}

describe("TrueType PDF metrics", () => {
  test("round-trips defined WinAnsi bytes through CP1252 Unicode code points", () => {
    expect(pdfWinAnsiCodePoint(0x80)).toBe(0x20ac);
    expect(pdfWinAnsiCodePoint(0x95)).toBe(0x2022);
    expect(pdfWinAnsiCodePoint(0x81)).toBeUndefined();
    expect(pdfWinAnsiByte("€")).toBe(0x80);
    expect(pdfWinAnsiByte("•")).toBe(0x95);

    for (let byte = 0x20; byte <= 0xff; byte += 1) {
      const codePoint = pdfWinAnsiCodePoint(byte);
      if (codePoint !== undefined) {
        expect(pdfWinAnsiByte(String.fromCodePoint(codePoint))).toBe(byte);
      }
    }
  });

  test("parses WinAnsi widths and descriptor metrics from TrueType tables", () => {
    const metrics = parseTrueTypeFontMetrics(minimalTrueTypeWithFormat4ABWidths());
    const widths = metrics?.winAnsiWidths;

    expect(widths).toHaveLength(224);
    expect(widths?.[65 - 32]).toBe(600);
    expect(widths?.[66 - 32]).toBe(700);
    expect(metrics?.descriptor).toEqual({
      fontBBox: [-50, -200, 900, 1000],
      ascent: 800,
      descent: -200,
      capHeight: 800,
    });
  });

  test("parses WinAnsi widths from TrueType cmap format 12 subtables", () => {
    const metrics = parseTrueTypeFontMetrics(minimalTrueTypeWithFormat12ABWidths());
    const widths = metrics?.winAnsiWidths;

    expect(widths).toHaveLength(224);
    expect(widths?.[65 - 32]).toBe(600);
    expect(widths?.[66 - 32]).toBe(700);
  });

  test("maps CP1252 bytes to Unicode cmap entries for WinAnsi widths", () => {
    const metrics = parseTrueTypeFontMetrics(minimalTrueTypeWithCp1252EuroWidth());

    expect(metrics?.winAnsiWidths?.[0x80 - 32]).toBe(900);
    expect(metrics?.winAnsiWidths?.[0x81 - 32]).toBe(550);
  });

  test("uses OS/2 capHeight for PDF descriptor metrics when present", () => {
    const metrics = parseTrueTypeFontMetrics(minimalTrueTypeWithOs2CapHeight());

    expect(metrics?.descriptor?.capHeight).toBe(700);
  });

  test("parses horizontal format 0 kern pairs as PDF text-space adjustments", () => {
    const kerning = parseTrueTypeFontKerning(minimalTrueTypeWithABKerning(), [65, 66]);

    expect(kerning.get("65:66")).toBe(-120);
  });

  test("parses OpenType GPOS pair positioning format 1 as PDF text-space adjustments", () => {
    const font = minimalTrueTypeWithGposPairKerning(1);
    const kerning = parseTrueTypeFontKerning(font, [65, 66]);

    expect(kerning.get("65:66")).toBe(-120);
  });

  test("parses OpenType GPOS pair positioning format 2 class adjustments", () => {
    const kerning = parseTrueTypeFontKerning(minimalTrueTypeWithGposPairKerning(2), [65, 66]);

    expect(kerning.get("65:66")).toBe(-120);
  });

  test("combines OpenType GPOS pair adjustments from multiple kern lookups", () => {
    const kerning = parseTrueTypeFontKerning(
      minimalTrueTypeWithGposPairKerning(1, [-80, -40]),
      [65, 66],
    );

    expect(kerning.get("65:66")).toBe(-120);
  });
});

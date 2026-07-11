import { pdfWinAnsiCodePoint } from "../../projection/pdf/text-encoding";
import {
  parseTrueTypeCodeUnitWidths,
  parseTrueTypeFontMetrics as parseBaseTrueTypeFontMetrics,
} from "../../font/truetype";
import type { TrueTypeFontMetrics } from "../../font/truetype";

export {
  parseTrueTypeCodeUnitGlyphIds,
  parseTrueTypeCodeUnitWidths,
  parseTrueTypeGlyphWidths,
  parseTrueTypeFontKerning,
} from "../../font/truetype";
export type { TrueTypeDescriptorMetrics, TrueTypeFontMetrics } from "../../font/truetype";

export function parseTrueTypeFontMetrics(bytes: Uint8Array): TrueTypeFontMetrics | undefined {
  const metrics = parseBaseTrueTypeFontMetrics(bytes);
  if (!metrics) {
    return undefined;
  }

  const codePointsByByte = Array.from({ length: 224 }, (_, index) =>
    pdfWinAnsiCodePoint(index + 32),
  );
  const widthsByCodePoint = parseTrueTypeCodeUnitWidths(
    bytes,
    codePointsByByte.filter((value): value is number => value !== undefined),
  );
  const winAnsiWidths = codePointsByByte.map((codePoint) =>
    codePoint === undefined ? 550 : (widthsByCodePoint.get(codePoint) ?? 550),
  );

  return {
    ...metrics,
    winAnsiWidths,
  };
}

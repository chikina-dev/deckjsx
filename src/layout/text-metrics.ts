import type { FontAssetRegistration } from "../integration-context";
import type { TextFontMetrics } from "../style/length";
import {
  parseTrueTypeCodeUnitWidths,
  parseTrueTypeFontKerning,
  parseTrueTypeFontMetrics,
} from "../font/truetype";
import { fontFamilyList } from "../font/family";
import {
  HELVETICA_ASCII_WIDTH_UNITS_BY_CODE,
  HELVETICA_BOLD_ASCII_WIDTH_UNITS_BY_CODE,
} from "../font/standard-metrics";
import { shapedTextWidthUnits } from "../font/shaping";

export function standardTextCharacterWidthUnits(
  character: string,
  bold = false,
): number | undefined {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return undefined;
  }
  return (bold ? HELVETICA_BOLD_ASCII_WIDTH_UNITS_BY_CODE : HELVETICA_ASCII_WIDTH_UNITS_BY_CODE)[
    codePoint
  ];
}

function registrationWeight(registration: FontAssetRegistration): number {
  return registration.weight ?? 400;
}

function registrationStyle(registration: FontAssetRegistration): "normal" | "italic" {
  return registration.style ?? "normal";
}

function normalizedFamily(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/gu, "")
    .toLowerCase();
}

export function textFontMetricsFromRegistrations(
  registrations: readonly FontAssetRegistration[] | undefined,
): readonly TextFontMetrics[] {
  return (registrations ?? []).flatMap((registration) => {
    if (registration.source.kind !== "bytes") {
      return [];
    }

    const metrics = parseTrueTypeFontMetrics(registration.source.bytes);
    if (!metrics) {
      return [];
    }

    return [
      {
        family: registration.family,
        weight: registrationWeight(registration),
        style: registrationStyle(registration),
        data: registration.source.bytes,
        ...(metrics.winAnsiWidths ? { winAnsiWidths: metrics.winAnsiWidths } : {}),
      },
    ];
  });
}

export function textFontMetricsForStyle(input: {
  readonly family?: string;
  readonly weight?: number | "normal" | "bold";
  readonly style?: "normal" | "italic";
  readonly metrics?: readonly TextFontMetrics[];
}): TextFontMetrics | undefined {
  return textFontMetricsForStyleCandidates(input)[0];
}

export function textFontMetricsForStyleCandidates(input: {
  readonly family?: string;
  readonly weight?: number | "normal" | "bold";
  readonly style?: "normal" | "italic";
  readonly metrics?: readonly TextFontMetrics[];
}): readonly TextFontMetrics[] {
  if (!input.family) {
    return [];
  }

  const weight =
    typeof input.weight === "number" ? input.weight : input.weight === "bold" ? 700 : 400;
  const style = input.style ?? "normal";
  const families = fontFamilyList(input.family) ?? [input.family];
  return families.flatMap((family) =>
    (input.metrics ?? []).filter(
      (candidate) =>
        normalizedFamily(candidate.family) === normalizedFamily(family) &&
        candidate.weight === weight &&
        candidate.style === style,
    ),
  );
}

const codeUnitWidthsByFont = new WeakMap<Uint8Array, Map<number, number>>();

export function textFontCharacterWidthUnits(
  character: string,
  font: TextFontMetrics | undefined,
): number | undefined {
  if (!font) {
    return undefined;
  }

  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return undefined;
  }
  if (codePoint >= 32 && codePoint <= 255) {
    return font.winAnsiWidths?.[codePoint - 32];
  }

  let widths = codeUnitWidthsByFont.get(font.data);
  if (!widths) {
    widths = new Map();
    codeUnitWidthsByFont.set(font.data, widths);
  }
  if (!widths.has(codePoint)) {
    const parsed = parseTrueTypeCodeUnitWidths(font.data, [codePoint]).get(codePoint);
    if (parsed === undefined) {
      return undefined;
    }
    widths.set(codePoint, parsed);
  }
  return widths.get(codePoint);
}

export function textFontKerningAdjustments(
  text: string,
  font: TextFontMetrics | undefined,
): readonly number[] | undefined {
  if (!font || Array.from(text).length < 2) {
    return undefined;
  }

  const codePoints = Array.from(text, (character) => character.codePointAt(0) ?? 0);
  const pairs = parseTrueTypeFontKerning(font.data, codePoints);
  const adjustments = codePoints.slice(0, -1).map((codePoint, index) => {
    const nextCodePoint = codePoints[index + 1];
    return nextCodePoint === undefined ? 0 : (pairs.get(`${codePoint}:${nextCodePoint}`) ?? 0);
  });
  return adjustments.some((adjustment) => adjustment !== 0) ? adjustments : undefined;
}

export function textFontShapedWidthUnits(
  text: string,
  font: TextFontMetrics | undefined,
): ReturnType<typeof shapedTextWidthUnits> {
  return font ? shapedTextWidthUnits(font.data, text) : {};
}

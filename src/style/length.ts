import type { DeckLength, DeckPointLength } from "./types";
import { EMU_PER_INCH, PIXELS_PER_INCH, POINTS_PER_INCH } from "../types";

export type TextFontMetrics = {
  readonly family: string;
  readonly weight: number;
  readonly style: "normal" | "italic";
  readonly data: Uint8Array;
  readonly winAnsiWidths?: readonly number[];
};

export type LengthResolutionContext = {
  fontSizePt?: number;
  viewportWidthEmu?: number;
  viewportHeightEmu?: number;
  fontMetrics?: readonly TextFontMetrics[];
  fallbackTextWidthSafetyFactor?: number;
};

const ROOT_FONT_SIZE_PX = 16;
export const DEFAULT_FONT_SIZE_PT = (ROOT_FONT_SIZE_PX / PIXELS_PER_INCH) * POINTS_PER_INCH;
const CH_WIDTH_RATIO = 0.5;
const DECK_LENGTH_PATTERN =
  /^[-+]?(?:\d+|\d*\.\d+)(?:in|cm|mm|q|pt|pc|px|%|em|rem|vh|vw|vmin|vmax|ch)$/i;
const DECK_POINT_LENGTH_PATTERN =
  /^[-+]?(?:\d+|\d*\.\d+)(?:in|cm|mm|q|pt|pc|px|em|rem|vh|vw|vmin|vmax|ch)$/i;
const CSS_WIDE_KEYWORDS = new Set(["initial", "inherit", "unset", "revert", "revert-layer"]);

export function pointsToEmu(value: number) {
  return (value / POINTS_PER_INCH) * EMU_PER_INCH;
}

export function parsePercentage(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed.endsWith("%")) {
    return undefined;
  }

  return Number.parseFloat(trimmed.slice(0, -1));
}

function resolvePointUnitBase(context?: LengthResolutionContext) {
  return context?.fontSizePt ?? DEFAULT_FONT_SIZE_PT;
}

function absoluteLengthInInches(normalized: string): number | undefined {
  if (normalized.endsWith("vmin") || normalized.endsWith("vmax")) {
    return undefined;
  }

  if (normalized.endsWith("in")) {
    return Number.parseFloat(normalized.slice(0, -2));
  }

  if (normalized.endsWith("cm")) {
    return Number.parseFloat(normalized.slice(0, -2)) / 2.54;
  }

  if (normalized.endsWith("mm")) {
    return Number.parseFloat(normalized.slice(0, -2)) / 25.4;
  }

  if (normalized.endsWith("q")) {
    return Number.parseFloat(normalized.slice(0, -1)) / 101.6;
  }

  if (normalized.endsWith("pt")) {
    return Number.parseFloat(normalized.slice(0, -2)) / POINTS_PER_INCH;
  }

  if (normalized.endsWith("pc")) {
    return Number.parseFloat(normalized.slice(0, -2)) / 6;
  }

  if (normalized.endsWith("px")) {
    return Number.parseFloat(normalized.slice(0, -2)) / PIXELS_PER_INCH;
  }

  return undefined;
}

function resolveViewportEmu(
  normalized: string,
  context: LengthResolutionContext | undefined,
  errorContext: string,
): number | undefined {
  if (normalized.endsWith("vw")) {
    const viewportWidthEmu = context?.viewportWidthEmu;
    if (viewportWidthEmu === undefined) {
      throw new Error(
        `Unsupported viewport ${errorContext} without viewport context: ${normalized}`,
      );
    }

    return (viewportWidthEmu * Number.parseFloat(normalized.slice(0, -2))) / 100;
  }

  if (normalized.endsWith("vh")) {
    const viewportHeightEmu = context?.viewportHeightEmu;
    if (viewportHeightEmu === undefined) {
      throw new Error(
        `Unsupported viewport ${errorContext} without viewport context: ${normalized}`,
      );
    }

    return (viewportHeightEmu * Number.parseFloat(normalized.slice(0, -2))) / 100;
  }

  if (normalized.endsWith("vmin") || normalized.endsWith("vmax")) {
    const viewportWidthEmu = context?.viewportWidthEmu;
    const viewportHeightEmu = context?.viewportHeightEmu;
    if (viewportWidthEmu === undefined || viewportHeightEmu === undefined) {
      throw new Error(
        `Unsupported viewport ${errorContext} without viewport context: ${normalized}`,
      );
    }

    const base = normalized.endsWith("vmin")
      ? Math.min(viewportWidthEmu, viewportHeightEmu)
      : Math.max(viewportWidthEmu, viewportHeightEmu);
    const suffixLength = normalized.endsWith("vmin") ? 4 : 4;
    return (base * Number.parseFloat(normalized.slice(0, -suffixLength))) / 100;
  }

  return undefined;
}

export function isDeckLengthString(value: string): value is Extract<DeckLength, string> {
  return DECK_LENGTH_PATTERN.test(value.trim());
}

export function isDeckPointLengthString(value: string): value is Extract<DeckPointLength, string> {
  return DECK_POINT_LENGTH_PATTERN.test(value.trim());
}

export function isCssWideKeyword(value: unknown): boolean {
  return typeof value === "string" && CSS_WIDE_KEYWORDS.has(value.trim().toLowerCase());
}

export function parseLengthToken(
  value: string,
  baseEmu: number,
  fallback = 0,
  context?: LengthResolutionContext,
): number {
  const trimmed = value.trim();
  if (trimmed === "0") {
    return 0;
  }

  if (isCssWideKeyword(trimmed)) {
    return fallback;
  }

  if (!isDeckLengthString(trimmed)) {
    throw new Error(`Unsupported length value: ${value}`);
  }

  return parseLength(trimmed, baseEmu, fallback, context);
}

export function parsePointToken(
  value: string,
  fallback = 0,
  context?: LengthResolutionContext,
): number {
  const trimmed = value.trim();
  if (trimmed === "0") {
    return 0;
  }

  if (isCssWideKeyword(trimmed)) {
    return fallback;
  }

  if (!isDeckPointLengthString(trimmed)) {
    throw new Error(`Unsupported point value: ${value}`);
  }

  return parsePointValue(trimmed, fallback, context);
}

export function parsePointValue(
  value: DeckPointLength | undefined,
  fallback = 0,
  context?: LengthResolutionContext,
) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "number") {
    return value;
  }

  const normalized: string = value.trim().toLowerCase();
  if (normalized === "0") {
    return 0;
  }

  if (isCssWideKeyword(normalized)) {
    return fallback;
  }

  const absoluteInches = absoluteLengthInInches(normalized);
  if (absoluteInches !== undefined) {
    return absoluteInches * POINTS_PER_INCH;
  }

  if (normalized.endsWith("rem")) {
    return Number.parseFloat(normalized.slice(0, -3)) * DEFAULT_FONT_SIZE_PT;
  }

  if (normalized.endsWith("em")) {
    return Number.parseFloat(normalized.slice(0, -2)) * resolvePointUnitBase(context);
  }

  if (normalized.endsWith("ch")) {
    return (
      Number.parseFloat(normalized.slice(0, -2)) * resolvePointUnitBase(context) * CH_WIDTH_RATIO
    );
  }

  const viewportEmu = resolveViewportEmu(normalized, context, "point value");
  if (viewportEmu !== undefined) {
    return (viewportEmu / EMU_PER_INCH) * POINTS_PER_INCH;
  }

  throw new Error(`Unsupported point value: ${value}`);
}

export function parseStrokeWidth(
  value: DeckLength | undefined,
  fallback = 0,
  context?: LengthResolutionContext,
) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "number") {
    return value;
  }

  const normalized: string = value.trim().toLowerCase();
  if (normalized === "0") {
    return 0;
  }

  if (isCssWideKeyword(normalized)) {
    return fallback;
  }

  const absoluteInches = absoluteLengthInInches(normalized);
  if (absoluteInches !== undefined) {
    return absoluteInches * POINTS_PER_INCH;
  }

  if (normalized.endsWith("rem")) {
    return Number.parseFloat(normalized.slice(0, -3)) * DEFAULT_FONT_SIZE_PT;
  }

  if (normalized.endsWith("em")) {
    return Number.parseFloat(normalized.slice(0, -2)) * resolvePointUnitBase(context);
  }

  if (normalized.endsWith("ch")) {
    return (
      Number.parseFloat(normalized.slice(0, -2)) * resolvePointUnitBase(context) * CH_WIDTH_RATIO
    );
  }

  const viewportEmu = resolveViewportEmu(normalized, context, "stroke width");
  if (viewportEmu !== undefined) {
    return (viewportEmu / EMU_PER_INCH) * POINTS_PER_INCH;
  }

  throw new Error(`Unsupported stroke width: ${value}`);
}

export function parseLength(
  value: DeckLength | undefined,
  baseEmu: number,
  fallback = 0,
  context?: LengthResolutionContext,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "number") {
    return value * EMU_PER_INCH;
  }

  const normalized: string = value.trim().toLowerCase();
  if (normalized === "0") {
    return 0;
  }

  if (isCssWideKeyword(normalized)) {
    return fallback;
  }

  if (normalized.endsWith("%")) {
    return (baseEmu * Number.parseFloat(normalized.slice(0, -1))) / 100;
  }

  const absoluteInches = absoluteLengthInInches(normalized);
  if (absoluteInches !== undefined) {
    return absoluteInches * EMU_PER_INCH;
  }

  if (normalized.endsWith("rem")) {
    return (
      (Number.parseFloat(normalized.slice(0, -3)) * DEFAULT_FONT_SIZE_PT * EMU_PER_INCH) /
      POINTS_PER_INCH
    );
  }

  if (normalized.endsWith("em")) {
    return (
      (Number.parseFloat(normalized.slice(0, -2)) * resolvePointUnitBase(context) * EMU_PER_INCH) /
      POINTS_PER_INCH
    );
  }

  if (normalized.endsWith("ch")) {
    return (
      (Number.parseFloat(normalized.slice(0, -2)) *
        resolvePointUnitBase(context) *
        CH_WIDTH_RATIO *
        EMU_PER_INCH) /
      POINTS_PER_INCH
    );
  }

  const viewportEmu = resolveViewportEmu(normalized, context, "length");
  if (viewportEmu !== undefined) {
    return viewportEmu;
  }

  throw new Error(`Unsupported length value: ${value}`);
}

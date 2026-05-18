import type { DeckLength, DeckPointLength } from "../authoring/index";
import { EMU_PER_INCH, PIXELS_PER_INCH, POINTS_PER_INCH } from "../types";

export type LengthResolutionContext = {
  fontSizePt?: number;
  viewportWidthEmu?: number;
  viewportHeightEmu?: number;
};

const ROOT_FONT_SIZE_PX = 16;
export const DEFAULT_FONT_SIZE_PT = (ROOT_FONT_SIZE_PX / PIXELS_PER_INCH) * POINTS_PER_INCH;
const CH_WIDTH_RATIO = 0.5;
const DECK_LENGTH_PATTERN = /^[-+]?(?:\d+|\d*\.\d+)(?:in|pt|px|%|em|rem|vh|vw|ch)$/i;
const DECK_POINT_LENGTH_PATTERN = /^[-+]?(?:\d+|\d*\.\d+)(?:pt|in|px|em|rem|vh|vw|ch)$/i;

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

export function isDeckLengthString(value: string): value is Extract<DeckLength, string> {
  return DECK_LENGTH_PATTERN.test(value.trim());
}

export function isDeckPointLengthString(value: string): value is Extract<DeckPointLength, string> {
  return DECK_POINT_LENGTH_PATTERN.test(value.trim());
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

  if (value.endsWith("pt")) {
    return Number.parseFloat(value.slice(0, -2));
  }

  if (value.endsWith("in")) {
    return Number.parseFloat(value.slice(0, -2)) * POINTS_PER_INCH;
  }

  if (value.endsWith("px")) {
    return (Number.parseFloat(value.slice(0, -2)) / PIXELS_PER_INCH) * POINTS_PER_INCH;
  }

  if (value.endsWith("rem")) {
    return Number.parseFloat(value.slice(0, -3)) * DEFAULT_FONT_SIZE_PT;
  }

  if (value.endsWith("em")) {
    return Number.parseFloat(value.slice(0, -2)) * resolvePointUnitBase(context);
  }

  if (value.endsWith("ch")) {
    return Number.parseFloat(value.slice(0, -2)) * resolvePointUnitBase(context) * CH_WIDTH_RATIO;
  }

  if (value.endsWith("vw")) {
    const viewportWidthEmu = context?.viewportWidthEmu;
    if (viewportWidthEmu === undefined) {
      throw new Error(`Unsupported viewport point value without viewport context: ${value}`);
    }

    return (
      ((viewportWidthEmu * Number.parseFloat(value.slice(0, -2))) / 100 / EMU_PER_INCH) *
      POINTS_PER_INCH
    );
  }

  if (value.endsWith("vh")) {
    const viewportHeightEmu = context?.viewportHeightEmu;
    if (viewportHeightEmu === undefined) {
      throw new Error(`Unsupported viewport point value without viewport context: ${value}`);
    }

    return (
      ((viewportHeightEmu * Number.parseFloat(value.slice(0, -2))) / 100 / EMU_PER_INCH) *
      POINTS_PER_INCH
    );
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

  if (value.endsWith("pt")) {
    return Number.parseFloat(value.slice(0, -2));
  }

  if (value.endsWith("in")) {
    return Number.parseFloat(value.slice(0, -2)) * POINTS_PER_INCH;
  }

  if (value.endsWith("px")) {
    return (Number.parseFloat(value.slice(0, -2)) / PIXELS_PER_INCH) * POINTS_PER_INCH;
  }

  if (value.endsWith("rem")) {
    return Number.parseFloat(value.slice(0, -3)) * DEFAULT_FONT_SIZE_PT;
  }

  if (value.endsWith("em")) {
    return Number.parseFloat(value.slice(0, -2)) * resolvePointUnitBase(context);
  }

  if (value.endsWith("ch")) {
    return Number.parseFloat(value.slice(0, -2)) * resolvePointUnitBase(context) * CH_WIDTH_RATIO;
  }

  if (value.endsWith("vw")) {
    const viewportWidthEmu = context?.viewportWidthEmu;
    if (viewportWidthEmu === undefined) {
      throw new Error(`Unsupported viewport stroke width without viewport context: ${value}`);
    }

    return (
      ((viewportWidthEmu * Number.parseFloat(value.slice(0, -2))) / 100 / EMU_PER_INCH) *
      POINTS_PER_INCH
    );
  }

  if (value.endsWith("vh")) {
    const viewportHeightEmu = context?.viewportHeightEmu;
    if (viewportHeightEmu === undefined) {
      throw new Error(`Unsupported viewport stroke width without viewport context: ${value}`);
    }

    return (
      ((viewportHeightEmu * Number.parseFloat(value.slice(0, -2))) / 100 / EMU_PER_INCH) *
      POINTS_PER_INCH
    );
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

  if (value.endsWith("%")) {
    return (baseEmu * Number.parseFloat(value.slice(0, -1))) / 100;
  }

  if (value.endsWith("in")) {
    return Number.parseFloat(value.slice(0, -2)) * EMU_PER_INCH;
  }

  if (value.endsWith("pt")) {
    return (Number.parseFloat(value.slice(0, -2)) / POINTS_PER_INCH) * EMU_PER_INCH;
  }

  if (value.endsWith("px")) {
    return (Number.parseFloat(value.slice(0, -2)) / PIXELS_PER_INCH) * EMU_PER_INCH;
  }

  if (value.endsWith("rem")) {
    return (
      (Number.parseFloat(value.slice(0, -3)) * DEFAULT_FONT_SIZE_PT * EMU_PER_INCH) /
      POINTS_PER_INCH
    );
  }

  if (value.endsWith("em")) {
    return (
      (Number.parseFloat(value.slice(0, -2)) * resolvePointUnitBase(context) * EMU_PER_INCH) /
      POINTS_PER_INCH
    );
  }

  if (value.endsWith("ch")) {
    return (
      (Number.parseFloat(value.slice(0, -2)) *
        resolvePointUnitBase(context) *
        CH_WIDTH_RATIO *
        EMU_PER_INCH) /
      POINTS_PER_INCH
    );
  }

  if (value.endsWith("vw")) {
    const viewportWidthEmu = context?.viewportWidthEmu;
    if (viewportWidthEmu === undefined) {
      throw new Error(`Unsupported viewport length without viewport context: ${value}`);
    }

    return (viewportWidthEmu * Number.parseFloat(value.slice(0, -2))) / 100;
  }

  if (value.endsWith("vh")) {
    const viewportHeightEmu = context?.viewportHeightEmu;
    if (viewportHeightEmu === undefined) {
      throw new Error(`Unsupported viewport length without viewport context: ${value}`);
    }

    return (viewportHeightEmu * Number.parseFloat(value.slice(0, -2))) / 100;
  }

  throw new Error(`Unsupported length value: ${value}`);
}

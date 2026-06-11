import type { DeckLength, Spacing } from "../style/types";
import { EMU_PER_INCH, POINTS_PER_INCH } from "../types";
import { authoredLengthOrUndefined } from "../style/defaulting";
import { parseLength, type LengthResolutionContext } from "../style/length";

function splitSpacingTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(depth - 1, 0);
      current += char;
      continue;
    }

    if (/\s/.test(char) && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

function expandSpacingTokens(value: string): readonly [string, string, string, string] | undefined {
  const tokens = splitSpacingTokens(value);
  if (tokens.length <= 1) {
    return undefined;
  }

  if (tokens.length > 4) {
    throw new Error(`Unsupported spacing shorthand: ${value}`);
  }

  const [top, right = top, bottom = top, left = right] = tokens;
  if (top === undefined) {
    return undefined;
  }

  return [top, right, bottom, left];
}

export function parseSpacing(
  value: Spacing | undefined,
  context?: LengthResolutionContext,
  percentageBaseEmu = 0,
): [number, number, number, number] {
  if (value === undefined) {
    return [0, 0, 0, 0];
  }

  if (typeof value === "string") {
    const shorthand = expandSpacingTokens(value);
    if (shorthand) {
      return [
        parseLength(shorthand[0] as DeckLength, percentageBaseEmu, 0, context),
        parseLength(shorthand[1] as DeckLength, percentageBaseEmu, 0, context),
        parseLength(shorthand[2] as DeckLength, percentageBaseEmu, 0, context),
        parseLength(shorthand[3] as DeckLength, percentageBaseEmu, 0, context),
      ];
    }
  }

  if (typeof value === "number" || typeof value === "string") {
    const scalar = parseLength(value as DeckLength, percentageBaseEmu, 0, context);
    return [scalar, scalar, scalar, scalar];
  }

  return [
    parseLength(value[0], percentageBaseEmu, 0, context),
    parseLength(value[1], percentageBaseEmu, 0, context),
    parseLength(value[2], percentageBaseEmu, 0, context),
    parseLength(value[3], percentageBaseEmu, 0, context),
  ];
}

function parseLengthOrAuto(
  value: DeckLength,
  percentageBaseEmu: number,
  fallbackEmu: number,
  context?: LengthResolutionContext,
): number {
  const authoredValue = authoredLengthOrUndefined(value);
  if (authoredValue === undefined) {
    return fallbackEmu;
  }

  return parseLength(authoredValue, percentageBaseEmu, fallbackEmu, context);
}

export function parseSpacingAllowAuto(
  value: Spacing | undefined,
  context?: LengthResolutionContext,
  percentageBaseEmu = 0,
  autoFallbackEmu = 0,
): [number, number, number, number] {
  if (value === undefined) {
    return [0, 0, 0, 0];
  }

  if (typeof value === "string") {
    const shorthand = expandSpacingTokens(value);
    if (shorthand) {
      return [
        parseLengthOrAuto(shorthand[0] as DeckLength, percentageBaseEmu, autoFallbackEmu, context),
        parseLengthOrAuto(shorthand[1] as DeckLength, percentageBaseEmu, autoFallbackEmu, context),
        parseLengthOrAuto(shorthand[2] as DeckLength, percentageBaseEmu, autoFallbackEmu, context),
        parseLengthOrAuto(shorthand[3] as DeckLength, percentageBaseEmu, autoFallbackEmu, context),
      ];
    }
  }

  if (typeof value === "number" || typeof value === "string") {
    const scalar = parseLengthOrAuto(
      value as DeckLength,
      percentageBaseEmu,
      autoFallbackEmu,
      context,
    );
    return [scalar, scalar, scalar, scalar];
  }

  return [
    parseLengthOrAuto(value[0], percentageBaseEmu, autoFallbackEmu, context),
    parseLengthOrAuto(value[1], percentageBaseEmu, autoFallbackEmu, context),
    parseLengthOrAuto(value[2], percentageBaseEmu, autoFallbackEmu, context),
    parseLengthOrAuto(value[3], percentageBaseEmu, autoFallbackEmu, context),
  ];
}

function expandRawSpacing(
  value: Spacing | undefined,
): [
  DeckLength | undefined,
  DeckLength | undefined,
  DeckLength | undefined,
  DeckLength | undefined,
] {
  if (value === undefined) {
    return [undefined, undefined, undefined, undefined];
  }

  if (typeof value === "number" || typeof value === "string") {
    const shorthand = typeof value === "string" ? expandSpacingTokens(value) : undefined;
    if (shorthand) {
      return [
        shorthand[0] as DeckLength,
        shorthand[1] as DeckLength,
        shorthand[2] as DeckLength,
        shorthand[3] as DeckLength,
      ];
    }

    return [value as DeckLength, value as DeckLength, value as DeckLength, value as DeckLength];
  }

  return [value[0], value[1], value[2], value[3]];
}

export function resolveBoxSpacing(
  value: Spacing | undefined,
  top?: DeckLength,
  right?: DeckLength,
  bottom?: DeckLength,
  left?: DeckLength,
): Spacing | undefined {
  if (
    value === undefined &&
    top === undefined &&
    right === undefined &&
    bottom === undefined &&
    left === undefined
  ) {
    return undefined;
  }

  const [baseTop, baseRight, baseBottom, baseLeft] = expandRawSpacing(value);

  return [
    top ?? baseTop ?? 0,
    right ?? baseRight ?? 0,
    bottom ?? baseBottom ?? 0,
    left ?? baseLeft ?? 0,
  ];
}

export function resolveInset(
  value: Spacing | undefined,
  top?: DeckLength,
  right?: DeckLength,
  bottom?: DeckLength,
  left?: DeckLength,
) {
  if (
    value === undefined &&
    top === undefined &&
    right === undefined &&
    bottom === undefined &&
    left === undefined
  ) {
    return undefined;
  }

  const [baseTop, baseRight, baseBottom, baseLeft] = expandRawSpacing(value);
  return {
    top: top ?? baseTop,
    right: right ?? baseRight,
    bottom: bottom ?? baseBottom,
    left: left ?? baseLeft,
  };
}

export function parseSpacingInPoints(
  value: Spacing | undefined,
  context?: LengthResolutionContext,
  percentageBaseEmu = 0,
): [number, number, number, number] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const spacing = parseSpacing(value, context, percentageBaseEmu);
  return [
    (spacing[0] / EMU_PER_INCH) * POINTS_PER_INCH,
    (spacing[1] / EMU_PER_INCH) * POINTS_PER_INCH,
    (spacing[2] / EMU_PER_INCH) * POINTS_PER_INCH,
    (spacing[3] / EMU_PER_INCH) * POINTS_PER_INCH,
  ];
}

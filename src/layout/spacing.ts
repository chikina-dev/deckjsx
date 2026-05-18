import type { DeckLength, Spacing } from "../authoring/index.js";
import { EMU_PER_INCH, POINTS_PER_INCH } from "../types.js";
import { parseLength, type LengthResolutionContext } from "../style/length.js";

export function parseSpacing(
  value: Spacing | undefined,
  context?: LengthResolutionContext,
): [number, number, number, number] {
  if (value === undefined) {
    return [0, 0, 0, 0];
  }

  if (typeof value === "number" || typeof value === "string") {
    const scalar = parseLength(value, 0, 0, context);
    return [scalar, scalar, scalar, scalar];
  }

  return [
    parseLength(value[0], 0, 0, context),
    parseLength(value[1], 0, 0, context),
    parseLength(value[2], 0, 0, context),
    parseLength(value[3], 0, 0, context),
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
    return [value, value, value, value];
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
): [number, number, number, number] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const spacing = parseSpacing(value, context);
  return [
    (spacing[0] / EMU_PER_INCH) * POINTS_PER_INCH,
    (spacing[1] / EMU_PER_INCH) * POINTS_PER_INCH,
    (spacing[2] / EMU_PER_INCH) * POINTS_PER_INCH,
    (spacing[3] / EMU_PER_INCH) * POINTS_PER_INCH,
  ];
}

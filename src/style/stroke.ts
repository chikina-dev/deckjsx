import type { EdgeStrokeIR, StrokeIR } from "../layout/projected";
import {
  type BorderStyle,
  type DeckLength,
  type ShapeStyle,
  type StrokeDashType,
  type StrokeLineCap,
  type StrokeLineJoin,
  type ViewStyle,
} from "./types";
import { alphaToTransparency, parseCssColor } from "./color";
import {
  isDeckLengthString,
  parsePointToken,
  parseStrokeWidth,
  type LengthResolutionContext,
} from "./length";

function normalizeTransparency(value?: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(100, value));
}

function tokenizeCssShorthand(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let depth = 0;

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      current += char;
      quote = char;
      continue;
    }

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

function parseBorderStyleToken(value: string):
  | {
      style: BorderStyle;
      dashType?: StrokeDashType;
    }
  | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "none") {
    return { style: "none" };
  }

  if (normalized === "solid") {
    return { style: "solid" };
  }

  if (normalized === "dash" || normalized === "dashed") {
    return { style: "dash" };
  }

  if (normalized === "dot" || normalized === "dotted") {
    return { style: "dash", dashType: "sysDot" };
  }
}

function parseBorderWidthToken(value: string): DeckLength | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "thin") {
    return "1pt";
  }

  if (normalized === "medium") {
    return "3pt";
  }

  if (normalized === "thick") {
    return "5pt";
  }

  if (isDeckLengthString(normalized) && /^-?\d*\.?\d+(in|pt|px|%)$/i.test(normalized)) {
    return normalized;
  }
}

export function parseBorderShorthand(value?: string): {
  borderColor?: string;
  borderWidth?: DeckLength;
  borderStyle?: BorderStyle;
  borderDashType?: StrokeDashType;
} {
  if (!value) {
    return {};
  }

  const tokens = tokenizeCssShorthand(value);
  let borderColor: string | undefined;
  let borderWidth: DeckLength | undefined;
  let borderStyle: BorderStyle | undefined;
  let borderDashType: StrokeDashType | undefined;

  for (const token of tokens) {
    const parsedWidth = parseBorderWidthToken(token);
    if (borderWidth === undefined && parsedWidth !== undefined) {
      borderWidth = parsedWidth;
      continue;
    }

    const parsedStyle = parseBorderStyleToken(token);
    if (borderStyle === undefined && parsedStyle !== undefined) {
      borderStyle = parsedStyle.style;
      borderDashType = parsedStyle.dashType;
      continue;
    }

    borderColor ??= token;
  }

  return {
    borderColor,
    borderWidth,
    borderStyle,
    borderDashType,
  };
}

export function parseOutlineShorthand(value?: string): {
  outlineColor?: string;
  outlineWidth?: DeckLength;
  outlineStyle?: BorderStyle;
  outlineDashType?: StrokeDashType;
} {
  const border = parseBorderShorthand(value);
  return {
    outlineColor: border.borderColor,
    outlineWidth: border.borderWidth,
    outlineStyle: border.borderStyle,
    outlineDashType: border.borderDashType,
  };
}

export function parseStrokeShorthand(value?: string): {
  strokeColor?: string;
  strokeWidth?: DeckLength;
  strokeStyle?: BorderStyle;
  strokeDashType?: StrokeDashType;
} {
  const border = parseBorderShorthand(value);
  return {
    strokeColor: border.borderColor,
    strokeWidth: border.borderWidth,
    strokeStyle: border.borderStyle,
    strokeDashType: border.borderDashType,
  };
}

function hasSideBorderAuthoring(
  props: Partial<
    Pick<
      ViewStyle,
      | "borderTop"
      | "borderRight"
      | "borderBottom"
      | "borderLeft"
      | "borderTopColor"
      | "borderRightColor"
      | "borderBottomColor"
      | "borderLeftColor"
      | "borderTopWidth"
      | "borderRightWidth"
      | "borderBottomWidth"
      | "borderLeftWidth"
      | "borderTopStyle"
      | "borderRightStyle"
      | "borderBottomStyle"
      | "borderLeftStyle"
    >
  >,
) {
  return (
    props.borderTop !== undefined ||
    props.borderRight !== undefined ||
    props.borderBottom !== undefined ||
    props.borderLeft !== undefined ||
    props.borderTopColor !== undefined ||
    props.borderRightColor !== undefined ||
    props.borderBottomColor !== undefined ||
    props.borderLeftColor !== undefined ||
    props.borderTopWidth !== undefined ||
    props.borderRightWidth !== undefined ||
    props.borderBottomWidth !== undefined ||
    props.borderLeftWidth !== undefined ||
    props.borderTopStyle !== undefined ||
    props.borderRightStyle !== undefined ||
    props.borderBottomStyle !== undefined ||
    props.borderLeftStyle !== undefined
  );
}

export function parseSideBorderAuthoring(value?: string) {
  const border = parseBorderShorthand(value);
  return {
    color: border.borderColor,
    width: border.borderWidth,
    style: border.borderStyle,
    dashType: border.borderDashType,
  };
}

export function toStroke(
  color?: string,
  width?: DeckLength,
  style?: BorderStyle,
  dashType?: StrokeDashType,
  lineCap?: StrokeLineCap,
  lineJoin?: StrokeLineJoin,
  transparency?: number,
  context?: LengthResolutionContext,
): StrokeIR | undefined {
  const parsed = parseCssColor(color);
  if (!parsed) {
    return undefined;
  }
  const projectedDashType = dashType ?? (style === "dash" ? "dash" : undefined);

  return {
    color: parsed.color,
    widthPt: parseStrokeWidth(width, 1, context),
    style,
    ...(projectedDashType ? { dashType: projectedDashType } : {}),
    ...(lineCap ? { lineCap } : {}),
    ...(lineJoin ? { lineJoin } : {}),
    transparency: normalizeTransparency(transparency ?? alphaToTransparency(parsed.alpha)),
  };
}

export function parseStrokeDasharray(
  value?: string,
  context?: LengthResolutionContext,
): StrokeDashType | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.toLowerCase() === "none") {
    return "solid";
  }

  const rawTokens = trimmed.split(/[\s,]+/).filter(Boolean);
  if (rawTokens.length === 0) {
    return undefined;
  }

  const lengths = rawTokens.map((token) => {
    if (/^-?(?:\d+|\d*\.\d+)$/.test(token)) {
      return Number.parseFloat(token);
    }

    if (/^-?(?:\d+|\d*\.\d+)(?:in|cm|mm|q|pt|pc|px|em|rem|vh|vw|vmin|vmax|ch)$/i.test(token)) {
      return parsePointToken(token, 0, context);
    }

    throw new Error(`Unsupported strokeDasharray token: ${token}`);
  });

  if (lengths.some((length) => !Number.isFinite(length) || length < 0)) {
    throw new Error(`Unsupported strokeDasharray value: ${value}`);
  }

  const expanded = lengths.length % 2 === 0 ? lengths : [...lengths, ...lengths];
  const positive = expanded.filter((length) => length > 0);
  if (positive.length === 0) {
    throw new Error(`Unsupported strokeDasharray value: ${value}`);
  }

  const [firstPositive] = positive;
  if (firstPositive === undefined) {
    throw new Error(`Unsupported strokeDasharray value: ${value}`);
  }

  const dashSegments = expanded.filter((_, index) => index % 2 === 0);
  const gapSegments = expanded.filter((_, index) => index % 2 === 1);
  const firstDash = dashSegments[0] ?? firstPositive;
  const firstGap = gapSegments[0] ?? firstDash;
  const trailingDashes = dashSegments.slice(1);
  const hasDots = trailingDashes.length > 0;
  const trailingAverage =
    trailingDashes.length > 0
      ? trailingDashes.reduce((sum, segment) => sum + segment, 0) / trailingDashes.length
      : 0;
  const isLongDash = firstDash >= Math.max(firstGap * 2, trailingAverage * 2, 0);
  const trailingAreDots =
    trailingDashes.length > 0 && trailingDashes.every((segment) => segment <= firstDash * 0.5);

  if (trailingAreDots && trailingDashes.length >= 2) {
    return "lgDashDotDot";
  }

  if (trailingAreDots && hasDots) {
    return isLongDash ? "lgDashDot" : "dashDot";
  }

  if (expanded.length <= 2) {
    if (firstDash <= firstGap * 0.6) {
      return "sysDot";
    }

    if (firstGap >= firstDash * 2) {
      return "sysDash";
    }

    if (firstDash >= firstGap * 2.5) {
      return "lgDash";
    }

    return "dash";
  }

  if (hasDots) {
    return isLongDash ? "lgDashDot" : "dashDot";
  }

  return isLongDash ? "lgDash" : "dash";
}

export function parseStrokeLineCap(value?: string): StrokeLineCap | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "butt":
    case "round":
    case "square":
      return normalized;
    default:
      throw new Error(`Unsupported strokeLinecap value: ${value}`);
  }
}

export function parseStrokeLineJoin(value?: string): StrokeLineJoin | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "miter":
    case "round":
    case "bevel":
      return normalized;
    default:
      throw new Error(`Unsupported strokeLinejoin value: ${value}`);
  }
}

export function resolveNodeStrokes(
  props: Pick<
    ViewStyle,
    | "border"
    | "borderColor"
    | "borderWidth"
    | "borderStyle"
    | "borderTransparency"
    | "borderTop"
    | "borderRight"
    | "borderBottom"
    | "borderLeft"
    | "borderTopColor"
    | "borderRightColor"
    | "borderBottomColor"
    | "borderLeftColor"
    | "borderTopWidth"
    | "borderRightWidth"
    | "borderBottomWidth"
    | "borderLeftWidth"
    | "borderTopStyle"
    | "borderRightStyle"
    | "borderBottomStyle"
    | "borderLeftStyle"
  > &
    Partial<Pick<ShapeStyle, "stroke" | "strokeDasharray" | "strokeLinecap" | "strokeLinejoin">>,
  context?: LengthResolutionContext,
): {
  stroke?: StrokeIR;
  edgeStrokes?: EdgeStrokeIR;
} {
  const border = parseBorderShorthand(props.border);
  const stroke = parseStrokeShorthand(props.stroke);
  const explicitDashType = parseStrokeDasharray(props.strokeDasharray, context);
  const uniformDashType = explicitDashType ?? stroke.strokeDashType ?? border.borderDashType;

  if (!hasSideBorderAuthoring(props)) {
    return {
      stroke: toStroke(
        props.borderColor,
        props.borderWidth,
        props.borderStyle,
        uniformDashType,
        parseStrokeLineCap(props.strokeLinecap),
        parseStrokeLineJoin(props.strokeLinejoin),
        props.borderTransparency,
        context,
      ),
    };
  }

  const edgeStrokes: EdgeStrokeIR = {};
  const topBorder = parseSideBorderAuthoring(props.borderTop);
  const rightBorder = parseSideBorderAuthoring(props.borderRight);
  const bottomBorder = parseSideBorderAuthoring(props.borderBottom);
  const leftBorder = parseSideBorderAuthoring(props.borderLeft);

  const top = toStroke(
    props.borderTopColor ?? topBorder.color ?? props.borderColor,
    props.borderTopWidth ?? topBorder.width ?? props.borderWidth,
    props.borderTopStyle ?? topBorder.style ?? props.borderStyle,
    explicitDashType ?? topBorder.dashType ?? uniformDashType,
    parseStrokeLineCap(props.strokeLinecap),
    parseStrokeLineJoin(props.strokeLinejoin),
    props.borderTransparency,
    context,
  );
  const right = toStroke(
    props.borderRightColor ?? rightBorder.color ?? props.borderColor,
    props.borderRightWidth ?? rightBorder.width ?? props.borderWidth,
    props.borderRightStyle ?? rightBorder.style ?? props.borderStyle,
    explicitDashType ?? rightBorder.dashType ?? uniformDashType,
    parseStrokeLineCap(props.strokeLinecap),
    parseStrokeLineJoin(props.strokeLinejoin),
    props.borderTransparency,
    context,
  );
  const bottom = toStroke(
    props.borderBottomColor ?? bottomBorder.color ?? props.borderColor,
    props.borderBottomWidth ?? bottomBorder.width ?? props.borderWidth,
    props.borderBottomStyle ?? bottomBorder.style ?? props.borderStyle,
    explicitDashType ?? bottomBorder.dashType ?? uniformDashType,
    parseStrokeLineCap(props.strokeLinecap),
    parseStrokeLineJoin(props.strokeLinejoin),
    props.borderTransparency,
    context,
  );
  const left = toStroke(
    props.borderLeftColor ?? leftBorder.color ?? props.borderColor,
    props.borderLeftWidth ?? leftBorder.width ?? props.borderWidth,
    props.borderLeftStyle ?? leftBorder.style ?? props.borderStyle,
    explicitDashType ?? leftBorder.dashType ?? uniformDashType,
    parseStrokeLineCap(props.strokeLinecap),
    parseStrokeLineJoin(props.strokeLinejoin),
    props.borderTransparency,
    context,
  );

  if (top) {
    edgeStrokes.top = top;
  }
  if (right) {
    edgeStrokes.right = right;
  }
  if (bottom) {
    edgeStrokes.bottom = bottom;
  }
  if (left) {
    edgeStrokes.left = left;
  }

  return {
    edgeStrokes:
      edgeStrokes.top || edgeStrokes.right || edgeStrokes.bottom || edgeStrokes.left
        ? edgeStrokes
        : undefined,
  };
}

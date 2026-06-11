import type { TextStyleIR } from "../layout/projected";
import type { JsxNode } from "../authoring/index";
import { POINTS_PER_INCH } from "../types";
import {
  DEFAULT_FONT_SIZE_PT,
  isCssWideKeyword,
  parsePointValue,
  type LengthResolutionContext,
} from "./length";
import type { TextStyle, TextTabStopAuthoring } from "./types";

type TextDecorationResolution = {
  underline?: boolean;
  strike?: boolean;
};

export function parseTextDecoration(value?: string): TextDecorationResolution {
  if (!value) {
    return {
      underline: undefined,
      strike: undefined,
    };
  }

  const tokens = value
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  if (tokens.includes("none")) {
    return {
      underline: false,
      strike: false,
    };
  }

  return {
    underline: tokens.includes("underline") ? true : undefined,
    strike: tokens.includes("line-through") ? true : undefined,
  };
}

export function resolveLineHeight(
  lineHeight: TextStyle["lineHeight"] | undefined,
  context?: LengthResolutionContext,
): Pick<TextStyle, "lineSpacing" | "lineSpacingMultiple"> {
  if (lineHeight === undefined || lineHeight === "normal" || isCssWideKeyword(lineHeight)) {
    return {};
  }

  if (typeof lineHeight === "number") {
    return {
      lineSpacingMultiple: lineHeight,
    };
  }

  return {
    lineSpacing: parsePointValue(lineHeight, 0, context),
  };
}

export function resolveCharacterSpacing(
  charSpacing: TextStyle["charSpacing"] | TextStyle["letterSpacing"] | undefined,
  context?: LengthResolutionContext,
): number | undefined {
  if (charSpacing === undefined || isCssWideKeyword(charSpacing)) {
    return undefined;
  }

  if (charSpacing === "normal") {
    return 0;
  }

  return parsePointValue(charSpacing, 0, context);
}

export function resolveTextWrap(
  wrap: TextStyle["wrap"] | undefined,
  whiteSpace: TextStyle["whiteSpace"] | undefined,
  wordBreak: TextStyle["wordBreak"] | undefined,
  overflowWrap: TextStyle["overflowWrap"] | undefined,
): boolean | undefined {
  if (wrap !== undefined) {
    return wrap;
  }

  if (wordBreak === "break-all" || wordBreak === "break-word") {
    return true;
  }

  if (overflowWrap === "break-word" || overflowWrap === "anywhere") {
    return true;
  }

  if (whiteSpace === undefined) {
    return undefined;
  }

  if (whiteSpace === "nowrap" || whiteSpace === "pre") {
    return false;
  }

  return true;
}

export function getTextLengthContext(
  props: TextStyle,
  context?: LengthResolutionContext,
): LengthResolutionContext | undefined {
  if (props.fontSize === undefined) {
    return context;
  }

  return {
    ...context,
    fontSizePt: parsePointValue(props.fontSize, DEFAULT_FONT_SIZE_PT, context),
  };
}

export function resolveListStyle(
  props: TextStyle,
  context?: LengthResolutionContext,
): TextStyleIR["list"] | undefined {
  const indentPt =
    props.listIndent === undefined ? undefined : parsePointValue(props.listIndent, 27, context);

  switch (props.listStyleType) {
    case undefined:
      return undefined;
    case "none":
      return { type: "none" };
    case "disc":
      return {
        type: "bullet",
        characterCode: "2022",
        ...(indentPt !== undefined ? { indentPt } : {}),
      };
    case "circle":
      return {
        type: "bullet",
        characterCode: "25E6",
        ...(indentPt !== undefined ? { indentPt } : {}),
      };
    case "square":
      return {
        type: "bullet",
        characterCode: "25AA",
        ...(indentPt !== undefined ? { indentPt } : {}),
      };
    case "decimal":
      return {
        type: "number",
        style: "arabicPeriod",
        ...(props.listStart !== undefined ? { startAt: props.listStart } : {}),
        ...(indentPt !== undefined ? { indentPt } : {}),
      };
    case "lower-alpha":
      return {
        type: "number",
        style: "alphaLcPeriod",
        ...(props.listStart !== undefined ? { startAt: props.listStart } : {}),
        ...(indentPt !== undefined ? { indentPt } : {}),
      };
    case "upper-alpha":
      return {
        type: "number",
        style: "alphaUcPeriod",
        ...(props.listStart !== undefined ? { startAt: props.listStart } : {}),
        ...(indentPt !== undefined ? { indentPt } : {}),
      };
    case "lower-roman":
      return {
        type: "number",
        style: "romanLcPeriod",
        ...(props.listStart !== undefined ? { startAt: props.listStart } : {}),
        ...(indentPt !== undefined ? { indentPt } : {}),
      };
    case "upper-roman":
      return {
        type: "number",
        style: "romanUcPeriod",
        ...(props.listStart !== undefined ? { startAt: props.listStart } : {}),
        ...(indentPt !== undefined ? { indentPt } : {}),
      };
  }
}

export function resolveUnderlineStyle(
  value: TextStyle["textDecorationStyle"],
): TextStyleIR["underlineStyle"] | undefined {
  switch (value) {
    case "solid":
      return "sng";
    case "double":
      return "dbl";
    case "dotted":
      return "dotted";
    case "dashed":
      return "dash";
    case "wavy":
      return "wavy";
    default:
      return undefined;
  }
}

export function resolveTextDirection(
  value: TextStyle["writingMode"],
): TextStyleIR["textDirection"] | undefined {
  switch (value) {
    case "horizontal-tb":
      return "horz";
    case "vertical-rl":
      return "vert270";
    case "vertical-lr":
      return "vert";
    default:
      return undefined;
  }
}

function resolveTabStopAlignment(
  value: TextTabStopAuthoring["alignment"],
): "l" | "r" | "ctr" | "dec" | undefined {
  switch (value) {
    case "left":
      return "l";
    case "right":
      return "r";
    case "center":
      return "ctr";
    case "decimal":
      return "dec";
    default:
      return undefined;
  }
}

export function resolveTabStops(
  tabStops: TextStyle["tabStops"],
  context?: LengthResolutionContext,
): TextStyleIR["tabStops"] | undefined {
  if (!tabStops || tabStops.length === 0) {
    return undefined;
  }

  return tabStops.map((tabStop) => ({
    positionIn: parsePointValue(tabStop.position, 0, context) / POINTS_PER_INCH,
    ...(tabStop.alignment ? { alignment: resolveTabStopAlignment(tabStop.alignment) } : {}),
  }));
}

function normalizeChildren(input: JsxNode): JsxNode[] {
  if (Array.isArray(input)) {
    return input.flatMap((item) => normalizeChildren(item));
  }

  return [input];
}

function applyTextTransform(
  value: string,
  textTransform: TextStyle["textTransform"] | undefined,
): string {
  if (!textTransform || textTransform === "none") {
    return value;
  }

  if (textTransform === "uppercase") {
    return value.toUpperCase();
  }

  if (textTransform === "lowercase") {
    return value.toLowerCase();
  }

  return value.replace(/\b(\p{L})(\p{L}*)/gu, (match, first: string, rest: string) => {
    return first.toUpperCase() + rest.toLowerCase();
  });
}

export function extractText(
  children: ReadonlyArray<JsxNode>,
  textTransform?: TextStyle["textTransform"],
): string {
  const parts: string[] = [];

  for (const child of children.flatMap((item) => normalizeChildren(item))) {
    if (child === null || child === undefined || child === false || child === true) {
      continue;
    }

    if (typeof child === "string" || typeof child === "number") {
      parts.push(String(child));
      continue;
    }

    if (typeof child === "object") {
      throw new Error("Text nodes can only contain string or number children.");
    }
  }

  return applyTextTransform(parts.join(""), textTransform);
}

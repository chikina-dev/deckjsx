import type { AuthorElementPropValue } from "../authoring/tree";
import type { AuthoredTag } from "../authoring/tags";
import { diagnostic, type Diagnostic } from "../diagnostics";
import { fontFamilyList } from "../font/family";
import { parseCssColor } from "./color";
import type { StyleDeclarationForTarget, StyleDeclarationKey } from "./declaration";
import { parseTransformShorthand } from "./transform";
import {
  IMAGE_STYLE_KEYS,
  SHAPE_STYLE_KEYS,
  SLIDE_STYLE_KEYS,
  TABLE_CELL_STYLE_KEYS,
  TABLE_ROW_STYLE_KEYS,
  TABLE_SECTION_STYLE_KEYS,
  TABLE_STYLE_KEYS,
  TEXT_RUN_STYLE_KEYS,
  TEXT_STYLE_KEYS,
  VIDEO_STYLE_KEYS,
  VIEW_STYLE_KEYS,
} from "./keysets";

export function isAuthoringStyleRecord(
  value: unknown,
): value is Readonly<Record<string, AuthorElementPropValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const VIEW_STYLE_KEY_SET = new Set<string>(VIEW_STYLE_KEYS);
const SLIDE_STYLE_KEY_SET = new Set<string>(SLIDE_STYLE_KEYS);
const TEXT_STYLE_KEY_SET = new Set<string>(TEXT_STYLE_KEYS);
const TEXT_RUN_STYLE_KEY_SET = new Set<string>(TEXT_RUN_STYLE_KEYS);
const IMAGE_STYLE_KEY_SET = new Set<string>(IMAGE_STYLE_KEYS);
const VIDEO_STYLE_KEY_SET = new Set<string>(VIDEO_STYLE_KEYS);
const SHAPE_STYLE_KEY_SET = new Set<string>(SHAPE_STYLE_KEYS);
const TABLE_STYLE_KEY_SET = new Set<string>(TABLE_STYLE_KEYS);
const TABLE_SECTION_STYLE_KEY_SET = new Set<string>(TABLE_SECTION_STYLE_KEYS);
const TABLE_ROW_STYLE_KEY_SET = new Set<string>(TABLE_ROW_STYLE_KEYS);
const TABLE_CELL_STYLE_KEY_SET = new Set<string>(TABLE_CELL_STYLE_KEYS);

export type AuthoringStyleTarget = AuthoredTag | "slide";

export function supportedStyleNamesForAuthoredTag(tag: AuthoringStyleTarget): ReadonlySet<string> {
  switch (tag) {
    case "slide":
      return SLIDE_STYLE_KEY_SET;
    case "span":
      return TEXT_RUN_STYLE_KEY_SET;
    case "img":
      return IMAGE_STYLE_KEY_SET;
    case "video":
      return VIDEO_STYLE_KEY_SET;
    case "shape":
      return SHAPE_STYLE_KEY_SET;
    case "table":
      return TABLE_STYLE_KEY_SET;
    case "thead":
    case "tbody":
    case "tfoot":
      return TABLE_SECTION_STYLE_KEY_SET;
    case "tr":
      return TABLE_ROW_STYLE_KEY_SET;
    case "th":
    case "td":
      return TABLE_CELL_STYLE_KEY_SET;
    case "p":
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return TEXT_STYLE_KEY_SET;
    default:
      return VIEW_STYLE_KEY_SET;
  }
}

function nonPublicStylePropHelp(property: string): readonly string[] {
  if (property === "layout") {
    return [
      'Use CSS-like layout properties such as display: "block", display: "flex", or display: "grid".',
      'Use position: "absolute" with left/top/right/bottom only for explicit fixed placement.',
    ];
  }

  if (property === "x" || property === "y") {
    return [
      "Use normal flow, flex, grid, or Template Areas when you want deckjsx to place content structurally.",
      'Use explicit CSS positioning only when fixed placement is required, for example style={{ position: "absolute", left: 1, top: 1 }}.',
    ];
  }

  if (
    property === "fontSize" ||
    property === "fontFamily" ||
    property === "fontWeight" ||
    property === "lineHeight" ||
    property === "color" ||
    property === "textAlign"
  ) {
    return [
      `${property} belongs on text elements such as p, h1-h6, th, td, or inline span runs.`,
      "Use a text element for copy, or move visual box styling to the surrounding view element.",
    ];
  }

  if (property === "italic") {
    return ['Use CSS-like fontStyle instead, for example fontStyle: "italic".'];
  }

  if (property === "underline" || property === "strike") {
    return [
      'Use CSS-like textDecorationLine instead, for example textDecorationLine: "underline line-through".',
    ];
  }

  if (property === "charSpacing") {
    return ['Use CSS-like letterSpacing instead, for example letterSpacing: "1.5pt".'];
  }

  if (property === "lineSpacing" || property === "lineSpacingMultiple") {
    return ['Use CSS-like lineHeight instead, for example lineHeight: "24pt" or lineHeight: 1.4.'];
  }

  if (property === "wrap") {
    return [
      'Use CSS text wrapping properties instead, for example whiteSpace: "nowrap", wordBreak: "break-word", or overflowWrap: "anywhere".',
    ];
  }

  if (property === "radius") {
    return ['Use CSS-like borderRadius instead, for example borderRadius: "12px".'];
  }

  if (property === "transparency") {
    return ["Use CSS-like opacity instead, for example opacity: 0.65."];
  }

  if (property === "rounding") {
    return ['Use CSS-like borderRadius instead, for example borderRadius: "12px".'];
  }

  if (property === "rotation") {
    return ['Use CSS transform instead, for example transform: "rotate(15deg)".'];
  }

  if (property === "flipH") {
    return ['Use CSS transform instead, for example transform: "scaleX(-1)".'];
  }

  if (property === "flipV") {
    return ['Use CSS transform instead, for example transform: "scaleY(-1)".'];
  }

  if (property === "fillTransparency") {
    return ['Use alpha in the fill paint instead, for example fill: "rgba(37, 99, 235, 0.7)".'];
  }

  if (property === "backgroundTransparency") {
    return [
      'Use alpha in the background paint instead, for example backgroundColor: "rgba(17, 34, 51, 0.88)".',
    ];
  }

  if (property === "strokeOpacity") {
    return [
      'Use alpha in the stroke paint instead, for example stroke: "rgba(102, 51, 153, 0.75)".',
    ];
  }

  if (property === "borderTransparency") {
    return [
      'Use alpha in the border paint instead, for example borderColor: "rgba(31, 41, 55, 0.8)" or border: "2pt solid rgba(31, 41, 55, 0.8)".',
    ];
  }

  if (property === "fit") {
    return [
      'Use fit only on text elements for text fitting, for example fit: "shrink".',
      "Use objectFit on img and video elements.",
    ];
  }

  if (property === "objectFit" || property === "objectPosition" || property === "crop") {
    return [
      `${property} belongs on media elements such as img and video.`,
      "Use width, height, background, border, or padding on view/text elements instead.",
    ];
  }

  if (property === "fill" || property === "stroke") {
    return [
      `${property} belongs on shape elements.`,
      "Use background, backgroundColor, border, or borderColor on view/text elements.",
    ];
  }

  if (property === "strokeWidth") {
    return ['Use the stroke shorthand instead, for example stroke: "3pt solid #2563EB".'];
  }

  return [
    "Use a style key from this authored element's public style contract. deckjsx does not keep non-public CSS-like keys as compatibility aliases.",
  ];
}

export function nonPublicStylePropDiagnostic(input: {
  path: string;
  property: string;
  tag: AuthoringStyleTarget;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
    title: "style property is not part of the public authoring API",
    message: `Style property "${input.property}" is not part of the public deckjsx authoring style API for ${input.tag}.`,
    labels: [
      {
        path: input.path,
        message: `${input.property} is not accepted for ${input.tag}.`,
      },
    ],
    help: nonPublicStylePropHelp(input.property),
  });
}

function invalidStyleValueDiagnostic(input: {
  path: string;
  property: string;
  tag: AuthoringStyleTarget;
  message: string;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_COMPILE_INVALID_STYLE_VALUE",
    title: "style value is not part of the public authoring API",
    message: input.message,
    labels: [
      {
        path: input.path,
        message: `${input.property} is not accepted for ${input.tag} with this value.`,
      },
    ],
    help: [
      "Use a value from the public deckjsx style type. JavaScript and casts are still validated at compile time.",
    ],
  });
}

const POSITIONING_STYLE_PROPS = ["inset", "left", "top", "right", "bottom"] as const;

function positioningRequiresPositionDiagnostic(input: {
  path: string;
  property: string;
  tag: AuthoringStyleTarget;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_COMPILE_POSITIONING_REQUIRES_POSITION",
    title: "positioning style requires an explicit positioning mode",
    message: `${input.property} requires position: "absolute" for fixed placement or position: "relative" for flow-preserving offsets.`,
    labels: [
      {
        path: input.path,
        message: `${input.property} has no public authoring effect on static ${input.tag} layout.`,
      },
    ],
    help: [
      'Use style={{ position: "absolute", left: 1, top: 1 }} for explicit fixed placement.',
      'Use position: "relative" when left/top should offset an element that still participates in normal flow.',
      "Use Template Areas as structural anchors without overriding their frame through static positioning offsets.",
    ],
  });
}

function mutuallyExclusiveTextScriptDiagnostic(input: {
  path: string;
  tag: AuthoringStyleTarget;
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_COMPILE_INVALID_STYLE_VALUE",
    title: "style value is not part of the public authoring API",
    message: "Text cannot be both superscript and subscript.",
    labels: [
      {
        path: `${input.path}.superscript`,
        message: `superscript conflicts with subscript for ${input.tag}.`,
        severity: "primary",
      },
      {
        path: `${input.path}.subscript`,
        message: `subscript conflicts with superscript for ${input.tag}.`,
        severity: "secondary",
      },
    ],
    help: ["Use either superscript or subscript, or omit both for ordinary baseline text."],
  });
}

function isPublicGridAreaLine(value: string): boolean {
  return /^(?:auto|[1-9]\d*|span\s+[1-9]\d*)$/i.test(value.trim());
}

function isPublicGridAreaName(value: string): boolean {
  return /^[_a-zA-Z][\w-]*$/.test(value.trim());
}

function isPublicGridLineValue(value: AuthorElementPropValue): boolean {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0;
  }

  if (typeof value !== "string") {
    return false;
  }

  return isPublicGridAreaLine(value);
}

function isPublicGridPlacementValue(value: AuthorElementPropValue): boolean {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0;
  }

  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  const parts = normalized.split("/").map((part) => part.trim());
  return parts.length >= 1 && parts.length <= 2 && parts.every(isPublicGridAreaLine);
}

function isPublicGridAreaValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return isPublicGridLineValue(value);
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (!normalized.includes("/")) {
    return isPublicGridAreaLine(normalized) || isPublicGridAreaName(normalized);
  }

  const parts = normalized.split("/").map((part) => part.trim());
  return parts.length >= 2 && parts.length <= 4 && parts.every(isPublicGridAreaLine);
}

const ALIGN_ITEMS_VALUES = ["start", "flex-start", "center", "end", "flex-end", "stretch"] as const;
const ALIGN_SELF_VALUES = [...ALIGN_ITEMS_VALUES, "auto"] as const;
const JUSTIFY_SELF_VALUES = ALIGN_SELF_VALUES;
const JUSTIFY_CONTENT_VALUES = [
  "start",
  "flex-start",
  "center",
  "end",
  "flex-end",
  "stretch",
  "space-between",
  "space-around",
  "space-evenly",
] as const;
const ALIGN_CONTENT_VALUES = JUSTIFY_CONTENT_VALUES;

const CLOSED_STYLE_VALUE_SETS: Readonly<Record<string, readonly string[]>> = {
  display: ["flex", "block", "grid", "none"],
  visibility: ["visible", "hidden"],
  position: ["static", "absolute", "relative"],
  overflow: ["visible", "hidden"],
  boxSizing: ["border-box", "content-box"],
  isolation: ["auto", "isolate"],
  mixBlendMode: [
    "normal",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
    "luminosity",
  ],
  borderStyle: ["none", "solid", "dashed", "dotted"],
  borderTopStyle: ["none", "solid", "dashed", "dotted"],
  borderRightStyle: ["none", "solid", "dashed", "dotted"],
  borderBottomStyle: ["none", "solid", "dashed", "dotted"],
  borderLeftStyle: ["none", "solid", "dashed", "dotted"],
  outlineStyle: ["none", "solid", "dashed", "dotted"],
  strokeLinecap: ["butt", "round", "square"],
  strokeLinejoin: ["miter", "round", "bevel"],
  flexDirection: ["row", "column"],
  flexWrap: ["nowrap", "wrap"],
  justifyContent: JUSTIFY_CONTENT_VALUES,
  alignItems: ALIGN_ITEMS_VALUES,
  alignSelf: ALIGN_SELF_VALUES,
  justifySelf: JUSTIFY_SELF_VALUES,
  justifyItems: JUSTIFY_SELF_VALUES,
  alignContent: ALIGN_CONTENT_VALUES,
  gridAutoFlow: ["row", "column", "row dense", "column dense"],
  textAlign: ["left", "center", "right", "justify"],
  whiteSpace: ["normal", "nowrap", "pre", "pre-wrap", "pre-line"],
  wordBreak: ["normal", "break-all", "keep-all", "break-word"],
  overflowWrap: ["normal", "break-word", "anywhere"],
  tableLayout: ["auto", "fixed"],
  borderCollapse: ["collapse", "separate"],
  fontStyle: ["normal", "italic"],
  textDecoration: [
    "none",
    "underline",
    "line-through",
    "underline line-through",
    "line-through underline",
  ],
  textDecorationLine: [
    "none",
    "underline",
    "line-through",
    "underline line-through",
    "line-through underline",
  ],
  textDecorationStyle: ["solid", "double", "dotted", "dashed", "wavy"],
  textTransform: ["none", "uppercase", "lowercase", "capitalize"],
  writingMode: ["horizontal-tb", "vertical-rl", "vertical-lr"],
  verticalAlign: ["top", "middle", "bottom"],
  listStyleType: [
    "none",
    "disc",
    "circle",
    "square",
    "decimal",
    "lower-alpha",
    "upper-alpha",
    "lower-roman",
    "upper-roman",
  ],
};

const IMAGE_FIT_VALUES = ["contain", "cover", "fill"] as const;
const TEXT_FIT_VALUES = ["none", "shrink", "resize"] as const;
const VIEW_DIRECTION_VALUES = ["horizontal", "vertical"] as const;
const TEXT_DIRECTION_VALUES = ["ltr", "rtl"] as const;

function isPublicStyleKeyword(value: string, allowed: readonly string[]): boolean {
  return allowed.includes(value);
}

function isPublicPlaceStyleValue(
  value: AuthorElementPropValue,
  firstValues: readonly string[],
  secondValues: readonly string[],
): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const parts = value.trim().split(/\s+/);
  if (parts.length === 1) {
    return isPublicStyleKeyword(parts[0]!, firstValues);
  }

  return (
    parts.length === 2 &&
    isPublicStyleKeyword(parts[0]!, firstValues) &&
    isPublicStyleKeyword(parts[1]!, secondValues)
  );
}

function isPublicDeckLengthString(value: string): boolean {
  return (
    value === "0" ||
    /^-?\d+(?:\.\d+)?(?:in|cm|mm|q|pt|pc|px|%|em|rem|vh|vw|vmin|vmax|ch)$/.test(value)
  );
}

function isPublicDeckPointLengthString(value: string): boolean {
  return (
    value === "0" ||
    /^-?\d+(?:\.\d+)?(?:in|cm|mm|q|pt|pc|px|em|rem|vh|vw|vmin|vmax|ch)$/.test(value)
  );
}

const DECK_LENGTH_PROPERTIES = new Set([
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "gap",
  "rowGap",
  "columnGap",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderWidth",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRadius",
  "outlineWidth",
]);

const NON_NEGATIVE_DECK_LENGTH_PROPERTIES = new Set([
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "gap",
  "rowGap",
  "columnGap",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderRadius",
]);

const DECK_POINT_LENGTH_PROPERTIES = new Set([
  "fontSize",
  "paragraphSpacingBefore",
  "paragraphSpacingAfter",
  "textIndent",
  "listIndent",
]);

const SIGNED_DECK_POINT_LENGTH_PROPERTIES = new Set(["textIndent"]);

const NON_NEGATIVE_DECK_POINT_LENGTH_PROPERTIES = new Set([
  "fontSize",
  "paragraphSpacingBefore",
  "paragraphSpacingAfter",
  "listIndent",
]);

const SPACING_PROPERTIES = new Set(["inset", "margin", "padding"]);
const NON_NEGATIVE_SPACING_PROPERTIES = new Set(["padding"]);

function isPublicDeckLengthValue(value: AuthorElementPropValue): boolean {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && isPublicDeckLengthString(value.trim()))
  );
}

function isPublicNonNegativeDeckLengthString(value: string): boolean {
  return (
    value === "0" ||
    /^(?:\d+(?:\.\d+)?|\.\d+)(?:in|cm|mm|q|pt|pc|px|%|em|rem|vh|vw|vmin|vmax|ch)$/.test(value)
  );
}

function isPublicNonNegativeFilterLengthString(value: string): boolean {
  return (
    value === "0" ||
    /^(?:\d+(?:\.\d+)?|\.\d+)(?:in|cm|mm|q|pt|pc|px|em|rem|vh|vw|vmin|vmax|ch)$/i.test(value)
  );
}

function isPublicNonNegativeDeckLengthValue(value: AuthorElementPropValue): boolean {
  return (
    (typeof value === "number" && Number.isFinite(value) && value >= 0) ||
    (typeof value === "string" && isPublicNonNegativeDeckLengthString(value.trim()))
  );
}

function isPublicDeckPointLengthValue(value: AuthorElementPropValue): boolean {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && isPublicDeckPointLengthString(value.trim()))
  );
}

function isPublicSignedDeckPointLengthString(value: string): boolean {
  return (
    value === "0" ||
    /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:in|cm|mm|q|pt|pc|px|em|rem|vh|vw|vmin|vmax|ch)$/.test(value)
  );
}

function isPublicSignedDeckPointLengthValue(value: AuthorElementPropValue): boolean {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && isPublicSignedDeckPointLengthString(value.trim()))
  );
}

function isPublicNonNegativeDeckPointLengthString(value: string): boolean {
  return (
    value === "0" ||
    /^(?:\d+(?:\.\d+)?|\.\d+)(?:in|cm|mm|q|pt|pc|px|em|rem|vh|vw|vmin|vmax|ch)$/.test(value)
  );
}

function isPublicNonNegativeDeckPointLengthValue(value: AuthorElementPropValue): boolean {
  return (
    (typeof value === "number" && Number.isFinite(value) && value >= 0) ||
    (typeof value === "string" && isPublicNonNegativeDeckPointLengthString(value.trim()))
  );
}

function isPublicPositiveDeckPointLengthString(value: string): boolean {
  return isPublicNonNegativeDeckPointLengthString(value) && Number.parseFloat(value) > 0;
}

function isPublicLineHeightValue(value: AuthorElementPropValue): boolean {
  if (value === "normal") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }

  return typeof value === "string" && isPublicPositiveDeckPointLengthString(value.trim());
}

function isPublicFontWeightValue(value: AuthorElementPropValue): boolean {
  return (
    value === "normal" ||
    value === "bold" ||
    value === 100 ||
    value === 200 ||
    value === 300 ||
    value === 400 ||
    value === 500 ||
    value === 600 ||
    value === 700 ||
    value === 800 ||
    value === 900
  );
}

function isPublicListStartValue(value: AuthorElementPropValue): boolean {
  return Number.isInteger(value) && typeof value === "number" && value >= 1 && value <= 99;
}

function isPublicLetterSpacingValue(value: AuthorElementPropValue): boolean {
  return value === "normal" || isPublicSignedDeckPointLengthValue(value);
}

const TEXT_TAB_STOP_ALIGNMENTS = new Set(["left", "right", "center", "decimal"]);

function isPublicTabStopsValue(value: AuthorElementPropValue): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isAuthoringStyleRecord(item) &&
        isPublicNonNegativeDeckPointLengthValue(item.position) &&
        (item.alignment === undefined ||
          (typeof item.alignment === "string" && TEXT_TAB_STOP_ALIGNMENTS.has(item.alignment))),
    )
  );
}

function isPublicSpacingValue(value: AuthorElementPropValue): boolean {
  if (Array.isArray(value)) {
    return value.length === 4 && value.every(isPublicDeckLengthValue);
  }

  if (typeof value !== "string") {
    return isPublicDeckLengthValue(value);
  }

  const tokens = value.trim().split(/\s+/).filter(Boolean);
  return tokens.length >= 1 && tokens.length <= 2 && tokens.every(isPublicDeckLengthString);
}

function isPublicNonNegativeSpacingValue(value: AuthorElementPropValue): boolean {
  if (Array.isArray(value)) {
    return value.length === 4 && value.every(isPublicNonNegativeDeckLengthValue);
  }

  if (typeof value !== "string") {
    return isPublicNonNegativeDeckLengthValue(value);
  }

  const tokens = value.trim().split(/\s+/).filter(Boolean);
  return (
    tokens.length >= 1 && tokens.length <= 2 && tokens.every(isPublicNonNegativeDeckLengthString)
  );
}

function isPublicAspectRatioNumberToken(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && Number.parseFloat(value) > 0;
}

function isPublicAspectRatioValue(value: AuthorElementPropValue): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }

  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.replace(/\s+/g, "").toLowerCase();
  if (normalized === "auto") {
    return true;
  }

  if (!normalized.includes("/")) {
    return isPublicAspectRatioNumberToken(normalized);
  }

  const [width, height, extra] = normalized.split("/");
  return (
    extra === undefined &&
    width !== undefined &&
    height !== undefined &&
    isPublicAspectRatioNumberToken(width) &&
    isPublicAspectRatioNumberToken(height)
  );
}

function isPublicFlexBasisValue(value: AuthorElementPropValue): boolean {
  return value === "auto" || isPublicDeckLengthValue(value);
}

function splitCssCommaTokens(value: string): readonly string[] {
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
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      tokens.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  tokens.push(current.trim());
  return tokens;
}

function isPublicFractionTrack(value: string): boolean {
  return /^(?:\d+(?:\.\d+)?|\.\d+)fr$/.test(value);
}

function isPublicGridTrackSizeToken(value: string): boolean {
  return (
    value === "auto" || isPublicNonNegativeDeckLengthString(value) || isPublicFractionTrack(value)
  );
}

function isPublicMinmaxGridTrack(value: string): boolean {
  const match = /^minmax\((.*)\)$/i.exec(value.trim());
  if (!match) {
    return false;
  }

  const args = splitCssCommaTokens(match[1]!);
  return args.length === 2 && args.every(isPublicGridTrackSizeToken);
}

function isPublicRepeatGridTrack(value: string): boolean {
  const match = /^repeat\((.*)\)$/i.exec(value.trim());
  if (!match) {
    return false;
  }

  const args = splitCssCommaTokens(match[1]!);
  if (args.length !== 2) {
    return false;
  }

  const count = args[0]!;
  if (!/^(?:[1-9]\d*|auto-fill|auto-fit)$/i.test(count)) {
    return false;
  }

  const repeatedTracks = splitCssSpaceTokens(args[1]!).filter(Boolean);
  return repeatedTracks.length >= 1 && repeatedTracks.every(isPublicGridTrackToken);
}

function isPublicGridTrackToken(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    isPublicGridTrackSizeToken(normalized) ||
    isPublicMinmaxGridTrack(normalized) ||
    isPublicRepeatGridTrack(normalized)
  );
}

function isPublicGridTemplateTrackListValue(value: AuthorElementPropValue): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0;
  }

  if (Array.isArray(value)) {
    return value.every(isPublicGridTemplateTrackListValue);
  }

  if (typeof value !== "string") {
    return false;
  }

  const tokens = splitCssSpaceTokens(value.trim()).filter(Boolean);
  return tokens.length >= 1 && tokens.every(isPublicGridTrackToken);
}

function isPublicObjectPositionToken(value: string): boolean {
  return (
    value === "left" ||
    value === "center" ||
    value === "right" ||
    value === "top" ||
    value === "bottom" ||
    isPublicObjectPositionLengthString(value)
  );
}

function isPublicObjectPositionLengthString(value: string): boolean {
  return (
    value === "0" ||
    /^-?\d+(?:\.\d+)?(?:in|cm|mm|q|pt|pc|px|%|em|rem|vh|vw|vmin|vmax|ch)$/.test(value)
  );
}

function isPublicObjectPositionKeyword(value: string): boolean {
  return (
    value === "left" ||
    value === "center" ||
    value === "right" ||
    value === "top" ||
    value === "bottom"
  );
}

function isPublicObjectPositionValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return isPublicObjectPositionToken(parts[0]!);
  }

  if (parts.length === 2) {
    return parts.every(isPublicObjectPositionToken);
  }

  if (parts.length === 3) {
    return (
      isPublicObjectPositionKeyword(parts[0]!) &&
      isPublicObjectPositionLengthString(parts[1]!) &&
      isPublicObjectPositionKeyword(parts[2]!)
    );
  }

  return (
    parts.length === 4 &&
    isPublicObjectPositionKeyword(parts[0]!) &&
    isPublicObjectPositionLengthString(parts[1]!) &&
    isPublicObjectPositionKeyword(parts[2]!) &&
    isPublicObjectPositionLengthString(parts[3]!)
  );
}

const BACKGROUND_REPEAT_VALUES = ["no-repeat", "repeat-x", "repeat-y", "repeat"] as const;

function isPublicBackgroundRepeatValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const layers = value.split(",").map((part) => part.trim());
  return (
    layers.length >= 1 &&
    layers.length <= 3 &&
    layers.every((layer) => isPublicStyleKeyword(layer, BACKGROUND_REPEAT_VALUES))
  );
}

function commaLayers(value: string): readonly string[] {
  return value.split(",").map((part) => part.trim());
}

function isPublicBackgroundPositionValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const layers = commaLayers(value);
  return layers.length >= 1 && layers.every((layer) => isPublicObjectPositionValue(layer));
}

function isPublicBackgroundSizeComponent(value: string): boolean {
  return value === "auto" || isPublicNonNegativeDeckLengthString(value);
}

function isPublicBackgroundSizeLayer(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "cover" || normalized === "contain") {
    return true;
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return isPublicBackgroundSizeComponent(parts[0]!);
  }

  return (
    parts.length === 2 &&
    isPublicBackgroundSizeComponent(parts[0]!) &&
    isPublicBackgroundSizeComponent(parts[1]!)
  );
}

function isPublicBackgroundSizeValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const layers = commaLayers(value);
  return layers.length >= 1 && layers.every(isPublicBackgroundSizeLayer);
}

const BACKGROUND_BOX_VALUES = ["border-box", "padding-box", "content-box"] as const;

function isPublicBackgroundBoxListValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const layers = commaLayers(value);
  return (
    layers.length >= 1 &&
    layers.length <= 3 &&
    layers.every((layer) => isPublicStyleKeyword(layer, BACKGROUND_BOX_VALUES))
  );
}

function isPublicBackgroundImageValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^url\((.*)\)$/i.exec(value.trim());
  if (!match) {
    return false;
  }

  const inner = match[1]!;
  if (inner.trim() !== inner) {
    return false;
  }

  if (
    (inner.startsWith('"') && inner.endsWith('"')) ||
    (inner.startsWith("'") && inner.endsWith("'"))
  ) {
    const unquoted = inner.slice(1, -1);
    return unquoted.length > 0 && unquoted.trim() === unquoted;
  }

  return inner.length > 0;
}

function isPublicGradientValue(value: string): boolean {
  const match =
    /^(?:linear-gradient|radial-gradient|repeating-linear-gradient|repeating-radial-gradient)\((.*)\)$/i.exec(
      value.trim(),
    );
  return match !== null && match[1]!.trim().length > 0;
}

function isPublicPaintValue(value: AuthorElementPropValue): boolean {
  return (
    typeof value === "string" &&
    (isPublicColorValue(value) ||
      isPublicGradientValue(value) ||
      isPublicBackgroundImageValue(value))
  );
}

function splitCssTopLevelSlash(value: string): readonly [string, string | undefined] {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === "/" && depth === 0) {
      return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
    }
  }

  return [value.trim(), undefined];
}

function isPublicBackgroundLayerValue(value: string): boolean {
  const [beforeSlash, afterSlash] = splitCssTopLevelSlash(value);
  const beforeTokens = splitCssSpaceTokens(beforeSlash).filter(Boolean);
  if (beforeTokens.length === 0) {
    return false;
  }

  let hasPaint = false;
  let hasImage = false;
  let hasColor = false;
  let hasFill = false;
  let hasRepeat = false;
  const boxTokens: string[] = [];
  const positionTokens: string[] = [];

  for (const token of beforeTokens) {
    const lower = token.toLowerCase();
    if (!hasImage && isPublicBackgroundImageValue(token)) {
      hasPaint = true;
      hasImage = true;
      continue;
    }

    if (!hasColor && isPublicColorValue(token)) {
      hasPaint = true;
      hasColor = true;
      continue;
    }

    if (!hasFill && isPublicGradientValue(token)) {
      hasPaint = true;
      hasFill = true;
      continue;
    }

    if (!hasRepeat && isPublicStyleKeyword(lower, BACKGROUND_REPEAT_VALUES)) {
      hasRepeat = true;
      continue;
    }

    if (isPublicStyleKeyword(lower, BACKGROUND_BOX_VALUES)) {
      boxTokens.push(lower);
      continue;
    }

    positionTokens.push(token);
  }

  if (!hasPaint || boxTokens.length > 2) {
    return false;
  }

  if (!hasImage && (hasRepeat || positionTokens.length > 0 || afterSlash !== undefined)) {
    return false;
  }

  if (
    hasImage &&
    positionTokens.length > 0 &&
    !isPublicObjectPositionValue(positionTokens.join(" "))
  ) {
    return false;
  }

  return afterSlash === undefined || isPublicBackgroundSizeLayer(afterSlash);
}

function isPublicBackgroundValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  if (normalized.toLowerCase() === "none") {
    return true;
  }

  const layers = splitCssCommaTokens(normalized);
  return layers.length >= 1 && layers.every(isPublicBackgroundLayerValue);
}

function isPublicTransformValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  try {
    parseTransformShorthand(value);
    return true;
  } catch {
    return false;
  }
}

function isPublicTransformOriginValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return parts.length >= 1 && parts.length <= 2 && parts.every(isPublicObjectPositionToken);
}

const FILTER_FUNCTION_VALUES = [
  "blur",
  "brightness",
  "contrast",
  "drop-shadow",
  "grayscale",
  "hue-rotate",
  "invert",
  "opacity",
  "saturate",
  "sepia",
] as const;

function isPublicFilterValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  if (normalized === "none") {
    return true;
  }

  const functionMatches = [...normalized.matchAll(/([a-z-]+)\(((?:[^()]|\([^()]*\))*)\)/gi)];
  if (functionMatches.length === 0) {
    return false;
  }

  return (
    cssFilterFunctionMatchesCoverValue(normalized, functionMatches) &&
    functionMatches.every((match) =>
      isPublicFilterFunctionValue({
        name: match[1]!.toLowerCase(),
        args: match[2]!.trim(),
      }),
    )
  );
}

function cssFilterFunctionMatchesCoverValue(
  value: string,
  matches: readonly RegExpMatchArray[],
): boolean {
  let offset = 0;
  for (const match of matches) {
    const index = match.index ?? -1;
    if (index < offset || value.slice(offset, index).trim().length > 0) {
      return false;
    }
    offset = index + match[0].length;
  }

  return value.slice(offset).trim().length === 0;
}

function isPublicFilterNumberValue(value: string): boolean {
  return /^[-+]?(?:\d+|\d*\.\d+)%?$/.test(value.trim());
}

function isPublicFilterAngleValue(value: string): boolean {
  return /^[-+]?(?:\d+|\d*\.\d+)(?:deg|rad|turn)?$/i.test(value.trim());
}

function isPublicFilterFunctionValue(input: {
  readonly name: string;
  readonly args: string;
}): boolean {
  if (!isPublicStyleKeyword(input.name, FILTER_FUNCTION_VALUES) || input.args.trim().length === 0) {
    return false;
  }

  switch (input.name) {
    case "blur":
      return isPublicNonNegativeFilterLengthString(input.args);
    case "hue-rotate":
      return isPublicFilterAngleValue(input.args);
    case "brightness":
    case "contrast":
    case "grayscale":
    case "invert":
    case "opacity":
    case "saturate":
    case "sepia":
      return isPublicFilterNumberValue(input.args);
    case "drop-shadow":
      return input.args.toLowerCase() !== "none" && isPublicShadowValue(input.args);
    default:
      return false;
  }
}

function splitCssSpaceTokens(value: string): readonly string[] {
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
      depth = Math.max(0, depth - 1);
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

function isPublicShadowLengthString(value: string): boolean {
  return value === "0" || /^-?\d+(?:\.\d+)?(?:px|pt|in)$/.test(value);
}

function isPublicNonNegativeShadowLengthString(value: string): boolean {
  return value === "0" || /^\d+(?:\.\d+)?(?:px|pt|in)$/.test(value);
}

function isPublicShadowValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "none") {
    return true;
  }

  const tokens = splitCssSpaceTokens(normalized);
  const insetCount = tokens.filter((token) => token === "inset").length;
  if (insetCount > 1 || (insetCount === 1 && tokens[0] !== "inset")) {
    return false;
  }

  const layerTokens = tokens.filter((token) => token !== "inset");
  if (layerTokens.length < 2 || layerTokens.length > 5) {
    return false;
  }

  if (
    !isPublicShadowLengthString(layerTokens[0]!) ||
    !isPublicShadowLengthString(layerTokens[1]!)
  ) {
    return false;
  }

  const remaining = layerTokens.slice(2);
  if (remaining.length === 0) {
    return true;
  }

  const maybeColor = remaining.at(-1)!;
  const hasTrailingColor = isPublicColorValue(maybeColor);
  const lengthTokens = hasTrailingColor ? remaining.slice(0, -1) : remaining;
  if (lengthTokens.length === 0) {
    return hasTrailingColor;
  }

  if (lengthTokens.length > 2 || !isPublicNonNegativeShadowLengthString(lengthTokens[0]!)) {
    return false;
  }

  return lengthTokens.length === 1 || isPublicShadowLengthString(lengthTokens[1]!);
}

function isPublicStrokeDasharrayToken(value: string): boolean {
  return /^\d+(?:\.\d+)?(?:in|cm|mm|q|pt|pc|px|em|rem|vh|vw|vmin|vmax|ch)?$/.test(value);
}

function isPublicStrokeDasharrayValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "none") {
    return true;
  }

  const tokens = normalized.includes(",")
    ? normalized.split(",").map((token) => token.trim())
    : normalized.split(/\s+/).filter(Boolean);

  return (
    tokens.length >= 1 &&
    tokens.length <= 2 &&
    (normalized.includes(",") ? tokens.length === 2 : true) &&
    tokens.every(isPublicStrokeDasharrayToken)
  );
}

const BORDER_SHORTHAND_PROPERTIES = new Set([
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "outline",
]);

const BORDER_WIDTH_PROPERTIES = new Set([
  "borderWidth",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "outlineWidth",
]);

const BORDER_STYLE_VALUES = ["none", "solid", "dashed", "dotted"] as const;

const COLOR_STYLE_PROPERTIES = new Set([
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "color",
  "textDecorationColor",
]);

const OPACITY_STYLE_PROPERTIES = new Set(["opacity"]);

const TRANSPARENCY_STYLE_PROPERTIES = new Set<string>();

function isPublicColorValue(value: AuthorElementPropValue): boolean {
  return typeof value === "string" && parseCssColor(value) !== undefined;
}

function isPublicNumberInRange(
  value: AuthorElementPropValue,
  minimum: number,
  maximum: number,
): boolean {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function isPublicNonNegativeNumberValue(value: AuthorElementPropValue): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPublicIntegerValue(value: AuthorElementPropValue): boolean {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function isPublicBooleanValue(value: AuthorElementPropValue): boolean {
  return typeof value === "boolean";
}

function isPublicExternalHyperlinkValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  if (value.trim() !== value) {
    return false;
  }

  if (value.startsWith("mailto:")) {
    const recipient = value.slice("mailto:".length);
    return recipient.length > 0 && recipient.trim() === recipient;
  }

  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isPublicTooltipValue(value: AuthorElementPropValue): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function publicCropRatio(value: AuthorElementPropValue | undefined): number | undefined {
  if (value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value < 1 ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const match = /^(\d+(?:\.\d+)?)%$/.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const percent = Number.parseFloat(match[1]!);
  return Number.isFinite(percent) && percent >= 0 && percent < 100 ? percent / 100 : undefined;
}

function isPublicImageCropValue(value: AuthorElementPropValue): boolean {
  if (!isAuthoringStyleRecord(value)) {
    return false;
  }

  const top = publicCropRatio(value.top);
  const right = publicCropRatio(value.right);
  const bottom = publicCropRatio(value.bottom);
  const left = publicCropRatio(value.left);
  if (top === undefined || right === undefined || bottom === undefined || left === undefined) {
    return false;
  }

  return left + right < 1 && top + bottom < 1;
}

function isPublicGridTemplateAreaRow(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < 3) {
    return false;
  }

  const quote = trimmed[0];
  if (!((quote === '"' || quote === "'") && trimmed.endsWith(quote))) {
    return false;
  }

  return /^[A-Za-z_.]/.test(trimmed.slice(1, -1).trim());
}

function isPublicGridTemplateAreasValue(value: AuthorElementPropValue): boolean {
  const rows = typeof value === "string" ? value.split(/\n/) : Array.isArray(value) ? value : [];
  return rows.length > 0 && rows.every((row) => isPublicGridTemplateAreaRow(row));
}

function isPublicFontFamilyValue(value: AuthorElementPropValue): boolean {
  return typeof value === "string" && fontFamilyList(value) !== undefined;
}

function isPublicBorderWidthToken(value: string): boolean {
  return (
    value === "thin" ||
    value === "medium" ||
    value === "thick" ||
    value === "0" ||
    /^\d+(?:\.\d+)?(?:in|pt|px|%)$/.test(value)
  );
}

function isPublicBorderWidthValue(value: AuthorElementPropValue): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0;
  }

  return typeof value === "string" && isPublicBorderWidthToken(value.trim().toLowerCase());
}

function isPublicBorderShorthandValue(value: AuthorElementPropValue): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const tokens = splitCssSpaceTokens(value.trim().toLowerCase());
  if (tokens.length < 1 || tokens.length > 3) {
    return false;
  }

  let hasWidth = false;
  let hasStyle = false;
  let hasColor = false;

  for (const token of tokens) {
    if (!hasWidth && isPublicBorderWidthToken(token)) {
      hasWidth = true;
      continue;
    }

    if (!hasStyle && isPublicStyleKeyword(token, BORDER_STYLE_VALUES)) {
      hasStyle = true;
      continue;
    }

    if (!hasColor && parseCssColor(token) !== undefined) {
      hasColor = true;
      continue;
    }

    return false;
  }

  return tokens.length === 1 ? hasWidth || hasStyle : hasWidth && hasStyle;
}

function isPublicStrokeValue(value: AuthorElementPropValue): boolean {
  return isPublicColorValue(value) || isPublicBorderShorthandValue(value);
}

function closedStyleValuesFor(input: {
  property: string;
  tag: AuthoringStyleTarget;
}): readonly string[] | undefined {
  if (input.property === "objectFit") {
    return IMAGE_FIT_VALUES;
  }

  if (input.property === "fit") {
    return input.tag === "img" || input.tag === "video" ? IMAGE_FIT_VALUES : TEXT_FIT_VALUES;
  }

  if (input.property === "direction") {
    return input.tag === "p" ||
      input.tag === "h1" ||
      input.tag === "h2" ||
      input.tag === "h3" ||
      input.tag === "h4" ||
      input.tag === "h5" ||
      input.tag === "h6" ||
      input.tag === "th" ||
      input.tag === "td"
      ? TEXT_DIRECTION_VALUES
      : VIEW_DIRECTION_VALUES;
  }

  return CLOSED_STYLE_VALUE_SETS[input.property];
}

function closedStyleValueMessage(property: string, values: readonly string[]): string {
  return `${property} value is not part of the public authoring API. Use one of: ${values.join(", ")}.`;
}

function isPublicClosedStyleValue(
  value: AuthorElementPropValue,
  allowed: readonly string[],
): boolean {
  return typeof value === "string" && allowed.includes(value);
}

type StyleValueValidationInput = {
  property: string;
  tag: AuthoringStyleTarget;
  value: AuthorElementPropValue;
};

type StyleValueRule = {
  message: (property: string) => string;
  isValid: (input: StyleValueValidationInput) => boolean;
};

function styleValueRule(input: {
  message: string | ((property: string) => string);
  isValid: (input: StyleValueValidationInput) => boolean;
}): StyleValueRule {
  const message = input.message;
  return {
    message: typeof message === "string" ? () => message : message,
    isValid: input.isValid,
  };
}

function propertyRuleMessage(detail: string): (property: string) => string {
  return (property) => `${property} value is not part of the public authoring API. ${detail}`;
}

const STYLE_VALUE_RULES: Record<string, StyleValueRule> = {};

function registerStyleValueRule(properties: Iterable<string>, rule: StyleValueRule): void {
  for (const property of properties) {
    STYLE_VALUE_RULES[property] = rule;
  }
}

registerStyleValueRule(
  ["placeSelf"],
  styleValueRule({
    message:
      "placeSelf value is not part of the public authoring API. Use a supported one- or two-part alignment shorthand.",
    isValid: ({ value }) => isPublicPlaceStyleValue(value, ALIGN_SELF_VALUES, JUSTIFY_SELF_VALUES),
  }),
);
registerStyleValueRule(
  ["placeItems"],
  styleValueRule({
    message:
      "placeItems value is not part of the public authoring API. Use a supported one- or two-part alignment shorthand.",
    isValid: ({ value }) => isPublicPlaceStyleValue(value, ALIGN_ITEMS_VALUES, JUSTIFY_SELF_VALUES),
  }),
);
registerStyleValueRule(
  ["placeContent"],
  styleValueRule({
    message:
      "placeContent value is not part of the public authoring API. Use a supported one- or two-part alignment shorthand.",
    isValid: ({ value }) =>
      isPublicPlaceStyleValue(value, ALIGN_CONTENT_VALUES, JUSTIFY_CONTENT_VALUES),
  }),
);
registerStyleValueRule(
  ["objectPosition"],
  styleValueRule({
    message:
      "objectPosition value is not part of the public authoring API. Use supported CSS object-position keywords, deck length tokens, or edge-offset syntax.",
    isValid: ({ value }) => isPublicObjectPositionValue(value),
  }),
);
registerStyleValueRule(
  ["backgroundRepeat"],
  styleValueRule({
    message: `backgroundRepeat value is not part of the public authoring API. Use one of: ${BACKGROUND_REPEAT_VALUES.join(", ")}.`,
    isValid: ({ value }) => isPublicBackgroundRepeatValue(value),
  }),
);
registerStyleValueRule(
  DECK_LENGTH_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage("Use a number or supported deck length token."),
    isValid: ({ value }) => isPublicDeckLengthValue(value),
  }),
);
registerStyleValueRule(
  NON_NEGATIVE_DECK_LENGTH_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage("Use a non-negative number or supported length token."),
    isValid: ({ value }) => isPublicNonNegativeDeckLengthValue(value),
  }),
);
registerStyleValueRule(
  DECK_POINT_LENGTH_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage("Use a number or supported point length token."),
    isValid: ({ value }) => isPublicDeckPointLengthValue(value),
  }),
);
registerStyleValueRule(
  SIGNED_DECK_POINT_LENGTH_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage("Use a number or supported point length token."),
    isValid: ({ value }) => isPublicSignedDeckPointLengthValue(value),
  }),
);
registerStyleValueRule(
  NON_NEGATIVE_DECK_POINT_LENGTH_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage("Use a non-negative number or supported point length token."),
    isValid: ({ value }) => isPublicNonNegativeDeckPointLengthValue(value),
  }),
);
registerStyleValueRule(
  SPACING_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage(
      "Use a number, supported deck length token, two-token spacing shorthand, or four-item tuple.",
    ),
    isValid: ({ value }) => isPublicSpacingValue(value),
  }),
);
registerStyleValueRule(
  NON_NEGATIVE_SPACING_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage(
      "Use a non-negative number, supported non-negative length token, two-token spacing shorthand, or four-item tuple.",
    ),
    isValid: ({ value }) => isPublicNonNegativeSpacingValue(value),
  }),
);
registerStyleValueRule(
  ["lineHeight"],
  styleValueRule({
    message:
      "lineHeight value is not part of the public authoring API. Use normal, a number, or a supported point length token.",
    isValid: ({ value }) => isPublicLineHeightValue(value),
  }),
);
registerStyleValueRule(
  ["fontWeight"],
  styleValueRule({
    message:
      "fontWeight value is not part of the public authoring API. Use normal, bold, or a numeric CSS font-weight step from 100 to 900.",
    isValid: ({ value }) => isPublicFontWeightValue(value),
  }),
);
registerStyleValueRule(
  ["listStart"],
  styleValueRule({
    message:
      "listStart value is not part of the public authoring API. Use a positive integer from 1 to 99.",
    isValid: ({ value }) => isPublicListStartValue(value),
  }),
);
registerStyleValueRule(
  ["letterSpacing"],
  styleValueRule({
    message:
      "letterSpacing value is not part of the public authoring API. Use normal, a number, or a supported point length token.",
    isValid: ({ value }) => isPublicLetterSpacingValue(value),
  }),
);
registerStyleValueRule(
  ["tabStops"],
  styleValueRule({
    message:
      "tabStops value is not part of the public authoring API. Use tab stops with a supported point length position and optional left, right, center, or decimal alignment.",
    isValid: ({ value }) => isPublicTabStopsValue(value),
  }),
);
registerStyleValueRule(
  ["aspectRatio"],
  styleValueRule({
    message:
      "aspectRatio value is not part of the public authoring API. Use auto, a positive number, or a positive width/height ratio.",
    isValid: ({ value }) => isPublicAspectRatioValue(value),
  }),
);
registerStyleValueRule(
  ["flexBasis"],
  styleValueRule({
    message:
      "flexBasis value is not part of the public authoring API. Use auto, a number, or a supported deck length token.",
    isValid: ({ value }) => isPublicFlexBasisValue(value),
  }),
);
registerStyleValueRule(
  ["crop"],
  styleValueRule({
    message:
      "crop value is not part of the public authoring API. Use an object with top, right, bottom, and left crop ratios that leave visible image area.",
    isValid: ({ value }) => isPublicImageCropValue(value),
  }),
);
registerStyleValueRule(
  ["gridTemplateAreas"],
  styleValueRule({
    message:
      "gridTemplateAreas value is not part of the public authoring API. Use quoted CSS grid area rows with at least one area token.",
    isValid: ({ value }) => isPublicGridTemplateAreasValue(value),
  }),
);
registerStyleValueRule(
  ["backgroundImage"],
  styleValueRule({
    message:
      "backgroundImage value is not part of the public authoring API. Use a url(...) image source.",
    isValid: ({ value }) => isPublicBackgroundImageValue(value),
  }),
);
registerStyleValueRule(
  ["backgroundPosition"],
  styleValueRule({
    message:
      "backgroundPosition value is not part of the public authoring API. Use supported CSS object-position layers.",
    isValid: ({ value }) => isPublicBackgroundPositionValue(value),
  }),
);
registerStyleValueRule(
  ["backgroundSize"],
  styleValueRule({
    message:
      'backgroundSize value is not part of the public authoring API. Use cover, contain, "100% 100%", auto, deck length tokens, or one/two size components per layer.',
    isValid: ({ value }) => isPublicBackgroundSizeValue(value),
  }),
);
registerStyleValueRule(
  ["backgroundClip", "backgroundOrigin"],
  styleValueRule({
    message: propertyRuleMessage("Use border-box, padding-box, or content-box layer values."),
    isValid: ({ value }) => isPublicBackgroundBoxListValue(value),
  }),
);
registerStyleValueRule(
  COLOR_STYLE_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage("Use a supported CSS color value."),
    isValid: ({ value }) => isPublicColorValue(value),
  }),
);
registerStyleValueRule(
  OPACITY_STYLE_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage("Use a number from 0 to 1."),
    isValid: ({ value }) => isPublicNumberInRange(value, 0, 1),
  }),
);
registerStyleValueRule(
  ["flexGrow", "flexShrink"],
  styleValueRule({
    message: (property) =>
      `${property} value is not part of the public authoring API. Use a finite non-negative number.`,
    isValid: ({ value }) => isPublicNonNegativeNumberValue(value),
  }),
);
registerStyleValueRule(
  ["zIndex", "order"],
  styleValueRule({
    message: (property) =>
      `${property} value is not part of the public authoring API. Use a finite integer.`,
    isValid: ({ value }) => isPublicIntegerValue(value),
  }),
);
registerStyleValueRule(
  ["superscript", "subscript"],
  styleValueRule({
    message: (property) =>
      `${property} value is not part of the public authoring API. Use a boolean value.`,
    isValid: ({ value }) => isPublicBooleanValue(value),
  }),
);
registerStyleValueRule(
  TRANSPARENCY_STYLE_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage("Use a number from 0 to 100."),
    isValid: ({ value }) => isPublicNumberInRange(value, 0, 100),
  }),
);
registerStyleValueRule(
  ["href"],
  styleValueRule({
    message:
      "href value is not part of the public authoring API. Use an absolute http://, https://, or mailto: URL.",
    isValid: ({ value }) => isPublicExternalHyperlinkValue(value),
  }),
);
registerStyleValueRule(
  ["tooltip"],
  styleValueRule({
    message:
      "tooltip value is not part of the public authoring API. Use a non-empty tooltip string.",
    isValid: ({ value }) => isPublicTooltipValue(value),
  }),
);
registerStyleValueRule(
  ["fontFamily"],
  styleValueRule({
    message:
      "fontFamily value is not part of the public authoring API. Use a quoted family name, generic family, or CSS custom identifier.",
    isValid: ({ value }) => isPublicFontFamilyValue(value),
  }),
);
registerStyleValueRule(
  ["background"],
  styleValueRule({
    message:
      "background value is not part of the public authoring API. Use none, a CSS color, gradient, url(...) source, or supported background shorthand.",
    isValid: ({ value }) => isPublicBackgroundValue(value),
  }),
);
registerStyleValueRule(
  ["fill"],
  styleValueRule({
    message:
      "fill value is not part of the public authoring API. Use a CSS color, gradient, or url(...) source.",
    isValid: ({ value }) => isPublicPaintValue(value),
  }),
);
registerStyleValueRule(
  ["stroke"],
  styleValueRule({
    message:
      "stroke value is not part of the public authoring API. Use a CSS color or supported border-style shorthand.",
    isValid: ({ value }) => isPublicStrokeValue(value),
  }),
);
registerStyleValueRule(
  ["transform"],
  styleValueRule({
    message:
      "transform value is not part of the public authoring API. Use supported CSS transform functions.",
    isValid: ({ value }) => isPublicTransformValue(value),
  }),
);
registerStyleValueRule(
  ["transformOrigin"],
  styleValueRule({
    message:
      "transformOrigin value is not part of the public authoring API. Use one or two supported origin tokens.",
    isValid: ({ value }) => isPublicTransformOriginValue(value),
  }),
);
registerStyleValueRule(
  ["filter"],
  styleValueRule({
    message:
      "filter value is not part of the public authoring API. Use none or supported CSS filter functions.",
    isValid: ({ value }) => isPublicFilterValue(value),
  }),
);
registerStyleValueRule(
  ["boxShadow", "textShadow"],
  styleValueRule({
    message: propertyRuleMessage(
      "Use none or a shadow beginning with two supported shadow length tokens.",
    ),
    isValid: ({ value }) => isPublicShadowValue(value),
  }),
);
registerStyleValueRule(
  ["strokeDasharray"],
  styleValueRule({
    message:
      "strokeDasharray value is not part of the public authoring API. Use none, one numeric/length dash token, or two numeric/length dash tokens.",
    isValid: ({ value }) => isPublicStrokeDasharrayValue(value),
  }),
);
registerStyleValueRule(
  BORDER_SHORTHAND_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage("Use supported border width, style, and color tokens."),
    isValid: ({ value }) => isPublicBorderShorthandValue(value),
  }),
);
registerStyleValueRule(
  BORDER_WIDTH_PROPERTIES,
  styleValueRule({
    message: propertyRuleMessage("Use a non-negative number or supported border width token."),
    isValid: ({ value }) => isPublicBorderWidthValue(value),
  }),
);
registerStyleValueRule(
  ["gridArea"],
  styleValueRule({
    message:
      "gridArea value is not part of the public authoring API. Use a CSS custom identifier, auto, numeric grid lines, span lines, or a 2-4 part line placement shorthand.",
    isValid: ({ value }) => isPublicGridAreaValue(value),
  }),
);
registerStyleValueRule(
  ["gridTemplateColumns", "gridTemplateRows", "gridAutoColumns", "gridAutoRows"],
  styleValueRule({
    message: propertyRuleMessage(
      "Use supported grid track tokens such as deck lengths, fr units, minmax(...), or repeat(...).",
    ),
    isValid: ({ value }) => isPublicGridTemplateTrackListValue(value),
  }),
);
registerStyleValueRule(
  ["gridColumn", "gridRow"],
  styleValueRule({
    message: propertyRuleMessage(
      "Use auto, positive numeric grid lines, span lines, or a 1-2 part line placement shorthand.",
    ),
    isValid: ({ value }) => isPublicGridPlacementValue(value),
  }),
);
registerStyleValueRule(
  ["gridColumnStart", "gridColumnEnd", "gridRowStart", "gridRowEnd"],
  styleValueRule({
    message: propertyRuleMessage(
      "Use auto, a positive numeric grid line, or a positive span line.",
    ),
    isValid: ({ value }) => isPublicGridLineValue(value),
  }),
);

function styleValueRuleFor(input: {
  property: string;
  tag: AuthoringStyleTarget;
}): StyleValueRule | undefined {
  const closedValues = closedStyleValuesFor(input);
  if (closedValues !== undefined) {
    return styleValueRule({
      message: (property) => closedStyleValueMessage(property, closedValues),
      isValid: ({ value }) => isPublicClosedStyleValue(value, closedValues),
    });
  }

  return STYLE_VALUE_RULES[input.property];
}

export function validateSupportedStyleValue(input: {
  path: string;
  property: string;
  tag: AuthoringStyleTarget;
  value: AuthorElementPropValue;
}): Diagnostic | undefined {
  const rule = styleValueRuleFor({ property: input.property, tag: input.tag });
  if (rule === undefined) {
    return undefined;
  }

  if (rule.isValid(input)) {
    return undefined;
  }

  return invalidStyleValueDiagnostic({
    path: input.path,
    property: input.property,
    tag: input.tag,
    message: rule.message(input.property),
  });
}

export type SupportedStyleValueValidationResult<
  TTarget extends AuthoringStyleTarget,
  TProperty extends keyof StyleDeclarationForTarget<TTarget> & StyleDeclarationKey,
> =
  | {
      readonly ok: true;
      readonly property: TProperty;
      readonly value: StyleDeclarationForTarget<TTarget>[TProperty];
    }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/**
 * Validates a property and preserves its key/value correlation on success.
 *
 * This is the typed hand-off for runtime-originated declarations. The legacy diagnostic-only
 * validator remains available for callers that do not need to retain the accepted value.
 */
export function validateSupportedStyleValueResult<
  TTarget extends AuthoringStyleTarget,
  TProperty extends keyof StyleDeclarationForTarget<TTarget> & StyleDeclarationKey,
>(input: {
  path: string;
  property: TProperty;
  tag: TTarget;
  value: AuthorElementPropValue;
}): SupportedStyleValueValidationResult<TTarget, TProperty> {
  if (!supportedStyleNamesForAuthoredTag(input.tag).has(input.property)) {
    return {
      ok: false,
      diagnostic: nonPublicStylePropDiagnostic(input),
    };
  }

  const invalidValue = validateSupportedStyleValue(input);
  if (invalidValue) {
    return { ok: false, diagnostic: invalidValue };
  }

  return {
    ok: true,
    property: input.property,
    value: input.value as StyleDeclarationForTarget<TTarget>[TProperty],
  };
}

export type SupportedStyleDeclarationValidationResult<TTarget extends AuthoringStyleTarget> =
  | {
      readonly ok: true;
      readonly style: Readonly<StyleDeclarationForTarget<TTarget>>;
      readonly diagnostics: readonly [];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export function validateSupportedStyleDeclaration(input: {
  path: string;
  tag: AuthoringStyleTarget;
  style: Readonly<Record<string, AuthorElementPropValue>>;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const supportedStyleNames = supportedStyleNamesForAuthoredTag(input.tag);
  const authoredPosition = input.style.position;
  const hasExplicitPositioningMode =
    authoredPosition === "absolute" || authoredPosition === "relative";

  Object.keys(input.style).forEach((property) => {
    const propertyPath = `${input.path}.${property}`;
    if (!supportedStyleNames.has(property)) {
      diagnostics.push(
        nonPublicStylePropDiagnostic({
          path: propertyPath,
          property,
          tag: input.tag,
        }),
      );
      return;
    }

    const invalidValue = validateSupportedStyleValue({
      path: propertyPath,
      property,
      tag: input.tag,
      value: input.style[property],
    });
    if (invalidValue) {
      diagnostics.push(invalidValue);
    }

    if (
      !hasExplicitPositioningMode &&
      (POSITIONING_STYLE_PROPS as readonly string[]).includes(property) &&
      input.style[property] !== undefined
    ) {
      diagnostics.push(
        positioningRequiresPositionDiagnostic({
          path: propertyPath,
          property,
          tag: input.tag,
        }),
      );
    }
  });

  if (
    supportedStyleNames.has("superscript") &&
    supportedStyleNames.has("subscript") &&
    input.style.superscript === true &&
    input.style.subscript === true
  ) {
    diagnostics.push(mutuallyExclusiveTextScriptDiagnostic({ path: input.path, tag: input.tag }));
  }

  return diagnostics;
}

/** Validates a complete declaration and retains its target-specific style type on success. */
export function validateSupportedStyleDeclarationResult<
  TTarget extends AuthoringStyleTarget,
>(input: {
  path: string;
  tag: TTarget;
  style: Readonly<Record<string, AuthorElementPropValue>>;
}): SupportedStyleDeclarationValidationResult<TTarget> {
  const diagnostics = validateSupportedStyleDeclaration(input);
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    style: input.style as Readonly<StyleDeclarationForTarget<TTarget>>,
    diagnostics: [],
  };
}

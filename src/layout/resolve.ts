import {
  normalizeImageProps,
  normalizeShapeProps,
  normalizeSlideProps,
  normalizeTableCellProps,
  normalizeTableProps,
  normalizeTableRowProps,
  normalizeTableSectionProps,
  normalizeTextProps,
  normalizeVideoProps,
  normalizeViewProps,
  parsePlaceContent,
  parsePlaceItems,
  parsePlaceSelf,
  type InternalLayoutMode,
  type NormalizedImageProps,
  type NormalizedShapeProps,
  type NormalizedTableCellProps,
  type NormalizedTableProps,
  type NormalizedTableRowProps,
  type NormalizedTableSectionProps,
  type NormalizedTextProps,
  type NormalizedVideoProps,
  type NormalizedViewProps,
  type TextNormalizationInput,
} from "./normalization";
import type {
  LayoutInputContentNode,
  LayoutInputDocument,
  LayoutInputImage,
  LayoutInputShape,
  LayoutInputSlide,
  LayoutInputTable,
  LayoutInputTableCell,
  LayoutInputTableRow,
  LayoutInputTableSection,
  LayoutInputText,
  LayoutInputTextChild,
  LayoutInputVideo,
  LayoutInputView,
} from "./input";
import { frameFromProps, inflateSpecifiedBoxSize, parseAspectRatio } from "./absolute";
import { intersectClipRect, type ClipRect, type Frame, type Placement } from "./frame";
import type {
  ProjectedLayoutGroup,
  ProjectedLayoutId,
  ProjectedLayoutTable,
  ImageSourceIR,
  ProjectedLayoutClip,
  ProjectedLayoutNode,
  ProjectedLayoutDocument,
  ProjectedLayoutOrigin,
  ProjectedPaintIntent,
  ProjectedLayoutShape,
  ProjectedLayoutSlide,
  ProjectedLayoutText,
  ProjectedUnsupportedSemantic,
  ObjectPositionIR,
  EdgeStrokeIR,
  ShadowIR,
  StrokeIR,
  TextRunIR,
  TextStyleIR,
} from "./projected";
import { graphNodeId } from "../graph/identity";
import type { DeckOptions } from "../authoring/options";
import type {
  BorderWidthValue,
  CssAlignContent,
  CssAlignSelf,
  CssJustifySelf,
  DeckPointLength,
  DeckLength,
  BorderStyle,
  ImageStyle,
  StackAxis,
  ViewStyle,
} from "../style/types";
import type { StyleDeclarationValue } from "../style/declaration";
import {
  advanceGridAutoPlacementCursor,
  markGridItem,
  parseGridAreaShorthand,
  parseGridPlacement,
  parseGridTemplateAreas,
  resolveAutoGridPlacement,
  resolveGridPlacementFromLonghands,
  resolveGridSelfAlignment,
  resolveGridTemplateTracks,
  resolveGridTrackContentMinimums,
  resolveGridTracksWithContentMinimums,
  resolveTrackOffsets,
  stretchTracksToFit,
  type GridAutoPlacementCursor,
  type GridEntryPlacement,
  type GridPlacement,
  type GridTemplateResolution,
  type NamedGridArea,
} from "./grid";
import { parseSpacing, parseSpacingAllowAuto, parseSpacingInPoints } from "./spacing";
import {
  buildStackLines,
  resolveCrossGap,
  resolveCrossOffset,
  resolveCrossPlacement,
  resolveFlexMainAllocations,
  resolveJustifyOffset,
  resolveMainGap,
  type StackEntry,
  type StackMetrics,
} from "./stack";
import {
  parseObjectPosition,
  resolveBackgroundBoxFrames,
  resolveBackgroundLayers,
  type BackgroundBoxFrames,
} from "../style/background";
import { alphaToTransparency, normalizeColor, parseCssColor } from "../style/color";
import {
  isCssWideKeyword,
  parseLength,
  parsePointValue,
  type LengthResolutionContext,
  type TextFontMetrics,
} from "../style/length";
import {
  authoredLengthOrUndefined,
  hasAuthoredLength,
  hasAutoToken,
  hasCssWideKeywordToken,
} from "../style/defaulting";
import {
  parseOutlineShorthand,
  parseStrokeLineCap,
  parseStrokeLineJoin,
  resolveNodeStrokes,
  toStroke,
} from "../style/stroke";
import { hasShadowSpreadRadius, parseShadowShorthand } from "../style/shadow";
import { parseTransformOrigin, parseTransformShorthand } from "../style/transform";
import { PRESENTATION_TABLE_DEFAULTS } from "../style/defaults";
import {
  extractText,
  getTextLengthContext,
  resolveCharacterSpacing,
  resolveLineHeight,
  resolveListStyle,
  resolveTabStops,
  resolveTextDirection,
  resolveUnderlineStyle,
} from "../style/typography";
import { EMU_PER_INCH, POINTS_PER_INCH } from "../types";
import { normalizeProjectedImageFit, unsupportedObjectFitSemantics } from "./image-fit";
import {
  textFontCharacterWidthUnits,
  textFontKerningAdjustments,
  textFontMetricsForStyleCandidates,
  standardTextCharacterWidthUnits,
  textFontShapedWidthUnits,
} from "./text-metrics";
import {
  PRESENTATION_TEXT_MEASUREMENT_PROFILE,
  type TextMeasurementProfile,
} from "./text-measurement-profile";
import {
  errorReason,
  throwableResult,
  unsupportedCssWideKeywordSemantic,
  unsupportedSemantic,
  unsupportedSemanticFromReason,
} from "./unsupported";

type IdGenerator = {
  nextSlide(origin?: ProjectedLayoutOrigin): ProjectedLayoutId;
  nextNode(kind: ProjectedLayoutNode["kind"], origin?: ProjectedLayoutOrigin): ProjectedLayoutId;
};

export type ProjectedLayoutResolutionOptions = {
  readonly origins?: WeakMap<object, ProjectedLayoutOrigin>;
  readonly fontMetrics?: LengthResolutionContext["fontMetrics"];
  readonly textMeasurementProfile?: TextMeasurementProfile;
};

type StackLayoutOptions = Pick<
  ViewStyle,
  | "display"
  | "gap"
  | "rowGap"
  | "columnGap"
  | "gridTemplateAreas"
  | "padding"
  | "alignItems"
  | "justifyContent"
  | "alignContent"
  | "flexWrap"
  | "gridTemplateColumns"
  | "gridTemplateRows"
  | "gridAutoColumns"
  | "gridAutoRows"
  | "gridAutoFlow"
  | "justifyItems"
  | "placeItems"
  | "placeContent"
> & {
  readonly direction?: StackAxis;
};

type LayoutChildNode =
  | {
      kind: "view";
      source: LayoutInputView;
      props: NormalizedViewProps;
      siblingOrder: number;
      origin?: ProjectedLayoutOrigin;
    }
  | {
      kind: "text";
      source: LayoutInputText;
      props: NormalizedTextProps;
      siblingOrder: number;
      origin?: ProjectedLayoutOrigin;
    }
  | {
      kind: "table";
      source: LayoutInputTable;
      props: NormalizedTableProps;
      siblingOrder: number;
      origin?: ProjectedLayoutOrigin;
    }
  | {
      kind: "image";
      source: LayoutInputImage;
      props: NormalizedImageProps;
      siblingOrder: number;
      origin?: ProjectedLayoutOrigin;
    }
  | {
      kind: "video";
      source: LayoutInputVideo;
      props: NormalizedVideoProps;
      siblingOrder: number;
      origin?: ProjectedLayoutOrigin;
    }
  | {
      kind: "shape";
      source: LayoutInputShape;
      props: NormalizedShapeProps;
      siblingOrder: number;
      origin?: ProjectedLayoutOrigin;
    };

type InheritedTableCellTextKey = keyof NormalizedTableCellProps & keyof TextNormalizationInput;

const INHERITED_TABLE_CELL_TEXT_KEYS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "textDecorationLine",
  "textDecorationStyle",
  "textDecorationColor",
  "textTransform",
  "direction",
  "writingMode",
  "color",
  "textAlign",
  "verticalAlign",
  "lineHeight",
  "paragraphSpacingBefore",
  "paragraphSpacingAfter",
  "textIndent",
  "tabStops",
  "letterSpacing",
  "whiteSpace",
  "wordBreak",
  "overflowWrap",
  "listStyleType",
  "listStart",
  "listIndent",
  "superscript",
  "subscript",
  "textShadow",
  "fit",
] as const satisfies readonly InheritedTableCellTextKey[];

function parseShadowShorthandOrIgnore(input: { property: string; value?: string }): {
  readonly shadow?: ShadowIR;
  readonly unsupportedSemantics: readonly ProjectedUnsupportedSemantic[];
} {
  const parsed = throwableResult(() => parseShadowShorthand(input.value));
  if (!parsed.ok) {
    const unsupported = unsupportedSemanticFromReason({
      feature: "shadow",
      property: input.property,
      value: input.value,
      reason: parsed.reason,
    });
    return { unsupportedSemantics: unsupported ? [unsupported] : [] };
  }

  const unsupported = hasShadowSpreadRadius(input.value)
    ? unsupportedSemanticFromReason({
        feature: "shadow",
        property: input.property,
        value: input.value,
        reason: `CSS shadow spread radius is preserved as a paint-resolution issue because not every output adapter can reproduce it: ${input.value}`,
        fallback: {
          strategy: "preserveAuthoredValueOnly",
          preserves: ["projectedShadowWithoutSpread"],
          missing: ["cssShadowSpreadRadius"],
        },
      })
    : undefined;
  return {
    shadow: parsed.value,
    unsupportedSemantics: unsupported ? [unsupported] : [],
  };
}

type StrokeProjectionProps = {
  readonly border?: string;
  readonly borderColor?: string;
  readonly borderWidth?: BorderWidthValue;
  readonly borderStyle?: BorderStyle;
  readonly borderTop?: string;
  readonly borderRight?: string;
  readonly borderBottom?: string;
  readonly borderLeft?: string;
  readonly borderTopColor?: string;
  readonly borderRightColor?: string;
  readonly borderBottomColor?: string;
  readonly borderLeftColor?: string;
  readonly borderTopWidth?: BorderWidthValue;
  readonly borderRightWidth?: BorderWidthValue;
  readonly borderBottomWidth?: BorderWidthValue;
  readonly borderLeftWidth?: BorderWidthValue;
  readonly borderTopStyle?: BorderStyle;
  readonly borderRightStyle?: BorderStyle;
  readonly borderBottomStyle?: BorderStyle;
  readonly borderLeftStyle?: BorderStyle;
  readonly outline?: string;
  readonly outlineColor?: string;
  readonly outlineWidth?: BorderWidthValue;
  readonly outlineStyle?: BorderStyle;
  readonly stroke?: string;
  readonly strokeDasharray?: string;
  readonly strokeLinecap?: string;
  readonly strokeLinejoin?: string;
};

const STROKE_FALLBACK_REASON =
  "CSS-like stroke or border input could not be resolved into the canonical projected stroke model; the authored input is preserved as paint-resolution metadata.";

const OUTLINE_FALLBACK_REASON =
  "CSS-like outline input could not be resolved into the canonical projected outline model; the authored input is preserved as paint-resolution metadata.";

function firstDefinedStrokeInput(
  props: StrokeProjectionProps,
  keys: readonly (keyof StrokeProjectionProps)[],
): { readonly property: string; readonly value: StyleDeclarationValue } | undefined {
  for (const key of keys) {
    const value = props[key];
    if (value !== undefined && value !== null && value !== "") {
      return { property: key, value };
    }
  }
  return undefined;
}

function strokeFallbackInput(props: StrokeProjectionProps): {
  readonly feature: ProjectedUnsupportedSemantic["feature"];
  readonly property: string;
  readonly value: StyleDeclarationValue;
} {
  const strokeInput = firstDefinedStrokeInput(props, [
    "strokeDasharray",
    "strokeLinecap",
    "strokeLinejoin",
    "stroke",
  ]);
  if (strokeInput) {
    return { feature: "stroke", ...strokeInput };
  }

  const borderInput = firstDefinedStrokeInput(props, [
    "border",
    "borderTop",
    "borderRight",
    "borderBottom",
    "borderLeft",
    "borderColor",
    "borderWidth",
    "borderStyle",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderTopStyle",
    "borderRightStyle",
    "borderBottomStyle",
    "borderLeftStyle",
  ]);
  return borderInput
    ? { feature: "border", ...borderInput }
    : { feature: "border", property: "border", value: "unknown" };
}

function outlineFallbackInput(props: StrokeProjectionProps): {
  readonly property: string;
  readonly value: StyleDeclarationValue;
} {
  return (
    firstDefinedStrokeInput(props, ["outline", "outlineColor", "outlineWidth", "outlineStyle"]) ??
    firstDefinedStrokeInput(props, ["strokeLinecap", "strokeLinejoin"]) ?? {
      property: "outline",
      value: "unknown",
    }
  );
}

function hasAuthoredOutlineInput(props: StrokeProjectionProps): boolean {
  return (
    props.outline !== undefined ||
    props.outlineColor !== undefined ||
    props.outlineWidth !== undefined ||
    props.outlineStyle !== undefined
  );
}

function hasAuthoredStrokeInput(props: StrokeProjectionProps): boolean {
  return (
    props.border !== undefined ||
    props.borderTop !== undefined ||
    props.borderRight !== undefined ||
    props.borderBottom !== undefined ||
    props.borderLeft !== undefined ||
    props.stroke !== undefined ||
    props.strokeDasharray !== undefined ||
    props.strokeLinecap !== undefined ||
    props.strokeLinejoin !== undefined
  );
}

function isExplicitNone(value: StyleDeclarationValue): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "none";
}

function isStrokeIntentionallyNone(props: StrokeProjectionProps): boolean {
  return (
    isExplicitNone(props.border) ||
    isExplicitNone(props.borderTop) ||
    isExplicitNone(props.borderRight) ||
    isExplicitNone(props.borderBottom) ||
    isExplicitNone(props.borderLeft) ||
    props.borderStyle === "none"
  );
}

function unsupportedStrokeFallback(
  props: StrokeProjectionProps,
  error: unknown,
): ProjectedUnsupportedSemantic | undefined {
  const input = strokeFallbackInput(props);
  return unsupportedSemantic({
    feature: input.feature,
    property: input.property,
    value: input.value,
    error: new Error(`${STROKE_FALLBACK_REASON} ${errorReason(error)}`),
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["authoredStrokeInput"],
      missing: ["projectedStroke"],
    },
  });
}

function resolveNodeStrokesOrFallback(
  props: StrokeProjectionProps,
  context?: Parameters<typeof resolveNodeStrokes>[1],
): {
  readonly stroke?: StrokeIR;
  readonly edgeStrokes?: EdgeStrokeIR;
  readonly unsupportedSemantics: readonly ProjectedUnsupportedSemantic[];
} {
  const resolved = throwableResult(() =>
    resolveNodeStrokes(props as Parameters<typeof resolveNodeStrokes>[0], context),
  );

  if (!resolved.ok) {
    const semantic = unsupportedStrokeFallback(props, resolved.reason);
    return { unsupportedSemantics: semantic ? [semantic] : [] };
  }

  const strokes = resolved.value;
  if (
    !strokes.stroke &&
    !strokes.edgeStrokes &&
    hasAuthoredStrokeInput(props) &&
    !isStrokeIntentionallyNone(props)
  ) {
    const semantic = unsupportedStrokeFallback(
      props,
      "No canonical projected stroke could be produced from the authored stroke input.",
    );
    return { ...strokes, unsupportedSemantics: semantic ? [semantic] : [] };
  }

  return { ...strokes, unsupportedSemantics: [] };
}

function outlineStrokeOrFallback(
  props: StrokeProjectionProps,
  context?: Parameters<typeof toStroke>[7],
): {
  readonly outline?: StrokeIR;
  readonly unsupportedSemantics: readonly ProjectedUnsupportedSemantic[];
} {
  if (!hasAuthoredOutlineInput(props)) {
    return { unsupportedSemantics: [] };
  }

  const resolved = throwableResult(() => {
    const outlineInput = parseOutlineShorthand(props.outline);
    return toStroke(
      props.outlineColor ?? outlineInput.outlineColor,
      props.outlineWidth ?? outlineInput.outlineWidth,
      props.outlineStyle ?? outlineInput.outlineStyle,
      outlineInput.outlineDashType,
      parseStrokeLineCap(props.strokeLinecap),
      parseStrokeLineJoin(props.strokeLinejoin),
      undefined,
      context,
    );
  });

  if (!resolved.ok) {
    const input = outlineFallbackInput(props);
    const semantic = unsupportedSemanticFromReason({
      feature: "outline",
      property: input.property,
      value: input.value,
      reason: `${OUTLINE_FALLBACK_REASON} ${resolved.reason}`,
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["authoredOutlineInput"],
        missing: ["projectedOutline"],
      },
    });
    return { unsupportedSemantics: semantic ? [semantic] : [] };
  }

  if (resolved.value) {
    return { outline: resolved.value, unsupportedSemantics: [] };
  }

  const input = outlineFallbackInput(props);
  const semantic = unsupportedSemanticFromReason({
    feature: "outline",
    property: input.property,
    value: input.value,
    reason: OUTLINE_FALLBACK_REASON,
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["authoredOutlineInput"],
      missing: ["projectedOutline"],
    },
  });
  return { unsupportedSemantics: semantic ? [semantic] : [] };
}

function resolveBackgroundLayersOrEmpty(
  input: { readonly property: string; readonly value?: string },
  transparency?: number,
  context?: { widthEmu: number; heightEmu: number },
  frame?: Frame,
  boxFrames?: BackgroundBoxFrames,
  backgroundPosition?: string,
  backgroundSize?: string,
  backgroundRepeat?: string,
  backgroundOrigin?: string,
  backgroundClip?: string,
): ReturnType<typeof resolveBackgroundLayers> & {
  readonly unsupportedSemantics?: readonly ProjectedUnsupportedSemantic[];
} {
  const resolved = throwableResult(() =>
    resolveBackgroundLayers(
      input.value,
      transparency,
      context,
      frame,
      boxFrames,
      backgroundPosition,
      backgroundSize,
      backgroundRepeat,
      backgroundOrigin,
      backgroundClip,
    ),
  );
  if (resolved.ok) {
    return resolved.value;
  }

  const unsupported = unsupportedSemanticFromReason({
    feature: "background",
    property: input.property,
    value: input.value,
    reason: resolved.reason,
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["authoredBackgroundInput"],
      missing: ["projectedBackgroundLayer"],
    },
  });
  return unsupported ? { unsupportedSemantics: [unsupported] } : {};
}

function unsupportedTransformSemantics(props: {
  readonly transform?: string;
  readonly transformOrigin?: string;
}): readonly ProjectedUnsupportedSemantic[] {
  const unsupported: ProjectedUnsupportedSemantic[] = [];
  const transform = throwableResult(() => parseTransformShorthand(props.transform));
  if (!transform.ok) {
    const semantic = unsupportedSemanticFromReason({
      feature: "transform",
      property: "transform",
      value: props.transform,
      reason: transform.reason,
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  const origin = throwableResult(() =>
    parseTransformOrigin(props.transformOrigin, {
      widthEmu: EMU_PER_INCH,
      heightEmu: EMU_PER_INCH,
    }),
  );
  if (!origin.ok) {
    const semantic = unsupportedSemanticFromReason({
      feature: "transform",
      property: "transformOrigin",
      value: props.transformOrigin,
      reason: origin.reason,
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }
  return unsupported;
}

const CLIPPING_TRANSFORM_FALLBACK_REASON =
  "CSS overflow clipping combined with transforms may require a transformed clip mask; layout records axis-aligned clipping metadata as an output-neutral approximation.";

const CLIPPED_IMAGE_SOURCE_RECT_TRANSFORM_FALLBACK_REASON =
  "CSS clipping of a transformed image may require clipping the transformed visual image; layout folds the axis-aligned clip into the projected image source rectangle before transform.";

const TRANSFORM_STACKING_CONTEXT_FALLBACK_REASON =
  "CSS transforms create a stacking context; v0.8 preserves projected transform and paint-order inputs but does not yet evaluate a full CSS stacking-context subtree.";

const CSS_LAYOUT_UNSUPPORTED_VALUE_REASON =
  "This CSS layout value is valid CSS but is outside the current deckjsx v0.8.2 layout subset; deckjsx preserves the authored value for inspection and falls back to the closest supported layout behavior.";

const CSS_SUPPORTED_DISPLAY_VALUES = new Set(["block", "flex", "grid", "none"]);
const CSS_SUPPORTED_OVERFLOW_VALUES = new Set(["visible", "hidden"]);
const CSS_SUPPORTED_POSITION_VALUES = new Set(["static", "relative", "absolute"]);
const CSS_SUPPORTED_FLEX_DIRECTION_VALUES = new Set(["row", "column"]);
const CSS_SUPPORTED_FLEX_WRAP_VALUES = new Set(["nowrap", "wrap"]);
const CSS_SUPPORTED_SELF_ALIGNMENT_VALUES = new Set([
  "auto",
  "start",
  "flex-start",
  "center",
  "end",
  "flex-end",
  "stretch",
]);
const CSS_SUPPORTED_CONTENT_ALIGNMENT_VALUES = new Set([
  "start",
  "flex-start",
  "center",
  "end",
  "flex-end",
  "stretch",
  "space-between",
  "space-around",
  "space-evenly",
]);

type CssLayoutDiagnosticsProps = {
  readonly display?: unknown;
  readonly overflow?: unknown;
  readonly position?: unknown;
  readonly flexDirection?: unknown;
  readonly flexWrap?: unknown;
  readonly alignSelf?: unknown;
  readonly justifySelf?: unknown;
  readonly placeSelf?: unknown;
  readonly alignItems?: unknown;
  readonly justifyItems?: unknown;
  readonly placeItems?: unknown;
  readonly alignContent?: unknown;
  readonly justifyContent?: unknown;
  readonly placeContent?: unknown;
  readonly gridColumnStart?: unknown;
  readonly gridColumnEnd?: unknown;
  readonly gridRowStart?: unknown;
  readonly gridRowEnd?: unknown;
  readonly gridColumn?: unknown;
  readonly gridRow?: unknown;
  readonly gridArea?: unknown;
  readonly inset?: unknown;
  readonly left?: unknown;
  readonly top?: unknown;
  readonly right?: unknown;
  readonly bottom?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
  readonly minWidth?: unknown;
  readonly minHeight?: unknown;
  readonly maxWidth?: unknown;
  readonly maxHeight?: unknown;
  readonly padding?: unknown;
  readonly paddingTop?: unknown;
  readonly paddingRight?: unknown;
  readonly paddingBottom?: unknown;
  readonly paddingLeft?: unknown;
  readonly margin?: unknown;
  readonly marginTop?: unknown;
  readonly marginRight?: unknown;
  readonly marginBottom?: unknown;
  readonly marginLeft?: unknown;
  readonly gap?: unknown;
  readonly rowGap?: unknown;
  readonly columnGap?: unknown;
  readonly fontSize?: unknown;
  readonly lineHeight?: unknown;
  readonly charSpacing?: unknown;
  readonly letterSpacing?: unknown;
  readonly paragraphSpacingBefore?: unknown;
  readonly paragraphSpacingAfter?: unknown;
  readonly textIndent?: unknown;
  readonly borderWidth?: unknown;
  readonly borderTopWidth?: unknown;
  readonly borderRightWidth?: unknown;
  readonly borderBottomWidth?: unknown;
  readonly borderLeftWidth?: unknown;
  readonly outlineWidth?: unknown;
  readonly strokeWidth?: unknown;
};

type CssLayoutDiagnosticsProperty = keyof CssLayoutDiagnosticsProps;

function normalizedCssKeyword(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function unsupportedCssLayoutValueSemantic(
  property: string,
  value: unknown,
  missing: readonly string[],
): ProjectedUnsupportedSemantic | undefined {
  return unsupportedSemantic({
    feature: "layout",
    property,
    value,
    error: new Error(CSS_LAYOUT_UNSUPPORTED_VALUE_REASON),
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["authoredValue"],
      missing,
    },
  });
}

function addUnsupportedKeywordSemantic(input: {
  readonly unsupported: ProjectedUnsupportedSemantic[];
  readonly props: CssLayoutDiagnosticsProps;
  readonly property: CssLayoutDiagnosticsProperty;
  readonly supported: ReadonlySet<string>;
  readonly missing: readonly string[];
}) {
  const value = normalizedCssKeyword(input.props[input.property]);
  if (value === undefined || input.supported.has(value) || isCssWideKeyword(value)) {
    return;
  }

  const semantic = unsupportedCssLayoutValueSemantic(
    input.property,
    input.props[input.property],
    input.missing,
  );
  if (semantic) {
    input.unsupported.push(semantic);
  }
}

function hasUnsupportedAlignmentTokens(value: unknown, supported: ReadonlySet<string>): boolean {
  const normalized = normalizedCssKeyword(value);
  if (normalized === undefined) {
    return false;
  }

  if (isCssWideKeyword(normalized)) {
    return false;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }

  if (tokens[0] === "safe" || tokens[0] === "unsafe") {
    return true;
  }

  if (
    tokens.length >= 2 &&
    ((tokens[0] === "first" && tokens[1] === "baseline") ||
      (tokens[0] === "last" && tokens[1] === "baseline"))
  ) {
    return true;
  }

  return tokens.some((token) => !supported.has(token));
}

function hasUnsupportedGridLineValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value < 1;
  }

  const normalized = normalizedCssKeyword(value);
  if (normalized === undefined || normalized === "auto") {
    return false;
  }

  if (isCssWideKeyword(normalized)) {
    return false;
  }

  return !/^(?:span\s+\d+|\d+)$/.test(normalized);
}

function hasUnsupportedGridPlacementValue(value: unknown, allowNamedArea: boolean): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value < 1;
  }

  const normalized = normalizedCssKeyword(value);
  if (normalized === undefined || normalized === "auto") {
    return false;
  }

  if (isCssWideKeyword(normalized)) {
    return false;
  }

  if (allowNamedArea && !normalized.includes("/")) {
    return false;
  }

  const linePattern = String.raw`(?:\d+|span\s+\d+)`;
  const placementPattern = new RegExp(
    String.raw`^(?:${linePattern}|${linePattern}\s*/\s*${linePattern})$`,
  );
  return !placementPattern.test(normalized);
}

function unsupportedCssLayoutValueSemantics(
  props: CssLayoutDiagnosticsProps,
): readonly ProjectedUnsupportedSemantic[] {
  const unsupported: ProjectedUnsupportedSemantic[] = [];

  const cssWideKeywordChecks: Array<CssLayoutDiagnosticsProperty> = [
    "display",
    "overflow",
    "position",
    "flexDirection",
    "flexWrap",
    "alignSelf",
    "justifySelf",
    "placeSelf",
    "alignItems",
    "justifyItems",
    "placeItems",
    "alignContent",
    "justifyContent",
    "placeContent",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
    "width",
    "height",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    "padding",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "margin",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "gap",
    "rowGap",
    "columnGap",
    "fontSize",
    "lineHeight",
    "charSpacing",
    "letterSpacing",
    "paragraphSpacingBefore",
    "paragraphSpacingAfter",
    "textIndent",
    "borderWidth",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "outlineWidth",
  ];
  for (const property of cssWideKeywordChecks) {
    if (!hasCssWideKeywordToken(props[property])) {
      continue;
    }
    const semantic = unsupportedCssWideKeywordSemantic(property, props[property]);
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  addUnsupportedKeywordSemantic({
    unsupported,
    props,
    property: "display",
    supported: CSS_SUPPORTED_DISPLAY_VALUES,
    missing: ["cssDisplayBehavior"],
  });
  addUnsupportedKeywordSemantic({
    unsupported,
    props,
    property: "overflow",
    supported: CSS_SUPPORTED_OVERFLOW_VALUES,
    missing: ["cssOverflowBehavior"],
  });
  addUnsupportedKeywordSemantic({
    unsupported,
    props,
    property: "position",
    supported: CSS_SUPPORTED_POSITION_VALUES,
    missing: ["cssPositionBehavior"],
  });
  addUnsupportedKeywordSemantic({
    unsupported,
    props,
    property: "flexDirection",
    supported: CSS_SUPPORTED_FLEX_DIRECTION_VALUES,
    missing: ["reverseFlexOrdering"],
  });
  addUnsupportedKeywordSemantic({
    unsupported,
    props,
    property: "flexWrap",
    supported: CSS_SUPPORTED_FLEX_WRAP_VALUES,
    missing: ["reverseFlexLinePacking"],
  });

  const alignmentChecks: Array<{
    property: CssLayoutDiagnosticsProperty;
    supported: ReadonlySet<string>;
    missing: readonly string[];
  }> = [
    {
      property: "alignSelf",
      supported: CSS_SUPPORTED_SELF_ALIGNMENT_VALUES,
      missing: ["cssBoxAlignment"],
    },
    {
      property: "justifySelf",
      supported: CSS_SUPPORTED_SELF_ALIGNMENT_VALUES,
      missing: ["cssBoxAlignment"],
    },
    {
      property: "placeSelf",
      supported: CSS_SUPPORTED_SELF_ALIGNMENT_VALUES,
      missing: ["cssBoxAlignment"],
    },
    {
      property: "alignItems",
      supported: CSS_SUPPORTED_SELF_ALIGNMENT_VALUES,
      missing: ["cssBoxAlignment"],
    },
    {
      property: "justifyItems",
      supported: CSS_SUPPORTED_SELF_ALIGNMENT_VALUES,
      missing: ["cssBoxAlignment"],
    },
    {
      property: "placeItems",
      supported: CSS_SUPPORTED_SELF_ALIGNMENT_VALUES,
      missing: ["cssBoxAlignment"],
    },
    {
      property: "alignContent",
      supported: CSS_SUPPORTED_CONTENT_ALIGNMENT_VALUES,
      missing: ["cssContentDistribution"],
    },
    {
      property: "justifyContent",
      supported: CSS_SUPPORTED_CONTENT_ALIGNMENT_VALUES,
      missing: ["cssContentDistribution"],
    },
    {
      property: "placeContent",
      supported: CSS_SUPPORTED_CONTENT_ALIGNMENT_VALUES,
      missing: ["cssContentDistribution"],
    },
  ];

  for (const check of alignmentChecks) {
    if (!hasUnsupportedAlignmentTokens(props[check.property], check.supported)) {
      continue;
    }
    const semantic = unsupportedCssLayoutValueSemantic(
      check.property,
      props[check.property],
      check.missing,
    );
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  const gridLineChecks: Array<CssLayoutDiagnosticsProperty> = [
    "gridColumnStart",
    "gridColumnEnd",
    "gridRowStart",
    "gridRowEnd",
  ];
  for (const property of gridLineChecks) {
    if (!hasUnsupportedGridLineValue(props[property])) {
      continue;
    }
    const semantic = unsupportedCssLayoutValueSemantic(property, props[property], [
      "cssGridNamedOrNegativeLineResolution",
    ]);
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  const gridPlacementChecks: Array<{
    property: CssLayoutDiagnosticsProperty;
    allowNamedArea: boolean;
  }> = [
    { property: "gridColumn", allowNamedArea: false },
    { property: "gridRow", allowNamedArea: false },
    { property: "gridArea", allowNamedArea: true },
  ];
  for (const check of gridPlacementChecks) {
    if (!hasUnsupportedGridPlacementValue(props[check.property], check.allowNamedArea)) {
      continue;
    }
    const semantic = unsupportedCssLayoutValueSemantic(check.property, props[check.property], [
      "cssGridNamedOrNegativeLineResolution",
    ]);
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  const insetChecks: Array<CssLayoutDiagnosticsProperty> = [
    "inset",
    "top",
    "right",
    "bottom",
    "left",
  ];
  for (const property of insetChecks) {
    if (!hasAutoToken(props[property])) {
      continue;
    }
    const semantic = unsupportedCssLayoutValueSemantic(property, props[property], [
      "cssAutoInsetResolution",
    ]);
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  const marginChecks: Array<CssLayoutDiagnosticsProperty> = [
    "margin",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
  ];
  for (const property of marginChecks) {
    if (!hasAutoToken(props[property])) {
      continue;
    }
    const semantic = unsupportedCssLayoutValueSemantic(property, props[property], [
      "cssAutoMarginResolution",
    ]);
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  return unsupported;
}

const CSS_LOGICAL_LAYOUT_AXIS_FALLBACK_REASON =
  "CSS writing-mode and direction remap logical layout axes; deckjsx preserves text direction but still resolves layout, spacing, insets, and start/end alignment on physical axes.";

function unsupportedTextLogicalLayoutSemantics(props: {
  readonly direction?: "ltr" | "rtl";
  readonly writingMode?: "horizontal-tb" | "vertical-rl" | "vertical-lr";
}): readonly ProjectedUnsupportedSemantic[] {
  const unsupported: ProjectedUnsupportedSemantic[] = [];
  if (props.direction === "rtl") {
    const semantic = unsupportedSemantic({
      feature: "layout",
      property: "direction",
      value: props.direction,
      error: new Error(CSS_LOGICAL_LAYOUT_AXIS_FALLBACK_REASON),
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["textBodyDirection"],
        missing: ["logicalLayoutAxes", "cssLogicalStartEndMapping"],
      },
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  if (props.writingMode !== undefined && props.writingMode !== "horizontal-tb") {
    const semantic = unsupportedSemantic({
      feature: "layout",
      property: "writingMode",
      value: props.writingMode,
      error: new Error(CSS_LOGICAL_LAYOUT_AXIS_FALLBACK_REASON),
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["textBodyDirection"],
        missing: ["logicalLayoutAxes", "cssLogicalStartEndMapping"],
      },
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  return unsupported;
}

function hasProjectedTransform(input: {
  readonly rotation?: number;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
}): boolean {
  return (
    (input.rotation !== undefined && input.rotation !== 0) ||
    input.flipH === true ||
    input.flipV === true
  );
}

function unsupportedClippingTransformSemantics(input: {
  readonly clip?: ProjectedLayoutClip;
  readonly rotation?: number;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
}): readonly ProjectedUnsupportedSemantic[] {
  if (!input.clip || !hasProjectedTransform(input)) {
    return [];
  }

  const semantic = unsupportedSemantic({
    feature: "clipping",
    property: "overflow",
    value: `hidden + transform:${input.clip.strategy}`,
    error: new Error(CLIPPING_TRANSFORM_FALLBACK_REASON),
    fallback: {
      strategy: "axisAlignedClipWithoutTransformedMask",
      preserves: ["originalFrame", "clipFrame", "visibleFrame", "projectedTransform"],
      missing: ["transformedClipMask"],
    },
  });
  return semantic ? [semantic] : [];
}

function unsupportedClippedImageSourceRectTransformSemantics(input: {
  readonly clip?: ProjectedLayoutClip;
  readonly rotation?: number;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly fit?: string;
  readonly hasExplicitCrop?: boolean;
}): readonly ProjectedUnsupportedSemantic[] {
  if (!input.clip || !hasProjectedTransform(input)) {
    return [];
  }

  const cropSuffix = input.hasExplicitCrop ? "+crop" : "";
  const semantic = unsupportedSemantic({
    feature: "clipping",
    property: "imageSourceRect",
    value: `clip:${input.clip.strategy}+transform+fit:${input.fit ?? "contain"}${cropSuffix}`,
    error: new Error(CLIPPED_IMAGE_SOURCE_RECT_TRANSFORM_FALLBACK_REASON),
    fallback: {
      strategy: "sourceRectBeforeTransform",
      preserves: ["sourceFrame", "crop", "objectPosition", "projectedTransform"],
      missing: ["transformedImageClip"],
    },
  });
  return semantic ? [semantic] : [];
}

function unsupportedTransformStackingContextSemantics(props: {
  readonly transform?: string;
}): readonly ProjectedUnsupportedSemantic[] {
  const operations = throwableResult(() => parseTransformShorthand(props.transform));
  if (!operations.ok || !operations.value?.length) {
    return [];
  }

  const semantic = unsupportedSemantic({
    feature: "transform",
    property: "stackingContext",
    value: props.transform,
    error: new Error(TRANSFORM_STACKING_CONTEXT_FALLBACK_REASON),
    fallback: {
      strategy: "preserveTransformWithoutStackingContext",
      preserves: ["projectedTransform", "paintOrderInputs"],
      missing: ["cssStackingContext"],
    },
  });
  return semantic ? [semantic] : [];
}

function paintIntentFromProps(props: {
  readonly filter?: string;
  readonly mixBlendMode?: string;
  readonly isolation?: string;
}): ProjectedPaintIntent | undefined {
  const filter = props.filter?.trim();
  const mixBlendMode = props.mixBlendMode?.trim();
  const paintIntent: ProjectedPaintIntent = {
    ...(filter && filter.toLowerCase() !== "none" ? { filter: props.filter } : {}),
    ...(mixBlendMode && mixBlendMode.toLowerCase() !== "normal"
      ? { mixBlendMode: props.mixBlendMode }
      : {}),
    ...(props.isolation === "isolate" ? { isolation: "isolate" as const } : {}),
  };
  return Object.keys(paintIntent).length > 0 ? paintIntent : undefined;
}

function paintIntentSnapshotFromProps(props: {
  readonly filter?: string;
  readonly mixBlendMode?: string;
  readonly isolation?: string;
}): { readonly paintIntent?: ProjectedPaintIntent } {
  const paintIntent = paintIntentFromProps(props);
  return paintIntent ? { paintIntent } : {};
}

function backgroundInput(props: {
  readonly background?: string;
  readonly backgroundColor?: string;
  readonly backgroundImage?: string;
}): { readonly property: string; readonly value?: string } {
  const imageBackground = props.backgroundImage ?? props.background;
  if (props.backgroundColor !== undefined && imageBackground !== undefined) {
    return { property: "background", value: `${props.backgroundColor}, ${imageBackground}` };
  }
  if (props.backgroundImage !== undefined) {
    return { property: "backgroundImage", value: props.backgroundImage };
  }
  if (props.backgroundColor !== undefined) {
    return { property: "backgroundColor", value: props.backgroundColor };
  }
  return { property: "background", value: props.background };
}

function shapeFillInput(props: {
  readonly background?: string;
  readonly backgroundImage?: string;
  readonly fill?: string;
}): { readonly property: string; readonly value?: string } {
  if (props.fill !== undefined) {
    return { property: "fill", value: props.fill };
  }
  if (props.backgroundImage !== undefined) {
    return { property: "backgroundImage", value: props.backgroundImage };
  }
  return { property: "background", value: props.background };
}

type ResolvedGridContainerSpec = {
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  contentFrame: Frame;
  columnGapEmu: number;
  rowGapEmu: number;
  defaultAlignSelf: ViewStyle["alignItems"] | CssAlignSelf | undefined;
  defaultJustifySelf: CssJustifySelf | undefined;
  resolvedAlignContent: ViewStyle["alignContent"] | undefined;
  resolvedJustifyContent: ViewStyle["justifyContent"] | undefined;
  namedAreas: Map<string, NamedGridArea>;
  columnTemplate: GridTemplateResolution;
  rowTemplate: GridTemplateResolution;
  areaColumnCount: number;
  areaRowCount: number;
};

type SpacingTuple = [number, number, number, number];

const EMPTY_SPACING: SpacingTuple = [0, 0, 0, 0];
const DEFAULT_TEXT_FONT_SIZE_PT = 18;
const DEFAULT_NORMAL_LINE_HEIGHT_MULTIPLE = 1.2;

function createIdGenerator(): IdGenerator {
  const anonymousCounts = new Map<string, number>();
  const allocatedIds = new Map<ProjectedLayoutId, number>();

  const allocate = (
    scope: "slide" | "node",
    kind: string,
    origin: ProjectedLayoutOrigin | undefined,
  ): ProjectedLayoutId => {
    const semanticOwnerId = origin?.graphNodeIds?.[0];
    const anonymousKey = `${scope}:${kind}`;
    const anonymousIndex = anonymousCounts.get(anonymousKey) ?? 0;
    const material = semanticOwnerId
      ? ["projected-layout", scope, kind, "graph", semanticOwnerId]
      : ["projected-layout", scope, kind, "anonymous", String(anonymousIndex)];

    if (!semanticOwnerId) {
      anonymousCounts.set(anonymousKey, anonymousIndex + 1);
    }

    const baseId = String(graphNodeId(material));
    const collisionIndex = allocatedIds.get(baseId) ?? 0;
    allocatedIds.set(baseId, collisionIndex + 1);
    if (collisionIndex === 0) {
      return baseId;
    }

    return String(graphNodeId([...material, "collision", String(collisionIndex)]));
  };

  return {
    nextSlide(origin) {
      return allocate("slide", "slide", origin);
    },
    nextNode(kind, origin) {
      return allocate("node", kind, origin);
    },
  };
}

function imageSourceFromProps(props: NormalizedImageProps): ImageSourceIR {
  if (props.src) {
    if (/^https?:\/\//i.test(props.src)) {
      return { kind: "url", url: props.src };
    }
    return { kind: "path", path: props.src };
  }

  if (props.data) {
    return { kind: "data", data: props.data };
  }

  throw new Error("Image requires either src or data.");
}

function videoSourceFromProps(props: NormalizedVideoProps): ImageSourceIR {
  if (props.src) {
    if (/^https?:\/\//i.test(props.src)) {
      return { kind: "url", url: props.src };
    }
    return { kind: "path", path: props.src };
  }

  if (props.data) {
    return { kind: "data", data: props.data };
  }

  throw new Error("Video requires either src or data.");
}

function videoPosterSourceFromProps(props: NormalizedVideoProps): ImageSourceIR | undefined {
  if (props.poster) {
    if (/^https?:\/\//i.test(props.poster)) {
      return { kind: "url", url: props.poster };
    }
    return { kind: "path", path: props.poster };
  }

  if (props.posterData) {
    return { kind: "data", data: props.posterData };
  }

  return undefined;
}

function isLayoutInputContentNode(value: unknown): value is LayoutInputContentNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    ((value as { kind?: unknown }).kind === "view" ||
      (value as { kind?: unknown }).kind === "table" ||
      (value as { kind?: unknown }).kind === "text" ||
      (value as { kind?: unknown }).kind === "image" ||
      (value as { kind?: unknown }).kind === "video" ||
      (value as { kind?: unknown }).kind === "shape")
  );
}

function isLayoutInputTextNode(value: unknown): value is LayoutInputText {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind?: unknown }).kind === "text"
  );
}

function layoutChildFromNode(
  child: LayoutInputContentNode,
  siblingOrder: number,
  context?: LengthResolutionContext,
): LayoutChildNode {
  const origin = child.origin;

  switch (child.kind) {
    case "view":
      return {
        kind: "view",
        source: child,
        props: normalizeViewProps(child.props),
        siblingOrder,
        ...(origin ? { origin } : {}),
      };
    case "text":
      return {
        kind: "text",
        source: child,
        props: normalizeTextProps(child.props),
        siblingOrder,
        ...(origin ? { origin } : {}),
      };
    case "table":
      return {
        kind: "table",
        source: child,
        props: normalizeTableProps(child.props),
        siblingOrder,
        ...(origin ? { origin } : {}),
      };
    case "image":
      return {
        kind: "image",
        source: child,
        props: normalizeImagePropsWithIntrinsicAspectRatio(child, context),
        siblingOrder,
        ...(origin ? { origin } : {}),
      };
    case "video":
      return {
        kind: "video",
        source: child,
        props: normalizeVideoProps(child.props, context),
        siblingOrder,
        ...(origin ? { origin } : {}),
      };
    case "shape":
      return {
        kind: "shape",
        source: child,
        props: normalizeShapeProps(child.props),
        siblingOrder,
        ...(origin ? { origin } : {}),
      };
  }
}

function normalizeImagePropsWithIntrinsicAspectRatio(
  child: LayoutInputImage,
  context?: LengthResolutionContext,
): NormalizedImageProps {
  const props = normalizeImageProps(child.props, context);

  if (props.aspectRatio !== undefined) {
    return props;
  }

  const width = child.assetProbe?.width;
  const height = child.assetProbe?.height;

  if (
    width === undefined ||
    height === undefined ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return props;
  }

  return {
    ...props,
    aspectRatio: width / height,
  };
}

function inheritTableCellTextProps(
  cellProps: NormalizedTableCellProps,
  textProps: TextNormalizationInput,
): TextNormalizationInput {
  let next: TextNormalizationInput | undefined;

  for (const key of INHERITED_TABLE_CELL_TEXT_KEYS) {
    const value = cellProps[key];
    if (textProps[key] !== undefined || value === undefined) {
      continue;
    }

    next ??= { ...textProps };
    (next as Record<string, unknown>)[key] = value;
  }

  return next ?? textProps;
}

function authoredTextProp(
  props: TextNormalizationInput,
  key: keyof TextNormalizationInput,
): unknown {
  const style = props.style as Record<string, unknown> | undefined;
  if (style?.[key] !== undefined) {
    return style[key];
  }

  return (props as Record<string, unknown>)[key];
}

function tableCellTextCanFillCellHeight(textProps: TextNormalizationInput): boolean {
  const authoredHeight = authoredTextProp(textProps, "height") as DeckLength | undefined;
  const authoredInset = authoredTextProp(textProps, "inset") as DeckLength | undefined;
  const authoredTop = authoredTextProp(textProps, "top") as DeckLength | undefined;
  const authoredBottom = authoredTextProp(textProps, "bottom") as DeckLength | undefined;

  return (
    authoredTextProp(textProps, "position") !== "absolute" &&
    authoredLengthOrUndefined(authoredHeight) === undefined &&
    !(authoredInset !== undefined && !hasCssWideKeywordToken(authoredInset)) &&
    authoredLengthOrUndefined(authoredTop) === undefined &&
    authoredLengthOrUndefined(authoredBottom) === undefined
  );
}

function mergedTableCellTextOrigin(
  origins: readonly ProjectedLayoutOrigin[],
): ProjectedLayoutOrigin | undefined {
  if (origins.length === 0) {
    return undefined;
  }

  const [first] = origins;
  const graphNodeIds = [...new Set(origins.flatMap((origin) => origin.graphNodeIds ?? []))];
  const styleEntityIds = [...new Set(origins.flatMap((origin) => origin.styleEntityIds ?? []))];
  const assetEntityIds = [...new Set(origins.flatMap((origin) => origin.assetEntityIds ?? []))];

  return {
    ...(graphNodeIds.length > 0 ? { graphNodeIds } : {}),
    ...(styleEntityIds.length > 0 ? { styleEntityIds } : {}),
    ...(assetEntityIds.length > 0 ? { assetEntityIds } : {}),
    ...(first?.source ? { source: first.source } : {}),
    ...(first?.componentProvenance ? { componentProvenance: first.componentProvenance } : {}),
    ...(first?.templateAreaRef ? { templateAreaRef: first.templateAreaRef } : {}),
    ...(first?.templateAreaKind ? { templateAreaKind: first.templateAreaKind } : {}),
  };
}

function tableCellPlainTextFragment(child: LayoutInputContentNode): LayoutInputText | undefined {
  if (child.kind !== "text") {
    return undefined;
  }

  const props = normalizeTextProps(child.props);
  const runs = extractRichTextRuns(child.children, props.textTransform);
  if (runs.some((run) => run.style || run.hyperlink)) {
    return undefined;
  }

  return {
    ...child,
    props,
    children: [runs.map((run) => run.text).join("")],
  };
}

function normalizedTextPropsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => normalizedTextPropsEqual(value, right[index]))
    );
  }
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return false;
  }

  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return [...keys].every((key) => normalizedTextPropsEqual(leftRecord[key], rightRecord[key]));
}

function coalesceTableCellPlainTextFragments(
  children: ReadonlyArray<LayoutInputContentNode>,
): ReadonlyArray<LayoutInputContentNode> {
  const output: LayoutInputContentNode[] = [];
  let pendingTextChildren: LayoutInputTextChild[] = [];
  let pendingTextProps: TextNormalizationInput | undefined;
  let pendingOrigins: ProjectedLayoutOrigin[] = [];

  const flushPendingText = (): void => {
    if (!pendingTextProps || pendingTextChildren.length === 0) {
      return;
    }

    const origin = mergedTableCellTextOrigin(pendingOrigins);
    output.push({
      kind: "text",
      props: pendingTextProps,
      children: pendingTextChildren,
      ...(origin ? { origin } : {}),
    });
    pendingTextChildren = [];
    pendingTextProps = undefined;
    pendingOrigins = [];
  };

  for (const child of children) {
    const textFragment = tableCellPlainTextFragment(child);
    if (!textFragment) {
      flushPendingText();
      output.push(child);
      continue;
    }

    if (pendingTextProps && !normalizedTextPropsEqual(pendingTextProps, textFragment.props)) {
      flushPendingText();
    }
    pendingTextProps ??= textFragment.props;
    pendingTextChildren.push(...flattenTextChildren(textFragment.children));
    if (textFragment.origin) {
      pendingOrigins.push(textFragment.origin);
    }
  }

  flushPendingText();
  return output;
}

function tableCellChildrenWithInheritedTextStyle(
  children: ReadonlyArray<LayoutInputContentNode>,
  cellProps: NormalizedTableCellProps,
): ReadonlyArray<LayoutInputContentNode> {
  const coalescedChildren = coalesceTableCellPlainTextFragments(children);
  const shouldFillSingleTextChild =
    cellProps.verticalAlign !== undefined &&
    coalescedChildren.length === 1 &&
    coalescedChildren[0]?.kind === "text";

  return coalescedChildren.map((child) => {
    if (child.kind !== "text") {
      return child;
    }

    let props = inheritTableCellTextProps(cellProps, child.props);
    if (authoredTextProp(props, "fontSize") === undefined) {
      props = { ...props, fontSize: PRESENTATION_TABLE_DEFAULTS.cellTextFontSize };
    }
    if (authoredTextProp(props, "whiteSpace") === undefined) {
      props = { ...props, whiteSpace: PRESENTATION_TABLE_DEFAULTS.cellWhiteSpace };
    }
    if (shouldFillSingleTextChild && tableCellTextCanFillCellHeight(props)) {
      props = { ...props, height: "100%" };
    }

    return props === child.props ? child : { ...child, props };
  });
}

function resolveCornerRadiusEmu(
  value: DeckLength | undefined,
  frame: Frame,
  context?: LengthResolutionContext,
): number {
  return parseLength(value, Math.min(frame.widthEmu, frame.heightEmu), 0, context);
}

function unsupportedObjectPositionSemantics(input: {
  readonly value?: string;
  readonly resolved?: ObjectPositionIR;
}): readonly ProjectedUnsupportedSemantic[] {
  if (input.value === undefined || input.resolved !== undefined) {
    return [];
  }

  const unsupported = unsupportedSemantic({
    feature: "image",
    property: "objectPosition",
    value: input.value,
    error: new Error("Unsupported objectPosition value."),
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["authoredObjectPosition"],
      missing: ["projectedObjectPosition"],
    },
  });

  return unsupported ? [unsupported] : [];
}

function parseCropValue(
  value: NonNullable<ImageStyle["crop"]>[keyof NonNullable<ImageStyle["crop"]>],
): number {
  if (value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    const normalized = Math.abs(value) > 1 ? value / 100 : value;
    return Math.max(0, Math.min(1, normalized));
  }

  if (value.endsWith("%")) {
    return Math.max(0, Math.min(1, Number.parseFloat(value.slice(0, -1)) / 100));
  }

  return 0;
}

function parseImageCrop(
  crop: ImageStyle["crop"],
): { top: number; right: number; bottom: number; left: number } | undefined {
  if (!crop) {
    return undefined;
  }

  const normalized = {
    top: parseCropValue(crop.top),
    right: parseCropValue(crop.right),
    bottom: parseCropValue(crop.bottom),
    left: parseCropValue(crop.left),
  };

  if (normalized.left + normalized.right >= 1) {
    throw new Error("Image crop left and right must leave positive source width.");
  }

  if (normalized.top + normalized.bottom >= 1) {
    throw new Error("Image crop top and bottom must leave positive source height.");
  }

  if (
    normalized.top === 0 &&
    normalized.right === 0 &&
    normalized.bottom === 0 &&
    normalized.left === 0
  ) {
    return undefined;
  }

  return normalized;
}
function sortNodesForPaint(nodes: ReadonlyArray<ProjectedLayoutNode>): ProjectedLayoutNode[] {
  return nodes
    .map((node, siblingOrder) =>
      node.kind === "group"
        ? {
            ...node,
            siblingOrder,
            children: sortNodesForPaint(node.children),
          }
        : {
            ...node,
            siblingOrder,
          },
    )
    .sort(
      (left, right) =>
        (left.zIndex ?? 0) - (right.zIndex ?? 0) || left.siblingOrder - right.siblingOrder,
    );
}

function resolveAlignContentOffset(
  alignContent: CssAlignContent | undefined,
  availableEmu: number,
  usedEmu: number,
  lineCount: number,
) {
  const free = Math.max(availableEmu - usedEmu, 0);

  if (alignContent === "center") {
    return { offsetEmu: free / 2, extraGapEmu: 0, extraSizeEmu: 0 };
  }

  if (alignContent === "end" || alignContent === "flex-end") {
    return { offsetEmu: free, extraGapEmu: 0, extraSizeEmu: 0 };
  }

  if (alignContent === "space-between") {
    return {
      offsetEmu: 0,
      extraGapEmu: lineCount > 1 ? free / (lineCount - 1) : 0,
      extraSizeEmu: 0,
    };
  }

  if (alignContent === "space-around") {
    const gap = lineCount > 0 ? free / lineCount : 0;
    return { offsetEmu: gap / 2, extraGapEmu: gap, extraSizeEmu: 0 };
  }

  if (alignContent === "space-evenly") {
    const gap = lineCount > 0 ? free / (lineCount + 1) : 0;
    return { offsetEmu: gap, extraGapEmu: gap, extraSizeEmu: 0 };
  }

  if (alignContent === "stretch") {
    return {
      offsetEmu: 0,
      extraGapEmu: 0,
      extraSizeEmu: lineCount > 0 ? free / lineCount : 0,
    };
  }

  return { offsetEmu: 0, extraGapEmu: 0, extraSizeEmu: 0 };
}
function getChildPadding(
  node: LayoutChildNode,
  context?: LengthResolutionContext,
  percentageBaseEmu = 0,
) {
  switch (node.kind) {
    case "view":
    case "table":
      return parseSpacing(node.props.padding, context, percentageBaseEmu);
    case "text": {
      const { props } = node;
      return parseSpacing(props.padding, getTextLengthContext(props, context), percentageBaseEmu);
    }
    case "image":
      return EMPTY_SPACING;
    case "video":
      return EMPTY_SPACING;
    case "shape":
      return EMPTY_SPACING;
  }
}

function getNodeLengthContext(
  node: LayoutChildNode,
  context?: LengthResolutionContext,
): LengthResolutionContext | undefined {
  if (node.kind !== "text") {
    return context;
  }

  return {
    ...context,
    ...getTextLengthContext(node.props, context),
  };
}

function resolveChildMainLength(node: LayoutChildNode, axis: StackAxis): DeckLength | undefined {
  const flexBasis = node.props.flexBasis;
  if (flexBasis !== undefined && flexBasis !== "auto") {
    return flexBasis;
  }

  return node.props[axis === "horizontal" ? "width" : "height"];
}

function resolveTextFontSizePt(
  props: NormalizedTextProps,
  context?: LengthResolutionContext,
): number {
  return parsePointValue(props.fontSize, DEFAULT_TEXT_FONT_SIZE_PT, context);
}

function resolveTextLineHeightPt(
  props: NormalizedTextProps,
  context?: LengthResolutionContext,
): number {
  const fontSizePt = resolveTextFontSizePt(props, context);
  if (props.lineHeight === undefined || props.lineHeight === "normal") {
    return fontSizePt * DEFAULT_NORMAL_LINE_HEIGHT_MULTIPLE;
  }
  if (typeof props.lineHeight === "number") {
    return fontSizePt * props.lineHeight;
  }
  return parsePointValue(props.lineHeight, fontSizePt * DEFAULT_NORMAL_LINE_HEIGHT_MULTIPLE, {
    ...context,
    fontSizePt,
  });
}

function estimateLayoutCharacterWidthPt(
  character: string,
  fontSizePt: number,
  fontMetrics: LengthResolutionContext["fontMetrics"] = [],
  standardFontIsBold = false,
): number {
  for (const font of fontMetrics) {
    const fontWidthUnits = textFontCharacterWidthUnits(character, font);
    if (fontWidthUnits !== undefined) {
      return (fontSizePt * fontWidthUnits) / 1000;
    }
  }

  const standardWidthUnits = standardTextCharacterWidthUnits(character, standardFontIsBold);
  if (standardWidthUnits !== undefined) {
    return (fontSizePt * standardWidthUnits) / 1000;
  }

  if (/\s/u.test(character)) {
    return fontSizePt * 0.278;
  }
  if (/[ilI.,'`!|]/u.test(character)) {
    return fontSizePt * 0.25;
  }
  if (/[mwMW@%]/u.test(character)) {
    return fontSizePt * 0.8;
  }
  if (/[A-Z]/u.test(character)) {
    return fontSizePt * 0.65;
  }
  if (character.charCodeAt(0) > 0x7f) {
    return fontSizePt;
  }
  return fontSizePt * 0.5;
}

function estimateLayoutTextWidthPt(
  text: string,
  fontSizePt: number,
  fontMetrics: LengthResolutionContext["fontMetrics"] = [],
  standardFontIsBold = false,
  charSpacingPt = 0,
  fallbackTextWidthSafetyFactor = 1.15,
): number {
  const characterCount = Array.from(text).length;
  const width = Array.from(text).reduce(
    (total, character) =>
      total +
      estimateLayoutCharacterWidthPt(character, fontSizePt, fontMetrics, standardFontIsBold),
    0,
  );
  const shapedWidthUnits =
    fontMetrics.length === 1 ? textFontShapedWidthUnits(text, fontMetrics[0]) : {};
  if (shapedWidthUnits.value !== undefined) {
    return (
      (fontSizePt * shapedWidthUnits.value) / 1000 + Math.max(0, characterCount - 1) * charSpacingPt
    );
  }
  const kerning =
    fontMetrics.length === 1 ? textFontKerningAdjustments(text, fontMetrics[0]) : undefined;
  const fallbackWidthSafetyFactor = fontMetrics.length === 0 ? fallbackTextWidthSafetyFactor : 1;
  return (
    (width +
      (kerning?.reduce((total, adjustment) => total + (fontSizePt * adjustment) / 1000, 0) ?? 0)) *
      fallbackWidthSafetyFactor +
    Math.max(0, characterCount - 1) * charSpacingPt
  );
}

type EstimatedTextRun = {
  readonly text: string;
  readonly fontSizePt: number;
  readonly lineHeightPt: number;
  readonly fonts?: readonly TextFontMetrics[];
  readonly standardFontIsBold: boolean;
  readonly charSpacingPt: number;
  readonly fallbackTextWidthSafetyFactor: number;
};

function estimateWrappedTextLineHeights(input: {
  readonly runs: readonly EstimatedTextRun[];
  readonly availableWidthPt: number;
  readonly breakWords?: boolean;
  readonly wrap?: boolean;
}): readonly number[] {
  const firstRun = input.runs[0];
  const lineHeights: number[] = [firstRun?.lineHeightPt ?? 0];
  let currentWidth = 0;
  let hasContentOnLine = false;
  let pendingSpaceWidth = 0;

  const markCurrentLine = (lineHeightPt: number): void => {
    const currentIndex = Math.max(0, lineHeights.length - 1);
    lineHeights[currentIndex] = Math.max(lineHeights[currentIndex] ?? 0, lineHeightPt);
  };
  const nextLine = (lineHeightPt: number): void => {
    lineHeights.push(lineHeightPt);
    currentWidth = 0;
    hasContentOnLine = false;
    pendingSpaceWidth = 0;
  };

  if (input.runs.length === 0) {
    return [0];
  }

  for (const run of input.runs) {
    const fontMetrics = run.fonts ?? [];
    for (const [lineIndex, line] of run.text.split("\n").entries()) {
      if (lineIndex > 0) {
        nextLine(run.lineHeightPt);
      }

      const tokens = line.match(/\s+|\S+/gu) ?? [];
      for (const token of tokens) {
        markCurrentLine(run.lineHeightPt);
        if (/^\s+$/u.test(token)) {
          pendingSpaceWidth += estimateLayoutTextWidthPt(
            token,
            run.fontSizePt,
            fontMetrics,
            run.standardFontIsBold,
            run.charSpacingPt,
            run.fallbackTextWidthSafetyFactor,
          );
          continue;
        }

        const wordWidth = estimateLayoutTextWidthPt(
          token,
          run.fontSizePt,
          fontMetrics,
          run.standardFontIsBold,
          run.charSpacingPt,
          run.fallbackTextWidthSafetyFactor,
        );
        const spaceWidth =
          hasContentOnLine && pendingSpaceWidth > 0 ? pendingSpaceWidth + 2 * run.charSpacingPt : 0;
        if (
          input.wrap !== false &&
          input.availableWidthPt > 0 &&
          hasContentOnLine &&
          currentWidth + spaceWidth + wordWidth > input.availableWidthPt &&
          !(input.breakWords && wordWidth > input.availableWidthPt)
        ) {
          nextLine(run.lineHeightPt);
        }

        if (input.breakWords && input.availableWidthPt > 0 && wordWidth > input.availableWidthPt) {
          if (hasContentOnLine && pendingSpaceWidth > 0) {
            if (currentWidth + pendingSpaceWidth > input.availableWidthPt) {
              nextLine(run.lineHeightPt);
            } else {
              currentWidth += pendingSpaceWidth;
            }
          }
          pendingSpaceWidth = 0;
          for (const character of Array.from(token)) {
            const characterWidth =
              estimateLayoutCharacterWidthPt(
                character,
                run.fontSizePt,
                fontMetrics,
                run.standardFontIsBold,
              ) + (currentWidth > 0 ? run.charSpacingPt : 0);
            if (
              input.wrap !== false &&
              currentWidth > 0 &&
              currentWidth + characterWidth > input.availableWidthPt
            ) {
              nextLine(run.lineHeightPt);
            }
            currentWidth += characterWidth;
            hasContentOnLine = true;
            markCurrentLine(run.lineHeightPt);
          }
        } else {
          currentWidth += spaceWidth + wordWidth;
          hasContentOnLine = true;
        }
        pendingSpaceWidth = 0;
      }
    }
  }

  return lineHeights;
}

function estimateTextAutoContentSize(
  node: Extract<LayoutChildNode, { kind: "text" }>,
  dimension: "width" | "height",
  parent: Frame,
  context?: LengthResolutionContext,
  placement?: Placement,
): number {
  const textContext = getTextLengthContext(node.props, context);
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = parseSpacing(
    node.props.padding,
    textContext,
    parent.widthEmu,
  );

  if (dimension === "width") {
    return parent.widthEmu;
  }

  const fontSizePt = resolveTextFontSizePt(node.props, textContext);
  const lineHeightPt = resolveTextLineHeightPt(node.props, textContext);
  const charSpacingPt = resolveCharacterSpacing(node.props.charSpacing, textContext) ?? 0;
  const authoredWidth = authoredLengthOrUndefined(node.props.width);
  const specifiedWidthEmu =
    authoredWidth === undefined
      ? undefined
      : parseLength(authoredWidth, parent.widthEmu, 0, textContext);
  const outerWidthEmu = specifiedWidthEmu ?? placement?.widthEmu ?? parent.widthEmu;
  const availableWidthEmu =
    specifiedWidthEmu !== undefined && node.props.boxSizing === "content-box"
      ? specifiedWidthEmu
      : Math.max(outerWidthEmu - paddingLeft - paddingRight, 0);
  const availableWidthPt = (availableWidthEmu / EMU_PER_INCH) * POINTS_PER_INCH;
  const runs = extractRichTextRuns(node.source.children, node.props.textTransform, textContext);
  const estimatedRuns: EstimatedTextRun[] = runs.map((run) => {
    const runFontSizePt = run.style?.fontSizePt ?? fontSizePt;
    const runFonts = textFontMetricsForStyleCandidates({
      family: run.style?.fontFamily ?? node.props.fontFamily,
      weight: run.style?.fontWeight ?? node.props.fontWeight,
      style:
        run.style?.italic === undefined
          ? node.props.fontStyle
          : run.style.italic
            ? "italic"
            : "normal",
      metrics: textContext?.fontMetrics,
    });
    const runLineHeightPt =
      run.style?.lineSpacing ??
      (run.style?.lineSpacingMultiple !== undefined
        ? runFontSizePt * run.style.lineSpacingMultiple
        : run.style?.fontSizePt !== undefined
          ? (runFontSizePt / fontSizePt) * lineHeightPt
          : lineHeightPt);
    return {
      text: run.text,
      fontSizePt: runFontSizePt,
      lineHeightPt: runLineHeightPt,
      standardFontIsBold:
        run.style?.fontWeight === "bold" ||
        (typeof run.style?.fontWeight === "number" && run.style.fontWeight >= 600) ||
        (run.style?.fontWeight === undefined &&
          (node.props.fontWeight === "bold" ||
            (typeof node.props.fontWeight === "number" && node.props.fontWeight >= 600))),
      charSpacingPt: run.style?.charSpacing ?? charSpacingPt,
      fallbackTextWidthSafetyFactor: textContext?.fallbackTextWidthSafetyFactor ?? 1.15,
      ...(runFonts.length > 0 ? { fonts: runFonts } : {}),
    };
  });
  const lineHeights = estimateWrappedTextLineHeights({
    runs: estimatedRuns,
    availableWidthPt,
    wrap: node.props.wrap,
    ...(node.props.wordBreak === "break-all" ||
    node.props.wordBreak === "break-word" ||
    node.props.overflowWrap === "break-word" ||
    node.props.overflowWrap === "anywhere"
      ? { breakWords: true }
      : {}),
  });

  const textContentHeightPt =
    lineHeights.length === 0
      ? lineHeightPt
      : lineHeights.slice(0, -1).reduce((total, height) => total + height, 0) +
        (lineHeights.at(-1) ?? lineHeightPt);
  const paragraphSpacingBeforePt =
    node.props.paragraphSpacingBefore === undefined
      ? 0
      : parsePointValue(node.props.paragraphSpacingBefore, 0, textContext);
  const paragraphSpacingAfterPt =
    node.props.paragraphSpacingAfter === undefined
      ? 0
      : parsePointValue(node.props.paragraphSpacingAfter, 0, textContext);
  const contentHeightPt = paragraphSpacingBeforePt + textContentHeightPt + paragraphSpacingAfterPt;
  return (contentHeightPt / POINTS_PER_INCH) * EMU_PER_INCH + paddingTop + paddingBottom;
}

function textMayNeedWrappedMeasurement(text: string, props: NormalizedTextProps): boolean {
  if (!text || props.wrap === false) {
    return false;
  }

  return text.includes("\n") || text.trim().length > 80;
}

function unsupportedWrappedTextMeasurementSemantics(
  props: NormalizedTextProps,
  text: string,
): readonly ProjectedUnsupportedSemantic[] {
  if (!textMayNeedWrappedMeasurement(text, props)) {
    return [];
  }

  const hasAuthoredHeight = authoredLengthOrUndefined(props.height) !== undefined;
  const hasAuthoredInset = props.inset !== undefined && !hasCssWideKeywordToken(props.inset);
  const hasAuthoredTop = authoredLengthOrUndefined(props.top) !== undefined;
  const hasAuthoredBottom = authoredLengthOrUndefined(props.bottom) !== undefined;
  if (hasAuthoredHeight || hasAuthoredInset || (hasAuthoredTop && hasAuthoredBottom)) {
    return [];
  }

  const semantic = unsupportedSemantic({
    feature: "layout",
    property: "height",
    value: "auto",
    error: new Error(
      "Auto-height wrapping uses deterministic deckjsx glyph-width estimates; exact font metrics and shaping remain outside the shared layout subset.",
    ),
    fallback: {
      strategy: "synthesizeFallbackFrame",
      preserves: [
        "availableInlineSize",
        "wrappedLineCount",
        "lineHeightAutoHeight",
        "characterSpacing",
        "paragraphSpacing",
      ],
      missing: ["fontSpecificGlyphMetrics", "exactTextShaping"],
    },
  });
  return semantic ? [semantic] : [];
}

function estimateViewAutoContentSize(
  node: Extract<LayoutChildNode, { kind: "view" }>,
  dimension: "width" | "height",
  parent: Frame,
  context?: LengthResolutionContext,
): number {
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = parseSpacing(
    node.props.padding,
    context,
    parent.widthEmu,
  );
  const authoredWidth = authoredLengthOrUndefined(node.props.width);
  const authoredHeight = authoredLengthOrUndefined(node.props.height);
  const specifiedWidthEmu =
    authoredWidth === undefined
      ? undefined
      : parseLength(authoredWidth, parent.widthEmu, 0, context);
  const specifiedHeightEmu =
    authoredHeight === undefined
      ? undefined
      : parseLength(authoredHeight, parent.heightEmu, 0, context);
  const outerWidthEmu =
    specifiedWidthEmu === undefined || node.props.boxSizing === "content-box"
      ? (specifiedWidthEmu ?? parent.widthEmu) +
        (specifiedWidthEmu === undefined ? 0 : paddingLeft + paddingRight)
      : specifiedWidthEmu;
  const outerHeightEmu =
    specifiedHeightEmu === undefined || node.props.boxSizing === "content-box"
      ? (specifiedHeightEmu ?? parent.heightEmu) +
        (specifiedHeightEmu === undefined ? 0 : paddingTop + paddingBottom)
      : specifiedHeightEmu;
  const contentFrame: Frame = {
    xEmu: parent.xEmu + paddingLeft,
    yEmu: parent.yEmu + paddingTop,
    widthEmu: Math.max(outerWidthEmu - paddingLeft - paddingRight, 0),
    heightEmu: Math.max(outerHeightEmu - paddingTop - paddingBottom, 0),
  };
  const children = node.source.children
    .map(
      (child, siblingOrder): LayoutChildNode => layoutChildFromNode(child, siblingOrder, context),
    )
    .filter((child) => child.props.display !== "none" && !hasExplicitFrameInput(child));

  if (children.length === 0) {
    return dimension === "width" ? paddingLeft + paddingRight : paddingTop + paddingBottom;
  }

  const direction =
    node.props.layout === "stack" ? (node.props.direction ?? "vertical") : "vertical";
  const mainGapEmu = resolveMainGap(
    direction,
    node.props.gap,
    node.props.rowGap,
    node.props.columnGap,
    context,
    direction === "horizontal" ? contentFrame.widthEmu : contentFrame.heightEmu,
  );

  if (
    (dimension === "height" && direction === "vertical") ||
    (dimension === "width" && direction === "horizontal")
  ) {
    if (dimension === "height" && node.props.layout !== "stack") {
      let usedBlock = 0;
      let previousMarginBottom: number | undefined;
      children.forEach((child, index) => {
        const [marginTop, , marginBottom] = getNodeMargin(child, context, contentFrame.widthEmu);
        usedBlock +=
          (previousMarginBottom === undefined
            ? marginTop
            : collapseVerticalMargins(previousMarginBottom, marginTop)) +
          estimateChildContentSize(child, "height", contentFrame, "vertical", context) +
          (index > 0 ? mainGapEmu : 0);
        previousMarginBottom = marginBottom;
      });
      usedBlock += previousMarginBottom ?? 0;
      return usedBlock + paddingTop + paddingBottom;
    }

    const usedMain =
      children.reduce(
        (sum, child) => sum + estimateChildMainSize(child, direction, contentFrame, context),
        0,
      ) +
      Math.max(children.length - 1, 0) * mainGapEmu;
    return (
      usedMain + (dimension === "height" ? paddingTop + paddingBottom : paddingLeft + paddingRight)
    );
  }

  const usedCross = children.reduce(
    (max, child) => Math.max(max, estimateChildCrossSize(child, direction, contentFrame, context)),
    0,
  );
  return (
    usedCross + (dimension === "height" ? paddingTop + paddingBottom : paddingLeft + paddingRight)
  );
}

function collapseVerticalMargins(previous: number, next: number): number {
  if (previous >= 0 && next >= 0) {
    return Math.max(previous, next);
  }

  if (previous <= 0 && next <= 0) {
    return Math.min(previous, next);
  }

  return previous + next;
}

function estimateChildContentSize(
  node: LayoutChildNode,
  dimension: "width" | "height",
  parent: Frame,
  mainAxis?: StackAxis,
  context?: LengthResolutionContext,
) {
  const aspectRatio = parseAspectRatio(node.props.aspectRatio);
  const isMainDimension =
    (mainAxis === "horizontal" && dimension === "width") ||
    (mainAxis === "vertical" && dimension === "height");
  const basis = dimension === "width" ? parent.widthEmu : parent.heightEmu;
  const directValue =
    isMainDimension && mainAxis ? resolveChildMainLength(node, mainAxis) : node.props[dimension];
  const authoredValue = authoredLengthOrUndefined(directValue);

  if (authoredValue !== undefined) {
    return inflateSpecifiedBoxSize(
      parseLength(authoredValue, basis, 0, getNodeLengthContext(node, context)),
      node.kind === "image" || node.kind === "video"
        ? "border-box"
        : (node.props.boxSizing ?? "border-box"),
      getChildPadding(node, context, parent.widthEmu),
      dimension,
    );
  }

  if (node.kind === "text") {
    if (dimension === "width" && mainAxis === "horizontal") {
      return 0;
    }
    return estimateTextAutoContentSize(node, dimension, parent, context);
  }

  if (node.kind === "view") {
    return estimateViewAutoContentSize(node, dimension, parent, context);
  }

  if (aspectRatio === undefined) {
    return 0;
  }

  const oppositeDimension = dimension === "width" ? "height" : "width";
  const oppositeBasis = oppositeDimension === "width" ? parent.widthEmu : parent.heightEmu;
  const oppositeIsMain =
    (mainAxis === "horizontal" && oppositeDimension === "width") ||
    (mainAxis === "vertical" && oppositeDimension === "height");
  const oppositeValue =
    oppositeIsMain && mainAxis
      ? resolveChildMainLength(node, mainAxis)
      : node.props[oppositeDimension];
  const authoredOppositeValue = authoredLengthOrUndefined(oppositeValue);

  if (authoredOppositeValue === undefined) {
    return 0;
  }

  const oppositeSize = parseLength(
    authoredOppositeValue,
    oppositeBasis,
    0,
    getNodeLengthContext(node, context),
  );
  const derivedSize =
    dimension === "width" ? oppositeSize * aspectRatio : oppositeSize / aspectRatio;
  return inflateSpecifiedBoxSize(
    derivedSize,
    node.kind === "image" || node.kind === "video"
      ? "border-box"
      : (node.props.boxSizing ?? "border-box"),
    getChildPadding(node, context, parent.widthEmu),
    dimension,
  );
}
function getNodeMargin(
  node: LayoutChildNode,
  context?: LengthResolutionContext,
  percentageBaseEmu = 0,
) {
  switch (node.kind) {
    case "view":
    case "table":
      return parseSpacingAllowAuto(node.props.margin, context, percentageBaseEmu);
    case "text": {
      const { props } = node;
      return parseSpacingAllowAuto(
        props.margin,
        getTextLengthContext(props, context),
        percentageBaseEmu,
      );
    }
    case "image":
      return parseSpacingAllowAuto(node.props.margin, context, percentageBaseEmu);
    case "video":
      return parseSpacingAllowAuto(node.props.margin, context, percentageBaseEmu);
    case "shape":
      return parseSpacingAllowAuto(node.props.margin, context, percentageBaseEmu);
  }
}

function estimateChildMainSize(
  node: LayoutChildNode,
  axis: StackAxis,
  parent: Frame,
  context?: LengthResolutionContext,
) {
  const [top, right, bottom, left] = getNodeMargin(node, context, parent.widthEmu);
  const margin = axis === "horizontal" ? left + right : top + bottom;
  return (
    estimateChildContentSize(
      node,
      axis === "horizontal" ? "width" : "height",
      parent,
      axis,
      context,
    ) + margin
  );
}

function estimateChildCrossSize(
  node: LayoutChildNode,
  axis: StackAxis,
  parent: Frame,
  context?: LengthResolutionContext,
) {
  const [top, right, bottom, left] = getNodeMargin(node, context, parent.widthEmu);
  const margin = axis === "horizontal" ? top + bottom : left + right;
  return (
    estimateChildContentSize(
      node,
      axis === "horizontal" ? "height" : "width",
      parent,
      axis,
      context,
    ) + margin
  );
}
function shouldStretchGridDimension(node: LayoutChildNode, dimension: "width" | "height") {
  if (hasAuthoredLength(node.props[dimension])) {
    return false;
  }

  const aspectRatio = parseAspectRatio(node.props.aspectRatio);
  if (!aspectRatio) {
    return true;
  }

  const oppositeDimension = dimension === "width" ? "height" : "width";
  return !hasAuthoredLength(node.props[oppositeDimension]);
}
function resolveChildGridPlacements(
  node: LayoutChildNode,
  namedAreas: Map<string, NamedGridArea>,
): {
  rowPlacement?: GridPlacement;
  columnPlacement?: GridPlacement;
} {
  const explicitRow =
    resolveGridPlacementFromLonghands(node.props.gridRowStart, node.props.gridRowEnd) ??
    parseGridPlacement(node.props.gridRow);
  const explicitColumn =
    resolveGridPlacementFromLonghands(node.props.gridColumnStart, node.props.gridColumnEnd) ??
    parseGridPlacement(node.props.gridColumn);
  const shorthand = parseGridAreaShorthand(node.props.gridArea);
  const namedPlacement =
    node.props.gridArea && !node.props.gridArea.includes("/")
      ? namedAreas.get(node.props.gridArea)
      : undefined;

  return {
    rowPlacement:
      explicitRow ??
      shorthand.rowPlacement ??
      (namedPlacement
        ? {
            start: namedPlacement.row,
            span: namedPlacement.rowSpan,
          }
        : undefined),
    columnPlacement:
      explicitColumn ??
      shorthand.columnPlacement ??
      (namedPlacement
        ? {
            start: namedPlacement.column,
            span: namedPlacement.columnSpan,
          }
        : undefined),
  };
}

function resolveGridContainerSpec(
  parentFrame: Frame,
  options: Pick<
    ViewStyle,
    | "padding"
    | "rowGap"
    | "columnGap"
    | "gridTemplateAreas"
    | "gridTemplateColumns"
    | "gridTemplateRows"
    | "alignItems"
    | "alignContent"
    | "justifyContent"
    | "justifyItems"
    | "placeItems"
    | "placeContent"
  >,
  context?: LengthResolutionContext,
): ResolvedGridContainerSpec {
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = parseSpacing(
    options.padding,
    context,
    parentFrame.widthEmu,
  );
  const contentX = parentFrame.xEmu + paddingLeft;
  const contentY = parentFrame.yEmu + paddingTop;
  const contentWidth = Math.max(parentFrame.widthEmu - paddingLeft - paddingRight, 0);
  const contentHeight = Math.max(parentFrame.heightEmu - paddingTop - paddingBottom, 0);
  const contentFrame: Frame = {
    xEmu: contentX,
    yEmu: contentY,
    widthEmu: contentWidth,
    heightEmu: contentHeight,
  };
  const columnGapEmu = parseLength(options.columnGap ?? options.rowGap, contentWidth, 0, context);
  const rowGapEmu = parseLength(options.rowGap ?? options.columnGap, contentHeight, 0, context);
  const placeItems = parsePlaceItems(options.placeItems);
  const placeContent = parsePlaceContent(options.placeContent);
  const namedAreas = parseGridTemplateAreas(options.gridTemplateAreas);
  const columnTemplate = resolveGridTemplateTracks(
    options.gridTemplateColumns,
    contentWidth,
    columnGapEmu,
    context,
  );
  const rowTemplate = resolveGridTemplateTracks(
    options.gridTemplateRows,
    contentHeight,
    rowGapEmu,
    context,
  );

  return {
    contentX,
    contentY,
    contentWidth,
    contentHeight,
    contentFrame,
    columnGapEmu,
    rowGapEmu,
    defaultAlignSelf: placeItems.alignItems ?? options.alignItems,
    defaultJustifySelf: placeItems.justifyItems ?? options.justifyItems,
    resolvedAlignContent: placeContent.alignContent ?? options.alignContent,
    resolvedJustifyContent: placeContent.justifyContent ?? options.justifyContent,
    namedAreas,
    columnTemplate,
    rowTemplate,
    areaColumnCount: Array.from(namedAreas.values()).reduce(
      (max, area) => Math.max(max, area.column + area.columnSpan - 1),
      0,
    ),
    areaRowCount: Array.from(namedAreas.values()).reduce(
      (max, area) => Math.max(max, area.row + area.rowSpan - 1),
      0,
    ),
  };
}

function compileGridChildren(
  authorChildren: LayoutChildNode[],
  parentFrame: Frame,
  idGenerator: IdGenerator,
  options: Pick<
    ViewStyle,
    | "padding"
    | "rowGap"
    | "columnGap"
    | "gridTemplateAreas"
    | "gridTemplateColumns"
    | "gridTemplateRows"
    | "gridAutoColumns"
    | "gridAutoRows"
    | "alignItems"
    | "alignContent"
    | "justifyContent"
    | "justifyItems"
    | "placeItems"
    | "placeContent"
    | "gridAutoFlow"
  >,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutNode[] {
  const spec = resolveGridContainerSpec(parentFrame, options, context);
  const orderedChildren = authorChildren
    .map((child, sourceIndex) => ({
      child,
      sourceIndex,
      order: child.props.order ?? 0,
      gridPlacementInfo: resolveChildGridPlacements(child, spec.namedAreas),
    }))
    .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex);
  const maxExplicitColumn = orderedChildren.reduce((max, { gridPlacementInfo }) => {
    const placement = gridPlacementInfo.columnPlacement;
    if (placement?.start === undefined) {
      return max;
    }

    return Math.max(max, placement.start + placement.span - 1);
  }, 0);
  const maxExplicitRow = orderedChildren.reduce((max, { gridPlacementInfo }) => {
    const placement = gridPlacementInfo.rowPlacement;
    if (placement?.start === undefined) {
      return max;
    }

    return Math.max(max, placement.start + placement.span - 1);
  }, 0);
  const resolvedColumnTemplate = [
    ...(spec.columnTemplate.tracks.length > 0 ? spec.columnTemplate.tracks : ["1fr"]),
    ...Array.from(
      {
        length: Math.max(
          Math.max(maxExplicitColumn, spec.areaColumnCount) -
            (spec.columnTemplate.tracks.length > 0 ? spec.columnTemplate.tracks.length : 1),
          0,
        ),
      },
      () =>
        typeof options.gridAutoColumns === "number"
          ? `${options.gridAutoColumns}in`
          : String(options.gridAutoColumns ?? "1fr"),
    ),
  ];
  const initialRowCount = Math.max(
    spec.rowTemplate.tracks.length > 0 ? spec.rowTemplate.tracks.length : 1,
    maxExplicitRow,
    spec.areaRowCount,
    1,
  );
  const initialColumnCount = resolvedColumnTemplate.length;
  const occupied: boolean[][] = [];
  const placements: Array<GridEntryPlacement<LayoutChildNode>> = [];
  let autoPlacementCursor: GridAutoPlacementCursor = { row: 1, column: 1 };

  for (const { child, gridPlacementInfo } of orderedChildren) {
    const placement = resolveAutoGridPlacement(
      occupied,
      gridPlacementInfo.rowPlacement,
      gridPlacementInfo.columnPlacement,
      initialColumnCount,
      initialRowCount,
      options.gridAutoFlow,
      autoPlacementCursor,
    );
    markGridItem(
      occupied,
      placement.row,
      placement.column,
      placement.rowSpan,
      placement.columnSpan,
    );
    placements.push({
      child,
      ...placement,
    });
    autoPlacementCursor = advanceGridAutoPlacementCursor(
      placement,
      initialColumnCount,
      initialRowCount,
      options.gridAutoFlow,
    );
  }

  const placementColumnCount = placements.reduce(
    (max, placement) => Math.max(max, placement.column + placement.columnSpan - 1),
    1,
  );
  const placementRowCount = placements.reduce(
    (max, placement) => Math.max(max, placement.row + placement.rowSpan - 1),
    1,
  );
  const columnCount = spec.columnTemplate.collapseTrailingAutoFitTracks
    ? Math.max(placementColumnCount, maxExplicitColumn, 1)
    : Math.max(placementColumnCount, initialColumnCount);
  const resolvedRowCount = spec.rowTemplate.collapseTrailingAutoFitTracks
    ? Math.max(placementRowCount, maxExplicitRow, 1)
    : Math.max(placementRowCount, initialRowCount);
  const fullyResolvedColumnTemplate =
    resolvedColumnTemplate.length >= columnCount
      ? resolvedColumnTemplate.slice(0, columnCount)
      : [
          ...resolvedColumnTemplate,
          ...Array.from({ length: columnCount - resolvedColumnTemplate.length }, () =>
            typeof options.gridAutoColumns === "number"
              ? `${options.gridAutoColumns}in`
              : String(options.gridAutoColumns ?? "1fr"),
          ),
        ];
  const resolvedRowTemplate =
    spec.rowTemplate.tracks.length >= resolvedRowCount
      ? spec.rowTemplate.tracks.slice(0, resolvedRowCount)
      : [
          ...spec.rowTemplate.tracks,
          ...Array.from({ length: resolvedRowCount - spec.rowTemplate.tracks.length }, () =>
            typeof options.gridAutoRows === "number"
              ? `${options.gridAutoRows}in`
              : String(options.gridAutoRows ?? "1fr"),
          ),
        ];
  const gridContentMetrics = {
    getMargin: (child: LayoutChildNode, metricContext?: LengthResolutionContext) =>
      getNodeMargin(child, metricContext, spec.contentWidth),
    estimateContentSize: (
      child: LayoutChildNode,
      dimension: "width" | "height",
      parent: Frame,
      metricContext?: LengthResolutionContext,
    ) => estimateChildContentSize(child, dimension, parent, undefined, metricContext),
  };
  const columnContentMinimums = resolveGridTrackContentMinimums(
    placements,
    fullyResolvedColumnTemplate,
    "column",
    spec.contentFrame,
    spec.columnGapEmu,
    gridContentMetrics,
    context,
  );
  const rowContentMinimums = resolveGridTrackContentMinimums(
    placements,
    resolvedRowTemplate.length > 0
      ? resolvedRowTemplate
      : Array.from({ length: resolvedRowCount }, () => "1fr"),
    "row",
    spec.contentFrame,
    spec.rowGapEmu,
    gridContentMetrics,
    context,
  );
  const columnTracks = resolveGridTracksWithContentMinimums(
    fullyResolvedColumnTemplate,
    spec.contentWidth,
    spec.columnGapEmu,
    columnContentMinimums,
    context,
  );
  const rowTracks = resolveGridTracksWithContentMinimums(
    resolvedRowTemplate.length > 0
      ? resolvedRowTemplate
      : Array.from({ length: resolvedRowCount }, () => "1fr"),
    spec.contentHeight,
    spec.rowGapEmu,
    rowContentMinimums,
    context,
  );
  const stretchedColumnTracks =
    spec.resolvedJustifyContent === "stretch"
      ? stretchTracksToFit(columnTracks, spec.contentWidth, spec.columnGapEmu)
      : columnTracks;
  const stretchedRowTracks =
    spec.resolvedAlignContent === "stretch"
      ? stretchTracksToFit(rowTracks, spec.contentHeight, spec.rowGapEmu)
      : rowTracks;
  const usedColumns =
    stretchedColumnTracks.reduce((sum, size) => sum + size, 0) +
    Math.max(stretchedColumnTracks.length - 1, 0) * spec.columnGapEmu;
  const usedRows =
    stretchedRowTracks.reduce((sum, size) => sum + size, 0) +
    Math.max(stretchedRowTracks.length - 1, 0) * spec.rowGapEmu;
  const inlinePacking = resolveJustifyOffset(
    spec.resolvedJustifyContent,
    spec.contentWidth,
    usedColumns,
    stretchedColumnTracks.length,
  );
  const blockPacking = resolveAlignContentOffset(
    spec.resolvedAlignContent,
    spec.contentHeight,
    usedRows,
    stretchedRowTracks.length,
  );
  const columnOffsets = resolveTrackOffsets(stretchedColumnTracks, spec.columnGapEmu).map(
    (offset) => offset + inlinePacking.offsetEmu,
  );
  const rowOffsets = resolveTrackOffsets(stretchedRowTracks, spec.rowGapEmu).map(
    (offset) => offset + blockPacking.offsetEmu,
  );

  return sortNodesForPaint(
    placements
      .map((placement) => {
        const { child, row, column, rowSpan, columnSpan } = placement;
        const [marginTop, marginRight, marginBottom, marginLeft] = getNodeMargin(
          child,
          context,
          spec.contentWidth,
        );
        const cellWidth =
          stretchedColumnTracks
            .slice(column - 1, column - 1 + columnSpan)
            .reduce((sum, size) => sum + size, 0) +
          Math.max(columnSpan - 1, 0) * spec.columnGapEmu;
        const cellHeight =
          stretchedRowTracks
            .slice(row - 1, row - 1 + rowSpan)
            .reduce((sum, size) => sum + size, 0) +
          Math.max(rowSpan - 1, 0) * spec.rowGapEmu;
        const cellFrame: Frame = {
          xEmu: spec.contentX + (columnOffsets[column - 1] ?? 0),
          yEmu: spec.contentY + (rowOffsets[row - 1] ?? 0),
          widthEmu: cellWidth,
          heightEmu: cellHeight,
        };
        const innerFrame: Frame = {
          xEmu: cellFrame.xEmu + marginLeft,
          yEmu: cellFrame.yEmu + marginTop,
          widthEmu: Math.max(cellWidth - marginLeft - marginRight, 0),
          heightEmu: Math.max(cellHeight - marginTop - marginBottom, 0),
        };

        const justifySelf = resolveGridSelfAlignment(
          parsePlaceSelf(child.props.placeSelf).justifySelf ??
            child.props.justifySelf ??
            spec.defaultJustifySelf,
        );
        const alignSelf = resolveGridSelfAlignment(
          parsePlaceSelf(child.props.placeSelf).alignSelf ??
            child.props.alignSelf ??
            spec.defaultAlignSelf,
        );
        const naturalWidth = estimateChildContentSize(
          child,
          "width",
          innerFrame,
          undefined,
          context,
        );
        const naturalHeight = estimateChildContentSize(
          child,
          "height",
          innerFrame,
          undefined,
          context,
        );
        const stretchWidth =
          justifySelf === "stretch" && shouldStretchGridDimension(child, "width");
        const stretchHeight =
          alignSelf === "stretch" && shouldStretchGridDimension(child, "height");
        const renderWidth = stretchWidth ? innerFrame.widthEmu : naturalWidth;
        const renderHeight = stretchHeight ? innerFrame.heightEmu : naturalHeight;
        const xOffset = resolveCrossOffset(
          stretchWidth ? "start" : justifySelf,
          Math.max(innerFrame.widthEmu - renderWidth, 0),
        );
        const yOffset = resolveCrossOffset(
          stretchHeight ? "start" : alignSelf,
          Math.max(innerFrame.heightEmu - renderHeight, 0),
        );
        const placementOverride: Placement = {};
        if (stretchWidth || justifySelf !== "stretch") {
          placementOverride.widthEmu = renderWidth;
        }
        if (stretchHeight || alignSelf !== "stretch") {
          placementOverride.heightEmu = renderHeight;
        }
        if (!stretchWidth) {
          placementOverride.xEmu = innerFrame.xEmu + xOffset;
        }
        if (!stretchHeight) {
          placementOverride.yEmu = innerFrame.yEmu + yOffset;
        }

        const compiled = compileNode(
          child,
          innerFrame,
          idGenerator,
          placementOverride,
          clipRect,
          context,
          resolutionOptions,
        );
        if (!compiled || !child.origin?.templateAreaRef) {
          return compiled;
        }

        return {
          ...compiled,
          origin: {
            ...compiled.origin,
            templateAreaFrame: cellFrame,
          },
        };
      })
      .filter((node): node is ProjectedLayoutNode => node !== null),
  );
}

function hasExplicitFrameInput(child: LayoutChildNode): boolean {
  const { props } = child;
  return props.position === "absolute" || child.origin?.templateAreaRef !== undefined;
}

function compileBlockFlowChildren(
  authorChildren: LayoutChildNode[],
  parentFrame: Frame,
  idGenerator: IdGenerator,
  options: Pick<ViewStyle, "padding" | "gap" | "rowGap" | "columnGap">,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutNode[] {
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = parseSpacing(
    options.padding,
    context,
    parentFrame.widthEmu,
  );
  const contentFrame: Frame = {
    xEmu: parentFrame.xEmu + paddingLeft,
    yEmu: parentFrame.yEmu + paddingTop,
    widthEmu: Math.max(parentFrame.widthEmu - paddingLeft - paddingRight, 0),
    heightEmu: Math.max(parentFrame.heightEmu - paddingTop - paddingBottom, 0),
  };
  const blockGapEmu = resolveMainGap(
    "vertical",
    options.gap,
    options.rowGap,
    options.columnGap,
    context,
    contentFrame.heightEmu,
  );
  let cursorY = contentFrame.yEmu;
  let previousMarginBottom: number | undefined;
  const flowNodes: ProjectedLayoutNode[] = [];

  for (const child of authorChildren) {
    const [marginTop, marginRight, marginBottom, marginLeft] = getNodeMargin(
      child,
      context,
      contentFrame.widthEmu,
    );
    const childWidth =
      authoredLengthOrUndefined(child.props.width) === undefined
        ? Math.max(contentFrame.widthEmu - marginLeft - marginRight, 0)
        : estimateChildContentSize(child, "width", contentFrame, undefined, context);
    const childHeight = estimateChildContentSize(
      child,
      "height",
      contentFrame,
      "vertical",
      context,
    );
    const collapsedMarginBefore =
      previousMarginBottom === undefined
        ? marginTop
        : collapseVerticalMargins(previousMarginBottom, marginTop);
    const placement: Placement = {
      xEmu: contentFrame.xEmu + marginLeft,
      yEmu: cursorY + collapsedMarginBefore,
      widthEmu: childWidth,
      heightEmu: childHeight,
    };

    const compiledNode = compileNode(
      child,
      contentFrame,
      idGenerator,
      placement,
      clipRect,
      context,
      resolutionOptions,
    );
    if (compiledNode) {
      flowNodes.push(compiledNode);
    }
    cursorY += collapsedMarginBefore + childHeight + blockGapEmu;
    previousMarginBottom = marginBottom;
  }

  return flowNodes;
}

function compileAbsoluteChildren(
  authorChildren: LayoutChildNode[],
  parentFrame: Frame,
  idGenerator: IdGenerator,
  options: Pick<ViewStyle, "padding" | "gap" | "rowGap" | "columnGap">,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutNode[] {
  const flowChildren = authorChildren.filter((child) => !hasExplicitFrameInput(child));
  const absoluteChildren = authorChildren.filter(hasExplicitFrameInput);
  const flowNodes = compileBlockFlowChildren(
    flowChildren,
    parentFrame,
    idGenerator,
    options,
    clipRect,
    context,
    resolutionOptions,
  );
  const absoluteNodes = absoluteChildren
    .map((child) =>
      compileNode(child, parentFrame, idGenerator, undefined, clipRect, context, resolutionOptions),
    )
    .filter((node): node is ProjectedLayoutNode => node !== null);

  return sortNodesForPaint(
    [...flowNodes, ...absoluteNodes].sort((left, right) => left.siblingOrder - right.siblingOrder),
  );
}

function compileChildren(
  children: ReadonlyArray<LayoutInputContentNode>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  layout: InternalLayoutMode | undefined,
  options: StackLayoutOptions,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutNode[] {
  const authorChildren: LayoutChildNode[] = children
    .map((child, siblingOrder): LayoutChildNode => {
      if (!isLayoutInputContentNode(child)) {
        throw new Error("Only deckjsx components can be children of View in structured layout.");
      }

      return layoutChildFromNode(child, siblingOrder, context);
    })
    .filter((child) => child.props.display !== "none");

  if (layout === "grid") {
    return compileGridChildren(
      authorChildren,
      parentFrame,
      idGenerator,
      {
        padding: options.padding,
        rowGap: options.rowGap,
        columnGap: options.columnGap,
        gridTemplateAreas: options.gridTemplateAreas,
        gridTemplateColumns: options.gridTemplateColumns,
        gridTemplateRows: options.gridTemplateRows,
        gridAutoColumns: options.gridAutoColumns,
        gridAutoRows: options.gridAutoRows,
        alignItems: options.alignItems,
        alignContent: options.alignContent,
        justifyContent: options.justifyContent,
        justifyItems: options.justifyItems,
        placeItems: options.placeItems,
        placeContent: options.placeContent,
        gridAutoFlow: options.gridAutoFlow,
      },
      clipRect,
      context,
      resolutionOptions,
    );
  }

  if (layout !== "stack") {
    return compileAbsoluteChildren(
      authorChildren,
      parentFrame,
      idGenerator,
      {
        padding: options.padding,
        gap: options.gap,
        rowGap: options.rowGap,
        columnGap: options.columnGap,
      },
      clipRect,
      context,
      resolutionOptions,
    );
  }

  const direction = options.direction ?? "vertical";
  const defaultAlignItems =
    options.alignItems ?? (options.display === "flex" ? "stretch" : undefined);
  const [paddingTop, paddingRight, paddingBottom, paddingLeft] = parseSpacing(
    options.padding,
    context,
    parentFrame.widthEmu,
  );
  const contentX = parentFrame.xEmu + paddingLeft;
  const contentY = parentFrame.yEmu + paddingTop;
  const contentWidth = Math.max(parentFrame.widthEmu - paddingLeft - paddingRight, 0);
  const contentHeight = Math.max(parentFrame.heightEmu - paddingTop - paddingBottom, 0);
  const contentFrame: Frame = {
    xEmu: contentX,
    yEmu: contentY,
    widthEmu: contentWidth,
    heightEmu: contentHeight,
  };
  const mainGapEmu = resolveMainGap(
    direction,
    options.gap,
    options.rowGap,
    options.columnGap,
    context,
    direction === "horizontal" ? contentWidth : contentHeight,
  );
  const crossGapEmu = resolveCrossGap(
    direction,
    options.gap,
    options.rowGap,
    options.columnGap,
    context,
    direction === "horizontal" ? contentHeight : contentWidth,
  );
  const stackEntries: Array<StackEntry<LayoutChildNode>> = authorChildren.map(
    (child, sourceIndex) => ({
      child,
      sourceIndex,
      order: child.props.order ?? 0,
      position: child.props.position,
    }),
  );
  const stackMetrics: StackMetrics<LayoutChildNode> = {
    estimateMainSize: estimateChildMainSize,
    estimateCrossSize: estimateChildCrossSize,
    getMargin: (child, metricContext) => getNodeMargin(child, metricContext, contentFrame.widthEmu),
    getFlexGrow: (child) => child.props.flexGrow ?? 0,
    getFlexShrink: (child) => child.props.flexShrink ?? 1,
  };
  const flowEntries = stackEntries
    .filter((entry) => entry.position !== "absolute")
    .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex);
  const absoluteEntries = stackEntries.filter((entry) => entry.position === "absolute");
  const availableMain = direction === "horizontal" ? contentWidth : contentHeight;
  const availableCross = direction === "horizontal" ? contentHeight : contentWidth;
  const lines = buildStackLines(
    flowEntries,
    direction,
    contentFrame,
    availableMain,
    mainGapEmu,
    options.flexWrap,
    stackMetrics,
    context,
  );
  const usedCross =
    lines.reduce((sum, line) => sum + line.crossSizeEmu, 0) +
    Math.max(lines.length - 1, 0) * crossGapEmu;
  const contentPacking = resolveAlignContentOffset(
    options.alignContent,
    availableCross,
    usedCross,
    lines.length,
  );
  let crossCursor = contentPacking.offsetEmu;
  const flowNodes: ProjectedLayoutNode[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    const mainAllocations = resolveFlexMainAllocations(
      line,
      direction,
      contentFrame,
      availableMain,
      mainGapEmu,
      stackMetrics,
      context,
    );
    const allocatedUsedMain =
      mainAllocations.reduce((sum, allocation) => sum + allocation.outerMainEmu, 0) +
      Math.max(line.entries.length - 1, 0) * mainGapEmu;
    const justify = resolveJustifyOffset(
      options.justifyContent,
      availableMain,
      allocatedUsedMain,
      line.entries.length,
    );
    let mainCursor = justify.offsetEmu;
    const lineCrossSize =
      lines.length === 1 ? availableCross : line.crossSizeEmu + contentPacking.extraSizeEmu;

    for (const [entryIndex, entry] of line.entries.entries()) {
      const mainAllocation = mainAllocations[entryIndex];
      if (mainAllocation === undefined) {
        throw new Error("Stack layout allocation count did not match line entry count.");
      }

      const { child } = entry;
      const childCross = estimateChildCrossSize(child, direction, contentFrame, context);
      const [marginTop, marginRight, marginBottom, marginLeft] = getNodeMargin(
        child,
        context,
        contentFrame.widthEmu,
      );
      const alignSelf = parsePlaceSelf(child.props.placeSelf).alignSelf ?? child.props.alignSelf;
      let alignment = alignSelf === "auto" ? defaultAlignItems : (alignSelf ?? defaultAlignItems);
      if (alignment === "flex-start") {
        alignment = "start";
      }
      if (alignment === "flex-end") {
        alignment = "end";
      }
      const hasExplicitCrossSize =
        child.props[direction === "horizontal" ? "height" : "width"] !== undefined;
      const stretchedCross = Math.max(
        lineCrossSize -
          (direction === "horizontal" ? marginTop + marginBottom : marginLeft + marginRight),
        0,
      );
      const crossPlacement = resolveCrossPlacement(
        alignment,
        stretchedCross,
        Math.max(
          childCross -
            (direction === "horizontal" ? marginTop + marginBottom : marginLeft + marginRight),
          0,
        ),
        hasExplicitCrossSize,
      );

      const placement: Placement =
        direction === "horizontal"
          ? {
              xEmu: contentX + mainCursor + marginLeft,
              yEmu: contentY + crossCursor + crossPlacement.offsetEmu + marginTop,
              widthEmu: mainAllocation.contentMainEmu,
              heightEmu: crossPlacement.sizeEmu,
            }
          : {
              xEmu: contentX + crossCursor + crossPlacement.offsetEmu + marginLeft,
              yEmu: contentY + mainCursor + marginTop,
              heightEmu: mainAllocation.contentMainEmu,
              widthEmu: crossPlacement.sizeEmu,
            };

      mainCursor += mainAllocation.outerMainEmu + mainGapEmu;
      if (entryIndex < line.entries.length - 1) {
        mainCursor += justify.extraGapEmu;
      }

      const compiledNode = compileNode(
        child,
        parentFrame,
        idGenerator,
        placement,
        clipRect,
        context,
        resolutionOptions,
      );
      if (compiledNode) {
        flowNodes.push(compiledNode);
      }
    }

    crossCursor += lineCrossSize + crossGapEmu;
    if (lineIndex < lines.length - 1) {
      crossCursor += contentPacking.extraGapEmu;
    }
  }

  const absoluteNodes = absoluteEntries
    .map((entry) =>
      compileNode(
        entry.child,
        contentFrame,
        idGenerator,
        undefined,
        clipRect,
        context,
        resolutionOptions,
      ),
    )
    .filter((node): node is ProjectedLayoutNode => node !== null);

  return sortNodesForPaint([...flowNodes, ...absoluteNodes]);
}

function compileGroupNode(
  node: Extract<LayoutChildNode, { kind: "view" }>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutGroup | null {
  const { props } = node;
  const resolved = frameFromProps(props, parentFrame, placement, context);
  const strokes = resolveNodeStrokesOrFallback(props, context);
  const shadow = parseShadowShorthandOrIgnore({ property: "boxShadow", value: props.boxShadow });
  const outline = outlineStrokeOrFallback(props, context);
  const originalFrame: Frame = {
    xEmu: resolved.xEmu,
    yEmu: resolved.yEmu,
    widthEmu: resolved.widthEmu,
    heightEmu: resolved.heightEmu,
  };
  const visibleFrame = intersectClipRect(originalFrame, clipRect);

  if (!visibleFrame) {
    return null;
  }

  const childClipRect =
    props.overflow === "hidden" ? intersectClipRect(originalFrame, clipRect) : clipRect;
  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    visibleFrame,
    strokes.stroke,
    strokes.edgeStrokes,
    parseSpacing(props.padding, context, visibleFrame.widthEmu),
  );
  const backgroundFill = resolveBackgroundLayersOrEmpty(
    backgroundInput(props),
    undefined,
    {
      widthEmu: visibleFrame.widthEmu,
      heightEmu: visibleFrame.heightEmu,
    },
    visibleFrame,
    backgroundBoxFrames,
    props.backgroundPosition,
    props.backgroundSize,
    props.backgroundRepeat,
    props.backgroundOrigin,
    props.backgroundClip,
  );
  const clip = clippingMetadata(originalFrame, clipRect, visibleFrame);
  const unsupportedSemantics = [
    ...unsupportedCssLayoutValueSemantics(props),
    ...unsupportedTransformSemantics(props),
    ...unsupportedTransformStackingContextSemantics(props),
    ...unsupportedClippingTransformSemantics({
      clip,
      rotation: resolved.rotation,
      flipH: resolved.flipH,
      flipV: resolved.flipV,
    }),
    ...strokes.unsupportedSemantics,
    ...outline.unsupportedSemantics,
    ...shadow.unsupportedSemantics,
    ...(backgroundFill.unsupportedSemantics ?? []),
  ];

  return {
    id: idGenerator.nextNode("group", node.origin),
    kind: "group",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    opacity: resolved.opacity,
    ...paintIntentSnapshotFromProps(props),
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
    fill: backgroundFill.fill,
    ...(backgroundFill.backgroundLayers
      ? { backgroundLayers: backgroundFill.backgroundLayers }
      : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(outline.outline ? { outline: outline.outline } : {}),
    ...(shadow.shadow ? { shadow: shadow.shadow } : {}),
    radiusEmu: resolveCornerRadiusEmu(props.borderRadius, visibleFrame, context),
    children: compileChildren(
      node.source.children,
      originalFrame,
      idGenerator,
      props.layout,
      {
        direction: props.direction,
        display: props.display,
        gap: props.gap,
        rowGap: props.rowGap,
        columnGap: props.columnGap,
        padding: props.padding,
        alignItems: props.alignItems,
        justifyContent: props.justifyContent,
        alignContent: props.alignContent,
        flexWrap: props.flexWrap,
        gridTemplateAreas: props.gridTemplateAreas,
        gridTemplateColumns: props.gridTemplateColumns,
        gridTemplateRows: props.gridTemplateRows,
        gridAutoColumns: props.gridAutoColumns,
        gridAutoRows: props.gridAutoRows,
        gridAutoFlow: props.gridAutoFlow,
        justifyItems: props.justifyItems,
        placeItems: props.placeItems,
        placeContent: props.placeContent,
      },
      childClipRect,
      context,
      resolutionOptions,
    ),
  };
}

type NormalizedTableSection = {
  source: LayoutInputTableSection;
  props: NormalizedTableSectionProps;
  rows: readonly NormalizedTableRow[];
};

type NormalizedTableRow = {
  source: LayoutInputTableRow;
  props: NormalizedTableRowProps;
  cells: readonly NormalizedTableCell[];
};

type NormalizedTableCell = {
  source: LayoutInputTableCell;
  props: NormalizedTableCellProps;
};

function normalizeTableSections(
  sections: readonly LayoutInputTableSection[],
): readonly NormalizedTableSection[] {
  return sections.map((section) => ({
    source: section,
    props: normalizeTableSectionProps(section.props),
    rows: section.rows.map((row) => ({
      source: row,
      props: normalizeTableRowProps(row.props),
      cells: row.cells.map((cell) => ({
        source: cell,
        props: normalizeTableCellProps(cell.props),
      })),
    })),
  }));
}

function tableColumnCount(sections: readonly NormalizedTableSection[]): number {
  let maxColumns = 1;
  const rowSpanOccupancy: number[] = [];

  for (const section of sections) {
    for (const row of section.rows) {
      let columnIndex = 0;
      for (const cell of row.cells) {
        while ((rowSpanOccupancy[columnIndex] ?? 0) > 0) {
          columnIndex += 1;
        }
        const colSpan = Math.max(1, cell.source.colSpan);
        maxColumns = Math.max(maxColumns, columnIndex + colSpan);
        if (cell.source.rowSpan > 1) {
          for (let offset = 0; offset < colSpan; offset += 1) {
            rowSpanOccupancy[columnIndex + offset] = Math.max(
              rowSpanOccupancy[columnIndex + offset] ?? 0,
              cell.source.rowSpan,
            );
          }
        }
        columnIndex += colSpan;
      }
      for (let index = 0; index < rowSpanOccupancy.length; index += 1) {
        rowSpanOccupancy[index] = Math.max(0, (rowSpanOccupancy[index] ?? 0) - 1);
      }
    }
  }

  return maxColumns;
}

function firstTableRow(
  sections: readonly NormalizedTableSection[],
): NormalizedTableRow | undefined {
  for (const section of sections) {
    const first = section.rows[0];
    if (first) {
      return first;
    }
  }

  return undefined;
}

function resolveTableColumnWidths(input: {
  tableProps: NormalizedTableProps;
  sections: readonly NormalizedTableSection[];
  columnCount: number;
  widthEmu: number;
  context?: LengthResolutionContext;
}): readonly number[] {
  const { tableProps, sections, columnCount, widthEmu, context } = input;
  const widths = Array.from({ length: columnCount }, () => 0);
  const first = firstTableRow(sections);

  if (tableProps.tableLayout === "fixed" && first) {
    let column = 0;
    for (const cell of first.cells) {
      const span = Math.max(1, cell.source.colSpan);
      if (cell.props.width !== undefined) {
        const width = parseLength(cell.props.width, widthEmu, 0, context);
        const perColumn = width / span;
        for (let offset = 0; offset < span && column + offset < widths.length; offset += 1) {
          widths[column + offset] = perColumn;
        }
      }
      column += span;
    }
  }

  const fixedTotal = widths.reduce((total, width) => total + width, 0);
  const unsetCount = widths.filter((width) => width <= 0).length;
  const fallbackWidth = unsetCount > 0 ? Math.max(widthEmu - fixedTotal, 0) / unsetCount : 0;

  return widths.map((width) => (width > 0 ? width : fallbackWidth || widthEmu / columnCount));
}

function resolveTableRowHeights(input: {
  rows: readonly NormalizedTableRow[];
  heightEmu: number;
  context?: LengthResolutionContext;
}): readonly number[] {
  const explicit = input.rows.map((row) =>
    row.props.height !== undefined
      ? parseLength(row.props.height, input.heightEmu, 0, input.context)
      : undefined,
  );
  const explicitTotal = explicit.reduce<number>((total, height) => total + (height ?? 0), 0);
  const autoCount = explicit.filter((height) => height === undefined).length;
  const autoHeight = autoCount > 0 ? Math.max(input.heightEmu - explicitTotal, 0) / autoCount : 0;

  return explicit.map((height) => height ?? (autoHeight || input.heightEmu / input.rows.length));
}

function tableCellEdgeStrokesFromResolvedStrokes(input: {
  readonly stroke?: StrokeIR;
  readonly edgeStrokes?: EdgeStrokeIR;
}): EdgeStrokeIR | undefined {
  if (input.edgeStrokes) {
    return input.edgeStrokes;
  }
  if (!input.stroke) {
    return undefined;
  }

  return {
    top: input.stroke,
    right: input.stroke,
    bottom: input.stroke,
    left: input.stroke,
  };
}

function defaultTableCellEdgeStrokes(sectionKind: "head" | "body" | "foot"): EdgeStrokeIR {
  const defaultStroke =
    sectionKind === "head"
      ? PRESENTATION_TABLE_DEFAULTS.headerCellBorder
      : PRESENTATION_TABLE_DEFAULTS.bodyCellBorder;
  const stroke: StrokeIR = { ...defaultStroke };

  return { top: stroke, right: stroke, bottom: stroke, left: stroke };
}

function unsupportedTableLayoutSemantics(
  props: NormalizedTableProps,
): readonly ProjectedUnsupportedSemantic[] {
  const semantics: ProjectedUnsupportedSemantic[] = [];

  if (props.tableLayout === undefined || props.tableLayout === "auto") {
    semantics.push({
      feature: "layout",
      property: "tableLayout",
      value: "auto",
      reason:
        "CSS table-layout:auto requires the browser intrinsic table layout algorithm; deckjsx approximates it with available-width column distribution in the structured table layout.",
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["nativeTableStructure", "availableWidthColumnDistribution"],
        missing: ["browserAutoTableLayout"],
      },
    });
  }

  if (props.borderCollapse === "collapse") {
    semantics.push({
      feature: "layout",
      property: "borderCollapse",
      value: "collapse",
      reason:
        "CSS border-collapse:collapse requires browser border conflict resolution; deckjsx approximates shared borders with projected cell edge strokes.",
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["nativeTableStructure", "projectedCellBorders"],
        missing: ["cssBorderConflictResolution"],
      },
    });
  }

  return semantics;
}

function compileTableNode(
  node: Extract<LayoutChildNode, { kind: "table" }>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutTable | null {
  const { props } = node;
  const resolved = frameFromProps(props, parentFrame, placement, context);
  const originalFrame: Frame = {
    xEmu: resolved.xEmu,
    yEmu: resolved.yEmu,
    widthEmu: resolved.widthEmu,
    heightEmu: resolved.heightEmu,
  };
  const visibleFrame = intersectClipRect(originalFrame, clipRect);

  if (!visibleFrame) {
    return null;
  }

  const sections = normalizeTableSections(node.source.sections);
  const rows = sections.flatMap((section) => section.rows);
  const rowHeights = resolveTableRowHeights({
    rows,
    heightEmu: visibleFrame.heightEmu,
    context,
  });
  const columnCount = tableColumnCount(sections);
  const columnWidths = resolveTableColumnWidths({
    tableProps: props,
    sections,
    columnCount,
    widthEmu: visibleFrame.widthEmu,
    context,
  });
  const clip = clippingMetadata(originalFrame, clipRect, visibleFrame);
  const shadow = parseShadowShorthandOrIgnore({ property: "boxShadow", value: props.boxShadow });
  const tableStrokes = resolveNodeStrokesOrFallback(props, context);
  const tableEdgeStrokes = tableCellEdgeStrokesFromResolvedStrokes(tableStrokes);
  const outline = outlineStrokeOrFallback(props, context);
  const tableBackground = resolveBackgroundLayersOrEmpty(
    backgroundInput(props),
    undefined,
    {
      widthEmu: visibleFrame.widthEmu,
      heightEmu: visibleFrame.heightEmu,
    },
    visibleFrame,
    resolveBackgroundBoxFrames(visibleFrame, tableStrokes.stroke, tableEdgeStrokes),
    props.backgroundPosition,
    props.backgroundSize,
    props.backgroundRepeat,
    props.backgroundOrigin,
    props.backgroundClip,
  );
  const unsupportedSemantics = [
    ...unsupportedTableLayoutSemantics(props),
    ...shadow.unsupportedSemantics,
    ...(tableBackground.unsupportedSemantics ?? []),
    ...tableStrokes.unsupportedSemantics,
    ...outline.unsupportedSemantics,
  ];
  const rowSpanOccupancy = Array.from({ length: columnCount }, () => 0);
  let rowIndex = 0;
  let yEmu = visibleFrame.yEmu;

  return {
    id: idGenerator.nextNode("table", node.origin),
    kind: "table",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    opacity: resolved.opacity,
    ...paintIntentSnapshotFromProps(props),
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(shadow.shadow ? { shadow: shadow.shadow } : {}),
    fill: tableBackground.fill,
    ...(tableBackground.backgroundLayers
      ? { backgroundLayers: tableBackground.backgroundLayers }
      : {}),
    ...(tableEdgeStrokes ? { edgeStrokes: tableEdgeStrokes } : {}),
    ...(outline.outline ? { outline: outline.outline } : {}),
    radiusEmu: resolveCornerRadiusEmu(props.borderRadius, visibleFrame, context),
    ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    sections: sections.map((section) => {
      const sectionHeight = rowHeights
        .slice(rowIndex, rowIndex + section.rows.length)
        .reduce((total, height) => total + height, 0);
      const sectionFrame = {
        xEmu: visibleFrame.xEmu,
        yEmu,
        widthEmu: visibleFrame.widthEmu,
        heightEmu: sectionHeight,
      };
      const sectionBackground = resolveBackgroundLayersOrEmpty(
        backgroundInput(section.source.props),
        undefined,
        {
          widthEmu: sectionFrame.widthEmu,
          heightEmu: sectionFrame.heightEmu,
        },
        sectionFrame,
        resolveBackgroundBoxFrames(sectionFrame),
        section.source.props.backgroundPosition,
        section.source.props.backgroundSize,
        section.source.props.backgroundRepeat,
        section.source.props.backgroundOrigin,
        section.source.props.backgroundClip,
      );
      const sectionUnsupportedSemantics = [...(sectionBackground.unsupportedSemantics ?? [])];
      return {
        kind: "tableSection",
        sectionKind: section.source.sectionKind,
        frame: sectionFrame,
        ...(section.source.origin ? { origin: section.source.origin } : {}),
        opacity: section.source.props.opacity,
        ...paintIntentSnapshotFromProps(section.source.props),
        fill: sectionBackground.fill,
        ...(sectionBackground.backgroundLayers
          ? { backgroundLayers: sectionBackground.backgroundLayers }
          : {}),
        ...(sectionUnsupportedSemantics.length
          ? { unsupportedSemantics: sectionUnsupportedSemantics }
          : {}),
        rows: section.rows.map((row) => {
          const rowHeight = rowHeights[rowIndex] ?? 0;
          let xEmu = visibleFrame.xEmu;
          let columnIndex = 0;
          const advancePastOccupiedColumns = () => {
            while (rowSpanOccupancy[columnIndex] && columnIndex < columnCount) {
              xEmu += columnWidths[columnIndex] ?? 0;
              columnIndex += 1;
            }
          };
          const rowFrame = {
            xEmu: visibleFrame.xEmu,
            yEmu,
            widthEmu: visibleFrame.widthEmu,
            heightEmu: rowHeight,
          };
          const rowBackground = resolveBackgroundLayersOrEmpty(
            backgroundInput(row.props),
            undefined,
            {
              widthEmu: rowFrame.widthEmu,
              heightEmu: rowFrame.heightEmu,
            },
            rowFrame,
            resolveBackgroundBoxFrames(rowFrame),
            row.props.backgroundPosition,
            row.props.backgroundSize,
            row.props.backgroundRepeat,
            row.props.backgroundOrigin,
            row.props.backgroundClip,
          );
          const rowUnsupportedSemantics = [...(rowBackground.unsupportedSemantics ?? [])];
          const projectedRow = {
            kind: "tableRow" as const,
            ...(row.source.origin ? { origin: row.source.origin } : {}),
            frame: rowFrame,
            opacity: row.props.opacity,
            ...paintIntentSnapshotFromProps(row.props),
            fill: rowBackground.fill,
            ...(rowBackground.backgroundLayers
              ? { backgroundLayers: rowBackground.backgroundLayers }
              : {}),
            ...(rowUnsupportedSemantics.length
              ? { unsupportedSemantics: rowUnsupportedSemantics }
              : {}),
            cells: row.cells.map((cell) => {
              advancePastOccupiedColumns();
              const gridColumnIndex = columnIndex;
              const colSpan = Math.max(1, cell.source.colSpan);
              const cellWidth = columnWidths
                .slice(columnIndex, columnIndex + colSpan)
                .reduce((total, width) => total + width, 0);
              const cellFrame = {
                xEmu,
                yEmu,
                widthEmu: cellWidth,
                heightEmu: rowHeight * Math.max(1, cell.source.rowSpan),
              };
              const textLengthContext = getTextLengthContext(cell.props, context);
              const cellStrokes = resolveNodeStrokesOrFallback(cell.props, textLengthContext);
              const cellEdgeStrokes =
                tableCellEdgeStrokesFromResolvedStrokes(cellStrokes) ??
                (!hasAuthoredStrokeInput(props) &&
                !isStrokeIntentionallyNone(props) &&
                !hasAuthoredStrokeInput(cell.props) &&
                !isStrokeIntentionallyNone(cell.props)
                  ? defaultTableCellEdgeStrokes(section.source.sectionKind)
                  : undefined);
              const cellHyperlink = cell.props.href
                ? {
                    url: cell.props.href,
                    ...(cell.props.tooltip ? { tooltip: cell.props.tooltip } : {}),
                  }
                : undefined;
              const cellBackground = resolveBackgroundLayersOrEmpty(
                backgroundInput(cell.props),
                undefined,
                {
                  widthEmu: cellFrame.widthEmu,
                  heightEmu: cellFrame.heightEmu,
                },
                cellFrame,
                resolveBackgroundBoxFrames(
                  cellFrame,
                  cellStrokes.stroke,
                  cellEdgeStrokes,
                  parseSpacing(cell.props.padding, textLengthContext, cellFrame.widthEmu),
                ),
                cell.props.backgroundPosition,
                cell.props.backgroundSize,
                cell.props.backgroundRepeat,
                cell.props.backgroundOrigin,
                cell.props.backgroundClip,
              );
              const cellLayoutPadding =
                cell.props.padding ?? PRESENTATION_TABLE_DEFAULTS.cellPadding;
              if (cell.source.rowSpan > 1) {
                for (
                  let offset = 0;
                  offset < colSpan && gridColumnIndex + offset < rowSpanOccupancy.length;
                  offset += 1
                ) {
                  rowSpanOccupancy[gridColumnIndex + offset] = Math.max(
                    rowSpanOccupancy[gridColumnIndex + offset] ?? 0,
                    cell.source.rowSpan,
                  );
                }
              }
              xEmu += cellWidth;
              columnIndex += colSpan;
              return {
                kind: "tableCell" as const,
                cellKind: cell.source.cellKind,
                gridColumnIndex,
                colSpan: cell.source.colSpan,
                rowSpan: cell.source.rowSpan,
                ...(cell.source.origin ? { origin: cell.source.origin } : {}),
                frame: cellFrame,
                opacity: cell.props.opacity,
                ...paintIntentSnapshotFromProps(cell.props),
                fill: cellBackground.fill,
                ...(cellBackground.backgroundLayers
                  ? { backgroundLayers: cellBackground.backgroundLayers }
                  : {}),
                ...(cellEdgeStrokes ? { edgeStrokes: cellEdgeStrokes } : {}),
                style: textStyleFromProps(cell.props, textLengthContext),
                ...(cellHyperlink ? { hyperlink: cellHyperlink } : {}),
                children: compileChildren(
                  tableCellChildrenWithInheritedTextStyle(cell.source.children, cell.props),
                  cellFrame,
                  idGenerator,
                  "block",
                  { padding: cellLayoutPadding },
                  clipRect,
                  context,
                  resolutionOptions,
                ),
              };
            }),
          };
          for (let index = 0; index < rowSpanOccupancy.length; index += 1) {
            rowSpanOccupancy[index] = Math.max(0, (rowSpanOccupancy[index] ?? 0) - 1);
          }
          rowIndex += 1;
          yEmu += rowHeight;
          return projectedRow;
        }),
      };
    }),
  };
}

function textStyleFromProps(
  props: NormalizedTextProps,
  textLengthContext?: LengthResolutionContext,
): TextStyleIR {
  const list = resolveListStyle(props, textLengthContext);
  const lineHeight = resolveLineHeight(props.lineHeight, textLengthContext);
  const underlineStyle = props.underline
    ? (resolveUnderlineStyle(props.textDecorationStyle) ?? "sng")
    : resolveUnderlineStyle(props.textDecorationStyle);
  const underlineColor = normalizeColor(props.textDecorationColor);
  const underlineTransparency = alphaToTransparency(
    parseCssColor(props.textDecorationColor)?.alpha,
  );
  const colorTransparency = alphaToTransparency(parseCssColor(props.color)?.alpha);
  const textDirection = resolveTextDirection(props.writingMode);
  const tabStops = resolveTabStops(props.tabStops, textLengthContext);
  const fontSizePt =
    props.fontSize === undefined || isCssWideKeyword(props.fontSize)
      ? undefined
      : parsePointValue(props.fontSize, 0, textLengthContext);

  return {
    fontFamily: props.fontFamily,
    fontSizePt,
    fontWeight: props.fontWeight,
    italic: props.italic,
    underline: props.underline,
    ...(underlineStyle ? { underlineStyle } : {}),
    ...(underlineColor ? { underlineColor } : {}),
    ...(underlineTransparency !== undefined ? { underlineTransparency } : {}),
    strike: props.strike,
    color: normalizeColor(props.color),
    ...(colorTransparency !== undefined ? { colorTransparency } : {}),
    textAlign: props.textAlign,
    verticalAlign: props.verticalAlign,
    paddingPt: parseSpacingInPoints(props.padding, textLengthContext),
    lineSpacing: lineHeight.lineSpacing,
    lineSpacingMultiple: lineHeight.lineSpacingMultiple,
    paragraphSpacingBefore:
      props.paragraphSpacingBefore === undefined
        ? undefined
        : parsePointValue(props.paragraphSpacingBefore, 0, textLengthContext),
    paragraphSpacingAfter:
      props.paragraphSpacingAfter === undefined
        ? undefined
        : parsePointValue(props.paragraphSpacingAfter, 0, textLengthContext),
    ...(props.textIndent === undefined
      ? {}
      : {
          textIndentPt: parsePointValue(props.textIndent as DeckPointLength, 0, textLengthContext),
        }),
    ...(tabStops ? { tabStops } : {}),
    charSpacing: resolveCharacterSpacing(props.charSpacing, textLengthContext),
    ...(list ? { list } : {}),
    fit: props.fit,
    wrap: props.wrap,
    overflow: props.overflow,
    ...(props.wordBreak === "break-all" ||
    props.wordBreak === "break-word" ||
    props.overflowWrap === "break-word" ||
    props.overflowWrap === "anywhere"
      ? { breakWords: true }
      : {}),
    ...(props.direction === "rtl" ? { rtlMode: true } : {}),
    ...(textDirection ? { textDirection } : {}),
    ...(props.superscript ? { superscript: true } : {}),
    ...(props.subscript ? { subscript: true } : {}),
  };
}

function isEmptyRunStyle(style: TextStyleIR): boolean {
  return Object.values(style).every((value) => value === undefined);
}

function flattenTextChildren(children: readonly LayoutInputTextChild[]): LayoutInputTextChild[] {
  return children.flatMap((child): LayoutInputTextChild[] =>
    Array.isArray(child) ? flattenTextChildren(child) : [child],
  );
}

function extractRichTextRuns(
  children: readonly LayoutInputTextChild[],
  textTransform: NormalizedTextProps["textTransform"],
  textLengthContext?: LengthResolutionContext,
): TextRunIR[] {
  const runs: TextRunIR[] = [];
  const pushRun = (run: TextRunIR): void => {
    const previous = runs.at(-1);
    if (previous && !previous.style && !previous.hyperlink && !run.style && !run.hyperlink) {
      runs[runs.length - 1] = { text: `${previous.text}${run.text}` };
      return;
    }

    runs.push(run);
  };

  for (const child of flattenTextChildren(children)) {
    if (typeof child === "string" || typeof child === "number") {
      pushRun({ text: extractText([child], textTransform) });
      continue;
    }

    if (isLayoutInputTextNode(child)) {
      const props = normalizeTextProps(child.props);
      const childLengthContext = getTextLengthContext(props, textLengthContext);
      const style = textStyleFromProps(props, childLengthContext);
      const hyperlink = props.href
        ? {
            url: props.href,
            ...(props.tooltip ? { tooltip: props.tooltip } : {}),
          }
        : undefined;
      const text = extractRichTextRuns(
        child.children,
        props.textTransform ?? textTransform,
        childLengthContext,
      )
        .map((run) => run.text)
        .join("");
      pushRun({
        text,
        ...(!isEmptyRunStyle(style) ? { style } : {}),
        ...(hyperlink ? { hyperlink } : {}),
      });
      continue;
    }

    if (typeof child === "object") {
      throw new Error("Text nodes can only contain primitive text or inline text runs.");
    }
  }

  return runs;
}

function sameFrame(left: Frame, right: Frame): boolean {
  return (
    left.xEmu === right.xEmu &&
    left.yEmu === right.yEmu &&
    left.widthEmu === right.widthEmu &&
    left.heightEmu === right.heightEmu
  );
}

function clippingMetadata(
  originalFrame: Frame,
  clipRect: ClipRect | undefined,
  visibleFrame: Frame,
): ProjectedLayoutClip | undefined {
  if (!clipRect || sameFrame(originalFrame, visibleFrame)) {
    return undefined;
  }

  return {
    strategy: "intersectParentOverflow",
    originalFrame,
    clipFrame: clipRect,
    visibleFrame,
  };
}

function textFramePropsWithFallback(
  node: Extract<LayoutChildNode, { kind: "text" }>,
  parentFrame: Frame,
  placement: Placement | undefined,
  context?: LengthResolutionContext,
): NormalizedTextProps {
  const { props } = node;
  let resolved = props;
  const hasAuthoredWidth = authoredLengthOrUndefined(props.width) !== undefined;
  const hasAuthoredHeight = authoredLengthOrUndefined(props.height) !== undefined;
  const hasAuthoredInset = props.inset !== undefined && !hasCssWideKeywordToken(props.inset);
  const hasAuthoredLeft = authoredLengthOrUndefined(props.left) !== undefined;
  const hasAuthoredRight = authoredLengthOrUndefined(props.right) !== undefined;
  const hasAuthoredTop = authoredLengthOrUndefined(props.top) !== undefined;
  const hasAuthoredBottom = authoredLengthOrUndefined(props.bottom) !== undefined;

  if (placement?.widthEmu === undefined && !hasAuthoredWidth && !hasAuthoredInset) {
    if (!hasAuthoredRight && hasAuthoredLeft) {
      resolved = { ...resolved, right: 0 };
    } else if (!hasAuthoredLeft && hasAuthoredRight) {
      resolved = { ...resolved, left: 0 };
    } else if (!hasAuthoredLeft && !hasAuthoredRight) {
      resolved = { ...resolved, width: "100%" };
    }
  }

  if (
    placement?.heightEmu === undefined &&
    !hasAuthoredHeight &&
    !hasAuthoredInset &&
    !(hasAuthoredTop && hasAuthoredBottom)
  ) {
    const autoHeightEmu = estimateTextAutoContentSize(
      node,
      "height",
      parentFrame,
      context,
      placement,
    );
    resolved = {
      ...resolved,
      height: `${(autoHeightEmu / EMU_PER_INCH) * POINTS_PER_INCH}pt`,
    };
  }

  return resolved;
}

function compileTextNode(
  node: Extract<LayoutChildNode, { kind: "text" }>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
): ProjectedLayoutText | null {
  const { props } = node;
  const textLengthContext = getTextLengthContext(props, context);
  const frameProps = textFramePropsWithFallback(node, parentFrame, placement, textLengthContext);
  const resolved = frameFromProps(frameProps, parentFrame, placement, textLengthContext);
  const strokes = resolveNodeStrokesOrFallback(props, textLengthContext);
  const shadowValue: string | undefined =
    (props.textShadow as string | undefined) ?? (props.boxShadow as string | undefined);
  const shadow = parseShadowShorthandOrIgnore({
    property: props.textShadow !== undefined ? "textShadow" : "boxShadow",
    value: shadowValue,
  });
  const outline = outlineStrokeOrFallback(props, textLengthContext);
  const hyperlink = props.href
    ? {
        url: props.href,
        ...(props.tooltip ? { tooltip: props.tooltip } : {}),
      }
    : undefined;
  const style = textStyleFromProps(props, textLengthContext);
  const runs = extractRichTextRuns(node.source.children, props.textTransform, textLengthContext);
  const text = runs.map((run) => run.text).join("");

  const originalFrame = {
    xEmu: resolved.xEmu,
    yEmu: resolved.yEmu,
    widthEmu: resolved.widthEmu,
    heightEmu: resolved.heightEmu,
  };
  const visibleFrame = intersectClipRect(originalFrame, clipRect);

  if (!visibleFrame) {
    return null;
  }

  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    visibleFrame,
    strokes.stroke,
    strokes.edgeStrokes,
    parseSpacing(props.padding, textLengthContext, visibleFrame.widthEmu),
  );
  const backgroundFill = resolveBackgroundLayersOrEmpty(
    backgroundInput(props),
    undefined,
    {
      widthEmu: visibleFrame.widthEmu,
      heightEmu: visibleFrame.heightEmu,
    },
    visibleFrame,
    backgroundBoxFrames,
    props.backgroundPosition,
    props.backgroundSize,
    props.backgroundRepeat,
    props.backgroundOrigin,
    props.backgroundClip,
  );
  const clip = clippingMetadata(originalFrame, clipRect, visibleFrame);
  const unsupportedSemantics = [
    ...unsupportedCssLayoutValueSemantics(props),
    ...unsupportedTextLogicalLayoutSemantics(props),
    ...unsupportedTransformSemantics(props),
    ...unsupportedClippingTransformSemantics({
      clip,
      rotation: resolved.rotation,
      flipH: resolved.flipH,
      flipV: resolved.flipV,
    }),
    ...unsupportedWrappedTextMeasurementSemantics(props, text),
    ...strokes.unsupportedSemantics,
    ...outline.unsupportedSemantics,
    ...shadow.unsupportedSemantics,
    ...(backgroundFill.unsupportedSemantics ?? []),
  ];

  return {
    id: idGenerator.nextNode("text", node.origin),
    kind: "text",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    opacity: resolved.opacity,
    ...paintIntentSnapshotFromProps(props),
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
    content: {
      text,
      ...(runs.length > 1 || runs.some((run) => run.style) ? { runs } : {}),
    },
    style,
    fill: backgroundFill.fill,
    ...(backgroundFill.backgroundLayers
      ? { backgroundLayers: backgroundFill.backgroundLayers }
      : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(outline.outline ? { outline: outline.outline } : {}),
    ...(shadow.shadow ? { shadow: shadow.shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    radiusEmu: resolveCornerRadiusEmu(props.borderRadius, visibleFrame, textLengthContext),
  };
}

function compileImageNode(
  node: Extract<LayoutChildNode, { kind: "image" }>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
): ProjectedLayoutNode | null {
  const { props } = node;
  const fit = normalizeProjectedImageFit(props.fit);
  const resolved = frameFromProps(props, parentFrame, placement, context);
  const shadow = parseShadowShorthandOrIgnore({ property: "boxShadow", value: props.boxShadow });
  const objectPosition = parseObjectPosition(props.objectPosition, {
    widthEmu: resolved.widthEmu,
    heightEmu: resolved.heightEmu,
  });
  const crop = parseImageCrop(props.crop);
  const hyperlink = props.href
    ? {
        url: props.href,
        ...(props.tooltip ? { tooltip: props.tooltip } : {}),
      }
    : undefined;

  if (!props.src && !props.data) {
    throw new Error("Image requires either src or data.");
  }

  const originalFrame = {
    xEmu: resolved.xEmu,
    yEmu: resolved.yEmu,
    widthEmu: resolved.widthEmu,
    heightEmu: resolved.heightEmu,
  };
  const visibleFrame = intersectClipRect(originalFrame, clipRect);

  if (!visibleFrame) {
    return null;
  }
  const clip = clippingMetadata(originalFrame, clipRect, visibleFrame);
  const unsupportedSemantics = [
    ...unsupportedCssLayoutValueSemantics(props),
    ...unsupportedTransformSemantics(props),
    ...unsupportedClippingTransformSemantics({
      clip,
      rotation: resolved.rotation,
      flipH: resolved.flipH,
      flipV: resolved.flipV,
    }),
    ...unsupportedClippedImageSourceRectTransformSemantics({
      clip,
      rotation: resolved.rotation,
      flipH: resolved.flipH,
      flipV: resolved.flipV,
      fit,
      hasExplicitCrop: crop !== undefined,
    }),
    ...unsupportedObjectPositionSemantics({
      value: props.objectPosition,
      resolved: objectPosition,
    }),
    ...unsupportedObjectFitSemantics(props.fit),
    ...shadow.unsupportedSemantics,
  ];

  return {
    id: idGenerator.nextNode("image", node.origin),
    kind: "image",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    sourceFrame: originalFrame,
    opacity: resolved.opacity,
    ...paintIntentSnapshotFromProps(props),
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
    fit,
    ...(objectPosition ? { objectPosition } : {}),
    ...(crop ? { crop } : {}),
    rounding: props.rounding,
    ...(shadow.shadow ? { shadow: shadow.shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    source: imageSourceFromProps(props),
  };
}

const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9;

function isUnspecifiedVideoDimension(value: DeckLength | undefined): boolean {
  if (value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "auto" || isCssWideKeyword(normalized);
  }

  return false;
}

function videoPropsWithFallbackFrame(
  props: NormalizedVideoProps,
  parentFrame: Frame,
): {
  readonly props: NormalizedVideoProps;
  readonly missingHeight: boolean;
  readonly missingWidth: boolean;
  readonly unsupportedSemantics: readonly ProjectedUnsupportedSemantic[];
} {
  const missingWidth = isUnspecifiedVideoDimension(props.width);
  const missingHeight = isUnspecifiedVideoDimension(props.height);

  if (!missingWidth && !missingHeight) {
    return { props, missingHeight, missingWidth, unsupportedSemantics: [] };
  }

  const aspectRatio = parseAspectRatio(props.aspectRatio) ?? DEFAULT_VIDEO_ASPECT_RATIO;
  const fallbackWidthIn = parentFrame.widthEmu / EMU_PER_INCH / 2;
  const fallbackAspectRatio: NormalizedVideoProps["aspectRatio"] =
    props.aspectRatio ?? DEFAULT_VIDEO_ASPECT_RATIO;
  const fallbackProps = {
    ...props,
    aspectRatio: fallbackAspectRatio,
    ...(missingWidth && missingHeight ? { width: fallbackWidthIn } : {}),
  };

  return {
    props: fallbackProps,
    missingHeight,
    missingWidth,
    unsupportedSemantics: [
      {
        feature: "layout",
        property:
          missingWidth && missingHeight ? "width,height" : missingWidth ? "width" : "height",
        value: missingWidth && missingHeight ? "auto auto" : "auto",
        reason:
          "Video frame size was omitted; deckjsx synthesized a 16:9 fallback frame for the initial playable video projection.",
        fallback: {
          strategy: "synthesizeFallbackFrame",
          preserves: ["playableVideoMedia"],
          missing: [
            ...(missingWidth ? ["authoredWidth"] : []),
            ...(missingHeight ? ["authoredHeight"] : []),
            ...(props.aspectRatio === undefined ? [`defaultAspectRatio=${aspectRatio}`] : []),
          ],
        },
      },
    ],
  };
}

function compileVideoNode(
  node: Extract<LayoutChildNode, { kind: "video" }>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
): ProjectedLayoutNode | null {
  const videoFrame = videoPropsWithFallbackFrame(node.props, parentFrame);
  const { props } = videoFrame;
  const fit = normalizeProjectedImageFit(props.fit);
  const framePlacement =
    videoFrame.missingWidth || videoFrame.missingHeight
      ? {
          ...(placement?.xEmu !== undefined ? { xEmu: placement.xEmu } : {}),
          ...(placement?.yEmu !== undefined ? { yEmu: placement.yEmu } : {}),
          ...(!videoFrame.missingWidth && placement?.widthEmu !== undefined
            ? { widthEmu: placement.widthEmu }
            : {}),
          ...(!videoFrame.missingHeight && placement?.heightEmu !== undefined
            ? { heightEmu: placement.heightEmu }
            : {}),
        }
      : placement;
  const resolved = frameFromProps(props, parentFrame, framePlacement, context);
  const shadow = parseShadowShorthandOrIgnore({ property: "boxShadow", value: props.boxShadow });
  const objectPosition = parseObjectPosition(props.objectPosition, {
    widthEmu: resolved.widthEmu,
    heightEmu: resolved.heightEmu,
  });

  if (!props.src && !props.data) {
    throw new Error("Video requires either src or data.");
  }

  const originalFrame = {
    xEmu: resolved.xEmu,
    yEmu: resolved.yEmu,
    widthEmu: resolved.widthEmu,
    heightEmu: resolved.heightEmu,
  };
  const visibleFrame = intersectClipRect(originalFrame, clipRect);

  if (!visibleFrame) {
    return null;
  }

  const clip = clippingMetadata(originalFrame, clipRect, visibleFrame);
  const unsupportedSemantics = [
    ...unsupportedCssLayoutValueSemantics(props),
    ...unsupportedTransformSemantics(props),
    ...unsupportedClippingTransformSemantics({
      clip,
      rotation: resolved.rotation,
      flipH: resolved.flipH,
      flipV: resolved.flipV,
    }),
    ...unsupportedObjectPositionSemantics({
      value: props.objectPosition,
      resolved: objectPosition,
    }),
    ...unsupportedObjectFitSemantics(props.fit),
    ...shadow.unsupportedSemantics,
    ...videoFrame.unsupportedSemantics,
  ];
  const posterSource = videoPosterSourceFromProps(props);

  return {
    id: idGenerator.nextNode("video", node.origin),
    kind: "video",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    sourceFrame: originalFrame,
    opacity: resolved.opacity,
    ...paintIntentSnapshotFromProps(props),
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
    fit,
    ...(objectPosition ? { objectPosition } : {}),
    rounding: props.rounding,
    ...(shadow.shadow ? { shadow: shadow.shadow } : {}),
    source: videoSourceFromProps(props),
    ...(posterSource ? { posterSource } : {}),
  };
}

function compileShapeNode(
  node: Extract<LayoutChildNode, { kind: "shape" }>,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
): ProjectedLayoutShape | null {
  const { props } = node;
  const resolved = frameFromProps(props, parentFrame, placement, context);
  const strokes = resolveNodeStrokesOrFallback(props, context);
  const shadow = parseShadowShorthandOrIgnore({ property: "boxShadow", value: props.boxShadow });
  const outline = outlineStrokeOrFallback(props, context);
  const hyperlink = props.href
    ? {
        url: props.href,
        ...(props.tooltip ? { tooltip: props.tooltip } : {}),
      }
    : undefined;

  const originalFrame = {
    xEmu: resolved.xEmu,
    yEmu: resolved.yEmu,
    widthEmu: resolved.widthEmu,
    heightEmu: resolved.heightEmu,
  };
  const visibleFrame = intersectClipRect(originalFrame, clipRect);

  if (!visibleFrame) {
    return null;
  }

  const backgroundBoxFrames = resolveBackgroundBoxFrames(
    visibleFrame,
    strokes.stroke,
    strokes.edgeStrokes,
  );
  const shapeFill = resolveBackgroundLayersOrEmpty(
    shapeFillInput(props),
    undefined,
    {
      widthEmu: visibleFrame.widthEmu,
      heightEmu: visibleFrame.heightEmu,
    },
    visibleFrame,
    backgroundBoxFrames,
    props.backgroundPosition,
    props.backgroundSize,
    props.backgroundRepeat,
    props.backgroundOrigin,
    props.backgroundClip,
  );
  const clip = clippingMetadata(originalFrame, clipRect, visibleFrame);
  const unsupportedSemantics = [
    ...unsupportedCssLayoutValueSemantics(props),
    ...unsupportedTransformSemantics(props),
    ...unsupportedClippingTransformSemantics({
      clip,
      rotation: resolved.rotation,
      flipH: resolved.flipH,
      flipV: resolved.flipV,
    }),
    ...strokes.unsupportedSemantics,
    ...outline.unsupportedSemantics,
    ...shadow.unsupportedSemantics,
    ...(shapeFill.unsupportedSemantics ?? []),
  ];

  return {
    id: idGenerator.nextNode("shape", node.origin),
    kind: "shape",
    ...(node.origin ? { origin: node.origin } : {}),
    shape: props.shape,
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    opacity: resolved.opacity,
    ...paintIntentSnapshotFromProps(props),
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
    fill: shapeFill.fill,
    ...(shapeFill.backgroundLayers ? { backgroundLayers: shapeFill.backgroundLayers } : {}),
    stroke: strokes.stroke,
    ...(strokes.edgeStrokes ? { edgeStrokes: strokes.edgeStrokes } : {}),
    ...(outline.outline ? { outline: outline.outline } : {}),
    ...(shadow.shadow ? { shadow: shadow.shadow } : {}),
    ...(hyperlink ? { hyperlink } : {}),
    radiusEmu: resolveCornerRadiusEmu(props.radius, visibleFrame, context),
  };
}

function compileNode(
  child: LayoutChildNode,
  parentFrame: Frame,
  idGenerator: IdGenerator,
  placement?: Placement,
  clipRect?: ClipRect,
  context?: LengthResolutionContext,
  resolutionOptions?: ProjectedLayoutResolutionOptions,
): ProjectedLayoutNode | null {
  switch (child.kind) {
    case "view":
      return compileGroupNode(
        child,
        parentFrame,
        idGenerator,
        placement,
        clipRect,
        context,
        resolutionOptions,
      );
    case "text":
      return compileTextNode(child, parentFrame, idGenerator, placement, clipRect, context);
    case "table":
      return compileTableNode(
        child,
        parentFrame,
        idGenerator,
        placement,
        clipRect,
        context,
        resolutionOptions,
      );
    case "image":
      return compileImageNode(child, parentFrame, idGenerator, placement, clipRect, context);
    case "video":
      return compileVideoNode(child, parentFrame, idGenerator, placement, clipRect, context);
    case "shape":
      return compileShapeNode(child, parentFrame, idGenerator, placement, clipRect, context);
  }
}

function compileSlide(
  root: LayoutInputSlide,
  context: { slideIndex: number },
  slideFrame: Frame,
  idGenerator: IdGenerator,
  lengthContext?: LengthResolutionContext,
): ProjectedLayoutSlide {
  const slideProps = normalizeSlideProps(root.props);
  const backgroundBoxFrames = resolveBackgroundBoxFrames(slideFrame);
  const backgroundFill = resolveBackgroundLayersOrEmpty(
    backgroundInput(slideProps),
    undefined,
    {
      widthEmu: slideFrame.widthEmu,
      heightEmu: slideFrame.heightEmu,
    },
    slideFrame,
    backgroundBoxFrames,
    slideProps.backgroundPosition,
    slideProps.backgroundSize,
    slideProps.backgroundRepeat,
    slideProps.backgroundOrigin,
    slideProps.backgroundClip,
  );
  const nodes = compileChildren(
    root.children,
    slideFrame,
    idGenerator,
    slideProps.layout,
    {
      display: slideProps.display,
      gap: slideProps.gap,
      rowGap: slideProps.rowGap,
      columnGap: slideProps.columnGap,
      padding: slideProps.padding,
      alignItems: slideProps.alignItems,
      justifyContent: slideProps.justifyContent,
      alignContent: slideProps.alignContent,
      flexWrap: slideProps.flexWrap,
      gridTemplateAreas: slideProps.gridTemplateAreas,
      gridTemplateColumns: slideProps.gridTemplateColumns,
      gridTemplateRows: slideProps.gridTemplateRows,
      gridAutoColumns: slideProps.gridAutoColumns,
      gridAutoRows: slideProps.gridAutoRows,
      gridAutoFlow: slideProps.gridAutoFlow,
      justifyItems: slideProps.justifyItems,
      placeItems: slideProps.placeItems,
      placeContent: slideProps.placeContent,
    },
    undefined,
    lengthContext,
  );

  return {
    id: idGenerator.nextSlide(root.origin),
    name: slideProps.name,
    ...(root.origin ? { origin: root.origin } : {}),
    background: backgroundFill.fill,
    ...(backgroundFill.backgroundLayers
      ? { backgroundLayers: backgroundFill.backgroundLayers }
      : {}),
    nodes,
  };
}

export function resolveProjectedLayout(
  options: DeckOptions,
  input: LayoutInputDocument,
  resolutionOptions: ProjectedLayoutResolutionOptions = {},
): ProjectedLayoutDocument {
  const idGenerator = createIdGenerator();
  const slideSize = input.size
    ? input.size
    : options.layout.unit === "in"
      ? {
          widthEmu: options.layout.width * EMU_PER_INCH,
          heightEmu: options.layout.height * EMU_PER_INCH,
        }
      : {
          widthEmu: (options.layout.width / POINTS_PER_INCH) * EMU_PER_INCH,
          heightEmu: (options.layout.height / POINTS_PER_INCH) * EMU_PER_INCH,
        };
  const slideMeta = input.meta ?? options.meta;
  const slideFrame: Frame = {
    xEmu: 0,
    yEmu: 0,
    widthEmu: slideSize.widthEmu,
    heightEmu: slideSize.heightEmu,
  };
  const lengthContext: LengthResolutionContext = {
    viewportWidthEmu: slideFrame.widthEmu,
    viewportHeightEmu: slideFrame.heightEmu,
    ...(resolutionOptions.fontMetrics ? { fontMetrics: resolutionOptions.fontMetrics } : {}),
    fallbackTextWidthSafetyFactor: (
      resolutionOptions.textMeasurementProfile ?? PRESENTATION_TEXT_MEASUREMENT_PROFILE
    ).unregisteredFontWidthSafetyFactor,
  };

  return {
    ...(slideMeta ? { meta: slideMeta } : {}),
    size: slideSize,
    slides: input.slides.map((slide, slideIndex) => {
      return compileSlide(
        slide,
        {
          slideIndex,
        },
        slideFrame,
        idGenerator,
        lengthContext,
      );
    }),
  };
}

import {
  normalizeImageProps,
  normalizeShapeProps,
  normalizeSlideProps,
  normalizeTextProps,
  normalizeVideoProps,
  normalizeViewProps,
  parsePlaceContent,
  parsePlaceItems,
  parsePlaceSelf,
  type NormalizedImageProps,
  type NormalizedShapeProps,
  type NormalizedTextProps,
  type NormalizedVideoProps,
  type NormalizedViewProps,
} from "./normalization";
import type {
  LayoutInputContentNode,
  LayoutInputDocument,
  LayoutInputImage,
  LayoutInputShape,
  LayoutInputSlide,
  LayoutInputText,
  LayoutInputTextChild,
  LayoutInputVideo,
  LayoutInputView,
} from "./input";
import { frameFromProps, inflateSpecifiedBoxSize, parseAspectRatio } from "./absolute";
import { intersectClipRect, type ClipRect, type Frame, type Placement } from "./frame";
import type {
  ProjectedLayoutGroup,
  ImageSourceIR,
  ProjectedLayoutClip,
  ProjectedLayoutNode,
  ProjectedLayoutDocument,
  ProjectedLayoutOrigin,
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
import type { DeckOptions } from "../authoring/index";
import type {
  CssAlignContent,
  CssAlignSelf,
  CssJustifySelf,
  DeckLength,
  BorderStyle,
  ImageStyle,
  StackAlignment,
  StackAxis,
  StyleDeclarationValue,
  ViewStyle,
} from "../style/types";
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
  normalizeTransparency,
  parseObjectPosition,
  resolveBackgroundBoxFrames,
  resolveBackgroundLayers,
  type BackgroundBoxFrames,
} from "../style/background";
import { normalizeColor } from "../style/color";
import {
  isCssWideKeyword,
  parseLength,
  parsePointValue,
  type LengthResolutionContext,
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
import { unsupportedCssWideKeywordSemantic, unsupportedSemantic } from "./unsupported";

type IdGenerator = {
  nextSlide(): string;
  nextNode(): string;
};

export type ProjectedLayoutResolutionOptions = {
  readonly origins?: WeakMap<object, ProjectedLayoutOrigin>;
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

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseShadowShorthandOrIgnore(input: { property: string; value?: string }): {
  readonly shadow?: ShadowIR;
  readonly unsupportedSemantics: readonly ProjectedUnsupportedSemantic[];
} {
  try {
    const shadow = parseShadowShorthand(input.value);
    const unsupported = hasShadowSpreadRadius(input.value)
      ? unsupportedSemantic({
          feature: "shadow",
          property: input.property,
          value: input.value,
          error: new Error(
            `CSS shadow spread radius is not projected by the current PPTX shadow model: ${input.value}`,
          ),
          fallback: {
            strategy: "preserveAuthoredValueOnly",
            preserves: ["projectedShadowWithoutSpread"],
            missing: ["cssShadowSpreadRadius"],
          },
        })
      : undefined;
    return {
      shadow,
      unsupportedSemantics: unsupported ? [unsupported] : [],
    };
  } catch (error) {
    const unsupported = unsupportedSemantic({
      feature: "shadow",
      property: input.property,
      value: input.value,
      error,
    });
    return { unsupportedSemantics: unsupported ? [unsupported] : [] };
  }
}

type StrokeProjectionProps = {
  readonly border?: string;
  readonly borderColor?: string;
  readonly borderWidth?: DeckLength;
  readonly borderStyle?: BorderStyle;
  readonly borderTransparency?: number;
  readonly borderTop?: string;
  readonly borderRight?: string;
  readonly borderBottom?: string;
  readonly borderLeft?: string;
  readonly borderTopColor?: string;
  readonly borderRightColor?: string;
  readonly borderBottomColor?: string;
  readonly borderLeftColor?: string;
  readonly borderTopWidth?: DeckLength;
  readonly borderRightWidth?: DeckLength;
  readonly borderBottomWidth?: DeckLength;
  readonly borderLeftWidth?: DeckLength;
  readonly borderTopStyle?: BorderStyle;
  readonly borderRightStyle?: BorderStyle;
  readonly borderBottomStyle?: BorderStyle;
  readonly borderLeftStyle?: BorderStyle;
  readonly outline?: string;
  readonly outlineColor?: string;
  readonly outlineWidth?: DeckLength;
  readonly outlineStyle?: BorderStyle;
  readonly stroke?: string;
  readonly strokeWidth?: DeckLength;
  readonly strokeDasharray?: string;
  readonly strokeLinecap?: string;
  readonly strokeLinejoin?: string;
};

const STROKE_FALLBACK_REASON =
  "CSS-like stroke or border input could not be projected to the current PPTX stroke model; v0.8 preserves the authored stroke input as unsupported semantic metadata.";

const OUTLINE_FALLBACK_REASON =
  "CSS-like outline input could not be projected to the current PPTX outline model; v0.8 preserves the authored outline input as unsupported semantic metadata.";

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
    "strokeWidth",
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

function isExplicitNone(value: StyleDeclarationValue | undefined): boolean {
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
      missing: ["pptxStroke"],
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
  try {
    const strokes = resolveNodeStrokes(props as Parameters<typeof resolveNodeStrokes>[0], context);
    if (
      !strokes.stroke &&
      !strokes.edgeStrokes &&
      hasAuthoredStrokeInput(props) &&
      !isStrokeIntentionallyNone(props)
    ) {
      const semantic = unsupportedStrokeFallback(
        props,
        new Error("No PPTX stroke could be produced from the authored stroke input."),
      );
      return { ...strokes, unsupportedSemantics: semantic ? [semantic] : [] };
    }

    return { ...strokes, unsupportedSemantics: [] };
  } catch (error) {
    const semantic = unsupportedStrokeFallback(props, error);
    return { unsupportedSemantics: semantic ? [semantic] : [] };
  }
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

  try {
    const outlineInput = parseOutlineShorthand(props.outline);
    const outline = toStroke(
      props.outlineColor ?? outlineInput.outlineColor,
      props.outlineWidth ?? outlineInput.outlineWidth,
      props.outlineStyle ?? outlineInput.outlineStyle,
      outlineInput.outlineDashType,
      parseStrokeLineCap(props.strokeLinecap),
      parseStrokeLineJoin(props.strokeLinejoin),
      undefined,
      context,
    );
    if (outline) {
      return { outline, unsupportedSemantics: [] };
    }
    const input = outlineFallbackInput(props);
    const semantic = unsupportedSemantic({
      feature: "outline",
      property: input.property,
      value: input.value,
      error: new Error(OUTLINE_FALLBACK_REASON),
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["authoredOutlineInput"],
        missing: ["pptxOutline"],
      },
    });
    return { unsupportedSemantics: semantic ? [semantic] : [] };
  } catch (error) {
    const input = outlineFallbackInput(props);
    const semantic = unsupportedSemantic({
      feature: "outline",
      property: input.property,
      value: input.value,
      error: new Error(`${OUTLINE_FALLBACK_REASON} ${errorReason(error)}`),
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["authoredOutlineInput"],
        missing: ["pptxOutline"],
      },
    });
    return { unsupportedSemantics: semantic ? [semantic] : [] };
  }
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
  try {
    return resolveBackgroundLayers(
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
    );
  } catch (error) {
    const unsupported = unsupportedSemantic({
      feature: "background",
      property: input.property,
      value: input.value,
      error,
      fallback: {
        strategy: "preserveAuthoredValueOnly",
        preserves: ["authoredBackgroundInput"],
        missing: ["pptxBackgroundLayer"],
      },
    });
    return unsupported ? { unsupportedSemantics: [unsupported] } : {};
  }
}

function unsupportedTransformSemantics(props: {
  readonly transform?: string;
  readonly transformOrigin?: string;
}): readonly ProjectedUnsupportedSemantic[] {
  const unsupported: ProjectedUnsupportedSemantic[] = [];
  try {
    parseTransformShorthand(props.transform);
  } catch (error) {
    const semantic = unsupportedSemantic({
      feature: "transform",
      property: "transform",
      value: props.transform,
      error,
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }
  try {
    parseTransformOrigin(props.transformOrigin, {
      widthEmu: EMU_PER_INCH,
      heightEmu: EMU_PER_INCH,
    });
  } catch (error) {
    const semantic = unsupportedSemantic({
      feature: "transform",
      property: "transformOrigin",
      value: props.transformOrigin,
      error,
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }
  return unsupported;
}

const GROUP_OPACITY_COMPOSITING_FALLBACK_REASON =
  "CSS group opacity creates a composited stacking context; the current PPTX writer cascades alpha to child drawing values instead of compositing the rendered subtree.";

const OPACITY_STACKING_CONTEXT_FALLBACK_REASON =
  "CSS opacity creates a stacking context; v0.8 preserves the projected opacity value but does not yet evaluate a full CSS stacking-context subtree for this drawing node.";

const CLIPPING_TRANSFORM_FALLBACK_REASON =
  "CSS overflow clipping combined with transforms may require a transformed clip mask; v0.8 records axis-aligned clipping metadata and emits an approximate PPTX fallback.";

const CLIPPED_IMAGE_SOURCE_RECT_TRANSFORM_FALLBACK_REASON =
  "CSS clipping of a transformed image may require clipping the transformed visual image; v0.8 folds axis-aligned clipping into the PPTX image source rectangle before applying transform.";

const TRANSFORM_STACKING_CONTEXT_FALLBACK_REASON =
  "CSS transforms create a stacking context; v0.8 preserves projected transform and paint-order inputs but does not yet evaluate a full CSS stacking-context subtree.";

const FILTER_EFFECT_FALLBACK_REASON =
  "CSS filter effects are not emitted by the current PPTX writer; v0.8 preserves the authored filter as an unsupported paint semantic for inspection.";

const BLEND_MODE_FALLBACK_REASON =
  "CSS blend modes require compositing behavior that the current PPTX writer does not reproduce; v0.8 preserves the authored blend mode as an unsupported paint semantic for inspection.";

const ISOLATION_FALLBACK_REASON =
  "CSS isolation creates a compositing group; v0.8 preserves the authored isolation input but does not yet evaluate isolated compositing groups.";

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
  readonly x?: unknown;
  readonly y?: unknown;
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
    "x",
    "y",
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
    "strokeWidth",
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
    "x",
    "y",
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
  "CSS writing-mode and direction remap logical layout axes; deckjsx v0.8.2 projects them to PPTX text body direction but still resolves layout, spacing, insets, and start/end alignment on physical axes.";

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

function unsupportedGroupOpacitySemantics(props: {
  readonly opacity?: number;
}): readonly ProjectedUnsupportedSemantic[] {
  if (props.opacity === undefined || props.opacity <= 0 || props.opacity >= 1) {
    return [];
  }

  const semantic = unsupportedSemantic({
    feature: "opacity",
    property: "opacity",
    value: props.opacity,
    error: new Error(GROUP_OPACITY_COMPOSITING_FALLBACK_REASON),
    fallback: {
      strategy: "cascadeOpacityToChildren",
      preserves: ["projectedOpacity", "childDrawingValues"],
      missing: ["compositedSubtree", "cssStackingContext"],
    },
  });
  return semantic ? [semantic] : [];
}

function unsupportedOpacityStackingContextSemantics(props: {
  readonly opacity?: number;
}): readonly ProjectedUnsupportedSemantic[] {
  if (props.opacity === undefined || props.opacity <= 0 || props.opacity >= 1) {
    return [];
  }

  const semantic = unsupportedSemantic({
    feature: "opacity",
    property: "stackingContext",
    value: props.opacity,
    error: new Error(OPACITY_STACKING_CONTEXT_FALLBACK_REASON),
    fallback: {
      strategy: "preserveOpacityWithoutCompositedSubtree",
      preserves: ["projectedOpacity", "drawingNode"],
      missing: ["compositedSubtree", "cssStackingContext"],
    },
  });
  return semantic ? [semantic] : [];
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
  let operations: ReturnType<typeof parseTransformShorthand>;
  try {
    operations = parseTransformShorthand(props.transform);
  } catch {
    return [];
  }

  if (!operations?.length) {
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

function unsupportedCompositingSemantics(props: {
  readonly filter?: string;
  readonly mixBlendMode?: string;
  readonly isolation?: string;
}): readonly ProjectedUnsupportedSemantic[] {
  const unsupported: ProjectedUnsupportedSemantic[] = [];
  const filter = props.filter?.trim();
  if (filter && filter.toLowerCase() !== "none") {
    const semantic = unsupportedSemantic({
      feature: "filter",
      property: "filter",
      value: props.filter,
      error: new Error(FILTER_EFFECT_FALLBACK_REASON),
      fallback: {
        strategy: "dropFilterEffect",
        preserves: ["authoredFilter"],
        missing: ["filterEffect"],
      },
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  const mixBlendMode = props.mixBlendMode?.trim();
  if (mixBlendMode && mixBlendMode.toLowerCase() !== "normal") {
    const semantic = unsupportedSemantic({
      feature: "blend",
      property: "mixBlendMode",
      value: props.mixBlendMode,
      error: new Error(BLEND_MODE_FALLBACK_REASON),
      fallback: {
        strategy: "dropBlendMode",
        preserves: ["authoredBlendMode"],
        missing: ["blendCompositing"],
      },
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  if (props.isolation === "isolate") {
    const semantic = unsupportedSemantic({
      feature: "isolation",
      property: "isolation",
      value: props.isolation,
      error: new Error(ISOLATION_FALLBACK_REASON),
      fallback: {
        strategy: "dropIsolationGroup",
        preserves: ["authoredIsolation"],
        missing: ["isolatedCompositingGroup"],
      },
    });
    if (semantic) {
      unsupported.push(semantic);
    }
  }

  return unsupported;
}

function backgroundInput(props: {
  readonly background?: string;
  readonly backgroundColor?: string;
  readonly backgroundImage?: string;
}): { readonly property: string; readonly value?: string } {
  if (props.backgroundColor !== undefined) {
    return { property: "backgroundColor", value: props.backgroundColor };
  }
  if (props.backgroundImage !== undefined) {
    return { property: "backgroundImage", value: props.backgroundImage };
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
  let slideCount = 0;
  let nodeCount = 0;

  return {
    nextSlide() {
      slideCount += 1;
      return `slide-${slideCount}`;
    },
    nextNode() {
      nodeCount += 1;
      return `node-${nodeCount}`;
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
      missing: ["pptxObjectPosition"],
    },
  });

  return unsupported ? [unsupported] : [];
}

function parseCropValue(value: number | `${number}%` | undefined): number {
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
  alignContent: StackAlignment | CssAlignContent | undefined,
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

function estimateTextAutoContentSize(
  node: Extract<LayoutChildNode, { kind: "text" }>,
  dimension: "width" | "height",
  parent: Frame,
  context?: LengthResolutionContext,
): number {
  const textContext = getTextLengthContext(node.props, context);
  const [paddingTop, , paddingBottom] = parseSpacing(
    node.props.padding,
    textContext,
    parent.widthEmu,
  );

  if (dimension === "width") {
    return parent.widthEmu;
  }

  return (
    (resolveTextLineHeightPt(node.props, textContext) / POINTS_PER_INCH) * EMU_PER_INCH +
    paddingTop +
    paddingBottom
  );
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
    getMargin: getNodeMargin,
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
        const innerFrame: Frame = {
          xEmu: spec.contentX + (columnOffsets[column - 1] ?? 0) + marginLeft,
          yEmu: spec.contentY + (rowOffsets[row - 1] ?? 0) + marginTop,
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

        return compileNode(
          child,
          innerFrame,
          idGenerator,
          placementOverride,
          clipRect,
          context,
          resolutionOptions,
        );
      })
      .filter((node): node is ProjectedLayoutNode => node !== null),
  );
}

function hasExplicitFrameInput(child: LayoutChildNode): boolean {
  const { props } = child;
  const relativePosition = props.position === "relative";
  return (
    props.position === "absolute" ||
    props.area !== undefined ||
    (!relativePosition &&
      (hasAuthoredLength(props.x) ||
        hasAuthoredLength(props.y) ||
        (hasCssWideKeywordToken(props.inset) === false && props.inset !== undefined) ||
        hasAuthoredLength(props.left) ||
        hasAuthoredLength(props.top) ||
        hasAuthoredLength(props.right) ||
        hasAuthoredLength(props.bottom))) ||
    hasAuthoredLength(props.width) ||
    hasAuthoredLength(props.height)
  );
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
    const placement: Placement = {
      xEmu: contentFrame.xEmu + marginLeft,
      yEmu: cursorY + marginTop,
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
    cursorY += marginTop + childHeight + marginBottom + blockGapEmu;
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
  layout: ViewStyle["layout"],
  options: Pick<
    ViewStyle,
    | "direction"
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
  >,
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
    getMargin: getNodeMargin,
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
    props.backgroundTransparency,
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
    ...unsupportedCompositingSemantics(props),
    ...unsupportedGroupOpacitySemantics(props),
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
    id: idGenerator.nextNode(),
    kind: "group",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    opacity: resolved.opacity,
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
    strike: props.strike,
    color: normalizeColor(props.color),
    textAlign: props.textAlign,
    verticalAlign: props.verticalAlign,
    paddingPt: parseSpacingInPoints(props.padding, textLengthContext),
    lineSpacing: props.lineSpacing ?? lineHeight.lineSpacing,
    lineSpacingMultiple: props.lineSpacingMultiple ?? lineHeight.lineSpacingMultiple,
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
      : { textIndentPt: parsePointValue(props.textIndent, 0, textLengthContext) }),
    ...(tabStops ? { tabStops } : {}),
    charSpacing: resolveCharacterSpacing(props.charSpacing, textLengthContext),
    ...(list ? { list } : {}),
    fit: props.fit,
    wrap: props.wrap,
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

  for (const child of flattenTextChildren(children)) {
    if (typeof child === "string" || typeof child === "number") {
      runs.push({ text: extractText([child], textTransform) });
      continue;
    }

    if (isLayoutInputTextNode(child)) {
      const props = normalizeTextProps(child.props);
      const childLengthContext = getTextLengthContext(props, textLengthContext);
      const style = textStyleFromProps(props, childLengthContext);
      const text = extractRichTextRuns(
        child.children,
        props.textTransform ?? textTransform,
        childLengthContext,
      )
        .map((run) => run.text)
        .join("");
      runs.push({
        text,
        ...(!isEmptyRunStyle(style) ? { style } : {}),
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
  props: NormalizedTextProps,
  placement: Placement | undefined,
  context?: LengthResolutionContext,
): NormalizedTextProps {
  let resolved = props;
  const hasAuthoredWidth = authoredLengthOrUndefined(props.width) !== undefined;
  const hasAuthoredHeight = authoredLengthOrUndefined(props.height) !== undefined;
  const hasAuthoredInset = props.inset !== undefined && !hasCssWideKeywordToken(props.inset);
  const hasAuthoredLeft = authoredLengthOrUndefined(props.left) !== undefined;
  const hasAuthoredRight = authoredLengthOrUndefined(props.right) !== undefined;
  const hasAuthoredTop = authoredLengthOrUndefined(props.top) !== undefined;
  const hasAuthoredBottom = authoredLengthOrUndefined(props.bottom) !== undefined;
  const hasAuthoredX = authoredLengthOrUndefined(props.x) !== undefined;

  if (placement?.widthEmu === undefined && !hasAuthoredWidth && !hasAuthoredInset) {
    if (!hasAuthoredRight && (hasAuthoredX || hasAuthoredLeft)) {
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
    resolved = {
      ...resolved,
      height: `${resolveTextLineHeightPt(props, context)}pt`,
    };
  }

  return resolved;
}

function usesTextLineHeightFallback(
  props: NormalizedTextProps,
  placement: Placement | undefined,
): boolean {
  const hasAuthoredHeight = authoredLengthOrUndefined(props.height) !== undefined;
  const hasAuthoredInset = props.inset !== undefined && !hasCssWideKeywordToken(props.inset);
  const hasAuthoredTop = authoredLengthOrUndefined(props.top) !== undefined;
  const hasAuthoredBottom = authoredLengthOrUndefined(props.bottom) !== undefined;
  return (
    placement?.heightEmu === undefined &&
    !hasAuthoredHeight &&
    !hasAuthoredInset &&
    !(hasAuthoredTop && hasAuthoredBottom)
  );
}

function textMayNeedWrappedMeasurement(text: string, props: NormalizedTextProps): boolean {
  if (!text || props.wrap === false) {
    return false;
  }

  return text.includes("\n") || text.trim().length > 80;
}

function unsupportedWrappedTextMeasurementSemantics(input: {
  readonly props: NormalizedTextProps;
  readonly placement?: Placement;
  readonly text: string;
}): readonly ProjectedUnsupportedSemantic[] {
  if (
    !usesTextLineHeightFallback(input.props, input.placement) ||
    !textMayNeedWrappedMeasurement(input.text, input.props)
  ) {
    return [];
  }

  const semantic = unsupportedSemantic({
    feature: "layout",
    property: "height",
    value: "auto",
    error: new Error(
      "Exact wrapped text measurement is not part of the v0.8.2 layout subset; deckjsx uses a line-height based auto-height fallback.",
    ),
    fallback: {
      strategy: "preserveAuthoredValueOnly",
      preserves: ["availableInlineSize", "lineHeightAutoHeight"],
      missing: ["wrappedTextMeasurement"],
    },
  });
  return semantic ? [semantic] : [];
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
  const frameProps = textFramePropsWithFallback(props, placement, textLengthContext);
  const resolved = frameFromProps(frameProps, parentFrame, placement, textLengthContext);
  const strokes = resolveNodeStrokesOrFallback(props, textLengthContext);
  const shadow = parseShadowShorthandOrIgnore({
    property: props.textShadow !== undefined ? "textShadow" : "boxShadow",
    value: props.textShadow ?? props.boxShadow,
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
    props.backgroundTransparency,
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
    ...unsupportedCompositingSemantics(props),
    ...unsupportedOpacityStackingContextSemantics(props),
    ...unsupportedClippingTransformSemantics({
      clip,
      rotation: resolved.rotation,
      flipH: resolved.flipH,
      flipV: resolved.flipV,
    }),
    ...unsupportedWrappedTextMeasurementSemantics({
      props,
      placement,
      text,
    }),
    ...strokes.unsupportedSemantics,
    ...outline.unsupportedSemantics,
    ...shadow.unsupportedSemantics,
    ...(backgroundFill.unsupportedSemantics ?? []),
  ];

  return {
    id: idGenerator.nextNode(),
    kind: "text",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    opacity: resolved.opacity,
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
    ...unsupportedCompositingSemantics(props),
    ...unsupportedOpacityStackingContextSemantics(props),
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
    id: idGenerator.nextNode(),
    kind: "image",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    sourceFrame: originalFrame,
    opacity: resolved.opacity,
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
    fit,
    ...(objectPosition ? { objectPosition } : {}),
    ...(crop ? { crop } : {}),
    transparency: normalizeTransparency(props.transparency),
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
  const fallbackProps = {
    ...props,
    aspectRatio: props.aspectRatio ?? `${DEFAULT_VIDEO_ASPECT_RATIO}`,
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
    ...unsupportedCompositingSemantics(props),
    ...unsupportedOpacityStackingContextSemantics(props),
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
    id: idGenerator.nextNode(),
    kind: "video",
    ...(node.origin ? { origin: node.origin } : {}),
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    sourceFrame: originalFrame,
    opacity: resolved.opacity,
    rotation: resolved.rotation,
    zIndex: resolved.zIndex,
    ...(props.visibility !== undefined ? { visibility: props.visibility } : {}),
    flipH: resolved.flipH,
    flipV: resolved.flipV,
    ...(unsupportedSemantics.length ? { unsupportedSemantics } : {}),
    fit,
    ...(objectPosition ? { objectPosition } : {}),
    transparency: normalizeTransparency(props.transparency),
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
    props.fillTransparency,
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
    ...unsupportedCompositingSemantics(props),
    ...unsupportedOpacityStackingContextSemantics(props),
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
    id: idGenerator.nextNode(),
    kind: "shape",
    ...(node.origin ? { origin: node.origin } : {}),
    shape: props.shape,
    frame: visibleFrame,
    siblingOrder: node.siblingOrder,
    ...(clip ? { clip } : {}),
    opacity: resolved.opacity,
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
    slideProps.backgroundTransparency,
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
  const children = root.children
    .map(
      (child, siblingOrder): LayoutChildNode =>
        layoutChildFromNode(child, siblingOrder, lengthContext),
    )
    .filter((child) => child.props.display !== "none");
  const nodes = compileAbsoluteChildren(
    children,
    slideFrame,
    idGenerator,
    {
      padding: undefined,
      gap: undefined,
      rowGap: undefined,
      columnGap: undefined,
    },
    undefined,
    lengthContext,
  );

  return {
    id: idGenerator.nextSlide(),
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

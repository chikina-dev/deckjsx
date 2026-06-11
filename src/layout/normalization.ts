import type { ClassNameValue } from "../authoring/props";
import type { TemplateAreaRef } from "../templates";
import type {
  CssAlignContent,
  CssAlignSelf,
  CssFlexDirection,
  CssJustifyContent,
  CssJustifySelf,
  DeckLength,
  ImageStyle,
  ShapeStyle,
  SlideStyle,
  StackAxis,
  TextStyle,
  ViewStyle,
} from "../style/types";
import { resolveGridContainerAuthoring } from "./grid";
import { resolveBoxSpacing, resolveInset } from "./spacing";
import { normalizeOpacityAsTransparency, parseBackgroundShorthand } from "../style/background";
import { parseLength, type LengthResolutionContext } from "../style/length";
import {
  parseBorderShorthand,
  parseOutlineShorthand,
  parseSideBorderAuthoring,
  parseStrokeShorthand,
} from "../style/stroke";
import { parseTextDecoration, resolveTextWrap } from "../style/typography";

type SlideStructuralInput = {
  readonly name?: string;
  readonly template?: string;
  readonly className?: ClassNameValue;
};

type AreaStructuralInput = {
  readonly className?: ClassNameValue;
  readonly area?: TemplateAreaRef;
};

type ImageStructuralInput = AreaStructuralInput & {
  readonly src?: string;
  readonly data?: string;
};

type ShapeKind = "rect" | "ellipse" | "line";

type ShapeStructuralInput = AreaStructuralInput & {
  readonly shape?: ShapeKind;
};

export type NormalizedSlideProps = SlideStructuralInput & SlideStyle;
export type NormalizedViewProps = AreaStructuralInput & ViewStyle;
export type NormalizedTextProps = AreaStructuralInput & TextStyle;
export type NormalizedImageProps = ImageStructuralInput & ImageStyle;
export type NormalizedShapeProps = AreaStructuralInput & ShapeStyle & { readonly shape: ShapeKind };
export type SlideNormalizationInput = Partial<SlideStructuralInput> &
  SlideStyle & {
    readonly style?: SlideStyle;
  };
export type ViewNormalizationInput = Partial<AreaStructuralInput> &
  ViewStyle & {
    readonly style?: ViewStyle;
  };
export type TextNormalizationInput = Partial<AreaStructuralInput> &
  TextStyle & {
    readonly style?: TextStyle;
  };
export type ImageNormalizationInput = Partial<ImageStructuralInput> &
  ImageStyle & {
    readonly style?: ImageStyle;
  };
export type ShapeNormalizationInput = Partial<ShapeStructuralInput> &
  ShapeStyle & {
    readonly style?: ShapeStyle;
  };

function resolveFlexDirection(
  direction: StackAxis | undefined,
  flexDirection: CssFlexDirection | undefined,
  display: ViewStyle["display"],
): StackAxis | undefined {
  if (direction) {
    return direction;
  }

  if (flexDirection === "row") {
    return "horizontal";
  }

  if (flexDirection === "column") {
    return "vertical";
  }

  if (display === "flex") {
    return "horizontal";
  }

  return undefined;
}

function resolveLayout(
  layout: ViewStyle["layout"],
  display: ViewStyle["display"],
  position: ViewStyle["position"],
): ViewStyle["layout"] {
  if (layout) {
    return layout;
  }

  if (display === "flex") {
    return "stack";
  }

  if (display === "grid") {
    return "grid";
  }

  if (position === "absolute" || display === "block") {
    return "absolute";
  }

  return undefined;
}

function resolveGap(
  gap: DeckLength | undefined,
  rowGap: DeckLength | undefined,
  columnGap: DeckLength | undefined,
  direction: StackAxis | undefined,
) {
  if (gap !== undefined) {
    return gap;
  }

  if (direction === "horizontal") {
    return columnGap ?? rowGap;
  }

  if (direction === "vertical") {
    return rowGap ?? columnGap;
  }

  return rowGap ?? columnGap;
}

function isCssAlignSelf(value: string): value is CssAlignSelf {
  return (
    value === "start" ||
    value === "flex-start" ||
    value === "center" ||
    value === "end" ||
    value === "flex-end" ||
    value === "stretch" ||
    value === "auto"
  );
}

function isCssAlignContent(value: string): value is CssAlignContent {
  return (
    value === "start" ||
    value === "flex-start" ||
    value === "center" ||
    value === "end" ||
    value === "flex-end" ||
    value === "space-between" ||
    value === "space-around" ||
    value === "space-evenly" ||
    value === "stretch"
  );
}

export function parsePlaceSelf(value: string | undefined): {
  alignSelf?: CssAlignSelf;
  justifySelf?: CssJustifySelf;
} {
  if (!value) {
    return {};
  }

  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return {};
  }

  const alignSelf = isCssAlignSelf(parts[0]) ? parts[0] : undefined;
  const justifySelfToken = parts.length === 1 ? parts[0] : parts[1];
  const justifySelf = isCssAlignSelf(justifySelfToken) ? justifySelfToken : undefined;

  if (parts.length === 1) {
    return {
      alignSelf,
      justifySelf,
    };
  }

  return {
    alignSelf,
    justifySelf,
  };
}

export function parsePlaceItems(value: string | undefined): {
  alignItems?: CssAlignSelf;
  justifyItems?: CssJustifySelf;
} {
  const parsed = parsePlaceSelf(value);
  return {
    alignItems: parsed.alignSelf,
    justifyItems: parsed.justifySelf,
  };
}

export function parsePlaceContent(value: string | undefined): {
  alignContent?: CssAlignContent;
  justifyContent?: CssJustifyContent;
} {
  if (!value) {
    return {};
  }

  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return {};
  }

  const alignContent = isCssAlignContent(parts[0]) ? parts[0] : undefined;
  const justifyContentToken = parts.length === 1 ? parts[0] : parts[1];
  const justifyContent = isCssAlignContent(justifyContentToken) ? justifyContentToken : undefined;

  if (parts.length === 1) {
    return {
      alignContent,
      justifyContent,
    };
  }

  return {
    alignContent,
    justifyContent,
  };
}

export function normalizeViewProps(props: ViewNormalizationInput): NormalizedViewProps {
  const { style, ...rest } = props;
  const resolved: NormalizedViewProps = {
    ...rest,
    ...style,
  };
  const background = parseBackgroundShorthand(resolved.background);
  const border = parseBorderShorthand(resolved.border);
  const borderTop = parseSideBorderAuthoring(resolved.borderTop);
  const borderRight = parseSideBorderAuthoring(resolved.borderRight);
  const borderBottom = parseSideBorderAuthoring(resolved.borderBottom);
  const borderLeft = parseSideBorderAuthoring(resolved.borderLeft);
  const outline = parseOutlineShorthand(resolved.outline);
  const gridContainerAuthoring = resolveGridContainerAuthoring(resolved);
  const authored: NormalizedViewProps = {
    ...gridContainerAuthoring,
    ...resolved,
  };
  authored.display = resolved.display ?? gridContainerAuthoring.display;
  authored.gridTemplateAreas =
    resolved.gridTemplateAreas ?? gridContainerAuthoring.gridTemplateAreas;
  authored.gridTemplateRows = resolved.gridTemplateRows ?? gridContainerAuthoring.gridTemplateRows;
  authored.gridTemplateColumns =
    resolved.gridTemplateColumns ?? gridContainerAuthoring.gridTemplateColumns;
  authored.gridAutoColumns = resolved.gridAutoColumns ?? gridContainerAuthoring.gridAutoColumns;
  authored.gridAutoRows = resolved.gridAutoRows ?? gridContainerAuthoring.gridAutoRows;
  authored.gridAutoFlow = resolved.gridAutoFlow ?? gridContainerAuthoring.gridAutoFlow;
  const direction = resolveFlexDirection(
    authored.direction,
    authored.flexDirection,
    authored.display,
  );
  const inset = resolveInset(
    authored.inset,
    authored.top,
    authored.right,
    authored.bottom,
    authored.left,
  );

  return {
    ...authored,
    top: inset?.top ?? authored.top,
    right: inset?.right ?? authored.right,
    bottom: inset?.bottom ?? authored.bottom,
    left: inset?.left ?? authored.left,
    direction,
    layout: resolveLayout(authored.layout, authored.display, authored.position),
    gap: resolveGap(authored.gap, authored.rowGap, authored.columnGap, direction),
    backgroundColor: authored.backgroundColor ?? background.backgroundColor,
    borderColor: authored.borderColor ?? border.borderColor,
    borderWidth: authored.borderWidth ?? border.borderWidth,
    borderStyle: authored.borderStyle ?? border.borderStyle,
    borderTopColor: authored.borderTopColor ?? borderTop.color,
    borderRightColor: authored.borderRightColor ?? borderRight.color,
    borderBottomColor: authored.borderBottomColor ?? borderBottom.color,
    borderLeftColor: authored.borderLeftColor ?? borderLeft.color,
    borderTopWidth: authored.borderTopWidth ?? borderTop.width,
    borderRightWidth: authored.borderRightWidth ?? borderRight.width,
    borderBottomWidth: authored.borderBottomWidth ?? borderBottom.width,
    borderLeftWidth: authored.borderLeftWidth ?? borderLeft.width,
    borderTopStyle: authored.borderTopStyle ?? borderTop.style,
    borderRightStyle: authored.borderRightStyle ?? borderRight.style,
    borderBottomStyle: authored.borderBottomStyle ?? borderBottom.style,
    borderLeftStyle: authored.borderLeftStyle ?? borderLeft.style,
    outlineColor: authored.outlineColor ?? outline.outlineColor,
    outlineWidth: authored.outlineWidth ?? outline.outlineWidth,
    outlineStyle: authored.outlineStyle ?? outline.outlineStyle,
    padding: resolveBoxSpacing(
      authored.padding,
      authored.paddingTop,
      authored.paddingRight,
      authored.paddingBottom,
      authored.paddingLeft,
    ),
    margin: resolveBoxSpacing(
      authored.margin,
      authored.marginTop,
      authored.marginRight,
      authored.marginBottom,
      authored.marginLeft,
    ),
  };
}

export function normalizeTextProps(props: TextNormalizationInput): NormalizedTextProps {
  const { style, ...rest } = props;
  const resolved: NormalizedTextProps = {
    ...rest,
    ...style,
  };
  const background = parseBackgroundShorthand(resolved.background);
  const border = parseBorderShorthand(resolved.border);
  const borderTop = parseSideBorderAuthoring(resolved.borderTop);
  const borderRight = parseSideBorderAuthoring(resolved.borderRight);
  const borderBottom = parseSideBorderAuthoring(resolved.borderBottom);
  const borderLeft = parseSideBorderAuthoring(resolved.borderLeft);
  const outline = parseOutlineShorthand(resolved.outline);
  const decoration = parseTextDecoration(resolved.textDecorationLine ?? resolved.textDecoration);
  if (resolved.superscript && resolved.subscript) {
    throw new Error("Text cannot be both superscript and subscript.");
  }
  const inset = resolveInset(
    resolved.inset,
    resolved.top,
    resolved.right,
    resolved.bottom,
    resolved.left,
  );

  return {
    ...resolved,
    top: inset?.top ?? resolved.top,
    right: inset?.right ?? resolved.right,
    bottom: inset?.bottom ?? resolved.bottom,
    left: inset?.left ?? resolved.left,
    italic: resolved.italic ?? (resolved.fontStyle === "italic" ? true : undefined),
    underline: resolved.underline ?? decoration.underline,
    strike: resolved.strike ?? decoration.strike,
    charSpacing:
      resolved.charSpacing ?? (resolved.letterSpacing === "normal" ? 0 : resolved.letterSpacing),
    backgroundColor: resolved.backgroundColor ?? background.backgroundColor,
    borderColor: resolved.borderColor ?? border.borderColor,
    borderWidth: resolved.borderWidth ?? border.borderWidth,
    borderStyle: resolved.borderStyle ?? border.borderStyle,
    borderTopColor: resolved.borderTopColor ?? borderTop.color,
    borderRightColor: resolved.borderRightColor ?? borderRight.color,
    borderBottomColor: resolved.borderBottomColor ?? borderBottom.color,
    borderLeftColor: resolved.borderLeftColor ?? borderLeft.color,
    borderTopWidth: resolved.borderTopWidth ?? borderTop.width,
    borderRightWidth: resolved.borderRightWidth ?? borderRight.width,
    borderBottomWidth: resolved.borderBottomWidth ?? borderBottom.width,
    borderLeftWidth: resolved.borderLeftWidth ?? borderLeft.width,
    borderTopStyle: resolved.borderTopStyle ?? borderTop.style,
    borderRightStyle: resolved.borderRightStyle ?? borderRight.style,
    borderBottomStyle: resolved.borderBottomStyle ?? borderBottom.style,
    borderLeftStyle: resolved.borderLeftStyle ?? borderLeft.style,
    outlineColor: resolved.outlineColor ?? outline.outlineColor,
    outlineWidth: resolved.outlineWidth ?? outline.outlineWidth,
    outlineStyle: resolved.outlineStyle ?? outline.outlineStyle,
    wrap: resolveTextWrap(
      resolved.wrap,
      resolved.whiteSpace,
      resolved.wordBreak,
      resolved.overflowWrap,
    ),
    padding: resolveBoxSpacing(
      resolved.padding,
      resolved.paddingTop,
      resolved.paddingRight,
      resolved.paddingBottom,
      resolved.paddingLeft,
    ),
    margin: resolveBoxSpacing(
      resolved.margin,
      resolved.marginTop,
      resolved.marginRight,
      resolved.marginBottom,
      resolved.marginLeft,
    ),
  };
}

export function normalizeImageProps(
  props: ImageNormalizationInput,
  context?: LengthResolutionContext,
): NormalizedImageProps {
  const { style, ...rest } = props;
  const resolved: NormalizedImageProps = {
    ...rest,
    ...style,
  };
  const inset = resolveInset(
    resolved.inset,
    resolved.top,
    resolved.right,
    resolved.bottom,
    resolved.left,
  );

  return {
    ...resolved,
    top: inset?.top ?? resolved.top,
    right: inset?.right ?? resolved.right,
    bottom: inset?.bottom ?? resolved.bottom,
    left: inset?.left ?? resolved.left,
    fit: resolved.fit ?? resolved.objectFit,
    objectPosition: resolved.objectPosition,
    crop: resolved.crop,
    rounding:
      resolved.rounding ??
      (resolved.borderRadius !== undefined
        ? parseLength(resolved.borderRadius, 0, 0, context) > 0
        : undefined),
    margin: resolveBoxSpacing(
      resolved.margin,
      resolved.marginTop,
      resolved.marginRight,
      resolved.marginBottom,
      resolved.marginLeft,
    ),
  };
}

export function normalizeSlideProps(props: SlideNormalizationInput): NormalizedSlideProps {
  const { style, ...rest } = props;
  const resolved: NormalizedSlideProps = {
    ...rest,
    ...style,
  };
  const background = parseBackgroundShorthand(resolved.background);

  return {
    ...resolved,
    backgroundColor: resolved.backgroundColor ?? background.backgroundColor,
  };
}

export function normalizeShapeProps(props: ShapeNormalizationInput): NormalizedShapeProps {
  const { style, ...rest } = props;
  const resolved: NormalizedShapeProps = {
    ...rest,
    ...style,
    shape: rest.shape ?? "rect",
  };
  const background = parseBackgroundShorthand(resolved.background);
  const border = parseBorderShorthand(resolved.border);
  const borderTop = parseSideBorderAuthoring(resolved.borderTop);
  const borderRight = parseSideBorderAuthoring(resolved.borderRight);
  const borderBottom = parseSideBorderAuthoring(resolved.borderBottom);
  const borderLeft = parseSideBorderAuthoring(resolved.borderLeft);
  const outline = parseOutlineShorthand(resolved.outline);
  const stroke = parseStrokeShorthand(resolved.stroke);
  const inset = resolveInset(
    resolved.inset,
    resolved.top,
    resolved.right,
    resolved.bottom,
    resolved.left,
  );

  return {
    ...resolved,
    top: inset?.top ?? resolved.top,
    right: inset?.right ?? resolved.right,
    bottom: inset?.bottom ?? resolved.bottom,
    left: inset?.left ?? resolved.left,
    backgroundColor: resolved.backgroundColor ?? background.backgroundColor,
    fill:
      resolved.fill ??
      resolved.backgroundColor ??
      resolved.backgroundImage ??
      background.backgroundColor,
    fillTransparency: resolved.fillTransparency ?? resolved.backgroundTransparency,
    borderColor: resolved.borderColor ?? stroke.strokeColor ?? border.borderColor,
    borderWidth:
      resolved.borderWidth ?? resolved.strokeWidth ?? stroke.strokeWidth ?? border.borderWidth,
    borderStyle: resolved.borderStyle ?? stroke.strokeStyle ?? border.borderStyle,
    borderTransparency:
      resolved.borderTransparency ?? normalizeOpacityAsTransparency(resolved.strokeOpacity),
    borderTopColor: resolved.borderTopColor ?? borderTop.color,
    borderRightColor: resolved.borderRightColor ?? borderRight.color,
    borderBottomColor: resolved.borderBottomColor ?? borderBottom.color,
    borderLeftColor: resolved.borderLeftColor ?? borderLeft.color,
    borderTopWidth: resolved.borderTopWidth ?? borderTop.width,
    borderRightWidth: resolved.borderRightWidth ?? borderRight.width,
    borderBottomWidth: resolved.borderBottomWidth ?? borderBottom.width,
    borderLeftWidth: resolved.borderLeftWidth ?? borderLeft.width,
    borderTopStyle: resolved.borderTopStyle ?? borderTop.style,
    borderRightStyle: resolved.borderRightStyle ?? borderRight.style,
    borderBottomStyle: resolved.borderBottomStyle ?? borderBottom.style,
    borderLeftStyle: resolved.borderLeftStyle ?? borderLeft.style,
    outlineColor: resolved.outlineColor ?? outline.outlineColor,
    outlineWidth: resolved.outlineWidth ?? outline.outlineWidth,
    outlineStyle: resolved.outlineStyle ?? outline.outlineStyle,
    radius: resolved.radius ?? resolved.borderRadius,
    margin: resolveBoxSpacing(
      resolved.margin,
      resolved.marginTop,
      resolved.marginRight,
      resolved.marginBottom,
      resolved.marginLeft,
    ),
  };
}

import type { ClassNameValue } from "../authoring/props";
import type { TemplateAreaRef } from "../templates";
import type { ProjectedImageFit } from "./image-fit";
import type {
  CssAlignContent,
  CssAlignSelf,
  CssColor,
  CssFlexDirection,
  CssGridTemplate,
  CssJustifyContent,
  CssLetterSpacing,
  CssJustifySelf,
  DeckLength,
  ImageFit,
  ImageStyle,
  NonNegativeDeckLength,
  CssPaint,
  ShapeStyle,
  SlideStyle,
  StackAxis,
  TableCellStyle,
  TableRowStyle,
  TableSectionStyle,
  TableStyle,
  TextStyle,
  VideoStyle,
  ViewStyle,
} from "../style/types";
import { resolveGridContainerAuthoring } from "./grid";
import { resolveBoxSpacing, resolveInset } from "./spacing";
import { parseBackgroundShorthand } from "../style/background";
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

function firstGridTemplateValue(...values: readonly unknown[]): CssGridTemplate | undefined {
  return values.find((value) => value !== undefined) as CssGridTemplate | undefined;
}

type ImageStructuralInput = AreaStructuralInput & {
  readonly src?: string;
  readonly data?: string;
};

type VideoStructuralInput = AreaStructuralInput & {
  readonly src?: string;
  readonly data?: string;
  readonly poster?: string;
  readonly posterData?: string;
};

type ShapeKind = "rect" | "ellipse" | "line" | "roundRect";

function asCssColor(value: string | undefined): CssColor | undefined {
  return value as CssColor | undefined;
}

function asCssPaint(value: string | undefined): CssPaint | undefined {
  return value as CssPaint | undefined;
}

function authoredOrParsedCssColor(
  authored: CssColor | undefined,
  parsed: string | undefined,
): CssColor | undefined {
  if (authored !== undefined) {
    return authored;
  }

  return asCssColor(parsed);
}

function firstCssColor(...values: readonly unknown[]): CssColor | undefined {
  return values.find((value) => value !== undefined) as CssColor | undefined;
}

function firstCssPaint(...values: readonly unknown[]): CssPaint | undefined {
  return values.find((value) => value !== undefined) as CssPaint | undefined;
}

type ShapeStructuralInput = AreaStructuralInput & {
  readonly shape?: ShapeKind;
};

export type InternalLayoutMode = "block" | "stack" | "grid";
export type NormalizedSlideProps = SlideStructuralInput &
  SlideStyle & {
    readonly direction?: StackAxis;
    readonly layout?: InternalLayoutMode;
  };
export type NormalizedViewProps = AreaStructuralInput &
  ViewStyle & {
    readonly direction?: StackAxis;
    readonly layout?: InternalLayoutMode;
  };
export type NormalizedTextProps = AreaStructuralInput &
  TextStyle & {
    readonly italic?: boolean;
    readonly underline?: boolean;
    readonly strike?: boolean;
    readonly charSpacing?: CssLetterSpacing;
    readonly wrap?: boolean;
  };
export type NormalizedImageProps = ImageStructuralInput &
  ImageStyle & {
    readonly fit?: ProjectedImageFit;
    readonly rounding?: boolean;
  };
export type NormalizedVideoProps = VideoStructuralInput &
  VideoStyle & {
    readonly fit?: ProjectedImageFit;
    readonly rounding?: boolean;
  };
export type NormalizedShapeProps = AreaStructuralInput &
  ShapeStyle & {
    readonly shape: ShapeKind;
    readonly borderTransparency?: number;
    readonly radius?: DeckLength;
  };
export type NormalizedTableProps = AreaStructuralInput & TableStyle;
export type NormalizedTableSectionProps = TableSectionStyle;
export type NormalizedTableRowProps = TableRowStyle;
export type NormalizedTableCellProps = TableCellStyle;
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
export type VideoNormalizationInput = Partial<VideoStructuralInput> &
  VideoStyle & {
    readonly style?: VideoStyle;
  };
export type ShapeNormalizationInput = Partial<ShapeStructuralInput> &
  ShapeStyle & {
    readonly style?: ShapeStyle;
  };
export type TableNormalizationInput = Partial<AreaStructuralInput> &
  TableStyle & {
    readonly style?: TableStyle;
  };
export type TableSectionNormalizationInput = TableSectionStyle & {
  readonly style?: TableSectionStyle;
};
export type TableRowNormalizationInput = TableRowStyle & {
  readonly style?: TableRowStyle;
};
export type TableCellNormalizationInput = TableCellStyle & {
  readonly style?: TableCellStyle;
};

function resolveFlexDirection(
  flexDirection: CssFlexDirection | undefined,
  display: ViewStyle["display"],
): StackAxis | undefined {
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
  display: ViewStyle["display"],
  position: ViewStyle["position"],
): InternalLayoutMode | undefined {
  if (display === "flex") {
    return "stack";
  }

  if (display === "grid") {
    return "grid";
  }

  if (position === "absolute" || display === "block") {
    return "block";
  }

  return undefined;
}

function resolveGap(
  gap: NonNegativeDeckLength | undefined,
  rowGap: NonNegativeDeckLength | undefined,
  columnGap: NonNegativeDeckLength | undefined,
  direction: StackAxis | undefined,
): NonNegativeDeckLength | undefined {
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

function normalizeImageFit(value: ImageFit | undefined): ProjectedImageFit | undefined {
  if (value === "fill") {
    return "stretch";
  }

  return value;
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
  authored.gridTemplateRows = firstGridTemplateValue(
    resolved.gridTemplateRows,
    gridContainerAuthoring.gridTemplateRows,
  );
  authored.gridTemplateColumns = firstGridTemplateValue(
    resolved.gridTemplateColumns,
    gridContainerAuthoring.gridTemplateColumns,
  );
  authored.gridAutoColumns = resolved.gridAutoColumns ?? gridContainerAuthoring.gridAutoColumns;
  authored.gridAutoRows = resolved.gridAutoRows ?? gridContainerAuthoring.gridAutoRows;
  authored.gridAutoFlow = resolved.gridAutoFlow ?? gridContainerAuthoring.gridAutoFlow;
  const direction = resolveFlexDirection(authored.flexDirection, authored.display);
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
    layout: resolveLayout(authored.display, authored.position),
    gap: resolveGap(authored.gap, authored.rowGap, authored.columnGap, direction),
    backgroundColor: authoredOrParsedCssColor(authored.backgroundColor, background.backgroundColor),
    borderColor: firstCssColor(authored.borderColor, border.borderColor),
    borderWidth: authored.borderWidth ?? border.borderWidth,
    borderStyle: authored.borderStyle ?? border.borderStyle,
    borderTopColor: firstCssColor(authored.borderTopColor, borderTop.color),
    borderRightColor: firstCssColor(authored.borderRightColor, borderRight.color),
    borderBottomColor: firstCssColor(authored.borderBottomColor, borderBottom.color),
    borderLeftColor: firstCssColor(authored.borderLeftColor, borderLeft.color),
    borderTopWidth: authored.borderTopWidth ?? borderTop.width,
    borderRightWidth: authored.borderRightWidth ?? borderRight.width,
    borderBottomWidth: authored.borderBottomWidth ?? borderBottom.width,
    borderLeftWidth: authored.borderLeftWidth ?? borderLeft.width,
    borderTopStyle: authored.borderTopStyle ?? borderTop.style,
    borderRightStyle: authored.borderRightStyle ?? borderRight.style,
    borderBottomStyle: authored.borderBottomStyle ?? borderBottom.style,
    borderLeftStyle: authored.borderLeftStyle ?? borderLeft.style,
    outlineColor: firstCssColor(authored.outlineColor, outline.outlineColor),
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

export function normalizeTableProps(props: TableNormalizationInput): NormalizedTableProps {
  return normalizeViewProps(props);
}

export function normalizeTableSectionProps(
  props: TableSectionNormalizationInput,
): NormalizedTableSectionProps {
  return normalizeViewProps(props);
}

export function normalizeTableRowProps(props: TableRowNormalizationInput): NormalizedTableRowProps {
  return normalizeViewProps(props);
}

export function normalizeTableCellProps(
  props: TableCellNormalizationInput,
): NormalizedTableCellProps {
  return normalizeTextProps(props);
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
    italic: resolved.fontStyle === "italic" ? true : undefined,
    underline: decoration.underline,
    strike: decoration.strike,
    charSpacing: resolved.letterSpacing === "normal" ? 0 : resolved.letterSpacing,
    backgroundColor: firstCssColor(resolved.backgroundColor, background.backgroundColor),
    borderColor: firstCssColor(resolved.borderColor, border.borderColor),
    borderWidth: resolved.borderWidth ?? border.borderWidth,
    borderStyle: resolved.borderStyle ?? border.borderStyle,
    borderTopColor: firstCssColor(resolved.borderTopColor, borderTop.color),
    borderRightColor: firstCssColor(resolved.borderRightColor, borderRight.color),
    borderBottomColor: firstCssColor(resolved.borderBottomColor, borderBottom.color),
    borderLeftColor: firstCssColor(resolved.borderLeftColor, borderLeft.color),
    borderTopWidth: resolved.borderTopWidth ?? borderTop.width,
    borderRightWidth: resolved.borderRightWidth ?? borderRight.width,
    borderBottomWidth: resolved.borderBottomWidth ?? borderBottom.width,
    borderLeftWidth: resolved.borderLeftWidth ?? borderLeft.width,
    borderTopStyle: resolved.borderTopStyle ?? borderTop.style,
    borderRightStyle: resolved.borderRightStyle ?? borderRight.style,
    borderBottomStyle: resolved.borderBottomStyle ?? borderBottom.style,
    borderLeftStyle: resolved.borderLeftStyle ?? borderLeft.style,
    outlineColor: firstCssColor(resolved.outlineColor, outline.outlineColor),
    outlineWidth: resolved.outlineWidth ?? outline.outlineWidth,
    outlineStyle: resolved.outlineStyle ?? outline.outlineStyle,
    wrap: resolveTextWrap(resolved.whiteSpace, resolved.wordBreak, resolved.overflowWrap),
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
    fit: normalizeImageFit(resolved.objectFit),
    objectPosition: resolved.objectPosition,
    crop: resolved.crop,
    rounding:
      resolved.borderRadius !== undefined
        ? parseLength(resolved.borderRadius, 0, 0, context) > 0
        : undefined,
    margin: resolveBoxSpacing(
      resolved.margin,
      resolved.marginTop,
      resolved.marginRight,
      resolved.marginBottom,
      resolved.marginLeft,
    ),
  };
}

export function normalizeVideoProps(
  props: VideoNormalizationInput,
  context?: LengthResolutionContext,
): NormalizedVideoProps {
  const { style, ...rest } = props;
  const resolved: NormalizedVideoProps = {
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
    fit: normalizeImageFit(resolved.objectFit),
    objectPosition: resolved.objectPosition,
    rounding:
      resolved.borderRadius !== undefined
        ? parseLength(resolved.borderRadius, 0, 0, context) > 0
        : undefined,
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
  const gridContainerAuthoring = resolveGridContainerAuthoring(resolved);
  const authored: NormalizedSlideProps = {
    ...gridContainerAuthoring,
    ...resolved,
  };
  authored.display = resolved.display ?? gridContainerAuthoring.display;
  authored.gridTemplateAreas =
    resolved.gridTemplateAreas ?? gridContainerAuthoring.gridTemplateAreas;
  authored.gridTemplateRows = firstGridTemplateValue(
    resolved.gridTemplateRows,
    gridContainerAuthoring.gridTemplateRows,
  );
  authored.gridTemplateColumns = firstGridTemplateValue(
    resolved.gridTemplateColumns,
    gridContainerAuthoring.gridTemplateColumns,
  );
  authored.gridAutoColumns = resolved.gridAutoColumns ?? gridContainerAuthoring.gridAutoColumns;
  authored.gridAutoRows = resolved.gridAutoRows ?? gridContainerAuthoring.gridAutoRows;
  authored.gridAutoFlow = resolved.gridAutoFlow ?? gridContainerAuthoring.gridAutoFlow;
  const direction = resolveFlexDirection(authored.flexDirection, authored.display);

  return {
    ...authored,
    direction,
    layout: resolveLayout(authored.display, undefined),
    gap: resolveGap(authored.gap, authored.rowGap, authored.columnGap, direction),
    backgroundColor: firstCssColor(authored.backgroundColor, background.backgroundColor),
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
    backgroundColor: firstCssColor(resolved.backgroundColor, background.backgroundColor),
    fill: firstCssPaint(
      resolved.fill,
      resolved.backgroundColor,
      resolved.backgroundImage,
      asCssPaint(background.backgroundColor),
    ),
    borderColor: firstCssColor(resolved.borderColor, stroke.strokeColor, border.borderColor),
    borderWidth: resolved.borderWidth ?? stroke.strokeWidth ?? border.borderWidth,
    borderStyle: resolved.borderStyle ?? stroke.strokeStyle ?? border.borderStyle,
    borderTransparency: resolved.borderTransparency,
    borderTopColor: firstCssColor(resolved.borderTopColor, borderTop.color),
    borderRightColor: firstCssColor(resolved.borderRightColor, borderRight.color),
    borderBottomColor: firstCssColor(resolved.borderBottomColor, borderBottom.color),
    borderLeftColor: firstCssColor(resolved.borderLeftColor, borderLeft.color),
    borderTopWidth: resolved.borderTopWidth ?? borderTop.width,
    borderRightWidth: resolved.borderRightWidth ?? borderRight.width,
    borderBottomWidth: resolved.borderBottomWidth ?? borderBottom.width,
    borderLeftWidth: resolved.borderLeftWidth ?? borderLeft.width,
    borderTopStyle: resolved.borderTopStyle ?? borderTop.style,
    borderRightStyle: resolved.borderRightStyle ?? borderRight.style,
    borderBottomStyle: resolved.borderBottomStyle ?? borderBottom.style,
    borderLeftStyle: resolved.borderLeftStyle ?? borderLeft.style,
    outlineColor: firstCssColor(resolved.outlineColor, outline.outlineColor),
    outlineWidth: resolved.outlineWidth ?? outline.outlineWidth,
    outlineStyle: resolved.outlineStyle ?? outline.outlineStyle,
    radius: resolved.borderRadius,
    margin: resolveBoxSpacing(
      resolved.margin,
      resolved.marginTop,
      resolved.marginRight,
      resolved.marginBottom,
      resolved.marginLeft,
    ),
  };
}

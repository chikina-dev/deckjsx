import type {
  CssVisibility,
  ProjectedStrokeStyle,
  StrokeDashType,
  StrokeLineCap,
  StrokeLineJoin,
  TextFit,
  VerticalAlign,
} from "../style/types";
import type { AssetEntityId, GraphNodeId, SourceOrigin, StyleEntityId } from "../graph";
import type { ComponentProvenance } from "../authoring-metadata";
import type { SemanticTemplateAreaRef } from "../graph/types";
import type { TemplateAreaKind } from "../templates";

/**
 * Opaque identity of a projected layout entity.
 *
 * Canonical projections derive this value from semantic graph identity. Callers should compare it
 * for identity only and must not infer paint order or array position from its representation.
 */
export type ProjectedLayoutId = string;

export type ProjectedLayoutOrigin = {
  readonly graphNodeIds?: readonly GraphNodeId[];
  readonly styleEntityIds?: readonly StyleEntityId[];
  readonly assetEntityIds?: readonly AssetEntityId[];
  readonly source?: SourceOrigin;
  readonly componentProvenance?: ComponentProvenance;
  readonly templateAreaRef?: SemanticTemplateAreaRef;
  readonly templateAreaKind?: TemplateAreaKind;
  readonly templateAreaFrame?: FrameIR;
};

export type ProjectedLayoutDocument = {
  meta?: {
    title?: string;
    author?: string;
    subject?: string;
  };
  size: SizeIR;
  slides: ReadonlyArray<ProjectedLayoutSlide>;
};

export type SizeIR = {
  widthEmu: number;
  heightEmu: number;
};

export type FrameIR = SizeIR & {
  xEmu: number;
  yEmu: number;
};

export type ProjectedLayoutClip = {
  readonly strategy: "intersectParentOverflow";
  readonly originalFrame: FrameIR;
  readonly clipFrame: FrameIR;
  readonly visibleFrame: FrameIR;
};

/** Output-neutral paint and compositing intent retained beside resolved geometry. */
export type ProjectedPaintIntent = {
  readonly filter?: string;
  readonly mixBlendMode?: string;
  readonly isolation?: "isolate";
};

export type ProjectedUnsupportedSemanticFeature =
  | "blend"
  | "background"
  | "border"
  | "clipping"
  | "content"
  | "filter"
  | "image"
  | "isolation"
  | "layout"
  | "outline"
  | "opacity"
  | "shadow"
  | "stroke"
  | "transform";

export type ProjectedUnsupportedFallbackStrategy =
  | "axisAlignedClipWithoutTransformedMask"
  | "cascadeOpacityToChildren"
  | "dropBlendMode"
  | "dropFilterEffect"
  | "dropIsolationGroup"
  | "preserveAuthoredValueOnly"
  | "preserveOpacityWithoutCompositedSubtree"
  | "preserveTransformWithoutStackingContext"
  | "sourceRectBeforeTransform"
  | "synthesizeFallbackFrame";

export type ProjectedUnsupportedFallback = {
  readonly strategy: ProjectedUnsupportedFallbackStrategy;
  readonly preserves: readonly string[];
  readonly missing: readonly string[];
};

export type ProjectedUnsupportedSemantic = {
  readonly feature: ProjectedUnsupportedSemanticFeature;
  readonly property: string;
  readonly value: string;
  readonly reason: string;
  readonly fallback?: ProjectedUnsupportedFallback;
};

export type ProjectedLayoutSlide = {
  id: ProjectedLayoutId;
  name?: string;
  origin?: ProjectedLayoutOrigin;
  background?: FillIR;
  backgroundLayers?: ReadonlyArray<BackgroundLayerIR>;
  nodes: ReadonlyArray<ProjectedLayoutNode>;
};

export type ProjectedLayoutNode =
  | ProjectedLayoutGroup
  | ProjectedLayoutTable
  | ProjectedLayoutText
  | ProjectedLayoutImage
  | ProjectedLayoutVideo
  | ProjectedLayoutShape;

export type ProjectedLayoutBaseNode = {
  id: ProjectedLayoutId;
  origin?: ProjectedLayoutOrigin;
  frame: FrameIR;
  siblingOrder: number;
  opacity?: number;
  rotation?: number;
  zIndex?: number;
  visibility?: CssVisibility;
  flipH?: boolean;
  flipV?: boolean;
  clip?: ProjectedLayoutClip;
  paintIntent?: ProjectedPaintIntent;
  unsupportedSemantics?: ReadonlyArray<ProjectedUnsupportedSemantic>;
};

export type ShadowIR = {
  type: "outer" | "inner";
  color: string;
  opacity: number;
  blurPt: number;
  spreadPt?: number;
  offsetPt: number;
  angle: number;
};

export type HyperlinkIR = {
  url: string;
  tooltip?: string;
};

export type ObjectPositionIR = {
  x: number;
  y: number;
};

export type ImageCropIR = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ProjectedLayoutGroup = ProjectedLayoutBaseNode & {
  kind: "group";
  children: ReadonlyArray<ProjectedLayoutNode>;
  fill?: FillIR;
  backgroundLayers?: ReadonlyArray<BackgroundLayerIR>;
  stroke?: StrokeIR;
  edgeStrokes?: EdgeStrokeIR;
  outline?: StrokeIR;
  shadow?: ShadowIR;
  radiusEmu?: number;
};

export type ProjectedLayoutTable = ProjectedLayoutBaseNode & {
  kind: "table";
  shadow?: ShadowIR;
  fill?: FillIR;
  backgroundLayers?: ReadonlyArray<BackgroundLayerIR>;
  edgeStrokes?: EdgeStrokeIR;
  outline?: StrokeIR;
  radiusEmu?: number;
  sections: ReadonlyArray<ProjectedLayoutTableSection>;
};

export type ProjectedLayoutTableSection = {
  kind: "tableSection";
  sectionKind: "head" | "body" | "foot";
  frame: FrameIR;
  opacity?: number;
  paintIntent?: ProjectedPaintIntent;
  unsupportedSemantics?: ReadonlyArray<ProjectedUnsupportedSemantic>;
  fill?: FillIR;
  backgroundLayers?: ReadonlyArray<BackgroundLayerIR>;
  rows: ReadonlyArray<ProjectedLayoutTableRow>;
  origin?: ProjectedLayoutOrigin;
};

export type ProjectedLayoutTableRow = {
  kind: "tableRow";
  frame: FrameIR;
  opacity?: number;
  paintIntent?: ProjectedPaintIntent;
  unsupportedSemantics?: ReadonlyArray<ProjectedUnsupportedSemantic>;
  fill?: FillIR;
  backgroundLayers?: ReadonlyArray<BackgroundLayerIR>;
  cells: ReadonlyArray<ProjectedLayoutTableCell>;
  origin?: ProjectedLayoutOrigin;
};

export type ProjectedLayoutTableCell = {
  kind: "tableCell";
  cellKind: "header" | "data";
  gridColumnIndex: number;
  colSpan: number;
  rowSpan: number;
  frame: FrameIR;
  opacity?: number;
  paintIntent?: ProjectedPaintIntent;
  unsupportedSemantics?: ReadonlyArray<ProjectedUnsupportedSemantic>;
  fill?: FillIR;
  backgroundLayers?: ReadonlyArray<BackgroundLayerIR>;
  edgeStrokes?: EdgeStrokeIR;
  style: TextStyleIR;
  hyperlink?: HyperlinkIR;
  children: ReadonlyArray<ProjectedLayoutNode>;
  origin?: ProjectedLayoutOrigin;
};

export type ProjectedLayoutText = ProjectedLayoutBaseNode & {
  kind: "text";
  content: TextContentIR;
  style: TextStyleIR;
  fill?: FillIR;
  backgroundLayers?: ReadonlyArray<BackgroundLayerIR>;
  stroke?: StrokeIR;
  edgeStrokes?: EdgeStrokeIR;
  outline?: StrokeIR;
  shadow?: ShadowIR;
  hyperlink?: HyperlinkIR;
  radiusEmu?: number;
};

export type ProjectedLayoutImage = ProjectedLayoutBaseNode & {
  kind: "image";
  sourceFrame: FrameIR;
  source: ImageSourceIR;
  fit: "contain" | "cover" | "stretch";
  objectPosition?: ObjectPositionIR;
  crop?: ImageCropIR;
  transparency?: number;
  rounding?: boolean;
  shadow?: ShadowIR;
  hyperlink?: HyperlinkIR;
};

export type ProjectedLayoutVideo = ProjectedLayoutBaseNode & {
  kind: "video";
  sourceFrame: FrameIR;
  source: ImageSourceIR;
  posterSource?: ImageSourceIR;
  fit: "contain" | "cover" | "stretch";
  objectPosition?: ObjectPositionIR;
  transparency?: number;
  rounding?: boolean;
  shadow?: ShadowIR;
};

export type ProjectedLayoutShape = ProjectedLayoutBaseNode & {
  kind: "shape";
  shape: "rect" | "ellipse" | "line" | "roundRect";
  fill?: FillIR;
  backgroundLayers?: ReadonlyArray<BackgroundLayerIR>;
  stroke?: StrokeIR;
  edgeStrokes?: EdgeStrokeIR;
  outline?: StrokeIR;
  shadow?: ShadowIR;
  hyperlink?: HyperlinkIR;
  radiusEmu?: number;
};

export type SolidFillIR = {
  kind: "solid";
  color: string;
  transparency?: number;
  frame?: FrameIR;
};

export type LinearGradientStopIR = {
  color: string;
  transparency?: number;
  position: number;
};

export type LinearGradientFillIR = {
  kind: "linear-gradient";
  angle: number;
  stops: ReadonlyArray<LinearGradientStopIR>;
  frame?: FrameIR;
};

export type RadialGradientFillIR = {
  kind: "radial-gradient";
  shape: "circle" | "ellipse";
  center: {
    x: number;
    y: number;
  };
  radius: {
    x: number;
    y: number;
  };
  stops: ReadonlyArray<LinearGradientStopIR>;
  frame?: FrameIR;
};

export type BackgroundImageLayerIR = {
  kind: "background-image";
  frame: FrameIR;
  sourceFrame: FrameIR;
  source: ImageSourceIR;
  fit: "contain" | "cover" | "stretch" | "size";
  size?: {
    widthEmu?: number;
    heightEmu?: number;
  };
  repeat: "no-repeat" | "repeat-x" | "repeat-y" | "repeat";
  objectPosition?: ObjectPositionIR;
  transparency?: number;
};

export type FillIR = SolidFillIR | LinearGradientFillIR | RadialGradientFillIR;
export type BackgroundLayerIR = FillIR | BackgroundImageLayerIR;

export type StrokeIR = {
  color: string;
  widthPt: number;
  style?: ProjectedStrokeStyle;
  dashType?: StrokeDashType;
  lineCap?: StrokeLineCap;
  lineJoin?: StrokeLineJoin;
  transparency?: number;
};

export type EdgeStrokeIR = {
  top?: StrokeIR;
  right?: StrokeIR;
  bottom?: StrokeIR;
  left?: StrokeIR;
};

export type TextContentIR = {
  text: string;
  runs?: ReadonlyArray<TextRunIR>;
};

export type TextRunIR = {
  text: string;
  style?: TextStyleIR;
  hyperlink?: HyperlinkIR;
};

export type TextTabStopIR = {
  positionIn: number;
  alignment?: "l" | "r" | "ctr" | "dec";
};

export type TextBulletListIR = {
  type: "bullet";
  characterCode: string;
  indentPt?: number;
};

export type TextNumberListIR = {
  type: "number";
  style: "arabicPeriod" | "alphaLcPeriod" | "alphaUcPeriod" | "romanLcPeriod" | "romanUcPeriod";
  startAt?: number;
  indentPt?: number;
};

export type TextNoListIR = {
  type: "none";
};

export type TextListIR = TextBulletListIR | TextNumberListIR | TextNoListIR;

export type TextStyleIR = {
  fontFamily?: string;
  fontSizePt?: number;
  fontWeight?: number | "normal" | "bold";
  italic?: boolean;
  underline?: boolean;
  underlineStyle?: "dash" | "dbl" | "dotted" | "none" | "sng" | "wavy";
  underlineColor?: string;
  underlineTransparency?: number;
  strike?: boolean;
  rtlMode?: boolean;
  textDirection?: "horz" | "vert" | "vert270";
  superscript?: boolean;
  subscript?: boolean;
  color?: string;
  colorTransparency?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  verticalAlign?: VerticalAlign;
  paddingPt?: [number, number, number, number];
  lineSpacing?: number;
  lineSpacingMultiple?: number;
  paragraphSpacingBefore?: number;
  paragraphSpacingAfter?: number;
  textIndentPt?: number;
  tabStops?: ReadonlyArray<TextTabStopIR>;
  charSpacing?: number;
  list?: TextListIR;
  fit?: TextFit;
  wrap?: boolean;
  breakWords?: boolean;
  overflow?: "hidden" | "visible";
};

export type ImageSourceIR =
  | {
      kind: "path";
      path: string;
    }
  | {
      kind: "data";
      data: string;
    }
  | {
      kind: "url";
      url: string;
    };

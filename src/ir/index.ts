import type {
  BackendName,
  BorderStyle,
  CssVisibility,
  StrokeDashType,
  StrokeLineCap,
  StrokeLineJoin,
  TextFit,
  VerticalAlign,
} from "../authoring/index";

export type PresentationIR = {
  version: "0.1";
  meta?: {
    title?: string;
    author?: string;
    subject?: string;
  };
  size: SizeIR;
  slides: ReadonlyArray<SlideIR>;
};

export type SizeIR = {
  widthEmu: number;
  heightEmu: number;
};

export type FrameIR = SizeIR & {
  xEmu: number;
  yEmu: number;
};

export type SlideIR = {
  id: string;
  name?: string;
  background?: FillIR;
  backgroundLayers?: ReadonlyArray<BackgroundLayerIR>;
  nodes: ReadonlyArray<NodeIR>;
};

export type NodeIR = GroupIR | TextIR | ImageIR | ShapeIR;

export type BaseNodeIR = {
  id: string;
  frame: FrameIR;
  opacity?: number;
  rotation?: number;
  zIndex?: number;
  visibility?: CssVisibility;
  flipH?: boolean;
  flipV?: boolean;
};

export type ShadowIR = {
  type: "outer" | "inner";
  color: string;
  opacity?: number;
  blurPt?: number;
  offsetPt?: number;
  angle?: number;
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

export type GroupIR = BaseNodeIR & {
  kind: "group";
  children: ReadonlyArray<NodeIR>;
  fill?: FillIR;
  backgroundLayers?: ReadonlyArray<BackgroundLayerIR>;
  stroke?: StrokeIR;
  edgeStrokes?: EdgeStrokeIR;
  outline?: StrokeIR;
  shadow?: ShadowIR;
  radiusEmu?: number;
};

export type TextIR = BaseNodeIR & {
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

export type ImageIR = BaseNodeIR & {
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

export type ShapeIR = BaseNodeIR & {
  kind: "shape";
  shape: "rect" | "ellipse" | "line";
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
  style?: BorderStyle;
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
};

export type TextTabStopIR = {
  positionIn: number;
  alignment?: "l" | "r" | "ctr" | "dec";
};

export type TextBulletListIR = {
  type: "bullet";
  characterCode?: string;
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
  strike?: boolean;
  rtlMode?: boolean;
  textDirection?: "horz" | "vert" | "vert270";
  superscript?: boolean;
  subscript?: boolean;
  color?: string;
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
};

export type ImageSourceIR =
  | {
      kind: "path";
      path: string;
    }
  | {
      kind: "data";
      data: string;
    };

export type BackendArtifact = {
  kind: "buffer";
  mimeType: string;
  data: Uint8Array;
  extension: string;
};

export type CompileBackend = {
  name: BackendName;
  emit(ir: PresentationIR): Promise<BackendArtifact>;
};

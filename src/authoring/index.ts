export type DeckLength =
  | number
  | `${number}${"in" | "pt" | "px" | "%" | "em" | "rem" | "vh" | "vw" | "ch"}`;
export type DeckPointLength =
  | number
  | `${number}${"pt" | "in" | "px" | "em" | "rem" | "vh" | "vw" | "ch"}`;
export type CssAspectRatio = number | `${number}/${number}` | `${number} / ${number}`;
export type CssBoxSizing = "border-box" | "content-box";
export type Spacing = DeckLength | readonly [DeckLength, DeckLength, DeckLength, DeckLength];
export type StackAxis = "horizontal" | "vertical";
export type StackAlignment = "start" | "center" | "end";
export type LayoutMode = "absolute" | "stack" | "grid";
export type BackendName = "pptxgenjs" | "ooxml";
export type ImplementedBackendName = "pptxgenjs";
export type BorderStyle = "none" | "solid" | "dash";
export type StrokeDashType =
  | "solid"
  | "dash"
  | "dashDot"
  | "lgDash"
  | "lgDashDot"
  | "lgDashDotDot"
  | "sysDash"
  | "sysDot";
export type StrokeLineCap = "butt" | "round" | "square";
export type StrokeLineJoin = "miter" | "round" | "bevel";
export type VerticalAlign = "top" | "middle" | "bottom";
export type TextFit = "none" | "shrink" | "resize";
export type CssDisplay = "flex" | "block" | "grid" | "none";
export type CssPosition = "absolute" | "relative";
export type CssVisibility = "visible" | "hidden";
export type CssOverflow = "visible" | "hidden";
export type CssFlexDirection = "row" | "column";
export type CssGridTrack = DeckLength | `${number}fr` | `minmax(${string})`;
export type CssGridTemplate = readonly CssGridTrack[] | string;
export type CssGridLine = number | "auto" | `span ${number}`;
export type CssGridPlacement =
  | number
  | `span ${number}`
  | `${number} / ${number}`
  | `${number}/${number}`
  | `${number} / span ${number}`
  | `${number}/span${number}`;
export type CssAlignItems = "start" | "flex-start" | "center" | "end" | "flex-end" | "stretch";
export type CssAlignSelf = CssAlignItems | "auto";
export type CssJustifySelf = CssAlignItems | "auto";
export type CssJustifyContent =
  | "start"
  | "flex-start"
  | "center"
  | "end"
  | "flex-end"
  | "stretch"
  | "space-between"
  | "space-around"
  | "space-evenly";
export type CssAlignContent =
  | "start"
  | "flex-start"
  | "center"
  | "end"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly"
  | "stretch";
export type CssFlexWrap = "nowrap" | "wrap";
export type CssFlexBasis = DeckLength | "auto";
export type CssGridAutoFlow = "row" | "column" | "row dense" | "column dense";
export type CssGridTemplateAreas = string | readonly string[];
export type CssGridTemplateShorthand = string;
export type CssGridShorthand = string;
export type CssObjectPosition = string;
export type ImageCropValue = number | `${number}%`;
export type TextTabStopLength = DeckPointLength;
export type TextTabStopAlignment = "left" | "right" | "center" | "decimal";
export type TextTabStopAuthoring = {
  position: TextTabStopLength;
  alignment?: TextTabStopAlignment;
};
export type ImageCropAuthoring = {
  top?: ImageCropValue;
  right?: ImageCropValue;
  bottom?: ImageCropValue;
  left?: ImageCropValue;
};

export interface TextJsxChildArray extends ReadonlyArray<TextJsxChild> {}
export type TextJsxChild = string | number | boolean | null | undefined | TextJsxChildArray;
export type ContentAuthorNode = AuthorNode<"view" | "text" | "image" | "shape">;
export interface ContentJsxChildArray extends ReadonlyArray<ContentJsxChild> {}
export type ContentJsxChild = AuthorNode | boolean | null | undefined | ContentJsxChildArray;
export interface JsxNodeArray extends ReadonlyArray<JsxNode> {}
export type JsxNode = AuthorNode | string | number | boolean | null | undefined | JsxNodeArray;

type BaseAuthorProps = {
  opacity?: number;
  rotation?: number;
  transform?: string;
  transformOrigin?: string;
  zIndex?: number;
  flipH?: boolean;
  flipV?: boolean;
  overflow?: CssOverflow;
  alignSelf?: CssAlignSelf;
  justifySelf?: CssJustifySelf;
  placeSelf?: string;
  position?: CssPosition;
  order?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: CssFlexBasis;
  gridArea?: string;
  gridColumnStart?: CssGridLine;
  gridColumnEnd?: CssGridLine;
  gridRowStart?: CssGridLine;
  gridRowEnd?: CssGridLine;
  gridColumn?: CssGridPlacement;
  gridRow?: CssGridPlacement;
};

type FrameAuthorProps = BaseAuthorProps & {
  display?: CssDisplay;
  visibility?: CssVisibility;
  x?: DeckLength;
  y?: DeckLength;
  inset?: Spacing;
  left?: DeckLength;
  top?: DeckLength;
  right?: DeckLength;
  bottom?: DeckLength;
  width?: DeckLength;
  height?: DeckLength;
  aspectRatio?: CssAspectRatio;
  minWidth?: DeckLength;
  minHeight?: DeckLength;
  maxWidth?: DeckLength;
  maxHeight?: DeckLength;
};

type BoxStyleAuthorProps = {
  boxSizing?: CssBoxSizing;
  background?: string;
  backgroundImage?: string;
  backgroundColor?: string;
  backgroundTransparency?: number;
  backgroundPosition?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundClip?: string;
  backgroundOrigin?: string;
  boxShadow?: string;
  strokeLinecap?: StrokeLineCap;
  strokeLinejoin?: StrokeLineJoin;
  border?: string;
  borderColor?: string;
  borderWidth?: DeckLength;
  borderStyle?: BorderStyle;
  borderTransparency?: number;
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderTopColor?: string;
  borderRightColor?: string;
  borderBottomColor?: string;
  borderLeftColor?: string;
  borderTopWidth?: DeckLength;
  borderRightWidth?: DeckLength;
  borderBottomWidth?: DeckLength;
  borderLeftWidth?: DeckLength;
  borderTopStyle?: BorderStyle;
  borderRightStyle?: BorderStyle;
  borderBottomStyle?: BorderStyle;
  borderLeftStyle?: BorderStyle;
  borderRadius?: DeckLength;
  outline?: string;
  outlineColor?: string;
  outlineWidth?: DeckLength;
  outlineStyle?: BorderStyle;
  margin?: Spacing;
  marginTop?: DeckLength;
  marginRight?: DeckLength;
  marginBottom?: DeckLength;
  marginLeft?: DeckLength;
  paddingTop?: DeckLength;
  paddingRight?: DeckLength;
  paddingBottom?: DeckLength;
  paddingLeft?: DeckLength;
};

export type SlideStyle = {
  background?: string;
  backgroundImage?: string;
  backgroundColor?: string;
  backgroundTransparency?: number;
  backgroundPosition?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundClip?: string;
  backgroundOrigin?: string;
};

export type ViewStyle = FrameAuthorProps &
  BoxStyleAuthorProps & {
    layout?: LayoutMode;
    display?: CssDisplay;
    direction?: StackAxis;
    flexDirection?: CssFlexDirection;
    gap?: DeckLength;
    rowGap?: DeckLength;
    columnGap?: DeckLength;
    padding?: Spacing;
    alignItems?: StackAlignment | CssAlignItems;
    justifyContent?: StackAlignment | CssJustifyContent;
    justifyItems?: CssJustifySelf;
    placeItems?: string;
    alignContent?: StackAlignment | CssAlignContent;
    placeContent?: string;
    flexWrap?: CssFlexWrap;
    grid?: CssGridShorthand;
    gridTemplate?: CssGridTemplateShorthand;
    gridTemplateAreas?: CssGridTemplateAreas;
    gridTemplateColumns?: CssGridTemplate;
    gridTemplateRows?: CssGridTemplate;
    gridAutoColumns?: CssGridTrack;
    gridAutoRows?: CssGridTrack;
    gridAutoFlow?: CssGridAutoFlow;
  };

export type TextStyle = FrameAuthorProps &
  BoxStyleAuthorProps & {
    fontFamily?: string;
    fontSize?: DeckPointLength;
    fontWeight?: number | "normal" | "bold";
    italic?: boolean;
    fontStyle?: "normal" | "italic";
    underline?: boolean;
    strike?: boolean;
    textDecoration?: string;
    textDecorationLine?: string;
    textDecorationStyle?: "solid" | "double" | "dotted" | "dashed" | "wavy";
    textDecorationColor?: string;
    textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
    direction?: "ltr" | "rtl";
    writingMode?: "horizontal-tb" | "vertical-rl" | "vertical-lr";
    color?: string;
    textAlign?: "left" | "center" | "right" | "justify";
    verticalAlign?: VerticalAlign;
    padding?: Spacing;
    lineSpacing?: number;
    lineSpacingMultiple?: number;
    lineHeight?: DeckPointLength | "normal";
    paragraphSpacingBefore?: number;
    paragraphSpacingAfter?: number;
    textIndent?: DeckPointLength;
    tabStops?: readonly TextTabStopAuthoring[];
    charSpacing?: number;
    letterSpacing?: number;
    whiteSpace?: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line";
    wordBreak?: "normal" | "break-all" | "keep-all" | "break-word";
    overflowWrap?: "normal" | "break-word" | "anywhere";
    href?: string;
    tooltip?: string;
    listStyleType?:
      | "none"
      | "disc"
      | "circle"
      | "square"
      | "decimal"
      | "lower-alpha"
      | "upper-alpha"
      | "lower-roman"
      | "upper-roman";
    listStart?: number;
    listIndent?: DeckPointLength;
    superscript?: boolean;
    subscript?: boolean;
    textShadow?: string;
    fit?: TextFit;
    wrap?: boolean;
  };

export type ImageStyle = FrameAuthorProps & {
  fit?: "contain" | "cover" | "stretch";
  objectFit?: "contain" | "cover" | "stretch";
  objectPosition?: CssObjectPosition;
  crop?: ImageCropAuthoring;
  href?: string;
  tooltip?: string;
  transparency?: number;
  rounding?: boolean;
  borderRadius?: DeckLength;
  boxShadow?: string;
  margin?: Spacing;
  marginTop?: DeckLength;
  marginRight?: DeckLength;
  marginBottom?: DeckLength;
  marginLeft?: DeckLength;
};

export type ShapeStyle = FrameAuthorProps &
  Omit<BoxStyleAuthorProps, "backgroundColor" | "backgroundTransparency" | "borderRadius"> & {
    background?: string;
    backgroundColor?: string;
    backgroundTransparency?: number;
    href?: string;
    tooltip?: string;
    fill?: string;
    fillTransparency?: number;
    stroke?: string;
    strokeWidth?: DeckLength;
    strokeOpacity?: number;
    strokeDasharray?: string;
    borderRadius?: DeckLength;
    radius?: DeckLength;
  };

export type DeckOptions = {
  layout: {
    width: number;
    height: number;
    unit: "in" | "pt";
  };
  meta?: {
    title?: string;
    author?: string;
    subject?: string;
  };
};

export type SlideContext = {
  slideIndex: number;
  totalSlides: number;
};

export type SlideFactory = (context: SlideContext) => JsxNode;

export type OutputConfig = {
  backend: ImplementedBackendName;
  output: string;
};

export type SlideNodeProps = {
  name?: string;
  style?: SlideStyle;
  background?: string;
  backgroundImage?: string;
  backgroundColor?: string;
  backgroundTransparency?: number;
  backgroundPosition?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundClip?: string;
  backgroundOrigin?: string;
};

export type SlideProps = SlideNodeProps & {
  children?: ContentJsxChild;
};

export type ViewNodeProps = {
  style?: ViewStyle;
} & ViewStyle;

export type ViewProps = ViewNodeProps & {
  children?: ContentJsxChild;
};

export type TextNodeProps = {
  style?: TextStyle;
} & TextStyle;

export type TextProps = TextNodeProps & {
  children?: TextJsxChild;
};

export type ImageNodeProps = {
  style?: ImageStyle;
  src?: string;
  data?: string;
} & ImageStyle;

export type ImageProps = ImageNodeProps & {
  children?: never;
};

export type ShapeNodeProps = {
  style?: ShapeStyle;
  shape: "rect" | "ellipse" | "line";
} & ShapeStyle;

export type ShapeProps = ShapeNodeProps & {
  children?: never;
};

export type AuthorNodeMap = {
  slide: SlideProps;
  view: ViewProps;
  text: TextProps;
  image: ImageProps;
  shape: ShapeProps;
};

export type AuthorNodeKind = keyof AuthorNodeMap;
export type AuthorNodePropsMap = {
  slide: SlideNodeProps;
  view: ViewNodeProps;
  text: TextNodeProps;
  image: ImageNodeProps;
  shape: ShapeNodeProps;
};
export type AuthorNodeProps<K extends AuthorNodeKind> = AuthorNodePropsMap[K];

type BaseAuthorNode<K extends AuthorNodeKind, P, C> = {
  readonly $$typeof: "deckjsx.author-node";
  readonly kind: K;
  readonly props: P;
  readonly children: ReadonlyArray<C>;
};

export interface SlideAuthorNode extends BaseAuthorNode<"slide", SlideNodeProps, ContentJsxChild> {}
export interface ViewAuthorNode extends BaseAuthorNode<"view", ViewNodeProps, ContentJsxChild> {}
export interface TextAuthorNode extends BaseAuthorNode<"text", TextNodeProps, TextJsxChild> {}
export interface ImageAuthorNode extends BaseAuthorNode<"image", ImageNodeProps, never> {}
export interface ShapeAuthorNode extends BaseAuthorNode<"shape", ShapeNodeProps, never> {}

type AuthorNodeByKind = {
  slide: SlideAuthorNode;
  view: ViewAuthorNode;
  text: TextAuthorNode;
  image: ImageAuthorNode;
  shape: ShapeAuthorNode;
};

export type AuthorNode<K extends AuthorNodeKind = AuthorNodeKind> = AuthorNodeByKind[K];

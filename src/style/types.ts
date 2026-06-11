export type DeckLength =
  | number
  | `${number}${"in" | "pt" | "px" | "%" | "em" | "rem" | "vh" | "vw" | "ch"}`;
export type DeckPointLength =
  | number
  | `${number}${"pt" | "in" | "px" | "em" | "rem" | "vh" | "vw" | "ch"}`;
export type CssLetterSpacing = DeckPointLength | "normal";
export type CssAspectRatio = number | `${number}/${number}` | `${number} / ${number}`;
export type CssBoxSizing = "border-box" | "content-box";
export type Spacing = DeckLength | readonly [DeckLength, DeckLength, DeckLength, DeckLength];
export type StackAxis = "horizontal" | "vertical";
export type StackAlignment = "start" | "center" | "end";
export type LayoutMode = "absolute" | "stack" | "grid";
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

type BaseAuthorProps = {
  opacity?: number;
  rotation?: number;
  transform?: string;
  transformOrigin?: string;
  filter?: string;
  mixBlendMode?: string;
  isolation?: "auto" | "isolate";
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
    paragraphSpacingBefore?: DeckPointLength;
    paragraphSpacingAfter?: DeckPointLength;
    textIndent?: DeckPointLength;
    tabStops?: readonly TextTabStopAuthoring[];
    charSpacing?: DeckPointLength;
    letterSpacing?: CssLetterSpacing;
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

export type TextRunStyle = Pick<
  TextStyle,
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "italic"
  | "fontStyle"
  | "underline"
  | "strike"
  | "textDecoration"
  | "textDecorationLine"
  | "textDecorationStyle"
  | "textDecorationColor"
  | "textTransform"
  | "direction"
  | "writingMode"
  | "color"
  | "verticalAlign"
  | "charSpacing"
  | "letterSpacing"
  | "href"
  | "tooltip"
  | "superscript"
  | "subscript"
  | "textShadow"
>;

type KnownStyleDeclarationSource =
  | SlideStyle
  | ViewStyle
  | TextStyle
  | TextRunStyle
  | ImageStyle
  | ShapeStyle;
type KeysOfUnion<T> = T extends T ? keyof T : never;
type ValueOfUnion<T, TKey extends PropertyKey> = T extends T
  ? TKey extends keyof T
    ? T[TKey]
    : never
  : never;
type KnownStyleDeclarationKey = KeysOfUnion<KnownStyleDeclarationSource>;
export type StyleDeclarationValue = ValueOfUnion<
  KnownStyleDeclarationSource,
  KnownStyleDeclarationKey
>;
export type StyleDeclaration = {
  readonly [Key in KnownStyleDeclarationKey]?: ValueOfUnion<KnownStyleDeclarationSource, Key>;
};

export type StyleForAuthoredTag<TTag extends string> = TTag extends "span"
  ? TextRunStyle
  : TTag extends "img"
    ? ImageStyle
    : TTag extends "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p"
      ? TextStyle
      : ViewStyle;

export const VIEW_STYLE_KEYS = [
  "opacity",
  "rotation",
  "transform",
  "transformOrigin",
  "filter",
  "mixBlendMode",
  "isolation",
  "zIndex",
  "flipH",
  "flipV",
  "overflow",
  "alignSelf",
  "justifySelf",
  "placeSelf",
  "position",
  "order",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "gridArea",
  "gridColumnStart",
  "gridColumnEnd",
  "gridRowStart",
  "gridRowEnd",
  "gridColumn",
  "gridRow",
  "display",
  "visibility",
  "x",
  "y",
  "inset",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "aspectRatio",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "boxSizing",
  "background",
  "backgroundImage",
  "backgroundColor",
  "backgroundTransparency",
  "backgroundPosition",
  "backgroundSize",
  "backgroundRepeat",
  "backgroundClip",
  "backgroundOrigin",
  "boxShadow",
  "strokeLinecap",
  "strokeLinejoin",
  "border",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "borderTransparency",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
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
  "borderRadius",
  "outline",
  "outlineColor",
  "outlineWidth",
  "outlineStyle",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "layout",
  "direction",
  "flexDirection",
  "gap",
  "rowGap",
  "columnGap",
  "padding",
  "alignItems",
  "justifyContent",
  "justifyItems",
  "placeItems",
  "alignContent",
  "placeContent",
  "flexWrap",
  "grid",
  "gridTemplate",
  "gridTemplateAreas",
  "gridTemplateColumns",
  "gridTemplateRows",
  "gridAutoColumns",
  "gridAutoRows",
  "gridAutoFlow",
] as const;

export const TEXT_STYLE_KEYS = [
  ...VIEW_STYLE_KEYS,
  "fontFamily",
  "fontSize",
  "fontWeight",
  "italic",
  "fontStyle",
  "underline",
  "strike",
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
  "lineSpacing",
  "lineSpacingMultiple",
  "lineHeight",
  "paragraphSpacingBefore",
  "paragraphSpacingAfter",
  "textIndent",
  "tabStops",
  "charSpacing",
  "letterSpacing",
  "whiteSpace",
  "wordBreak",
  "overflowWrap",
  "href",
  "tooltip",
  "listStyleType",
  "listStart",
  "listIndent",
  "superscript",
  "subscript",
  "textShadow",
  "fit",
  "wrap",
] as const;

export const TEXT_RUN_STYLE_KEYS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "italic",
  "fontStyle",
  "underline",
  "strike",
  "textDecoration",
  "textDecorationLine",
  "textDecorationStyle",
  "textDecorationColor",
  "textTransform",
  "direction",
  "writingMode",
  "color",
  "verticalAlign",
  "charSpacing",
  "letterSpacing",
  "href",
  "tooltip",
  "superscript",
  "subscript",
  "textShadow",
] as const;

export const IMAGE_STYLE_KEYS = [
  "opacity",
  "rotation",
  "transform",
  "transformOrigin",
  "filter",
  "mixBlendMode",
  "isolation",
  "zIndex",
  "flipH",
  "flipV",
  "overflow",
  "alignSelf",
  "justifySelf",
  "placeSelf",
  "position",
  "order",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "gridArea",
  "gridColumnStart",
  "gridColumnEnd",
  "gridRowStart",
  "gridRowEnd",
  "gridColumn",
  "gridRow",
  "display",
  "visibility",
  "x",
  "y",
  "inset",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "aspectRatio",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "fit",
  "objectFit",
  "objectPosition",
  "crop",
  "href",
  "tooltip",
  "transparency",
  "rounding",
  "borderRadius",
  "boxShadow",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
] as const;

export const SHAPE_STYLE_KEYS = [
  ...VIEW_STYLE_KEYS,
  "href",
  "tooltip",
  "fill",
  "fillTransparency",
  "stroke",
  "strokeWidth",
  "strokeOpacity",
  "strokeDasharray",
  "radius",
] as const;

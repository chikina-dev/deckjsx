import type { JsxKey } from "./tree";
import type { EmptySlideTemplateSet, SlideTemplateSet } from "../templates";
import type { Theme } from "../style/theme";
import type {
  ImageNodeProps,
  ShapeNodeProps,
  SlideNodeProps,
  TextNodeProps,
  TextRunNodeProps,
  ViewNodeProps,
} from "./props";

export type {
  ClassNameObject,
  ClassNameValue,
  ClassNameValueArray,
  ImageNodeProps,
  ShapeNodeProps,
  SlideNodeProps,
  TextNodeProps,
  TextRunNodeProps,
  ViewNodeProps,
} from "./props";
export type {
  BorderStyle,
  CssAlignContent,
  CssAlignItems,
  CssAlignSelf,
  CssAspectRatio,
  CssBoxSizing,
  CssDisplay,
  CssFlexBasis,
  CssFlexDirection,
  CssFlexWrap,
  CssGridAutoFlow,
  CssGridLine,
  CssGridPlacement,
  CssGridShorthand,
  CssGridTemplate,
  CssGridTemplateAreas,
  CssGridTemplateShorthand,
  CssGridTrack,
  CssJustifyContent,
  CssJustifySelf,
  CssObjectPosition,
  CssOverflow,
  CssPosition,
  CssVisibility,
  DeckLength,
  DeckPointLength,
  ImageCropAuthoring,
  ImageCropValue,
  ImageStyle,
  LayoutMode,
  ShapeStyle,
  SlideStyle,
  Spacing,
  StackAlignment,
  StackAxis,
  StrokeDashType,
  StrokeLineCap,
  StrokeLineJoin,
  TextFit,
  TextRunStyle,
  TextStyle,
  TextTabStopAlignment,
  TextTabStopAuthoring,
  TextTabStopLength,
  VerticalAlign,
  ViewStyle,
} from "../style/types";
export type {
  StyleClassDefinition,
  StyleClassStyle,
  StyleSheet,
  StyleTargetSelector,
} from "../style/stylesheet";

export type DeckJsxElement = {
  readonly $$typeof: "deckjsx.author-tree";
};

export interface TextJsxChildArray extends ReadonlyArray<TextJsxChild> {}
export type TextJsxChild =
  | DeckJsxElement
  | string
  | number
  | boolean
  | null
  | undefined
  | TextJsxChildArray;
export interface ContentJsxChildArray extends ReadonlyArray<ContentJsxChild> {}
export type ContentJsxChild = DeckJsxElement | boolean | null | undefined | ContentJsxChildArray;
export interface ViewIntrinsicJsxChildArray extends ReadonlyArray<ViewIntrinsicJsxChild> {}
export type ViewIntrinsicJsxChild = ContentJsxChild | string | number | ViewIntrinsicJsxChildArray;
export interface JsxNodeArray extends ReadonlyArray<JsxNode> {}
export type JsxNode = DeckJsxElement | string | number | boolean | null | undefined | JsxNodeArray;

export type DeckOptions<TTemplates extends SlideTemplateSet = EmptySlideTemplateSet> = {
  layout: {
    width: number;
    height: number;
    unit: "in" | "pt";
  };
  templates?: TTemplates;
  meta?: {
    title?: string;
    author?: string;
    subject?: string;
  };
  theme?: Theme;
  output?: {
    format?: "pptx";
  };
};

export type SlideContext = {
  composition: import("../composition/types").CompositionContext;
};

export type SlideFactory<TSourceContext = void> =
  import("../composition/types").SlideFactory<TSourceContext>;

export type SlideProps = SlideNodeProps & {
  children?: ContentJsxChild;
};

export type ViewProps = ViewNodeProps & {
  children?: ContentJsxChild;
};

export type TextProps = TextNodeProps & {
  children?: TextJsxChild;
};

export type ImageProps = ImageNodeProps & {
  children?: never;
};

export type ShapeProps = ShapeNodeProps & {
  children?: never;
};

type IntrinsicKeyProps = {
  key?: JsxKey;
};

export type IntrinsicDivProps = ViewNodeProps &
  IntrinsicKeyProps & {
    children?: ViewIntrinsicJsxChild;
  };

export type IntrinsicPProps = TextNodeProps &
  IntrinsicKeyProps & {
    children?: TextJsxChild;
  };

export type IntrinsicSpanProps = TextRunNodeProps &
  IntrinsicKeyProps & {
    children?: TextJsxChild;
  };

export type IntrinsicImgProps = ImageProps & IntrinsicKeyProps;
export type IntrinsicShapeProps = ShapeProps & IntrinsicKeyProps;

export type IntrinsicViewTag =
  | "article"
  | "aside"
  | "div"
  | "figure"
  | "footer"
  | "header"
  | "main"
  | "nav"
  | "section";

export type IntrinsicTextTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p";

export type DeckJsxIntrinsicElements = {
  img: IntrinsicImgProps;
  shape: IntrinsicShapeProps;
  span: IntrinsicSpanProps;
} & {
  [Tag in IntrinsicViewTag]: IntrinsicDivProps;
} & {
  [Tag in IntrinsicTextTag]: IntrinsicPProps;
};

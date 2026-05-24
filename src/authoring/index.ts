import type { AuthorTreeNode } from "./tree";
import type { Theme } from "../style/theme";
import type {
  ImageStyle,
  ShapeStyle,
  SlideStyle,
  TextRunStyle,
  TextStyle,
  ViewStyle,
} from "../style/types";

export type BackendName = "pptxgenjs" | "ooxml";
export type ImplementedBackendName = "pptxgenjs";

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

export interface TextJsxChildArray extends ReadonlyArray<TextJsxChild> {}
export type TextJsxChild =
  | AuthorTreeNode
  | string
  | number
  | boolean
  | null
  | undefined
  | TextJsxChildArray;
export type ContentAuthorNode = AuthorNode<"view" | "text" | "image" | "shape">;
export interface ContentJsxChildArray extends ReadonlyArray<ContentJsxChild> {}
export type ContentJsxChild =
  | AuthorNode
  | AuthorTreeNode
  | boolean
  | null
  | undefined
  | ContentJsxChildArray;
export interface ViewIntrinsicJsxChildArray extends ReadonlyArray<ViewIntrinsicJsxChild> {}
export type ViewIntrinsicJsxChild = ContentJsxChild | string | number | ViewIntrinsicJsxChildArray;
export interface JsxNodeArray extends ReadonlyArray<JsxNode> {}
export type JsxNode =
  | AuthorNode
  | AuthorTreeNode
  | string
  | number
  | boolean
  | null
  | undefined
  | JsxNodeArray;

export interface ClassNameValueArray extends ReadonlyArray<ClassNameValue> {}
export type ClassNameObject = Readonly<Record<string, boolean | null | undefined>>;
export type ClassNameValue =
  | string
  | false
  | null
  | undefined
  | ClassNameValueArray
  | ClassNameObject;

type ClassNameAuthorProps = {
  className?: ClassNameValue;
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
  theme?: Theme;
};

export type SlideContext = {
  composition: import("../composition/types").CompositionContext;
};

export type SlideFactory<TSourceContext = void> =
  import("../composition/types").SlideFactory<TSourceContext>;

export type OutputConfig = {
  backend: ImplementedBackendName;
  output: string;
};

export type SlideNodeProps = {
  name?: string;
  className?: ClassNameValue;
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
} & ClassNameAuthorProps &
  ViewStyle;

export type ViewProps = ViewNodeProps & {
  children?: ContentJsxChild;
};

export type TextNodeProps = {
  style?: TextStyle;
} & ClassNameAuthorProps &
  TextStyle;

export type TextProps = TextNodeProps & {
  children?: TextJsxChild;
};

export type TextRunNodeProps = {
  style?: TextRunStyle;
} & ClassNameAuthorProps &
  TextRunStyle;

export type ImageNodeProps = {
  style?: ImageStyle;
} & ClassNameAuthorProps &
  ImageStyle &
  (
    | {
        src: string;
        data?: string;
      }
    | {
        src?: string;
        data: string;
      }
  );

export type ImageProps = ImageNodeProps & {
  children?: never;
};

export type ShapeNodeProps = {
  style?: ShapeStyle;
  shape: "rect" | "ellipse" | "line";
} & ClassNameAuthorProps &
  ShapeStyle;

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

export type IntrinsicDivProps = ViewNodeProps & {
  children?: ViewIntrinsicJsxChild;
};

export type IntrinsicPProps = TextNodeProps & {
  children?: TextJsxChild;
};

export type IntrinsicSpanProps = TextRunNodeProps & {
  children?: TextJsxChild;
};

export type IntrinsicImgProps = ImageProps;

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
  span: IntrinsicSpanProps;
} & {
  [Tag in IntrinsicViewTag]: IntrinsicDivProps;
} & {
  [Tag in IntrinsicTextTag]: IntrinsicPProps;
};

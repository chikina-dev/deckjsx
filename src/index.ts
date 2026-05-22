import type { ContentJsxChild, DeckJsxIntrinsicElements } from "./authoring/index";
import type { JsxKey } from "./jsx-runtime";

export { Deck } from "./deck";
export {
  CompositionDiagnosticError,
  DeckDiagnosticError,
  SemanticGraphDiagnosticError,
  formatDiagnostic,
  formatDiagnostics,
} from "./diagnostics";
export {
  Fragment,
  Image,
  Shape,
  Slide,
  Text,
  View,
  createElement,
  isAuthorNode,
  isContentNode,
  isSlideNode,
} from "./jsx";
export type { JsxKey } from "./jsx-runtime";
export { pptxgenjsBackend } from "./backends/pptxgenjs";
export { EMU_PER_INCH, POINTS_PER_INCH } from "./types";
export {
  type AuthorNode,
  type AuthorNodeKind,
  type AuthorNodeMap,
  type AuthorNodeProps,
  type AuthorNodePropsMap,
  type BackendName,
  type BorderStyle,
  type ContentAuthorNode,
  type ContentJsxChild,
  type CssAlignContent,
  type CssAlignItems,
  type CssAlignSelf,
  type CssAspectRatio,
  type CssBoxSizing,
  type CssDisplay,
  type CssFlexBasis,
  type CssFlexDirection,
  type CssFlexWrap,
  type CssGridAutoFlow,
  type CssGridLine,
  type CssGridPlacement,
  type CssGridShorthand,
  type CssGridTemplate,
  type CssGridTemplateAreas,
  type CssGridTemplateShorthand,
  type CssGridTrack,
  type CssJustifyContent,
  type CssJustifySelf,
  type CssObjectPosition,
  type CssOverflow,
  type CssPosition,
  type CssVisibility,
  type DeckLength,
  type DeckOptions,
  type DeckPointLength,
  type DeckJsxIntrinsicElements,
  type ImageCropAuthoring,
  type ImageCropValue,
  type ImageProps,
  type ImageStyle,
  type IntrinsicDivProps,
  type IntrinsicImgProps,
  type IntrinsicPProps,
  type IntrinsicTextTag,
  type IntrinsicViewTag,
  type ImplementedBackendName,
  type JsxNode,
  type LayoutMode,
  type OutputConfig,
  type ShapeProps,
  type ShapeStyle,
  type SlideProps,
  type SlideStyle,
  type Spacing,
  type StackAlignment,
  type StackAxis,
  type StrokeDashType,
  type StrokeLineCap,
  type StrokeLineJoin,
  type TextFit,
  type TextProps,
  type TextStyle,
  type TextJsxChild,
  type TextTabStopAlignment,
  type TextTabStopAuthoring,
  type TextTabStopLength,
  type VerticalAlign,
  type ViewProps,
  type ViewStyle,
} from "./authoring/index";
export type { SourceSpan } from "./authoring/tree";
export type {
  BoundSource,
  CompileInspectResult,
  CompileMode,
  CompositionContext,
  SlideFactory,
  SlideFactoryInput,
  SourceContextMapper,
} from "./deck";
export type { Diagnostic, DiagnosticLabel, DiagnosticSeverity, Diagnostics } from "./diagnostics";
export type {
  AssetEntity,
  AssetEntityId,
  BaseSemanticNode,
  GraphNodeId,
  SemanticAuthorGraph,
  SemanticContainerNode,
  SemanticDocumentNode,
  SemanticImageNode,
  SemanticNode,
  SemanticNodeKind,
  SemanticOrigin,
  SemanticRole,
  SemanticShapeNode,
  SemanticSlideNode,
  SemanticTextNode,
  SemanticTextRunNode,
  SourceIdentity,
  SourceOrigin,
  StyleEntity,
  StyleEntityId,
} from "./graph";
export type {
  BackgroundImageLayerIR,
  BackgroundLayerIR,
  BackendArtifact,
  BaseNodeIR,
  CompileBackend,
  EdgeStrokeIR,
  FillIR,
  FrameIR,
  GroupIR,
  HyperlinkIR,
  ImageCropIR,
  ImageIR,
  ImageSourceIR,
  LinearGradientFillIR,
  LinearGradientStopIR,
  NodeIR,
  ObjectPositionIR,
  PresentationIR,
  RadialGradientFillIR,
  ShadowIR,
  ShapeIR,
  SizeIR,
  SlideIR,
  SolidFillIR,
  StrokeIR,
  TextContentIR,
  TextIR,
  TextListIR,
  TextNumberListIR,
  TextNoListIR,
  TextBulletListIR,
  TextRunIR,
  TextStyleIR,
  TextTabStopIR,
} from "./ir/index";

declare global {
  namespace JSX {
    type Element = ContentJsxChild;

    interface ElementChildrenAttribute {
      children: {};
    }

    interface IntrinsicAttributes {
      key?: JsxKey;
    }

    interface IntrinsicElements extends DeckJsxIntrinsicElements {}
  }
}

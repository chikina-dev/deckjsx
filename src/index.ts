import type { ContentJsxChild, DeckJsxIntrinsicElements } from "./authoring/index";
import type { JsxKey } from "./jsx-runtime";

export { Deck } from "./deck";
export { StyleSheet } from "./style/stylesheet";
export { Theme, type ThemeInput } from "./style/theme";
export {
  CompositionDiagnosticError,
  DeckDiagnosticError,
  SemanticGraphDiagnosticError,
  StyleDiagnosticError,
  formatDiagnostic,
  formatDiagnostics,
} from "./diagnostics";
export type { JsxKey } from "./jsx-runtime";
export type {
  AssetLoadResult,
  AssetLoader,
  AssetLoaderContext,
  AssetMediaType,
  AssetProbeResult,
  AssetSource,
} from "./assets";
export { EMU_PER_INCH, POINTS_PER_INCH } from "./types";
export {
  type BorderStyle,
  type ClassNameObject,
  type ClassNameValue,
  type ClassNameValueArray,
  type ContentJsxChild,
  type CssAlignContent,
  type CssAlignItems,
  type CssAlignSelf,
  type CssAspectRatio,
  type CssBoxSizing,
  type CssDisplay,
  type DeckJsxElement,
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
  type CssLetterSpacing,
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
  type ImageStyle,
  type IntrinsicDivProps,
  type IntrinsicImgProps,
  type IntrinsicPProps,
  type IntrinsicShapeProps,
  type IntrinsicTextTag,
  type IntrinsicViewTag,
  type LayoutMode,
  type ShapeStyle,
  type SlideStyle,
  type Spacing,
  type StackAlignment,
  type StackAxis,
  type StrokeDashType,
  type StrokeLineCap,
  type StrokeLineJoin,
  type TextFit,
  type TextRunStyle,
  type TextStyle,
  type TextJsxChild,
  type TextTabStopAlignment,
  type TextTabStopAuthoring,
  type TextTabStopLength,
  type VerticalAlign,
  type ViewStyle,
} from "./authoring/index";
export type {
  OutputFormat,
  ProjectionFormat,
  ProjectOptions,
  InspectionDetailLevel,
  RenderAssemblyBuildSummary,
  RenderAssemblyExpectedEntrySummary,
  RenderAssemblyFingerprintDelta,
  RenderAssemblyFinalEntrySummary,
  RenderAssemblyPlanEntrySummary,
  RenderAssemblyPlanSummary,
  RenderAssemblyReasonDetails,
  RenderOutputSideEffectReason,
  RenderOutputSideEffectStatus,
  RenderOutputSideEffectSummary,
  RenderedArtifact,
  RenderInspectionSummary,
  StageArtifactStatus,
  StageName,
  StageSummary,
  WrittenOutput,
} from "./pipeline";
export type { ThemeDefaults } from "./style/defaults";
export type { SourceSpan } from "./authoring/tree";
export type {
  BoundSource,
  CompileResult,
  CompositionContext,
  ProjectResult,
  RenderResult,
  SlideFactory,
  SlideFactoryInput,
  SlideFactoryInputWithTemplate,
  SlideOptions,
  SourceContextMapper,
} from "./deck";
export type { Diagnostic, DiagnosticLabel, DiagnosticSeverity, Diagnostics } from "./diagnostics";
export type {
  SlideTemplate,
  SlideTemplateSet,
  TemplateArea,
  TemplateAreaKind,
  TemplateAreaRef,
  TemplateFrame,
  TemplateHandle,
} from "./templates";

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

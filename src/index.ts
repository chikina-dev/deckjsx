import type { DeckJsxIntrinsicElements } from "./authoring/intrinsic";
import type { DeckJsxElementValue } from "./authoring/jsx-types";
import type { JsxKey } from "./jsx-runtime";

export { Deck } from "./deck";
export {
  StyleSheet,
  Theme,
  type StyleSheetValue,
  type ThemeInput,
  type ThemeValue,
} from "./style/public";
export {
  CompositionDiagnosticError,
  DeckDiagnosticError,
  SemanticGraphDiagnosticError,
  StyleDiagnosticError,
  formatDiagnostic,
  formatDiagnostics,
} from "./diagnostics";
export type { JsxKey } from "./jsx-runtime";
export { EMU_PER_INCH, POINTS_PER_INCH } from "./types";
export {
  type ClassNameObject,
  type ClassNameValue,
  type ClassNameValueArray,
  type DataUriString,
  type ImageSourceString,
  type VideoSourceString,
} from "./authoring/props";
export type { ShapeName, TableCellSpan } from "./authoring/contract";
export {
  type ContentJsxChild,
  type ContentJsxElement,
  type DeckJsxIntrinsicElements,
  type IntrinsicDivProps,
  type IntrinsicImgProps,
  type IntrinsicPProps,
  type IntrinsicShapeProps,
  type IntrinsicSpanProps,
  type IntrinsicTableCellProps,
  type IntrinsicTableProps,
  type IntrinsicTableRowProps,
  type IntrinsicTableSectionProps,
  type IntrinsicTextTag,
  type IntrinsicVideoProps,
  type IntrinsicViewTag,
  type TextJsxChild,
} from "./authoring/intrinsic";
export { type DeckJsxElement, type DeckJsxElementValue } from "./authoring/jsx-types";
export {
  type BorderStyle,
  type BorderWidthValue,
  type CssAlignContent,
  type CssAlignItems,
  type CssAlignSelf,
  type CssAspectRatio,
  type CssBackgroundAuthoringString,
  type CssBackgroundImageSourceAuthoringString,
  type CssBoxSizing,
  type CssBorderCollapse,
  type CssBorderWidth,
  type CssColor,
  type CssDisplay,
  type CssExternalHyperlinkAuthoringString,
  type CssFlexBasis,
  type CssFlexDirection,
  type CssFlexFactor,
  type CssFlexWrap,
  type CssFontFamilyAuthoringString,
  type CssFontWeight,
  type CssGenericFontFamily,
  type CssGradientAuthoringString,
  type CssGridAreaAuthoringString,
  type CssGridAutoFlow,
  type CssGridLine,
  type CssGridPlacement,
  type CssGridTemplate,
  type CssGridTemplateAreas,
  type CssGridTrack,
  type CssHexColor,
  type CssHslColor,
  type CssHttpHyperlinkAuthoringString,
  type CssInteger,
  type CssJustifyContent,
  type CssJustifySelf,
  type CssLetterSpacing,
  type CssMailtoHyperlinkAuthoringString,
  type CssObjectPosition,
  type CssOverflow,
  type CssPaint,
  type CssPointLength,
  type CssPosition,
  type CssQuotedFontFamilyAuthoringString,
  type CssRgbColor,
  type CssTableLayout,
  type CssVisibility,
  type DeckLength,
  type DeckPointLength,
  type ImageCropAuthoring,
  type ImageCropValue,
  type ImageStyle,
  type ListStart,
  type NonNegativeDeckLength,
  type NonNegativeDeckLengthString,
  type NonNegativeDeckPointLength,
  type NonNegativeDeckPointLengthString,
  type NonNegativeSpacing,
  type ShapeStyle,
  type SlideStyle,
  type Spacing,
  type StyleForAuthoredTag,
  type StrokeDashType,
  type StrokeLineCap,
  type StrokeLineJoin,
  type TableCellStyle,
  type TableRowStyle,
  type TableSectionStyle,
  type TableStyle,
  type TextFit,
  type TextRunStyle,
  type TextStyle,
  type TextTabStopAlignment,
  type TextTabStopAuthoring,
  type TextTabStopLength,
  type TooltipText,
  type VerticalAlign,
  type VideoStyle,
  type ViewStyle,
} from "./style/types";
export type { DeckOptions } from "./authoring/options/public";
export type { StyleClassStyle, StyleSheetInput } from "./style/public";
export type {
  OutputFormat,
  ProjectionFormat,
  ProjectOptions,
  InspectionDetailLevel,
  RenderedArtifact,
  StageArtifactStatus,
  StageName,
  StageSummary,
} from "./pipeline/public";
export type { ThemeDefaults } from "./style/public";
export type {
  BoundSource,
  CompileResult,
  CompositionContext,
  DeckPluginInput,
  ProjectionDefinitionInput,
  ProjectResult,
  RenderResult,
  SlideFactory,
  SlideFactoryInput,
  SlideFactoryInputWithTemplate,
  SlideOptions,
  SourceContextMapper,
} from "./deck";
export type {
  Diagnostic,
  DiagnosticLabel,
  DiagnosticSeverity,
  DiagnosticSourceSpan,
  Diagnostics,
} from "./diagnostics";
export type {
  SlideTemplate,
  SlideTemplateSet,
  TemplateArea,
  TemplateAreaKind,
  TemplateAreaRef,
  TemplateAreaStyle,
  TemplateHandle,
  SlideTemplateStyle,
} from "./templates";

declare global {
  namespace JSX {
    type Element = DeckJsxElementValue;

    interface ElementChildrenAttribute {
      children: {};
    }

    interface IntrinsicAttributes {
      key?: JsxKey;
    }

    interface IntrinsicElements extends DeckJsxIntrinsicElements {}
  }
}

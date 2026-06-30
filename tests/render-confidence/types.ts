import type { Deck } from "@/src/index.ts";

export type RenderConfidenceCategory =
  | "colorFill"
  | "complexLayout"
  | "geometry"
  | "imageCrop"
  | "shadowEffect"
  | "text";

export type RenderConfidenceAssertionOptions = {
  readonly expectedSlides: number;
  readonly requiredTexts: readonly string[];
  readonly orderedTextSignals?: readonly string[];
  readonly requiredXmlSnippets?: readonly string[];
  readonly requireGradientFillSignal?: boolean;
  readonly requireHyperlinkRelationship?: boolean;
  readonly requireImageCropSourceRectSignal?: boolean;
  readonly requireImageRelationship?: boolean;
  readonly requirePaintOrderSignal?: boolean;
  readonly requireRichTextRunSignal?: boolean;
  readonly requireShadowSignal?: boolean;
  readonly requireTableSignal?: boolean;
  readonly requireTemplateLayoutTopology?: boolean;
  readonly requireTextBodySignal?: boolean;
};

export type RenderConfidenceRasterPage = {
  readonly page: number;
  readonly category: RenderConfidenceCategory;
};

export type RenderConfidenceDeck = Deck<void, any>;

export type RenderConfidenceFixture = {
  readonly name: string;
  readonly group: string;
  readonly artifactBaseName: string;
  readonly description: string;
  readonly rasterPages: readonly RenderConfidenceRasterPage[];
  readonly assertions: RenderConfidenceAssertionOptions;
  readonly createDeck: () => RenderConfidenceDeck;
};

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
  readonly expectedImageCropSourceRects?: readonly string[];
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

export type RenderConfidencePdfAssertionOptions = {
  readonly expectedPages: number;
  readonly minimumImageClipVisuals?: number;
  readonly minimumImageVisuals?: number;
  readonly minimumShadowVisuals?: number;
  readonly minimumShapeVisuals?: number;
  readonly minimumTableBorderVisuals?: number;
  readonly minimumTableBorderVisualsByPage?: readonly {
    readonly minimum: number;
    readonly page: number;
  }[];
  readonly minimumShapeVisualsByPage?: readonly {
    readonly minimum: number;
    readonly page: number;
  }[];
  readonly orderedTextSignals?: readonly string[];
  readonly orderedVisualSignals?: readonly {
    readonly kind: "image" | "line" | "shape" | "text";
    readonly shape?: "ellipse" | "rect" | "roundRect";
    readonly text?: string;
  }[];
  readonly requiredTexts: readonly string[];
  readonly requireGradientResource?: boolean;
  readonly requireGradientVisual?: boolean;
  readonly requiredGradientVisuals?: readonly {
    readonly angle?: number;
    readonly kind: "linear-gradient" | "radial-gradient";
    readonly stops?: readonly {
      readonly color: string;
      readonly offset: number;
    }[];
  }[];
  readonly requireImageClip?: boolean;
  readonly requireImageResource?: boolean;
  readonly requiredImageClipBoxes?: readonly {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }[];
  readonly requiredImageFitVisuals?: readonly {
    readonly fit: "contain" | "cover" | "crop" | "stretch";
    readonly minimum: number;
  }[];
  readonly requireShapeVisual?: boolean;
  readonly requireShadowVisual?: boolean;
  readonly requireTableCellVisuals?: boolean;
  readonly requireTableText?: boolean;
  readonly requiredShapeFillColorSignals?: readonly {
    readonly color: string;
    readonly shape?: "ellipse" | "rect" | "roundRect";
  }[];
  readonly requiredShapeVisualKinds?: readonly ("ellipse" | "rect" | "roundRect")[];
  readonly requiredTableCellVisualPages?: readonly number[];
  readonly requiredTextColorSignals?: readonly {
    readonly color: string;
    readonly text: string;
  }[];
  readonly requiredTextFontSizeSignals?: readonly {
    readonly fontSize: number;
    readonly text: string;
  }[];
  readonly requiredTextsByPage?: readonly {
    readonly page: number;
    readonly texts: readonly string[];
  }[];
  readonly requiredTableTexts?: readonly string[];
  readonly rasterTolerance?: {
    readonly maxMeanAbsoluteChannelDifference: number;
    readonly maxChannelDifference: number;
    readonly maxChangedPixelRatio?: number;
  };
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
  readonly pdfAssertions?: RenderConfidencePdfAssertionOptions;
  readonly createDeck: () => RenderConfidenceDeck;
};

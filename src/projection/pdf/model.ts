import type { ProjectionFormat } from "../../pipeline/public";
import type { AssetSource, AssetSourceField } from "../../assets";
import type { AssetEntity } from "../../graph";
import type {
  ObjectPositionIR,
  ProjectedLayoutOrigin,
  ProjectedUnsupportedSemantic,
  TextStyleIR,
} from "../../layout/projected";
import type { TextFit } from "../../style/types";
import type { PdfDocumentId, PdfPageId, PdfResourceId } from "./identity";

export type PdfRectangle = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type PdfRgbColor = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

export type PdfPoint = {
  readonly x: number;
  readonly y: number;
};

export type PdfFontResource = {
  readonly id: PdfResourceId;
  readonly name: string;
  readonly family?: string;
  readonly weight?: number;
  readonly style?: "normal" | "italic";
  readonly encoding?: "win-ansi" | "identity-h";
  readonly fallback?: boolean;
  readonly sourceKey?: string;
  readonly data?: Uint8Array;
};

export type PdfImageResource = {
  readonly id: PdfResourceId;
  readonly name?: string;
  readonly assetEntityId?: AssetEntity["id"];
  readonly source?: AssetSource;
  readonly sourceField?: Extract<AssetSourceField, "data" | "poster" | "posterData" | "src">;
  readonly mediaType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly data?: Uint8Array;
  readonly pdfColorFilter?: string;
};

export type PdfGradientStop = {
  readonly color: PdfRgbColor;
  readonly position: number;
  readonly opacity?: number;
};

export type PdfLinearGradientResource = {
  readonly id: PdfResourceId;
  readonly name: string;
  readonly kind: "linear-gradient";
  readonly angle: number;
  readonly box: PdfRectangle;
  readonly stops: readonly PdfGradientStop[];
};

export type PdfRadialGradientResource = {
  readonly id: PdfResourceId;
  readonly name: string;
  readonly kind: "radial-gradient";
  readonly shape: "circle" | "ellipse";
  readonly center: {
    readonly x: number;
    readonly y: number;
  };
  readonly radius: {
    readonly x: number;
    readonly y: number;
  };
  readonly box: PdfRectangle;
  readonly stops: readonly PdfGradientStop[];
};

export type PdfGradientResource = PdfLinearGradientResource | PdfRadialGradientResource;

export type PdfResourceDictionary = {
  readonly fonts: readonly PdfFontResource[];
  readonly images: readonly PdfImageResource[];
  readonly gradients?: readonly PdfGradientResource[];
};

export type PdfPageResourceReferences = {
  readonly fonts: readonly PdfResourceId[];
  readonly images: readonly PdfResourceId[];
  readonly gradients?: readonly PdfResourceId[];
};

export type PdfLinkAnnotation = {
  readonly kind: "link";
  readonly box: PdfRectangle;
  readonly url: string;
  readonly tooltip?: string;
};

export type PdfPageAnnotation = PdfLinkAnnotation;

export type PdfSetFillColorOp = {
  readonly op: "setFillColor";
  readonly color: PdfRgbColor;
};

export type PdfSetStrokeColorOp = {
  readonly op: "setStrokeColor";
  readonly color: PdfRgbColor;
};

export type PdfSetLineWidthOp = {
  readonly op: "setLineWidth";
  readonly width: number;
};

export type PdfStrokeDash = "dash" | "sysDot";
export type PdfStrokeLineCap = "butt" | "round" | "square";
export type PdfStrokeLineJoin = "bevel" | "miter" | "round";
export type PdfBlendMode =
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export type PdfGraphicsState = {
  readonly opacity?: number;
  readonly blendMode?: PdfBlendMode;
};

export type PdfElementOrigin = Pick<
  ProjectedLayoutOrigin,
  "assetEntityIds" | "componentProvenance" | "graphNodeIds" | "source" | "styleEntityIds"
>;

export type PdfTextOp = {
  readonly op: "text";
  readonly text: string;
  readonly textEncoding?: "win-ansi" | "utf16be";
  /** Logical text used for extraction when shaped glyphs are emitted in visual RTL order. */
  readonly actualText?: string;
  /** Optional OpenType-shaped glyphs for an Identity-H registered font. */
  readonly glyphs?: readonly PdfTextGlyph[];
  readonly x: number;
  readonly y: number;
  readonly box?: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly fontId?: PdfResourceId;
  readonly fontSize?: number;
  readonly charSpacing?: number;
  /** TrueType text-space adjustments after each character. Negative values tighten pairs. */
  readonly kerningAdjustments?: readonly number[];
  readonly textRise?: number;
  readonly color?: PdfRgbColor;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfTextGlyph = {
  readonly glyphId: number;
  /** Unicode cluster represented by this glyph, used for ToUnicode extraction. */
  readonly unicode: string;
  /** Shaped advance in 1/1000 em units. Required when the glyph has an offset. */
  readonly advanceWidth?: number;
  /** Text-space advance adjustment relative to the font glyph advance. */
  readonly advanceAdjustment?: number;
  /** Text-space offsets applied relative to the current shaped pen position. */
  readonly xOffset?: number;
  readonly yOffset?: number;
};

export type PdfImageOp = {
  readonly op: "image";
  readonly imageId: PdfResourceId;
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfFillRectOp = {
  readonly op: "fillRect";
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfFillEllipseOp = {
  readonly op: "fillEllipse";
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfFillRoundRectOp = {
  readonly op: "fillRoundRect";
  readonly box: PdfRectangle;
  readonly radius: number;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfFillLinearGradientRectOp = {
  readonly op: "fillLinearGradientRect";
  readonly gradientId: PdfResourceId;
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfFillLinearGradientEllipseOp = {
  readonly op: "fillLinearGradientEllipse";
  readonly gradientId: PdfResourceId;
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfFillLinearGradientRoundRectOp = {
  readonly op: "fillLinearGradientRoundRect";
  readonly gradientId: PdfResourceId;
  readonly box: PdfRectangle;
  readonly radius: number;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfFillRadialGradientRectOp = {
  readonly op: "fillRadialGradientRect";
  readonly gradientId: PdfResourceId;
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfFillRadialGradientEllipseOp = {
  readonly op: "fillRadialGradientEllipse";
  readonly gradientId: PdfResourceId;
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfFillRadialGradientRoundRectOp = {
  readonly op: "fillRadialGradientRoundRect";
  readonly gradientId: PdfResourceId;
  readonly box: PdfRectangle;
  readonly radius: number;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
};

export type PdfStrokeRectOp = {
  readonly op: "strokeRect";
  readonly box: PdfRectangle;
  readonly rotation?: number;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly lineWidth?: number;
  readonly dash?: PdfStrokeDash;
  readonly lineCap?: PdfStrokeLineCap;
  readonly lineJoin?: PdfStrokeLineJoin;
  readonly opacity?: number;
  readonly rotationBox?: PdfRectangle;
};

export type PdfStrokeEllipseOp = {
  readonly op: "strokeEllipse";
  readonly box: PdfRectangle;
  readonly rotation?: number;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly lineWidth?: number;
  readonly dash?: PdfStrokeDash;
  readonly lineCap?: PdfStrokeLineCap;
  readonly lineJoin?: PdfStrokeLineJoin;
  readonly opacity?: number;
  readonly rotationBox?: PdfRectangle;
};

export type PdfStrokeRoundRectOp = {
  readonly op: "strokeRoundRect";
  readonly box: PdfRectangle;
  readonly radius: number;
  readonly rotation?: number;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly lineWidth?: number;
  readonly dash?: PdfStrokeDash;
  readonly lineCap?: PdfStrokeLineCap;
  readonly lineJoin?: PdfStrokeLineJoin;
  readonly opacity?: number;
  readonly rotationBox?: PdfRectangle;
};

export type PdfStrokeLineOp = {
  readonly op: "strokeLine";
  readonly from: PdfPoint;
  readonly to: PdfPoint;
  readonly clipBox?: PdfRectangle;
  readonly color: PdfRgbColor;
  readonly lineWidth: number;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly dash?: PdfStrokeDash;
  readonly lineCap?: PdfStrokeLineCap;
  readonly lineJoin?: PdfStrokeLineJoin;
  readonly opacity?: number;
};

export type PdfContentOp = (
  | PdfFillEllipseOp
  | PdfFillLinearGradientEllipseOp
  | PdfFillLinearGradientRectOp
  | PdfFillLinearGradientRoundRectOp
  | PdfFillRadialGradientEllipseOp
  | PdfFillRadialGradientRectOp
  | PdfFillRadialGradientRoundRectOp
  | PdfFillRectOp
  | PdfFillRoundRectOp
  | PdfImageOp
  | PdfSetFillColorOp
  | PdfSetLineWidthOp
  | PdfStrokeEllipseOp
  | PdfStrokeRoundRectOp
  | PdfSetStrokeColorOp
  | PdfStrokeLineOp
  | PdfStrokeRectOp
  | PdfTextOp
) &
  PdfGraphicsState;

export type PdfPaintOrderInput = {
  readonly zIndex?: number;
  readonly siblingOrder: number;
  readonly generatedLayerRole?:
    | "authored"
    | "background"
    | "border"
    | "filter"
    | "outline"
    | "shadow";
  readonly generatedLayerPlacement?: "aboveAuthored" | "aboveBackground";
};

export type PdfImageFit = "contain" | "cover" | "stretch";

export type PdfTextVisualElement = {
  readonly kind: "text";
  readonly text: string;
  readonly textEncoding?: "win-ansi" | "utf16be";
  readonly actualText?: string;
  readonly glyphs?: readonly PdfTextGlyph[];
  readonly shapingDiagnostic?: {
    readonly code: string;
    readonly message: string;
  };
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly hyperlink?: {
    readonly url: string;
    readonly tooltip?: string;
  };
  readonly hyperlinkBox?: PdfRectangle;
  readonly fontId: PdfResourceId;
  readonly kerningAdjustments?: readonly number[];
  readonly style: {
    readonly fontFamily?: string;
    readonly fontSize?: number;
    readonly charSpacing?: number;
    readonly textRise?: number;
    readonly color?: PdfRgbColor;
    readonly textDirection?: TextStyleIR["textDirection"];
    readonly fit?: TextFit;
    readonly wrap?: boolean;
  };
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
  readonly paintOrder: PdfPaintOrderInput;
};

export type PdfShapeVisualElement = {
  readonly kind: "shape";
  readonly shape: "ellipse" | "rect" | "roundRect";
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly clipShape?: "ellipse";
  readonly radius?: number;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly fill?: {
    readonly color?: PdfRgbColor;
    readonly gradientId?: PdfResourceId;
    readonly kind?: "linear-gradient" | "radial-gradient";
    readonly angle?: number;
    readonly shape?: "circle" | "ellipse";
    readonly center?: {
      readonly x: number;
      readonly y: number;
    };
    readonly radius?: {
      readonly x: number;
      readonly y: number;
    };
    readonly stops?: readonly PdfGradientStop[];
    readonly opacity?: number;
  };
  readonly stroke?: {
    readonly color: PdfRgbColor;
    readonly width: number;
    readonly dash?: PdfStrokeDash;
    readonly lineCap?: PdfStrokeLineCap;
    readonly lineJoin?: PdfStrokeLineJoin;
    readonly opacity?: number;
  };
  readonly opacity?: number;
  readonly paintOrder: PdfPaintOrderInput;
};

export type PdfLineVisualElement = {
  readonly kind: "line";
  readonly from: PdfPoint;
  readonly to: PdfPoint;
  readonly clipBox?: PdfRectangle;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly stroke: {
    readonly color: PdfRgbColor;
    readonly width: number;
    readonly dash?: PdfStrokeDash;
    readonly lineCap?: PdfStrokeLineCap;
    readonly lineJoin?: PdfStrokeLineJoin;
    readonly opacity?: number;
  };
  readonly opacity?: number;
  readonly paintOrder: PdfPaintOrderInput;
};

export type PdfImageVisualElement = {
  readonly kind: "image";
  readonly imageId: PdfResourceId;
  readonly box: PdfRectangle;
  readonly clipBox?: PdfRectangle;
  readonly clipRadius?: number;
  readonly fit?: PdfImageFit;
  readonly objectPosition?: ObjectPositionIR;
  readonly rotation?: number;
  readonly rotationBox?: PdfRectangle;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
  readonly paintOrder: PdfPaintOrderInput;
};

export type PdfVisualElement = (
  | PdfImageVisualElement
  | PdfLineVisualElement
  | PdfShapeVisualElement
  | PdfTextVisualElement
) &
  PdfGraphicsState & {
    readonly origin?: PdfElementOrigin;
  };

export type PdfPage = {
  readonly id: PdfPageId;
  readonly index: number;
  readonly name?: string;
  readonly mediaBox: PdfRectangle;
  readonly resources: PdfPageResourceReferences;
  readonly annotations?: readonly PdfPageAnnotation[];
  /** Semantic visual elements before lowering, retained in source order for inspection. */
  readonly visuals?: readonly PdfVisualElement[];
  /** Final flattened PDF operations in emitted paint order. */
  readonly content: readonly PdfContentOp[];
};

export type PdfDocumentMetadata = {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly producer?: string;
  readonly creationDate?: string;
  readonly modificationDate?: string;
};

export type PdfFallback = {
  readonly code: string;
  readonly message: string;
  readonly pageId?: PdfPageId;
  readonly nodeId?: string;
  readonly kind?: "group" | "image" | "shape" | "table" | "text" | "video";
  readonly semantic?: ProjectedUnsupportedSemantic;
  readonly origin?: PdfElementOrigin;
};

export type PdfPageModel = {
  readonly format: Extract<ProjectionFormat, "pdf">;
  readonly version: "1.7";
  readonly documentId: PdfDocumentId;
  readonly metadata: PdfDocumentMetadata;
  readonly pages: readonly PdfPage[];
  readonly resources: PdfResourceDictionary;
  readonly fallbacks: readonly PdfFallback[];
};

export type PdfDocumentModel = PdfPageModel;

export function isPdfPageModel(value: unknown): value is PdfPageModel {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PdfPageModel>;
  return (
    candidate.format === "pdf" &&
    candidate.version === "1.7" &&
    typeof candidate.documentId === "string" &&
    typeof candidate.metadata === "object" &&
    candidate.metadata !== null &&
    Array.isArray(candidate.pages) &&
    typeof candidate.resources === "object" &&
    candidate.resources !== null &&
    Array.isArray(candidate.resources.fonts) &&
    Array.isArray(candidate.resources.images) &&
    Array.isArray(candidate.fallbacks)
  );
}

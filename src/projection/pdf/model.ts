import type { ProjectionFormat } from "../../pipeline/contract";
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

export type PdfFontResource = {
  readonly id: PdfResourceId;
  readonly name: string;
  readonly family?: string;
  readonly weight?: number;
  readonly style?: "normal" | "italic";
  readonly fallback?: boolean;
  readonly sourceKey?: string;
  readonly data?: Uint8Array;
};

export type PdfImageResource = {
  readonly id: PdfResourceId;
  readonly name?: string;
  readonly mediaType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly data?: Uint8Array;
};

export type PdfResourceDictionary = {
  readonly fonts: readonly PdfFontResource[];
  readonly images: readonly PdfImageResource[];
};

export type PdfPageResourceReferences = {
  readonly fonts: readonly PdfResourceId[];
  readonly images: readonly PdfResourceId[];
};

export type PdfSetFillColorOp = {
  readonly op: "setFillColor";
  readonly color: PdfRgbColor;
};

export type PdfTextOp = {
  readonly op: "text";
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fontId?: PdfResourceId;
  readonly fontSize?: number;
  readonly color?: PdfRgbColor;
};

export type PdfImageOp = {
  readonly op: "image";
  readonly imageId: PdfResourceId;
  readonly box: PdfRectangle;
};

export type PdfContentOp = PdfImageOp | PdfSetFillColorOp | PdfTextOp;

export type PdfPage = {
  readonly id: PdfPageId;
  readonly index: number;
  readonly mediaBox: PdfRectangle;
  readonly resources: PdfPageResourceReferences;
  readonly content: readonly PdfContentOp[];
};

export type PdfDocumentMetadata = {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly producer?: string;
};

export type PdfFallback = {
  readonly code: string;
  readonly message: string;
  readonly pageId?: PdfPageId;
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

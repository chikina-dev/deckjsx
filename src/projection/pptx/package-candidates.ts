import type {
  PackagePartId,
  PptxContentTypesPayload,
  PptxDefaultTextStylePayload,
  PptxPackageModel,
  PptxRelationshipsPayload,
  PptxSlideLayoutPartPayload,
  PptxSlideMasterPartPayload,
  PptxThemePartPayload,
} from "./model";

export type CandidateRecord = Readonly<Record<string, unknown>>;

export type PresentationPayloadCandidate = {
  readonly kind: "presentation";
  readonly size: PptxPackageModel["size"];
  readonly slideMasterIds: readonly {
    readonly slideMasterPartId: PackagePartId;
    readonly id: string;
  }[];
  readonly slidePartIds: readonly PackagePartId[];
  readonly defaultTextStyle: PptxDefaultTextStylePayload;
};

export function isRecord(value: unknown): value is CandidateRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isContentTypesPayload(value: unknown): value is PptxContentTypesPayload {
  return isRecord(value) && Array.isArray(value.defaults) && Array.isArray(value.overrides);
}

export function isRelationshipsPayload(value: unknown): value is PptxRelationshipsPayload {
  return isRecord(value) && Array.isArray(value.relationships);
}

export function isPresentationPayload(value: unknown): value is PresentationPayloadCandidate {
  return (
    isRecord(value) &&
    value.kind === "presentation" &&
    isRecord(value.size) &&
    Array.isArray(value.slideMasterIds) &&
    Array.isArray(value.slidePartIds) &&
    isRecord(value.defaultTextStyle) &&
    value.defaultTextStyle.source === "themeProjection" &&
    Array.isArray(value.defaultTextStyle.levels)
  );
}

export function isSlideMasterPayload(value: unknown): value is PptxSlideMasterPartPayload {
  return (
    isRecord(value) && value.kind === "slide-master" && Array.isArray(value.slideLayoutPartIds)
  );
}

export function isSlideLayoutPayload(value: unknown): value is PptxSlideLayoutPartPayload {
  return (
    isRecord(value) && value.kind === "slide-layout" && typeof value.slideMasterPartId === "string"
  );
}

export function isThemePayload(value: unknown): value is PptxThemePartPayload {
  return isRecord(value) && value.kind === "theme" && isRecord(value.projection);
}

export function isInspectableThemePayload(value: unknown): value is PptxThemePartPayload {
  return (
    isRecord(value) &&
    value.kind === "theme" &&
    typeof value.name === "string" &&
    value.editable === true &&
    isRecord(value.projection) &&
    isRecord(value.colorScheme) &&
    isRecord(value.fontScheme) &&
    isRecord(value.formatScheme) &&
    typeof value.colorScheme.name === "string" &&
    typeof value.fontScheme.name === "string" &&
    typeof value.formatScheme.name === "string"
  );
}

export const MEDIA_SOURCE_ORIGINS = Symbol.for("deckjsx.mediaSourceOrigins");

export type MediaSourceOrigin = {
  readonly importer?: string;
  readonly source?: string;
};

export type MediaSourceOriginField = "src" | "data" | "poster" | "posterData";

export type MediaSourceOriginByField = Partial<Record<MediaSourceOriginField, MediaSourceOrigin>>;

export function mediaSourceOrigins(origins: MediaSourceOriginByField): {
  readonly [MEDIA_SOURCE_ORIGINS]: MediaSourceOriginByField;
} {
  return { [MEDIA_SOURCE_ORIGINS]: origins };
}

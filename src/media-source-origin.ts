import { authoringMetadata } from "./authoring-metadata";

export const MEDIA_SOURCE_ORIGINS = Symbol.for("deckjsx.mediaSourceOrigins");

export type MediaSourceOrigin = {
  readonly importer?: string;
  readonly source?: string;
  readonly sourceIdentity?: string;
};

export type MediaSourceOriginField = "src" | "data" | "poster" | "posterData";

export type MediaSourceOriginByField = Partial<Record<MediaSourceOriginField, MediaSourceOrigin>>;

export function mediaSourceOrigins(
  origins: MediaSourceOriginByField,
): ReturnType<typeof authoringMetadata> {
  return authoringMetadata({ mediaSourceOrigins: origins });
}

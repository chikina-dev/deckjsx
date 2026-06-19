import type { MediaSourceOriginByField } from "./media-source-origin";
import type { JsxKey, SourceSpan } from "./authoring/tree";

export const AUTHORING_METADATA = Symbol.for("deckjsx.authoringMetadata");

export type ComponentFrame = {
  readonly name: string;
  readonly sourceSpan?: SourceSpan;
  readonly moduleId?: string;
  readonly key?: JsxKey;
};

export type ComponentProvenance = {
  readonly stack: readonly ComponentFrame[];
};

export type AuthoringMetadata = {
  readonly mediaSourceOrigins?: MediaSourceOriginByField;
  readonly componentProvenance?: ComponentProvenance;
};

export function authoringMetadata(metadata: AuthoringMetadata): {
  readonly [AUTHORING_METADATA]: AuthoringMetadata;
} {
  return { [AUTHORING_METADATA]: metadata };
}

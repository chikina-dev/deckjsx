import type { AuthorElementNode, AuthorTreeNode } from "../authoring/tree";
import type { Diagnostics } from "../diagnostics";
import type { SourceIdentity, SourceOrigin } from "../graph/types";
import type { StyleSheetValue } from "../style/stylesheet/public";
import type { CompositionContext } from "./public";
export type {
  CompositionContext,
  SlideFactory,
  SlideFactoryInput,
  SlideFactoryInputWithTemplate,
  SlideOptions,
  SourceContextInput,
  SourceContextMapper,
  SourceContextValue,
} from "./public";
export { COMPOSITION_SOURCE } from "./source";
export type {
  CompositionEntry,
  CompositionSource,
  CompositionSourceInternals,
  SourceContextBinding,
} from "./source";

export type SourceSlotOrigin = {
  readonly source: SourceOrigin;
  readonly field: string;
  readonly identityMaterial: readonly string[];
};

export type ComposedAuthorRoot = {
  readonly root: AuthorElementNode;
  readonly source: SourceOrigin;
  readonly sourceIdentityMaterial: readonly string[];
  readonly stylesheets: readonly StyleSheetValue[];
  readonly theme?: unknown;
  readonly templates?: unknown;
  readonly path: string;
  readonly composition: CompositionContext;
  readonly slotOrigins: WeakMap<AuthorTreeNode, SourceSlotOrigin>;
};

export type CompositionInspectResult = {
  readonly roots?: readonly ComposedAuthorRoot[];
  readonly diagnostics: Diagnostics;
};

export function sourceIdentity(value: string): SourceIdentity {
  return value as SourceIdentity;
}

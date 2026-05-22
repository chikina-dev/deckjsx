import type { JsxNode } from "../authoring/index";
import type { AuthorElementNode, AuthorTreeNode } from "../authoring/tree";
import type { Diagnostics } from "../diagnostics";
import type { SourceIdentity, SourceOrigin } from "../graph/types";

export const COMPOSITION_SOURCE = Symbol("deckjsx.compositionSource");

export type CompositionContext = {
  readonly sourceKey?: string;
  readonly slideIndex: number;
  readonly totalSlides: number;
  readonly deckSlideIndex: number;
  readonly deckTotalSlides: number;
};

export type SlideFactoryInput<TSourceContext = void> = [TSourceContext] extends [void]
  ? { readonly composition: CompositionContext }
  : { readonly context: TSourceContext; readonly composition: CompositionContext };

export type SlideFactory<TSourceContext = void> = (
  input: SlideFactoryInput<TSourceContext>,
) => JsxNode;

export type SourceContextMapper<TParentContext, TChildContext> = [TParentContext] extends [void]
  ? () => TChildContext
  : (context: TParentContext) => TChildContext;

export type SourceContextInput<TParentContext, TChildContext> =
  | TChildContext
  | SourceContextMapper<TParentContext, TChildContext>;

export type SourceContextBinding<TSourceContext = unknown> =
  | { readonly present: false }
  | { readonly present: true; readonly value: TSourceContext };

export type SourceSlotOrigin = {
  readonly source: SourceOrigin;
  readonly field: string;
  readonly identityMaterial: readonly string[];
};

export type ComposedAuthorRoot = {
  readonly root: AuthorElementNode;
  readonly source: SourceOrigin;
  readonly sourceIdentityMaterial: readonly string[];
  readonly path: string;
  readonly composition: CompositionContext;
  readonly slotOrigins: WeakMap<AuthorTreeNode, SourceSlotOrigin>;
};

export type CompositionInspectResult = {
  readonly roots?: readonly ComposedAuthorRoot[];
  readonly diagnostics: Diagnostics;
};

export type CompositionEntry<TSourceContext = unknown> =
  | {
      readonly kind: "slide";
      readonly factory: SlideFactory<TSourceContext>;
    }
  | {
      readonly kind: "mount";
      readonly sourceKey: string;
      readonly source: CompositionSource<unknown>;
      readonly contextProvider?: SourceContextInput<TSourceContext, unknown>;
      readonly invalidExtraContext?: boolean;
    };

export type CompositionSourceInternals<TSourceContext = unknown> = {
  readonly entries: readonly CompositionEntry<TSourceContext>[];
  readonly cycleId: object;
  readonly boundContext: SourceContextBinding<TSourceContext>;
};

export type CompositionSource<TSourceContext = unknown> = {
  readonly [COMPOSITION_SOURCE]: () => CompositionSourceInternals<TSourceContext>;
};

export function sourceIdentity(value: string): SourceIdentity {
  return value as SourceIdentity;
}

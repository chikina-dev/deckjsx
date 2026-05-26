import type { JsxNode } from "../authoring/index";
import type { AuthorElementNode, AuthorTreeNode } from "../authoring/tree";
import type { Diagnostics } from "../diagnostics";
import type { SourceIdentity, SourceOrigin } from "../graph/types";
import type { StyleSheet } from "../style/stylesheet";
import type { Theme } from "../style/theme";
import type {
  EmptySlideTemplateSet,
  SlideTemplateSet,
  TemplateHandle,
  TemplateName,
} from "../templates";

export const COMPOSITION_SOURCE = Symbol("deckjsx.compositionSource");

/**
 * Deck-generated composition values passed to every slide factory.
 *
 * `slideIndex` and `totalSlides` are source-local. `deckSlideIndex` and `deckTotalSlides` refer to
 * the fully composed root deck after mounted sources are expanded.
 */
export type CompositionContext = {
  readonly sourceKey?: string;
  readonly slideIndex: number;
  readonly totalSlides: number;
  readonly deckSlideIndex: number;
  readonly deckTotalSlides: number;
};

/**
 * The input shape for a slide factory.
 *
 * Root Decks receive only `composition`; Decks with Source Context also receive `context`.
 *
 * @typeParam TSourceContext - Source Context type required by the declaring Deck.
 */
export type SlideFactoryInput<TSourceContext = void> = [TSourceContext] extends [void]
  ? { readonly composition: CompositionContext }
  : { readonly context: TSourceContext; readonly composition: CompositionContext };

/**
 * Slide factory input when a slide selects a Deck Template.
 *
 * The `template` handle exposes typed Template Area References for the selected template.
 *
 * @typeParam TSourceContext - Source Context type required by the declaring Deck.
 * @typeParam TTemplates - Deck-local Slide Template set.
 * @typeParam TTemplateName - Selected Slide Template name.
 */
export type SlideFactoryInputWithTemplate<
  TSourceContext = void,
  TTemplates extends SlideTemplateSet = EmptySlideTemplateSet,
  TTemplateName extends TemplateName<TTemplates> = TemplateName<TTemplates>,
> = SlideFactoryInput<TSourceContext> & {
  readonly template: TemplateHandle<TTemplates, TTemplateName>;
};

/**
 * A callback that returns the authored JSX content for one slide.
 *
 * The returned JSX is slide content, not a public `<Slide>` wrapper.
 *
 * @typeParam TSourceContext - Source Context type required by the declaring Deck.
 * @typeParam TInput - Factory input shape, including template handle when applicable.
 */
export type SlideFactory<
  TSourceContext = void,
  TInput extends SlideFactoryInput<TSourceContext> = SlideFactoryInput<TSourceContext>,
> = (input: TInput) => JsxNode;

/**
 * Slide-level options for `deck.slide(...)`.
 *
 * `template` is available only when the Deck has a typed template set. `name`, `className`, and
 * `style` apply to the slide declaration itself.
 *
 * @typeParam TTemplates - Deck-local Slide Template set.
 * @typeParam TTemplateName - Selected Slide Template name.
 */
export type SlideOptions<
  TTemplates extends SlideTemplateSet = EmptySlideTemplateSet,
  TTemplateName extends TemplateName<TTemplates> = TemplateName<TTemplates>,
> = {
  readonly name?: string;
  readonly className?: import("../authoring/index").ClassNameValue;
  readonly style?: import("../style/types").SlideStyle;
} & ([TemplateName<TTemplates>] extends [never]
  ? { readonly template?: never }
  : { readonly template?: TTemplateName });

/**
 * Maps parent Source Context into a mounted child Deck's Source Context.
 *
 * Source Context mappers are synchronous and do not receive Composition Context.
 *
 * @typeParam TParentContext - Source Context type of the parent Deck.
 * @typeParam TChildContext - Source Context type required by the child Deck.
 */
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
  readonly stylesheets: readonly StyleSheet[];
  readonly theme?: Theme;
  readonly templates?: SlideTemplateSet;
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
      readonly options?: SlideOptions<SlideTemplateSet>;
      readonly factory: SlideFactory<TSourceContext, SlideFactoryInput<TSourceContext> & object>;
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
  readonly stylesheets: readonly StyleSheet[];
  readonly theme?: Theme;
  readonly templates?: SlideTemplateSet;
  readonly cycleId: object;
  readonly boundContext: SourceContextBinding<TSourceContext>;
};

export type CompositionSource<TSourceContext = unknown> = {
  readonly [COMPOSITION_SOURCE]: () => CompositionSourceInternals<TSourceContext>;
};

export function sourceIdentity(value: string): SourceIdentity {
  return value as SourceIdentity;
}

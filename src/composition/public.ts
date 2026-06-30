import type { JsxNode } from "../authoring/jsx-types";
import type { ClassNameValue } from "../authoring/props";
import type { SlideStyle } from "../style/types";
import type {
  EmptySlideTemplateSet,
  SlideTemplateSet,
  TemplateHandle,
  TemplateName,
} from "../templates";

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
  readonly className?: ClassNameValue;
  readonly style?: SlideStyle;
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

/**
 * Source Context value or mapper accepted by `deck.mount(...)`.
 *
 * Pass a value when the child Deck should always receive the same context. Pass a synchronous
 * mapper when the child context should be derived from the parent Deck's Source Context.
 *
 * @typeParam TParentContext - Source Context type of the parent Deck.
 * @typeParam TChildContext - Source Context type required by the child Deck.
 */
export type SourceContextInput<TParentContext, TChildContext> =
  | TChildContext
  | SourceContextMapper<TParentContext, TChildContext>;

/**
 * Public Source Context value carried through mounted Deck composition.
 *
 * Source Context is authoring data for slide factories. It may contain primitive JSX-compatible
 * values, deckjsx JSX nodes, arrays, or readonly object trees of those values. Functions, promises,
 * class instances, and runtime resources are not part of this public authoring API; convert them to
 * data before mounting or use integration hooks for runtime services.
 */
export type SourceContextValue = JsxNode | { readonly [key: string]: SourceContextValue };

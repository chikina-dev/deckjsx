import type { DeckOptions } from "./authoring/index";
import type { RenderOptions, WriterAdapter } from "./adapter";
import {
  COMPOSITION_SOURCE,
  type CompositionEntry,
  type CompositionSource,
  type CompositionSourceInternals,
  type SlideFactory,
  type SlideFactoryInputWithTemplate,
  type SlideOptions,
  type SourceContextInput,
  type SourceContextValue,
} from "./composition/types";
import type { Diagnostics } from "./diagnostics";
import type { SemanticAuthorGraph } from "./graph";
import { resultOk, stageSummary, type ProjectOptions, type StageArtifactStatus } from "./pipeline";
import { PipelineArtifactCollection } from "./pipeline-artifacts";
import {
  compileSource,
  projectSource,
  renderSource,
  type CompileResult,
  type ProjectResult,
  type RenderResult,
} from "./pipeline-runner";
import type { PptxPackageModel, PptxPackageModelCandidate } from "./projection/pptx/model";
import type { StyleSheet } from "./style/stylesheet";
import type { EmptySlideTemplateSet, SlideTemplateSet, TemplateName } from "./templates";

export type {
  CompositionContext,
  SlideFactory,
  SlideFactoryInput,
  SlideFactoryInputWithTemplate,
  SlideOptions,
  SourceContextMapper,
} from "./composition/types";
export type { CompileResult, ProjectResult, RenderResult } from "./pipeline-runner";

type WithSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
> = [TSourceContext] extends [void]
  ? never
  : (sourceContext: TSourceContext) => BoundSource<TSourceContext, TTemplates>;

type PresentStageArtifactStatus = Exclude<StageArtifactStatus, "missing">;

function projectedArtifactStatus(value: undefined, diagnostics: Diagnostics): "missing";
function projectedArtifactStatus<T>(value: T, diagnostics: Diagnostics): PresentStageArtifactStatus;
function projectedArtifactStatus<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): StageArtifactStatus {
  if (value === undefined) {
    return "missing";
  }

  return diagnostics.hasErrors ? "partial" : "available";
}

/**
 * A Deck with Source Context already bound.
 *
 * Bound sources can be mounted, compiled, projected, or rendered, but they are not an authoring
 * registration surface. Use `Deck#withSource(...)` when a child Deck requires Source Context and
 * should be executed as a standalone source.
 *
 * @typeParam TSourceContext - The Source Context type already bound to this source.
 * @typeParam TTemplates - The Deck-local Slide Template set owned by the source Deck.
 */
export class BoundSource<
  TSourceContext extends SourceContextValue | void = void,
  TTemplates extends SlideTemplateSet = SlideTemplateSet,
> implements CompositionSource<TSourceContext, TTemplates> {
  readonly #source: Deck<TSourceContext, TTemplates>;
  readonly #sourceContext: TSourceContext;

  /**
   * @param source - The Deck whose Source Context should be bound.
   * @param sourceContext - The Source Context value used whenever this source is composed.
   */
  constructor(source: Deck<TSourceContext, TTemplates>, sourceContext: TSourceContext) {
    this.#source = source;
    this.#sourceContext = sourceContext;
  }

  [COMPOSITION_SOURCE](): CompositionSourceInternals<TSourceContext, TTemplates> {
    const source = this.#source[COMPOSITION_SOURCE]();
    return {
      entries: source.entries,
      stylesheets: source.stylesheets,
      ...(source.theme ? { theme: source.theme } : {}),
      ...(source.templates ? { templates: source.templates } : {}),
      cycleId: source.cycleId,
      boundContext: { present: true, value: this.#sourceContext },
    };
  }

  /**
   * Compile this bound source into a Semantic Author Graph and resolved style inspection data.
   *
   * @returns A compile result with diagnostics, stage summaries, and graph artifacts when available.
   */
  compile(): CompileResult {
    return compileSource(this);
  }

  /**
   * Project this bound source into the configured output document model.
   *
   * @returns A project result with diagnostics, stage summaries, and the projected model when valid.
   */
  project(options?: ProjectOptions): Promise<ProjectResult> {
    return projectSource({
      source: this,
      options: this.#source.options,
      projectOptions: options,
    });
  }

  /**
   * Render this bound source with the default writer adapter or an explicit Writer Adapter.
   *
   * @param config - Render options for the default adapter, or an explicit Writer Adapter.
   * @returns A Promise resolving to render diagnostics, stage summaries, and an artifact when render succeeds.
   */
  render(config?: RenderOptions | WriterAdapter<PptxPackageModel>): Promise<RenderResult> {
    return renderSource({
      source: this,
      options: this.#source.options,
      renderInput: config ?? {},
    });
  }
}

type UntemplatedSlideOptions = Omit<SlideOptions<SlideTemplateSet>, "template"> & {
  readonly template?: never;
};

/**
 * The main authoring object for a deckjsx document.
 *
 * A Deck owns slide declarations, source-local stylesheets, optional Theme configuration, and
 * Deck-local Slide Templates. It compiles JSX authoring into the Semantic Author Graph, projects
 * that graph into an output document model, and renders the projected model through a writer.
 *
 * @typeParam TSourceContext - Source Context required by this Deck's slide factories.
 * @typeParam TTemplates - Deck-local Slide Template set inferred from `new Deck({ templates })`.
 */
export class Deck<
  TSourceContext extends SourceContextValue | void = void,
  TTemplates extends SlideTemplateSet = EmptySlideTemplateSet,
> implements CompositionSource<TSourceContext, TTemplates> {
  readonly #options: DeckOptions<TTemplates>;
  readonly #entries: CompositionEntry<TSourceContext, TTemplates>[] = [];
  readonly #stylesheets: StyleSheet[] = [];
  readonly #artifacts = new PipelineArtifactCollection();

  /** Bind Source Context to this Deck so it can be compiled, projected, rendered, or mounted. */
  readonly withSource: WithSource<TSourceContext, TTemplates>;

  /**
   * @param options - Deck configuration, including layout, metadata, Theme, output format, and Deck Templates.
   */
  constructor(options: DeckOptions<TTemplates>) {
    this.#options = options;
    this.withSource = ((sourceContext: TSourceContext) =>
      new BoundSource(this, sourceContext)) as WithSource<TSourceContext, TTemplates>;
  }

  get options(): DeckOptions<TTemplates> {
    return this.#options;
  }

  [COMPOSITION_SOURCE](): CompositionSourceInternals<TSourceContext, TTemplates> {
    return {
      entries: this.#entries,
      stylesheets: this.#stylesheets,
      ...(this.#options.theme ? { theme: this.#options.theme } : {}),
      ...(this.#options.templates ? { templates: this.#options.templates } : {}),
      cycleId: this,
      boundContext: { present: false },
    };
  }

  /**
   * Register a source-local StyleSheet for CSS-like `className` resolution.
   *
   * @param stylesheet - The StyleSheet to apply to slides declared by this Deck source.
   * @returns This Deck, for fluent authoring.
   */
  useStyles(stylesheet: StyleSheet): this {
    this.#stylesheets.push(stylesheet);
    this.#artifacts.invalidateFromSource();
    return this;
  }

  /**
   * Declare one slide.
   *
   * The factory returns the slide content JSX directly; authors should not wrap content in a public
   * `<Slide>` root. Slide-level metadata such as `name`, `className`, `style`, and `template` belongs
   * in the options object.
   *
   * @param factory - Callback that returns the authored JSX content for the slide.
   * @returns This Deck, for fluent authoring.
   */
  slide(factory: SlideFactory<TSourceContext>): this;
  /**
   * Declare one untemplated slide with slide-level options.
   *
   * Use this overload for slide metadata or slide-level style when no Deck Template is selected.
   *
   * @param options - Slide-level metadata and style. `template` is intentionally unavailable here.
   * @param factory - Callback that returns the authored JSX content for the slide.
   * @returns This Deck, for fluent authoring.
   */
  slide(options: UntemplatedSlideOptions, factory: SlideFactory<TSourceContext>): this;
  /**
   * Declare one slide using a Deck-owned Slide Template.
   *
   * The selected template name is type-checked from `new Deck({ templates })`. The factory receives a
   * typed `template` handle whose properties create Template Area References, e.g.
   * `area={template.title}`.
   *
   * @param options - Slide-level options including the selected Deck Template name.
   * @param factory - Callback that returns authored JSX content and receives a typed `template` handle.
   * @returns This Deck, for fluent authoring.
   */
  slide<TTemplateName extends TemplateName<TTemplates>>(
    options: SlideOptions<TTemplates, TTemplateName> & { readonly template: TTemplateName },
    factory: SlideFactory<
      TSourceContext,
      SlideFactoryInputWithTemplate<TSourceContext, TTemplates, TTemplateName>
    >,
  ): this;
  slide(
    optionsOrFactory:
      | UntemplatedSlideOptions
      | SlideOptions<TTemplates, TemplateName<TTemplates>>
      | SlideFactory<TSourceContext>
      | SlideFactory<
          TSourceContext,
          SlideFactoryInputWithTemplate<TSourceContext, TTemplates, TemplateName<TTemplates>>
        >,
    maybeFactory?:
      | SlideFactory<TSourceContext>
      | SlideFactory<
          TSourceContext,
          SlideFactoryInputWithTemplate<TSourceContext, TTemplates, TemplateName<TTemplates>>
        >,
  ): this {
    const options = typeof optionsOrFactory === "function" ? undefined : optionsOrFactory;
    const factory = typeof optionsOrFactory === "function" ? optionsOrFactory : maybeFactory;
    if (!factory) {
      throw new Error("deck.slide() requires a slide factory.");
    }

    this.#entries.push({ kind: "slide", ...(options ? { options } : {}), factory });
    this.#artifacts.invalidateFromSource();
    return this;
  }

  /**
   * Mount another Deck as a child source.
   *
   * Child Decks keep their own Source Context, stylesheets, Theme, and Slide Templates. Parent Deck
   * templates are not inherited by mounted children.
   *
   * @param sourceKey - Source-local key used for source identity and diagnostics.
   * @param child - Child Deck to compose into this Deck.
   * @param context - Required child Source Context value or synchronous mapper when the child needs context.
   * @returns This Deck, for fluent authoring.
   */
  mount<TChildContext extends SourceContextValue | void, TChildTemplates extends SlideTemplateSet>(
    sourceKey: string,
    child: Deck<TChildContext, TChildTemplates>,
    ...context: [TChildContext] extends [void]
      ? []
      : [sourceContext: SourceContextInput<TSourceContext, TChildContext>]
  ): this;
  mount<TChildContext extends SourceContextValue | void, TChildTemplates extends SlideTemplateSet>(
    sourceKey: string,
    child: BoundSource<TChildContext, TChildTemplates>,
  ): this;
  mount(
    sourceKey: string,
    child: CompositionSource<SourceContextValue, SlideTemplateSet>,
    ...context: readonly SourceContextInput<TSourceContext, SourceContextValue>[]
  ): this {
    this.#entries.push({
      kind: "mount",
      sourceKey,
      source: child,
      ...(context.length > 0 ? { contextProvider: context[0] } : {}),
      ...(child instanceof BoundSource && context.length > 0 ? { invalidExtraContext: true } : {}),
    });
    this.#artifacts.invalidateFromSource();
    return this;
  }

  /**
   * Replace the current compiled graph artifact before calling `project()` or `render()`.
   *
   * @param graph - The Semantic Author Graph to use as this Deck's compiled state.
   * @returns This Deck, for fluent pipeline editing.
   */
  defineGraph(graph: SemanticAuthorGraph): this {
    this.#artifacts.replaceGraphArtifact(this, graph);
    return this;
  }

  /**
   * Replace the current projected document model artifact before calling `render()`.
   *
   * @param projection - The projected PPTX Package Model to use as this Deck's projection state.
   * @returns This Deck, for fluent pipeline editing.
   */
  defineProjection(projection: PptxPackageModelCandidate): this {
    this.#artifacts.replaceProjectionArtifact(projection);
    return this;
  }

  /**
   * Compile this root Deck into the Semantic Author Graph and inspection artifacts.
   *
   * @returns A compile result with diagnostics, stage summaries, and graph artifacts when available.
   */
  compile(this: Deck<void, TTemplates>): CompileResult;
  compile(this: Deck<void, TTemplates>): CompileResult {
    if (this.#artifacts.graph) {
      const diagnostics = this.#artifacts.graph.diagnostics;

      return {
        ok: resultOk(diagnostics),
        diagnostics,
        stages: {
          compile: stageSummary(
            "compile",
            diagnostics,
            projectedArtifactStatus(this.#artifacts.graph.graph, diagnostics),
          ),
        },
        graph: this.#artifacts.graph.graph,
        resolvedStyles: this.#artifacts.graph.resolvedStyles,
      };
    }

    return compileSource(this, this.#artifacts);
  }

  /**
   * Project this root Deck into the configured output document model.
   *
   * @returns A project result with diagnostics, stage summaries, and the projected model when valid.
   */
  project(this: Deck<void, TTemplates>, options?: ProjectOptions): Promise<ProjectResult> {
    return projectSource({
      source: this,
      options: this.#options,
      projectOptions: options,
      definedGraph: this.#artifacts.graph,
      definedProjection: this.#artifacts.projection,
      artifacts: this.#artifacts,
    });
  }

  /**
   * Render this root Deck with the default writer adapter or an explicit Writer Adapter.
   *
   * @param config - Render options for the default adapter, or an explicit Writer Adapter.
   * @returns A Promise resolving to render diagnostics, stage summaries, and an artifact when render succeeds.
   */
  render(
    this: Deck<void, TTemplates>,
    config?: RenderOptions | WriterAdapter<PptxPackageModel>,
  ): Promise<RenderResult> {
    return renderSource({
      source: this,
      options: this.#options,
      renderInput: config ?? {},
      definedGraph: this.#artifacts.graph,
      definedProjection: this.#artifacts.projection,
      artifacts: this.#artifacts,
    });
  }
}

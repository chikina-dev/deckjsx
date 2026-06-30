import type { DeckOptions } from "./authoring/options/public";
import { validateDeckOptions } from "./authoring/options/validation";
import type { RenderOptions, WriterAdapter } from "./adapter/public";
import {
  COMPOSITION_SOURCE,
  compositionRevisionForSource,
  type CompositionEntry,
  type CompositionSource,
  type CompositionSourceInternals,
} from "./composition/source";
import type {
  SlideFactory,
  SlideFactoryInputWithTemplate,
  SlideOptions,
  SourceContextInput,
  SourceContextValue,
} from "./composition/public";
import { createDiagnostics, type Diagnostics } from "./diagnostics";
import type { SemanticAuthorGraph } from "./graph";
import { resultOk, stageSummary } from "./pipeline/stage";
import type { ProjectOptions, ProjectionFormat, StageArtifactStatus } from "./pipeline/contract";
import type { DefinedGraphInput, DefinedProjectionInput } from "./pipeline/artifact-input";
import { compileSource, defineGraphForSource } from "./compile-runner";
import type {
  CompiledAuthorGraph,
  CompileResult,
  ProjectResult,
  RenderResult,
} from "./pipeline/results-public";
import { isDeckPlugin } from "./plugin";
import type { StyleSheetValue } from "./style/stylesheet/public";
import type { EmptySlideTemplateSet, SlideTemplateSet, TemplateName } from "./templates";

export type {
  CompositionContext,
  SlideFactory,
  SlideFactoryInput,
  SlideFactoryInputWithTemplate,
  SlideOptions,
  SourceContextMapper,
} from "./composition/public";
export type { CompileResult, ProjectResult, RenderResult } from "./pipeline/results-public";

/**
 * Public plugin value accepted by `Deck#plugin(...)`.
 *
 * Root `deckjsx` exposes plugin registration only. It intentionally does not expose hook context,
 * asset loader, or integration authoring shapes; plugin authors should import `DeckPlugin` and the
 * related lifecycle types from `deckjsx/integration`.
 */
export type DeckPluginInput = {
  readonly kind: "deckjsx.plugin";
  readonly id: string;
  readonly name?: string;
};

/**
 * Public projected document definition accepted by `Deck#defineProjection(...)`.
 *
 * This root API only guarantees the lightweight projection contract. Adapter-specific projection
 * details remain validated at runtime and are exposed through inspection/integration surfaces.
 */
export type ProjectionDefinitionInput = {
  readonly format: ProjectionFormat;
};

type WithSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
> = [TSourceContext] extends [void]
  ? never
  : (sourceContext: TSourceContext) => BoundSource<TSourceContext, TTemplates>;

type PresentStageArtifactStatus = Exclude<StageArtifactStatus, "missing">;
type DeckPipelineArtifacts = {
  readonly graph?: DefinedGraphInput;
  readonly projection?: DefinedProjectionInput;
  invalidateFromSource(): void;
};
type ProjectSourceInput<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
> = {
  readonly source: CompositionSource<TSourceContext, TTemplates>;
  readonly options: DeckOptions;
  readonly projectOptions?: ProjectOptions;
  readonly definedGraph?: DefinedGraphInput;
  readonly definedProjection?: DefinedProjectionInput;
  readonly artifacts?: DeckPipelineArtifacts;
};
type RenderSourceInput<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
> = {
  readonly source: CompositionSource<TSourceContext, TTemplates>;
  readonly options: DeckOptions;
  readonly renderInput?: RenderOptions | WriterAdapter;
  readonly definedGraph?: DefinedGraphInput;
  readonly definedProjection?: DefinedProjectionInput;
  readonly artifacts?: DeckPipelineArtifacts;
};
type PipelineRunnerModule = {
  readonly createPipelineArtifacts: () => DeckPipelineArtifacts;
  readonly projectSource: <
    TSourceContext extends SourceContextValue | void,
    TTemplates extends SlideTemplateSet,
  >(
    input: ProjectSourceInput<TSourceContext, TTemplates>,
  ) => Promise<ProjectResult>;
  readonly renderSource: <
    TSourceContext extends SourceContextValue | void,
    TTemplates extends SlideTemplateSet,
  >(
    input: RenderSourceInput<TSourceContext, TTemplates>,
  ) => Promise<RenderResult>;
};

function loadPipelineRunner(): Promise<PipelineRunnerModule> {
  return import("./pipeline/runner") as Promise<PipelineRunnerModule>;
}

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
      plugins: source.plugins,
      ...(Object.hasOwn(source, "theme") ? { theme: source.theme } : {}),
      ...(Object.hasOwn(source, "templates") ? { templates: source.templates } : {}),
      cycleId: source.cycleId,
      revision: source.revision,
      boundContext: { present: true, value: this.#sourceContext },
    };
  }

  /**
   * Compile this bound source into a Semantic Author Graph and resolved style inspection data.
   *
   * @returns A compile result with diagnostics, stage summaries, and graph artifacts when available.
   */
  compile(): CompileResult {
    const optionsDiagnostics = validateDeckOptions(this.#source.options);
    if (optionsDiagnostics.hasErrors) {
      return {
        ok: false,
        diagnostics: optionsDiagnostics,
        stages: {
          compile: stageSummary("compile", optionsDiagnostics, "missing"),
        },
      };
    }

    return compileSource(this);
  }

  /**
   * Project this bound source into the configured output document model.
   *
   * @returns A project result with diagnostics, stage summaries, and the projected model when valid.
   */
  project(options?: ProjectOptions): Promise<ProjectResult> {
    return loadPipelineRunner().then(({ projectSource }) =>
      projectSource({
        source: this,
        options: this.#source.options,
        projectOptions: options,
      }),
    );
  }

  /**
   * Render this bound source with the default writer adapter or an explicit Writer Adapter.
   *
   * @param config - Render options for the default adapter, or an explicit Writer Adapter.
   * @returns A Promise resolving to render diagnostics, stage summaries, and an artifact when render succeeds.
   */
  render(config?: RenderOptions | WriterAdapter): Promise<RenderResult> {
    return loadPipelineRunner().then(({ renderSource }) =>
      renderSource({
        source: this,
        options: this.#source.options,
        renderInput: config ?? {},
      }),
    );
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
  readonly #stylesheets: StyleSheetValue[] = [];
  readonly #plugins: DeckPluginInput[] = [];
  #artifacts?: DeckPipelineArtifacts;
  #definedGraph?: DefinedGraphInput;
  #definedProjection?: DefinedProjectionInput;
  #revision = 0;

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

  #invalidateFromSource(): void {
    this.#revision += 1;
    this.#definedGraph = undefined;
    this.#definedProjection = undefined;
    this.#artifacts?.invalidateFromSource();
  }

  #pipelineArtifacts(createPipelineArtifacts: () => DeckPipelineArtifacts): DeckPipelineArtifacts {
    this.#artifacts ??= createPipelineArtifacts();
    return this.#artifacts;
  }

  #artifactGraph(): DefinedGraphInput | undefined {
    const graph = this.#artifacts?.graph;
    return graph?.compositionRevision === compositionRevisionForSource(this) ? graph : undefined;
  }

  [COMPOSITION_SOURCE](): CompositionSourceInternals<TSourceContext, TTemplates> {
    return {
      entries: this.#entries,
      stylesheets: this.#stylesheets,
      plugins: this.#plugins,
      ...(this.#options.theme !== undefined ? { theme: this.#options.theme } : {}),
      ...(this.#options.templates !== undefined ? { templates: this.#options.templates } : {}),
      cycleId: this,
      revision: this.#revision,
      boundContext: { present: false },
    };
  }

  /**
   * Register a source-local StyleSheet for CSS-like `className` resolution.
   *
   * @param stylesheet - The StyleSheet to apply to slides declared by this Deck source.
   * @returns This Deck, for fluent authoring.
   */
  useStyles(stylesheet: StyleSheetValue): this {
    this.#stylesheets.push(stylesheet);
    this.#invalidateFromSource();
    return this;
  }

  /**
   * Register a Deck Plugin for this root Deck's pipeline executions.
   *
   * Plugins participate in deckjsx pipeline stages without changing ordinary authoring props.
   */
  plugin(plugin: DeckPluginInput): this {
    const existing = isDeckPlugin(plugin)
      ? this.#plugins.findIndex((item) => isDeckPlugin(item) && item.id === plugin.id)
      : -1;
    if (existing >= 0) {
      this.#plugins.splice(existing, 1, plugin);
      this.#invalidateFromSource();
      return this;
    }
    this.#plugins.push(plugin);
    this.#invalidateFromSource();
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
    const hasOptions = typeof optionsOrFactory !== "function";
    const options = hasOptions ? optionsOrFactory : undefined;
    const factory = typeof optionsOrFactory === "function" ? optionsOrFactory : maybeFactory;
    if (!factory) {
      throw new Error("deck.slide() requires a slide factory.");
    }

    this.#entries.push({ kind: "slide", ...(hasOptions ? { options } : {}), factory });
    this.#invalidateFromSource();
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
    this.#invalidateFromSource();
    return this;
  }

  /**
   * Replace the current compiled graph artifact before calling `project()` or `render()`.
   *
   * This is a low-level pipeline override for tools. It is not an authoring escape hatch and does
   * not widen public JSX props, public style keys, Theme defaults, or StyleSheet class styles.
   *
   * @param graph - A compiled graph definition to use as this Deck's compiled state. Detailed
   * internal graph shape is validated by lower-level pipeline stages.
   * @returns This Deck, for fluent pipeline editing.
   */
  defineGraph(graph: CompiledAuthorGraph): this {
    this.#definedGraph = defineGraphForSource(this, graph as SemanticAuthorGraph);
    this.#definedProjection = undefined;
    this.#artifacts?.invalidateFromSource();
    return this;
  }

  /**
   * Replace the current projected document model artifact before calling `render()`.
   *
   * This is a low-level pipeline override for tools. It bypasses normal projection work for the
   * current Deck instance, but render-time diagnostics still validate adapter-specific shape.
   *
   * @param projection - A projection definition to use as this Deck's projection state. Detailed
   * adapter-specific shape is validated at runtime.
   * @returns This Deck, for fluent pipeline editing.
   */
  defineProjection<TProjection extends ProjectionDefinitionInput>(projection: TProjection): this {
    this.#definedGraph = undefined;
    this.#definedProjection = {
      projection,
      diagnostics: createDiagnostics(),
    };
    return this;
  }

  /**
   * Compile this root Deck into the Semantic Author Graph and inspection artifacts.
   *
   * @returns A compile result with diagnostics, stage summaries, and graph artifacts when available.
   */
  compile(this: Deck<void, TTemplates>): CompileResult;
  compile(this: Deck<void, TTemplates>): CompileResult {
    const optionsDiagnostics = validateDeckOptions(this.#options);
    if (optionsDiagnostics.hasErrors) {
      return {
        ok: false,
        diagnostics: optionsDiagnostics,
        stages: {
          compile: stageSummary("compile", optionsDiagnostics, "missing"),
        },
      };
    }

    const graphArtifact = this.#definedGraph ?? this.#artifactGraph();
    if (graphArtifact) {
      const diagnostics = graphArtifact.diagnostics;

      return {
        ok: resultOk(diagnostics),
        diagnostics,
        stages: {
          compile: stageSummary(
            "compile",
            diagnostics,
            projectedArtifactStatus(graphArtifact.graph, diagnostics),
          ),
        },
        graph: graphArtifact.graph,
        resolvedStyles: graphArtifact.resolvedStyles,
      };
    }

    return compileSource(this);
  }

  /**
   * Project this root Deck into the configured output document model.
   *
   * @returns A project result with diagnostics, stage summaries, and the projected model when valid.
   */
  project(this: Deck<void, TTemplates>, options?: ProjectOptions): Promise<ProjectResult> {
    return loadPipelineRunner().then(({ createPipelineArtifacts, projectSource }) => {
      const artifacts = this.#pipelineArtifacts(createPipelineArtifacts);
      const artifactGraph = this.#artifactGraph();
      return projectSource({
        source: this,
        options: this.#options,
        projectOptions: options,
        definedGraph: this.#definedGraph ?? artifactGraph,
        definedProjection:
          this.#definedProjection ?? (artifactGraph ? artifacts.projection : undefined),
        artifacts,
      });
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
    config?: RenderOptions | WriterAdapter,
  ): Promise<RenderResult> {
    return loadPipelineRunner().then(({ createPipelineArtifacts, renderSource }) => {
      const artifacts = this.#pipelineArtifacts(createPipelineArtifacts);
      const artifactGraph = this.#artifactGraph();
      return renderSource({
        source: this,
        options: this.#options,
        renderInput: config ?? {},
        definedGraph: this.#definedGraph ?? artifactGraph,
        definedProjection:
          this.#definedProjection ?? (artifactGraph ? artifacts.projection : undefined),
        artifacts,
      });
    });
  }
}

import type { DeckOptions } from "./authoring/index";
import type { RenderOptions, WriterAdapter } from "./adapter";
import {
  COMPOSITION_SOURCE,
  type CompositionEntry,
  type CompositionSource,
  type CompositionSourceInternals,
  type SlideFactory,
  type SourceContextInput,
} from "./composition/types";
import type { Diagnostics } from "./diagnostics";
import type { SemanticAuthorGraph } from "./graph";
import { resultOk, stageSummary, type StageArtifactStatus } from "./pipeline";
import { PipelineArtifactCollection } from "./pipeline-artifacts";
import {
  compileSource,
  projectSource,
  renderSource,
  type CompileResult,
  type ProjectResult,
  type RenderResult,
} from "./pipeline-runner";
import type { PptxPackageModel } from "./projection/pptx";
import type { StyleSheet } from "./style/stylesheet";

export type {
  CompositionContext,
  SlideFactory,
  SlideFactoryInput,
  SourceContextMapper,
} from "./composition/types";
export type { CompileResult, ProjectResult, RenderResult } from "./pipeline-runner";

type WithSource<TSourceContext> = [TSourceContext] extends [void]
  ? never
  : (sourceContext: TSourceContext) => BoundSource<TSourceContext>;

function projectedArtifactStatus<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): StageArtifactStatus {
  if (value === undefined) {
    return "missing";
  }

  return diagnostics.hasErrors ? "partial" : "available";
}

export class BoundSource<TSourceContext = void> implements CompositionSource<TSourceContext> {
  readonly #source: Deck<TSourceContext>;
  readonly #sourceContext: TSourceContext;

  constructor(source: Deck<TSourceContext>, sourceContext: TSourceContext) {
    this.#source = source;
    this.#sourceContext = sourceContext;
  }

  [COMPOSITION_SOURCE](): CompositionSourceInternals<TSourceContext> {
    const source = this.#source[COMPOSITION_SOURCE]();
    return {
      entries: source.entries,
      stylesheets: source.stylesheets,
      ...(source.theme ? { theme: source.theme } : {}),
      cycleId: source.cycleId,
      boundContext: { present: true, value: this.#sourceContext },
    };
  }

  compile(): CompileResult {
    return compileSource(this);
  }

  project(): ProjectResult {
    return projectSource({ source: this, options: this.#source.options });
  }

  render(config?: RenderOptions | WriterAdapter<PptxPackageModel>): Promise<RenderResult> {
    return renderSource({
      source: this,
      options: this.#source.options,
      renderInput: config ?? {},
    });
  }
}

export class Deck<TSourceContext = void> implements CompositionSource<TSourceContext> {
  readonly #options: DeckOptions;
  readonly #entries: CompositionEntry<TSourceContext>[] = [];
  readonly #stylesheets: StyleSheet[] = [];
  readonly #artifacts = new PipelineArtifactCollection();

  readonly withSource: WithSource<TSourceContext>;

  constructor(options: DeckOptions) {
    this.#options = options;
    this.withSource = ((sourceContext: TSourceContext) =>
      new BoundSource(this, sourceContext)) as WithSource<TSourceContext>;
  }

  get options(): DeckOptions {
    return this.#options;
  }

  [COMPOSITION_SOURCE](): CompositionSourceInternals<TSourceContext> {
    return {
      entries: this.#entries,
      stylesheets: this.#stylesheets,
      ...(this.#options.theme ? { theme: this.#options.theme } : {}),
      cycleId: this,
      boundContext: { present: false },
    };
  }

  useStyles(stylesheet: StyleSheet): this {
    this.#stylesheets.push(stylesheet);
    this.#artifacts.invalidateFromSource();
    return this;
  }

  add(slide: SlideFactory<TSourceContext>): this {
    this.#entries.push({ kind: "slide", factory: slide });
    this.#artifacts.invalidateFromSource();
    return this;
  }

  mount<TChildContext>(
    sourceKey: string,
    child: Deck<TChildContext>,
    ...context: [TChildContext] extends [void]
      ? []
      : [sourceContext: SourceContextInput<TSourceContext, TChildContext>]
  ): this;
  mount<TChildContext>(sourceKey: string, child: BoundSource<TChildContext>): this;
  mount(
    sourceKey: string,
    child: CompositionSource<unknown>,
    ...context: readonly unknown[]
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

  defineGraph(graph: SemanticAuthorGraph): this {
    this.#artifacts.replaceGraphArtifact(this, graph);
    return this;
  }

  defineProjection(projection: PptxPackageModel): this {
    this.#artifacts.replaceProjectionArtifact(projection);
    return this;
  }

  compile(this: Deck<void>): CompileResult;
  compile(this: Deck<void>): CompileResult {
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

  project(this: Deck<void>): ProjectResult {
    return projectSource({
      source: this,
      options: this.#options,
      definedGraph: this.#artifacts.graph,
      definedProjection: this.#artifacts.projection,
      artifacts: this.#artifacts,
    });
  }

  render(
    this: Deck<void>,
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

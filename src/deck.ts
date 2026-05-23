import { renderPresentation } from "./compiler";
import type { DeckOptions, OutputConfig, StyleSheet } from "./authoring/index";
import {
  CompositionDiagnosticError,
  createDiagnostics,
  SemanticGraphDiagnosticError,
  StyleDiagnosticError,
  type Diagnostics,
} from "./diagnostics";
import {
  COMPOSITION_SOURCE,
  type CompositionEntry,
  type CompositionSource,
  type CompositionSourceInternals,
  type SlideFactory,
  type SourceContextInput,
} from "./composition/types";
import { resolveComposition } from "./composition/resolve";
import { buildSemanticAuthorGraph, type SemanticAuthorGraph } from "./graph";
import { resolveStyles, type ResolvedStyleMap } from "./style/resolve";
import type { PresentationIR } from "./ir/index";
import { outputPresentation } from "./node";

export type {
  CompositionContext,
  SlideFactory,
  SlideFactoryInput,
  SourceContextMapper,
} from "./composition/types";

export type CompileMode = "inspect" | "strict";

export type CompileInspectResult = {
  readonly graph?: SemanticAuthorGraph;
  readonly diagnostics: Diagnostics;
  readonly resolvedStyles?: ResolvedStyleMap;
};

type WithSource<TSourceContext> = [TSourceContext] extends [void]
  ? never
  : (sourceContext: TSourceContext) => BoundSource<TSourceContext>;

function hasMountedSources(entries: readonly CompositionEntry<any>[]): boolean {
  return entries.some((entry) => entry.kind === "mount");
}

function directSlideFactories<TSourceContext>(
  entries: readonly CompositionEntry<TSourceContext>[],
): SlideFactory<TSourceContext>[] {
  return entries.flatMap((entry) => (entry.kind === "slide" ? [entry.factory] : []));
}

function mountedSourceError(): Error {
  return new Error(
    "Mounted sources are supported by compile() only until the output pipeline supports graph composition.",
  );
}

function combineDiagnostics(...diagnostics: readonly Diagnostics[]): Diagnostics {
  return createDiagnostics(diagnostics.flatMap((item) => item.items));
}

function compileSource(
  source: CompositionSource<any>,
  config: { mode?: CompileMode } = {},
): CompileInspectResult | SemanticAuthorGraph {
  const composition = resolveComposition(source);

  if (composition.diagnostics.hasErrors) {
    if (config.mode === "inspect") {
      return { diagnostics: composition.diagnostics };
    }

    throw new CompositionDiagnosticError(composition.diagnostics);
  }

  const result = buildSemanticAuthorGraph(composition.roots ?? []);
  const styleResult = result.graph
    ? resolveStyles(result.graph, composition.roots ?? [])
    : undefined;
  const diagnostics = styleResult
    ? combineDiagnostics(result.diagnostics, styleResult.diagnostics)
    : result.diagnostics;

  if (config.mode === "inspect") {
    return {
      ...(result.graph ? { graph: result.graph } : {}),
      diagnostics,
      ...(styleResult ? { resolvedStyles: styleResult.resolvedStyles } : {}),
    };
  }

  if (result.diagnostics.hasErrors) {
    throw new SemanticGraphDiagnosticError(result.diagnostics);
  }

  if (styleResult?.diagnostics.hasErrors) {
    throw new StyleDiagnosticError(styleResult.diagnostics);
  }

  if (!result.graph) {
    throw new SemanticGraphDiagnosticError(result.diagnostics);
  }

  return result.graph;
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
      cycleId: source.cycleId,
      boundContext: { present: true, value: this.#sourceContext },
    };
  }

  compile(): SemanticAuthorGraph;
  compile(config: { mode?: "strict" }): SemanticAuthorGraph;
  compile(config: { mode: "inspect" }): CompileInspectResult;
  compile(config: { mode?: CompileMode } = {}): CompileInspectResult | SemanticAuthorGraph {
    return compileSource(this, config);
  }

  render(): PresentationIR {
    const source = this.#source[COMPOSITION_SOURCE]();
    if (hasMountedSources(source.entries)) {
      throw mountedSourceError();
    }

    return renderPresentation(
      this.#source.options,
      directSlideFactories(source.entries).map(
        (factory) => (input) =>
          factory({
            ...input,
            context: this.#sourceContext,
          } as never),
      ),
    );
  }

  async output(config: OutputConfig): Promise<void> {
    await outputPresentation(this.render(), config);
  }
}

export class Deck<TSourceContext = void> implements CompositionSource<TSourceContext> {
  readonly #options: DeckOptions;
  readonly #entries: CompositionEntry<TSourceContext>[] = [];
  readonly #stylesheets: StyleSheet[] = [];

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
      cycleId: this,
      boundContext: { present: false },
    };
  }

  useStyles(stylesheet: StyleSheet): this {
    this.#stylesheets.push(stylesheet);
    return this;
  }

  add(slide: SlideFactory<TSourceContext>): this {
    this.#entries.push({ kind: "slide", factory: slide });
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
    return this;
  }

  render(this: Deck<void>): PresentationIR {
    if (hasMountedSources(this.#entries)) {
      throw mountedSourceError();
    }

    return renderPresentation(this.#options, directSlideFactories(this.#entries));
  }

  compile(this: Deck<void>): SemanticAuthorGraph;
  compile(this: Deck<void>, config: { mode?: "strict" }): SemanticAuthorGraph;
  compile(this: Deck<void>, config: { mode: "inspect" }): CompileInspectResult;
  compile(
    this: Deck<void>,
    config: { mode?: CompileMode } = {},
  ): CompileInspectResult | SemanticAuthorGraph {
    return compileSource(this, config);
  }

  async output(this: Deck<void>, config: OutputConfig): Promise<void> {
    await outputPresentation(this.render(), config);
  }
}

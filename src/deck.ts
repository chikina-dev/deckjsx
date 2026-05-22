import { renderPresentation } from "./compiler";
import type { DeckOptions, OutputConfig, SlideFactory } from "./authoring/index";
import type { AuthorTreeNode } from "./authoring/tree";
import { SemanticGraphDiagnosticError } from "./diagnostics";
import { buildSemanticAuthorGraph, type SemanticAuthorGraph } from "./graph";
import type { PresentationIR } from "./ir/index";
import { outputPresentation } from "./node";

export type CompileMode = "inspect" | "strict";

export type CompileInspectResult = {
  readonly graph?: SemanticAuthorGraph;
  readonly diagnostics: import("./diagnostics").Diagnostics;
};

export class Deck {
  readonly #options: DeckOptions;
  readonly #slides: SlideFactory[] = [];

  constructor(options: DeckOptions) {
    this.#options = options;
  }

  add(slide: SlideFactory): this {
    this.#slides.push(slide);
    return this;
  }

  render(): PresentationIR {
    return renderPresentation(this.#options, this.#slides);
  }

  compile(): SemanticAuthorGraph;
  compile(config: { mode?: "strict" }): SemanticAuthorGraph;
  compile(config: { mode: "inspect" }): CompileInspectResult;
  compile(config: { mode?: CompileMode } = {}): CompileInspectResult | SemanticAuthorGraph {
    const roots = this.#slides.map((factory, slideIndex) =>
      factory({
        slideIndex,
        totalSlides: this.#slides.length,
        context: {
          slideIndex,
          totalSlides: this.#slides.length,
        },
      }),
    );
    const result = buildSemanticAuthorGraph(roots as AuthorTreeNode[]);

    if (config.mode === "inspect") {
      return result;
    }

    if (result.diagnostics.hasErrors) {
      throw new SemanticGraphDiagnosticError(result.diagnostics);
    }

    if (!result.graph) {
      throw new SemanticGraphDiagnosticError(result.diagnostics);
    }

    return result.graph;
  }

  async output(config: OutputConfig): Promise<void> {
    await outputPresentation(this.render(), config);
  }
}

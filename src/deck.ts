import { renderPresentation } from "./compiler";
import type { DeckOptions, OutputConfig, SlideFactory } from "./authoring/index";
import { isLegacyAuthorNode } from "./authoring/legacy";
import { isAuthorTreeNode, type AuthorElementNode, type AuthorTreeNode } from "./authoring/tree";
import {
  createDiagnostics,
  diagnostic,
  SemanticGraphDiagnosticError,
  type Diagnostic,
  type Diagnostics,
} from "./diagnostics";
import { buildSemanticAuthorGraph, type SemanticAuthorGraph } from "./graph";
import type { PresentationIR } from "./ir/index";
import { outputPresentation } from "./node";

export type CompileMode = "inspect" | "strict";

export type CompileInspectResult = {
  readonly graph?: SemanticAuthorGraph;
  readonly diagnostics: Diagnostics;
};

function isSlideRoot(value: AuthorTreeNode): value is AuthorElementNode {
  return (
    value.kind === "element" &&
    value.source.kind === "component" &&
    value.source.component === "Slide"
  );
}

function describeInvalidRoot(value: unknown): string {
  if (isLegacyAuthorNode(value)) {
    return "Slide factory returned a legacy author node.";
  }

  if (isAuthorTreeNode(value)) {
    return "Slide factory returned an author tree node that is not a <Slide /> root.";
  }

  if (value === null) {
    return "Slide factory returned null.";
  }

  return `Slide factory returned ${typeof value}.`;
}

function invalidRootSourceSpan(value: unknown) {
  return isAuthorTreeNode(value) ? value.sourceSpan : undefined;
}

function invalidRootDiagnostic(value: unknown, slideIndex: number): Diagnostic {
  const path = `document > slideFactory[${slideIndex}]`;
  return diagnostic({
    severity: "error",
    code: "E_COMPILE_ROOT",
    title: "slide factory must return a <Slide /> root",
    message: describeInvalidRoot(value),
    labels: [
      {
        path,
        message: "Expected a deckjsx Author Tree <Slide /> node.",
        ...(invalidRootSourceSpan(value) ? { sourceSpan: invalidRootSourceSpan(value) } : {}),
      },
    ],
    help: ["Return <Slide>...</Slide> from the slide factory passed to deck.add()."],
  });
}

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
    const roots: AuthorElementNode[] = [];
    const diagnostics: Diagnostic[] = [];

    this.#slides.forEach((factory, slideIndex) => {
      const root = factory({
        slideIndex,
        totalSlides: this.#slides.length,
        context: {
          slideIndex,
          totalSlides: this.#slides.length,
        },
      });

      if (!isAuthorTreeNode(root) || !isSlideRoot(root)) {
        diagnostics.push(invalidRootDiagnostic(root, slideIndex));
        return;
      }

      roots.push(root);
    });

    if (diagnostics.length > 0) {
      const result = {
        diagnostics: createDiagnostics(diagnostics),
      };

      if (config.mode === "inspect") {
        return result;
      }

      throw new SemanticGraphDiagnosticError(result.diagnostics);
    }

    const result = buildSemanticAuthorGraph(roots);

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

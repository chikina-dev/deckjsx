import type { Diagnostics } from "./index";
import { formatDiagnostics } from "./format";

export class DeckDiagnosticError extends Error {
  readonly diagnostics: Diagnostics;

  constructor(message: string, diagnostics: Diagnostics) {
    super(message);
    this.name = "DeckDiagnosticError";
    this.diagnostics = diagnostics;
  }
}

export class SemanticGraphDiagnosticError extends DeckDiagnosticError {
  constructor(diagnostics: Diagnostics) {
    super(formatDiagnostics(diagnostics), diagnostics);
    this.name = "SemanticGraphDiagnosticError";
  }
}

export class CompositionDiagnosticError extends DeckDiagnosticError {
  constructor(diagnostics: Diagnostics) {
    super(formatDiagnostics(diagnostics), diagnostics);
    this.name = "CompositionDiagnosticError";
  }
}

export class StyleDiagnosticError extends DeckDiagnosticError {
  constructor(diagnostics: Diagnostics) {
    super(formatDiagnostics(diagnostics), diagnostics);
    this.name = "StyleDiagnosticError";
  }
}

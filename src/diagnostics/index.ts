export type DiagnosticSeverity = "error" | "warning";

/**
 * Public source-location summary attached to diagnostics.
 *
 * This shape is diagnostic metadata only. It mirrors the fields deckjsx can receive from development
 * JSX runtimes without exposing Author Tree node types through the root authoring API.
 */
export type DiagnosticSourceSpan = {
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
};

export type DiagnosticLabel = {
  readonly message: string;
  readonly path: string;
  readonly sourceSpan?: DiagnosticSourceSpan;
  readonly severity?: "primary" | "secondary";
};

export type Diagnostic = {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly title: string;
  readonly message?: string;
  readonly labels: readonly DiagnosticLabel[];
  readonly notes?: readonly string[];
  readonly help?: readonly string[];
};

export type Diagnostics = {
  readonly items: readonly Diagnostic[];
  readonly hasErrors: boolean;
  readonly hasWarnings: boolean;
};

export function createDiagnostics(items: readonly Diagnostic[] = []): Diagnostics {
  return {
    items,
    hasErrors: items.some((item) => item.severity === "error"),
    hasWarnings: items.some((item) => item.severity === "warning"),
  };
}

export function diagnostic(input: Diagnostic): Diagnostic {
  return input;
}

export {
  CompositionDiagnosticError,
  DeckDiagnosticError,
  SemanticGraphDiagnosticError,
  StyleDiagnosticError,
} from "./errors";
export { formatDiagnostic, formatDiagnostics } from "./format";

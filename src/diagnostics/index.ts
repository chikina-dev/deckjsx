import type { SourceSpan } from "../authoring/tree";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticLabel = {
  readonly message: string;
  readonly path: string;
  readonly sourceSpan?: SourceSpan;
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

export { DeckDiagnosticError, SemanticGraphDiagnosticError } from "./errors";
export { formatDiagnostic, formatDiagnostics } from "./format";

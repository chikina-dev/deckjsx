import type { DeckjsxDevCompilerEvent } from "../dev-compiler";
import type { DeckjsxDevDiagnostic } from "../dev-diagnostics";

export type InteractiveDiagnosticSnapshotValue = {
  readonly compilation?: number;
  readonly diagnostics: readonly DeckjsxDevDiagnostic[];
};

export type InteractiveDiagnosticSnapshot = {
  applyCompilerEvent(event: DeckjsxDevCompilerEvent): void;
  replace(input: InteractiveDiagnosticSnapshotValue): void;
  current(): InteractiveDiagnosticSnapshotValue;
};

export function createInteractiveDiagnosticSnapshot(): InteractiveDiagnosticSnapshot {
  let current: InteractiveDiagnosticSnapshotValue = { diagnostics: [] };

  return {
    applyCompilerEvent(event) {
      if (event.type === "diagnostic") {
        current = {
          ...current,
          diagnostics: [...current.diagnostics, event.diagnostic],
        };
        return;
      }
      if (event.type === "compilationFinished") {
        current = {
          compilation: event.result.compilation,
          diagnostics: event.result.diagnostics,
        };
      }
    },
    replace(input) {
      current = {
        ...(input.compilation !== undefined ? { compilation: input.compilation } : {}),
        diagnostics: input.diagnostics,
      };
    },
    current() {
      return current;
    },
  };
}

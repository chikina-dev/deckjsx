import {
  CompositionDiagnosticError,
  DeckDiagnosticError,
  SemanticGraphDiagnosticError,
  StyleDiagnosticError,
  createDiagnostics,
  diagnostic,
  formatDiagnostic,
  formatDiagnostics,
} from "@/src/diagnostics";
import { describe, expect, test } from "vite-plus/test";

describe("diagnostics public contract", () => {
  const item = diagnostic({
    severity: "warning",
    code: "W_TEST_DIAGNOSTIC",
    title: "test warning",
    message: "Something needs attention.",
    labels: [{ path: "slides.0", message: "check this value", severity: "primary" }],
    notes: ["The original value is preserved."],
    help: ["Use a supported value."],
  });
  const diagnostics = createDiagnostics([item]);

  test("formats complete diagnostics deterministically", () => {
    expect(formatDiagnostic(item)).toBe(
      [
        "warning[W_TEST_DIAGNOSTIC]: test warning",
        "  Something needs attention.",
        "  at slides.0",
        "   = check this value",
        "note: The original value is preserved.",
        "help: Use a supported value.",
      ].join("\n"),
    );
    expect(formatDiagnostics(createDiagnostics([item, item]))).toBe(
      `${formatDiagnostic(item)}\n\n${formatDiagnostic(item)}`,
    );
  });

  test.each([
    ["SemanticGraphDiagnosticError", SemanticGraphDiagnosticError],
    ["CompositionDiagnosticError", CompositionDiagnosticError],
    ["StyleDiagnosticError", StyleDiagnosticError],
  ] as const)(
    "%s preserves diagnostics and formatted message",
    (name: string, ErrorClass: new (input: typeof diagnostics) => DeckDiagnosticError) => {
      const error = new ErrorClass(diagnostics);

      expect(error).toBeInstanceOf(DeckDiagnosticError);
      expect(error.name).toBe(name);
      expect(error.message).toBe(formatDiagnostics(diagnostics));
      expect(error.diagnostics).toBe(diagnostics);
    },
  );
});

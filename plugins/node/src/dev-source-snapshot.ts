import path from "node:path";
import type { DeckjsxDevDiagnostic } from "./dev-diagnostics";

export type DeckjsxDevExecutableSourceSnapshot = {
  readonly status: "executable";
  readonly code: string;
  readonly moduleIds: readonly string[];
  readonly watchFiles: readonly string[];
  readonly changedSourceIds: readonly string[];
};

export type DeckjsxDevDiagnosticSourceSnapshot = {
  readonly status: "diagnostic";
  readonly diagnostics: readonly DeckjsxDevDiagnostic[];
};

export type DeckjsxDevSourceSnapshot =
  | DeckjsxDevExecutableSourceSnapshot
  | DeckjsxDevDiagnosticSourceSnapshot;

export function createExecutableSourceSnapshot(input: {
  readonly cwd?: string;
  readonly code: string;
  readonly moduleIds: readonly string[];
  readonly watchFiles: readonly string[];
  readonly changedSourceIds: readonly string[];
}): DeckjsxDevExecutableSourceSnapshot {
  const cwd = input.cwd ? path.resolve(input.cwd) : process.cwd();
  return {
    status: "executable",
    code: input.code,
    moduleIds: normalizePaths(cwd, input.moduleIds),
    watchFiles: normalizePaths(cwd, input.watchFiles),
    changedSourceIds: normalizePaths(cwd, input.changedSourceIds),
  };
}

export function createDiagnosticSourceSnapshot(
  diagnostics: readonly DeckjsxDevDiagnostic[],
): DeckjsxDevDiagnosticSourceSnapshot {
  return {
    status: "diagnostic",
    diagnostics,
  };
}

export function isExecutableSourceSnapshot(
  snapshot: DeckjsxDevSourceSnapshot,
): snapshot is DeckjsxDevExecutableSourceSnapshot {
  return snapshot.status === "executable";
}

function normalizePaths(cwd: string, files: readonly string[]): readonly string[] {
  return [...new Set(files.map((file) => path.resolve(cwd, file)))].sort();
}

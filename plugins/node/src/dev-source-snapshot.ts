import path from "node:path";
import type { RenderExecutionContext } from "deckjsx/integration";
import type { DeckjsxDevDiagnostic } from "./dev-diagnostics";

export type DeckjsxDevExecutionSnapshot = {
  readonly entry: string;
  readonly entries: readonly [string, ...string[]];
  readonly out?: string;
  readonly outputs?: readonly string[];
  readonly renderExecutionContext: RenderExecutionContext;
};

/**
 * Bundled source snapshot that can be executed by the Node dev compiler.
 *
 * Paths are normalized to absolute paths by the helper constructor so invalidation and watch
 * comparisons remain stable across equivalent relative inputs.
 */
export type DeckjsxDevExecutableSourceSnapshot = {
  readonly status: "executable";
  /** JavaScript source code to execute for this compilation cycle. */
  readonly code: string;
  /** Module ids represented by the bundled source. */
  readonly moduleIds: readonly string[];
  /** Files the source provider wants the dev compiler to watch. */
  readonly watchFiles: readonly string[];
  /** Source or asset ids that changed for this snapshot. */
  readonly changedSourceIds: readonly string[];
  /** Non-fatal Host resolution diagnostics paired with this source generation. */
  readonly diagnostics?: readonly DeckjsxDevDiagnostic[];
  /** Host execution inputs captured atomically with this source generation. */
  readonly execution?: DeckjsxDevExecutionSnapshot;
};

/** Source snapshot used when bundling failed and no executable source is available. */
export type DeckjsxDevDiagnosticSourceSnapshot = {
  readonly status: "diagnostic";
  /** Diagnostics explaining why the source cannot be executed. */
  readonly diagnostics: readonly DeckjsxDevDiagnostic[];
};

/** Source snapshot returned by a `DevSourceProvider`. */
export type DeckjsxDevSourceSnapshot =
  | DeckjsxDevExecutableSourceSnapshot
  | DeckjsxDevDiagnosticSourceSnapshot;

/**
 * Create an executable source snapshot with normalized paths.
 *
 * @param input - Bundled source code plus module, watch, and changed-source path lists.
 * @returns A source snapshot accepted by the dev compiler.
 */
export function createExecutableSourceSnapshot(input: {
  readonly cwd?: string;
  readonly code: string;
  readonly moduleIds: readonly string[];
  readonly watchFiles: readonly string[];
  readonly changedSourceIds: readonly string[];
  readonly diagnostics?: readonly DeckjsxDevDiagnostic[];
  readonly execution?: DeckjsxDevExecutionSnapshot;
}): DeckjsxDevExecutableSourceSnapshot {
  const cwd = input.cwd ? path.resolve(input.cwd) : process.cwd();
  return {
    status: "executable",
    code: input.code,
    moduleIds: normalizePaths(cwd, input.moduleIds),
    watchFiles: normalizePaths(cwd, input.watchFiles),
    changedSourceIds: normalizePaths(cwd, input.changedSourceIds),
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
    ...(input.execution ? { execution: input.execution } : {}),
  };
}

/**
 * Create a diagnostic source snapshot for bundle/provider failures.
 *
 * @param diagnostics - Diagnostics to report for the failed source snapshot.
 * @returns A non-executable source snapshot.
 */
export function createDiagnosticSourceSnapshot(
  diagnostics: readonly DeckjsxDevDiagnostic[],
): DeckjsxDevDiagnosticSourceSnapshot {
  return {
    status: "diagnostic",
    diagnostics,
  };
}

/** Return whether a dev source snapshot contains executable code. */
export function isExecutableSourceSnapshot(
  snapshot: DeckjsxDevSourceSnapshot,
): snapshot is DeckjsxDevExecutableSourceSnapshot {
  return snapshot.status === "executable";
}

function normalizePaths(cwd: string, files: readonly string[]): readonly string[] {
  return [...new Set(files.map((file) => path.resolve(cwd, file)))].sort();
}

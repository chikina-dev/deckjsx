import path from "node:path";
import type { IncrementalArtifactWriteRecord } from "deckjsx/integration";
import {
  missingTrackedOutputDiagnostic,
  outputWriteFailedDiagnostic,
  type DeckjsxDevDiagnostic,
} from "./dev-diagnostics";

export type { DeckjsxDevDiagnostic } from "./dev-diagnostics";

/** Write record captured from a deckjsx render cycle during Node dev output tracking. */
export type DeckjsxDevWriteRecord = {
  /** Output path reported by the writer integration. */
  readonly path: string;
  /** Whether the output belongs to the configured `out`/`outputs` set. */
  readonly tracked: boolean;
  /** Writer-specific result payload. */
  readonly result: object;
};

/** Normalized output paths used by `@deckjsx/node/dev`. */
export type NormalizedDevOutputPaths = {
  /** Primary output path. */
  readonly out: string;
  /** Primary plus additional output paths. */
  readonly outputs: readonly string[];
};

/** Classification of writes produced by one dev compilation cycle. */
export type ClassifiedDevWrites = {
  /** Write records observed during the cycle. */
  readonly records: readonly DeckjsxDevWriteRecord[];
  /** Output slot indexes retained from earlier cycles. */
  readonly retainedSlots: readonly number[];
  /** Diagnostics for missing, unexpected, or failed tracked writes. */
  readonly diagnostics: readonly DeckjsxDevDiagnostic[];
};

/**
 * Plan for whether a dev compilation can update the configured artifacts.
 *
 * `ready` means all required tracked outputs are present. `blocked` means the compilation produced
 * diagnostics that should prevent the host from treating artifacts as updated.
 */
export type DeckjsxDevArtifactPlan = {
  readonly status: "ready" | "blocked";
  readonly writes: readonly DeckjsxDevWriteRecord[];
  readonly retainedSlots: readonly number[];
  readonly diagnostics: readonly DeckjsxDevDiagnostic[];
};

export function normalizeDevOutputPaths(input: {
  readonly cwd: string;
  readonly out: string;
  readonly outputs?: readonly string[];
}): NormalizedDevOutputPaths {
  const cwd = path.resolve(input.cwd);
  const out = path.resolve(cwd, input.out);
  const extraOutputs = (input.outputs ?? [])
    .map((output) => path.resolve(cwd, output))
    .filter((output) => output !== out);
  const outputs = [out, ...uniqueSorted(extraOutputs)];
  return {
    out,
    outputs,
  };
}

export function classifyDevWrites(input: {
  readonly cwd: string;
  readonly out: string;
  readonly outputs?: readonly string[];
  readonly writes: readonly IncrementalArtifactWriteRecord[];
}): ClassifiedDevWrites {
  const cwd = path.resolve(input.cwd);
  const normalized = normalizeDevOutputPaths({ ...input, cwd });
  const records = input.writes.map((write) => {
    const writePath = path.resolve(cwd, write.path);
    return {
      path: writePath,
      tracked: writePath === normalized.out,
      result: write.result,
    };
  });
  const failedWrites = input.writes.flatMap((write) => {
    const writePath = path.resolve(cwd, write.path);
    return isFailedWriteResult(write.result)
      ? [
          {
            path: writePath,
            diagnostics: diagnosticsFromWriteResult(write.result),
          },
        ]
      : [];
  });
  const successfulTrackedSlots = input.writes.flatMap((write) =>
    path.resolve(cwd, write.path) === normalized.out && !isFailedWriteResult(write.result)
      ? [write.slot]
      : [],
  );
  const retainedSlots = failedWrites.length > 0 ? [] : uniqueSortedNumbers(successfulTrackedSlots);
  const diagnostics: readonly DeckjsxDevDiagnostic[] = [
    ...failedWrites.map(({ path: writePath, diagnostics }) =>
      outputWriteFailedDiagnostic({
        relativePath: path.relative(cwd, writePath),
        file: writePath,
        notes: diagnostics,
      }),
    ),
    ...(successfulTrackedSlots.length > 0 || failedWrites.length > 0
      ? []
      : [
          missingTrackedOutputDiagnostic({
            relativePath: path.relative(cwd, normalized.out),
            file: normalized.out,
          }),
        ]),
  ];

  return {
    records,
    retainedSlots,
    diagnostics,
  };
}

export function planDevArtifactUpdate(input: {
  readonly cwd: string;
  readonly out: string;
  readonly outputs?: readonly string[];
  readonly writes: readonly IncrementalArtifactWriteRecord[];
}): DeckjsxDevArtifactPlan {
  const classified = classifyDevWrites(input);
  return {
    status: classified.diagnostics.length === 0 ? "ready" : "blocked",
    writes: classified.records,
    retainedSlots: classified.retainedSlots,
    diagnostics: classified.diagnostics,
  };
}

export function devOutputIgnoreFiles(input: {
  readonly cwd: string;
  readonly out: string;
  readonly outputs?: readonly string[];
}): readonly string[] {
  const normalized = normalizeDevOutputPaths(input);
  const outputDirectories = uniqueSorted(normalized.outputs.map((output) => path.dirname(output)));
  return uniqueSorted([
    ...normalized.outputs,
    ...outputDirectories.map((directory) => path.join(directory, ".deckjsx-lock")),
    ...normalized.outputs.map((output) =>
      path.join(path.dirname(output), `.${path.basename(output)}.deckjsx-lock`),
    ),
  ]);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function uniqueSortedNumbers(values: readonly number[]): readonly number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function isFailedWriteResult(result: object): boolean {
  return "status" in result && result.status === "failed";
}

function diagnosticsFromWriteResult(result: object): readonly string[] {
  if (!("diagnostics" in result) || !Array.isArray(result.diagnostics)) {
    return [];
  }
  return result.diagnostics.flatMap((diagnostic) => {
    if (!isObject(diagnostic) || typeof diagnostic.code !== "string") {
      return [];
    }
    const message = typeof diagnostic.message === "string" ? `: ${diagnostic.message}` : "";
    return [`${diagnostic.code}${message}`];
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

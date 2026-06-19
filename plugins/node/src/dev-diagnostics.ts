export type DeckjsxDevDiagnosticSeverity = "error" | "warning" | "note";

export type DeckjsxDevDiagnosticPhase = "bundle" | "entry" | "output";

export type DeckjsxDevDiagnosticSpan = {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly sourceLine?: string;
  readonly spanLength?: number;
};

export type DeckjsxDevDiagnosticLabel = {
  readonly message: string;
  readonly span?: DeckjsxDevDiagnosticSpan;
};

export type DeckjsxDevDiagnostic = {
  readonly severity: DeckjsxDevDiagnosticSeverity;
  readonly code: string;
  readonly title: string;
  readonly message?: string;
  readonly primary?: DeckjsxDevDiagnosticSpan;
  readonly labels?: readonly DeckjsxDevDiagnosticLabel[];
  readonly notes?: readonly string[];
  readonly help?: readonly string[];
  readonly phase?: DeckjsxDevDiagnosticPhase;
  readonly compilation?: number;
};

export function annotateDevDiagnostics(
  diagnostics: readonly DeckjsxDevDiagnostic[],
  annotation: {
    readonly phase: DeckjsxDevDiagnosticPhase;
    readonly compilation: number;
  },
): readonly DeckjsxDevDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    phase: diagnostic.phase ?? annotation.phase,
    compilation: diagnostic.compilation ?? annotation.compilation,
  }));
}

export function cliUsageDiagnostic(input: {
  readonly code: string;
  readonly title: string;
}): DeckjsxDevDiagnostic {
  return {
    severity: "error",
    code: input.code,
    title: input.title,
  };
}

export function entryFailedDiagnostic(input: {
  readonly error: unknown;
  readonly file: string;
}): DeckjsxDevDiagnostic {
  return {
    severity: "error",
    code: "deckjsx.node.dev.entryFailed",
    title: "Entry execution failed.",
    message: errorMessage(input.error),
    primary: { file: input.file },
    labels: [{ message: "while importing the generated entry module" }],
    help: ["Fix the entry module and save again."],
  };
}

export function missingTrackedOutputDiagnostic(input: {
  readonly relativePath: string;
  readonly file: string;
}): DeckjsxDevDiagnostic {
  return {
    severity: "error",
    code: "deckjsx.node.dev.missingTrackedOutput",
    title: "Tracked output was not written.",
    message: input.relativePath,
    primary: { file: input.file },
    phase: "output",
    help: ["Make sure the entry calls write(...) for the same path passed to deckjsx dev --out."],
  };
}

export function outputWriteFailedDiagnostic(input: {
  readonly relativePath: string;
  readonly file: string;
  readonly notes: readonly string[];
}): DeckjsxDevDiagnostic {
  return {
    severity: "error",
    code: "deckjsx.node.dev.outputWriteFailed",
    title: "Output write failed.",
    message: input.relativePath,
    primary: { file: input.file },
    phase: "output",
    ...(input.notes.length > 0 ? { notes: input.notes } : {}),
  };
}

export function bundleMissingChunkDiagnostic(input: {
  readonly message: string;
  readonly notes: readonly string[];
}): DeckjsxDevDiagnostic {
  return {
    severity: "error",
    code: "deckjsx.node.dev.bundleMissingChunk",
    title: "Bundle output was missing.",
    message: input.message,
    notes: input.notes,
    help: ["Check the Rolldown watch result and generated entry output."],
  };
}

export function bundleFailedDiagnosticFromError(
  error: unknown,
  fallbackFile: string,
): DeckjsxDevDiagnostic {
  const location = isObject(error) && isObject(error.loc) ? error.loc : undefined;
  const frame = isObject(error) && typeof error.frame === "string" ? error.frame : undefined;
  const line = numberProperty(location, "line");
  const column = numberProperty(location, "column");
  const file =
    isObject(error) && typeof error.id === "string"
      ? error.id
      : location && typeof location.file === "string"
        ? location.file
        : fallbackFile;
  const primary = {
    file,
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
    ...(line !== undefined && frame ? { sourceLine: sourceLineFromFrame(frame, line) } : {}),
    ...(line !== undefined && frame ? { spanLength: spanLengthFromFrame(frame, line) } : {}),
  } satisfies DeckjsxDevDiagnosticSpan;

  return {
    severity: "error",
    code: "deckjsx.node.dev.bundleFailed",
    title: "Bundle failed.",
    message: errorMessage(error),
    primary,
    labels: [
      {
        message:
          line !== undefined ? "while bundling this source" : "while bundling the deckjsx entry",
      },
    ],
    help: ["Fix the bundling error and save again."],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (isObject(error) && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function sourceLineFromFrame(frame: string, line: number): string | undefined {
  const prefix = new RegExp(`^\\s*${line}\\s*\\|\\s?(.*)$`);
  for (const frameLine of frame.split(/\r?\n/)) {
    const match = prefix.exec(frameLine);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return undefined;
}

function spanLengthFromFrame(frame: string, line: number): number | undefined {
  const lines = frame.split(/\r?\n/);
  const sourceLineIndex = lines.findIndex((frameLine) =>
    new RegExp(`^\\s*${line}\\s*\\|`).test(frameLine),
  );
  const caretLine = sourceLineIndex >= 0 ? lines[sourceLineIndex + 1] : undefined;
  const caretMatch = caretLine ? /\|(\s*)(\^+)/.exec(caretLine) : undefined;
  return caretMatch?.[2]?.length;
}

function numberProperty(value: unknown, key: string): number | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const property = value[key];
  return typeof property === "number" ? property : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

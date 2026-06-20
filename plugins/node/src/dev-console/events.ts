import type { DeckjsxDevCompilerEvent } from "../dev-compiler";
import type { DeckjsxDevCompilationResult } from "../dev-compilation";
import type { DeckjsxDevDiagnostic } from "../dev-diagnostics";
import type { DeckjsxDevWriteRecord } from "../tracked-output-coordinator";

export type DevConsoleEvent =
  | {
      readonly kind: "dev.started";
      readonly entry?: string;
    }
  | {
      readonly kind: "dev.ready";
      readonly compilation: number;
      readonly changedSourceIds: readonly string[];
      readonly diagnostics: readonly DeckjsxDevDiagnostic[];
      readonly writes: readonly DeckjsxDevWriteRecord[];
    }
  | {
      readonly kind: "dev.blocked" | "dev.error";
      readonly compilation: number;
      readonly changedSourceIds: readonly string[];
      readonly diagnostics: readonly DeckjsxDevDiagnostic[];
      readonly writes?: readonly DeckjsxDevWriteRecord[];
    }
  | {
      readonly kind: "diagnostic";
      readonly diagnostic: DeckjsxDevDiagnostic;
    };

export function normalizeDevConsoleEvent(
  event: DeckjsxDevCompilerEvent | { readonly type: "devStarted"; readonly entry?: string },
): DevConsoleEvent | undefined {
  if (event.type === "devStarted") {
    return {
      kind: "dev.started",
      ...(event.entry ? { entry: event.entry } : {}),
    };
  }
  if (event.type === "diagnostic") {
    return { kind: "diagnostic", diagnostic: event.diagnostic };
  }
  if (event.type !== "compilationFinished") {
    return undefined;
  }
  return devConsoleEventFromCompilationResult(event.result);
}

export function devConsoleEventFromCompilationResult(
  result: DeckjsxDevCompilationResult,
): DevConsoleEvent {
  const changedSourceIds = changedSourceIdsFromCompilationResult(result);
  if (result.status === "artifactUpdated") {
    return {
      kind: "dev.ready",
      compilation: result.compilation,
      changedSourceIds,
      diagnostics: result.diagnostics,
      writes: result.writes,
    };
  }
  if (result.status === "outputBlocked") {
    return {
      kind: "dev.blocked",
      compilation: result.compilation,
      changedSourceIds,
      diagnostics: result.diagnostics,
      writes: result.writes,
    };
  }
  return {
    kind: "dev.error",
    compilation: result.compilation,
    changedSourceIds,
    diagnostics: result.diagnostics,
  };
}

function changedSourceIdsFromCompilationResult(
  result: DeckjsxDevCompilationResult,
): readonly string[] {
  return "sourceSnapshot" in result &&
    "changedSourceIds" in result.sourceSnapshot &&
    Array.isArray(result.sourceSnapshot.changedSourceIds)
    ? result.sourceSnapshot.changedSourceIds.filter(
        (sourceId): sourceId is string => typeof sourceId === "string",
      )
    : [];
}

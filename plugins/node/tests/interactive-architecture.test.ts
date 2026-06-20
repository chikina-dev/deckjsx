import { describe, expect, test } from "vite-plus/test";
import { createInteractiveDiagnosticSnapshot } from "../src/interactive/diagnostic-snapshot.ts";
import {
  createInteractiveInspectorModel,
  isInteractiveResult,
} from "../src/interactive/inspector-model.ts";
import { normalizeDevConsoleEvent } from "../src/dev-console/events.ts";
import type { DeckjsxDevDiagnostic } from "../src/dev-diagnostics.ts";

describe("interactive architecture boundaries", () => {
  test("diagnostic snapshot accumulates diagnostic events until a compilation result replaces them", () => {
    const snapshot = createInteractiveDiagnosticSnapshot();
    const first = diagnostic("E_FIRST");
    const second = diagnostic("E_SECOND");

    snapshot.applyCompilerEvent({ type: "diagnostic", diagnostic: first });
    snapshot.applyCompilerEvent({ type: "diagnostic", diagnostic: second });

    expect(snapshot.current()).toEqual({
      diagnostics: [first, second],
    });

    snapshot.applyCompilerEvent({
      type: "compilationFinished",
      result: {
        ok: false,
        status: "entryFailed",
        compilation: 8,
        sourceSnapshot: {
          status: "executable",
          code: "",
          moduleIds: [],
          watchFiles: [],
          changedSourceIds: [],
        },
        diagnostics: [second],
      },
    });

    expect(snapshot.current()).toEqual({
      compilation: 8,
      diagnostics: [second],
    });
  });

  test("inspector model is the owner of command result DTOs", async () => {
    const diagnostics = createInteractiveDiagnosticSnapshot();
    diagnostics.applyCompilerEvent({
      type: "diagnostic",
      diagnostic: diagnostic("E_ENTRY"),
    });
    const model = createInteractiveInspectorModel({
      diagnostics,
      artifactSession: undefined,
      inspectionStore: undefined,
      now: () => 10,
    });

    const response = await model.dispatch({ method: "diagnostics.list" });

    expect(response.ok).toBe(true);
    if (!response.ok || !isInteractiveResult(response.result)) {
      throw new Error("Expected diagnostics.list to return a typed interactive result.");
    }
    expect(response.result.kind).toBe("diagnostics.list");
  });

  test("inspector model does not mutate an externally owned diagnostic snapshot", () => {
    const diagnostics = createInteractiveDiagnosticSnapshot();
    const model = createInteractiveInspectorModel({
      diagnostics,
      artifactSession: undefined,
      inspectionStore: undefined,
      now: () => 10,
    });

    model.applyCompilerEvent({ type: "diagnostic", diagnostic: diagnostic("E_EXTERNAL") });

    expect(diagnostics.current().diagnostics).toEqual([]);
  });

  test("interactive results reject unknown structural DTO drift", () => {
    const result = {
      nodeId: "node-1",
      sourceKey: "deck:root",
      slot: 0,
      style: { color: "blue" },
      traces: { color: { property: "color" } },
    };

    expect(isInteractiveResult(result)).toBe(false);
  });

  test("dev compiler events normalize before rendering", () => {
    expect(
      normalizeDevConsoleEvent({
        type: "compilationFinished",
        result: {
          ok: true,
          status: "artifactUpdated",
          compilation: 3,
          sourceSnapshot: {
            status: "executable",
            code: "",
            moduleIds: [],
            watchFiles: [],
            changedSourceIds: ["/project/src/main.tsx"],
          },
          artifactPlan: { status: "ready", writes: [], diagnostics: [], retainedSlots: [] },
          graph: {
            files: [],
            moduleIds: [],
            watchFiles: [],
            observedAssetFiles: [],
            ignoredFiles: [],
          },
          writes: [],
          retainedSlots: [],
          diagnostics: [],
        },
      }),
    ).toEqual({
      kind: "dev.ready",
      compilation: 3,
      changedSourceIds: ["/project/src/main.tsx"],
      diagnostics: [],
      writes: [],
    });
  });
});

function diagnostic(code: string): DeckjsxDevDiagnostic {
  return {
    severity: "error",
    code,
    title: `${code} title`,
  };
}

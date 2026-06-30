import { describe, expect, test } from "vite-plus/test";
import { createInteractiveDevSession } from "@/src/interactive/session.ts";
import { createNodeDevInspectionStore } from "@/src/dev-inspection-store.ts";
import type { DeckjsxDevCompiler, DeckjsxDevCompilerEvent } from "@/src/dev-compiler.ts";
import type { DeckjsxDevCompilationResult } from "@/src/dev-compilation.ts";
import type { IncrementalArtifactSession } from "deckjsx/integration";

function createFakeCompiler(): {
  readonly compiler: DeckjsxDevCompiler;
  readonly emit: (event: DeckjsxDevCompilerEvent) => void;
} {
  const listeners = new Set<(event: DeckjsxDevCompilerEvent) => void>();
  return {
    compiler: {
      on(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      start() {},
      invalidate() {},
      async runNextCompilation() {
        throw new Error("not used");
      },
      async close() {},
    },
    emit: (event) => {
      listeners.forEach((listener) => listener(event));
    },
  };
}

type FakeArtifactSlot = {
  readonly slot: number;
  readonly artifacts: {
    readonly graphsBySourceKey?: ReadonlyMap<string, unknown>;
    readonly projection?: { readonly projection: unknown };
  };
};

function createFakeArtifactSession(slots: readonly FakeArtifactSlot[]): IncrementalArtifactSession {
  return {
    cycle: 1,
    beginCycle() {
      throw new Error("not used");
    },
    retainArtifactSlots() {},
    snapshot() {
      return { cycle: 1, writes: [] };
    },
    inspectArtifacts() {
      return {
        retainedSlots() {
          return slots.map((slot) => slot.slot);
        },
        graphNode(nodeId) {
          for (const slot of slots) {
            for (const [sourceKey, graph] of slot.artifacts.graphsBySourceKey ?? new Map()) {
              const graphRecord = graph as {
                readonly graph?: { readonly nodes?: ReadonlyMap<string, unknown> };
                readonly resolvedStyles?: ReadonlyMap<string, unknown>;
              };
              const node = graphRecord.graph?.nodes?.get(nodeId);
              if (node) {
                return {
                  slot: slot.slot,
                  sourceKey,
                  graph,
                  node,
                  ...(graphRecord.resolvedStyles?.get(nodeId)
                    ? { resolvedStyle: graphRecord.resolvedStyles.get(nodeId) }
                    : {}),
                } as never;
              }
            }
          }
          return undefined;
        },
        projectionForSlot(slot) {
          return slots.find((entry) => entry.slot === slot)?.artifacts.projection?.projection;
        },
        firstProjection() {
          for (const slot of slots) {
            const projection = slot.artifacts.projection;
            if (projection) {
              return { slot: slot.slot, projection: projection.projection };
            }
          }
          return undefined;
        },
      };
    },
  };
}

describe("@deckjsx/node interactive dev session", () => {
  test("session.help points to completion and external command reference", async () => {
    const { compiler } = createFakeCompiler();
    const session = createInteractiveDevSession({ compiler });

    await expect(session.dispatch({ method: "session.help" })).resolves.toEqual({
      ok: true,
      result: {
        kind: "session.help",
        title: "Interactive help",
        hints: [
          "Press Tab for contextual command completion.",
          "Run deckjsx dev --interactive-help for the full command reference.",
        ],
      },
    });
  });

  test("unknown commands return suggestions", async () => {
    const { compiler } = createFakeCompiler();
    const session = createInteractiveDevSession({ compiler });

    await expect(session.dispatch({ method: "statsu" })).resolves.toEqual({
      ok: false,
      error: {
        code: "deckjsx.node.interactive.unknownCommand",
        message: "Unknown interactive command: statsu",
        suggestions: ["status"],
      },
    });
  });

  test("dispatches session.status without terminal IO", async () => {
    const { compiler, emit } = createFakeCompiler();
    const session = createInteractiveDevSession({ compiler });

    emit({ type: "compilerStarted" });
    const response = await session.dispatch({ method: "session.status" });

    expect(response).toEqual({
      ok: true,
      result: {
        compilerStarted: true,
        compilerClosed: false,
        lastCompilation: undefined,
        lastSuccessfulCompilation: undefined,
        skippedFailedAttempts: 0,
      },
    });
  });

  test("session.timings reports compiler duration and command latency", async () => {
    const { compiler, emit } = createFakeCompiler();
    const times = [10, 15, 45, 50, 54, 60, 61];
    const session = createInteractiveDevSession({
      compiler,
      now: () => times.shift() ?? 999,
    });

    emit({ type: "compilerStarted" });
    emit({ type: "compilationStarted", compilation: 1, changedSourceIds: [] });
    emit({
      type: "compilationFinished",
      result: {
        ok: true,
        status: "artifactUpdated",
        compilation: 1,
        diagnostics: [],
      } as unknown as DeckjsxDevCompilationResult,
    });
    await session.dispatch({ method: "session.status" });

    await expect(session.dispatch({ method: "session.timings" })).resolves.toEqual({
      ok: true,
      result: {
        compilerUptimeMs: 50,
        lastCompilationDurationMs: 30,
        commandCount: 1,
        lastCommandLatencyMs: 4,
      },
    });
  });

  test("tracks the last successful compilation and skipped failed attempts", async () => {
    const { compiler, emit } = createFakeCompiler();
    const session = createInteractiveDevSession({ compiler });

    emit({
      type: "compilationFinished",
      result: {
        ok: true,
        status: "artifactUpdated",
        compilation: 1,
        diagnostics: [],
      } as unknown as DeckjsxDevCompilationResult,
    });
    emit({
      type: "compilationFinished",
      result: {
        ok: false,
        status: "entryFailed",
        compilation: 2,
        diagnostics: [{ code: "deckjsx.node.dev.entryFailed" }],
      } as unknown as DeckjsxDevCompilationResult,
    });

    const response = await session.dispatch({ method: "session.status" });

    expect(response).toEqual({
      ok: true,
      result: expect.objectContaining({
        lastCompilation: 2,
        lastSuccessfulCompilation: 1,
        skippedFailedAttempts: 1,
      }),
    });
  });

  test("history.changes compares the latest success with the previous success", async () => {
    const { compiler, emit } = createFakeCompiler();
    const session = createInteractiveDevSession({ compiler });

    emit({
      type: "compilationFinished",
      result: {
        ok: true,
        status: "artifactUpdated",
        compilation: 1,
        diagnostics: [],
        sourceSnapshot: { changedSourceIds: ["/project/src/initial.tsx"] },
      } as unknown as DeckjsxDevCompilationResult,
    });
    emit({
      type: "compilationFinished",
      result: {
        ok: false,
        status: "entryFailed",
        compilation: 2,
        diagnostics: [{ code: "deckjsx.node.dev.entryFailed" }],
      } as unknown as DeckjsxDevCompilationResult,
    });
    emit({
      type: "compilationFinished",
      result: {
        ok: true,
        status: "artifactUpdated",
        compilation: 3,
        diagnostics: [],
        sourceSnapshot: { changedSourceIds: ["/project/src/components/MetricCard.tsx"] },
      } as unknown as DeckjsxDevCompilationResult,
    });

    await expect(session.dispatch({ method: "history.changes" })).resolves.toEqual({
      ok: true,
      result: {
        fromCompilation: 1,
        toCompilation: 3,
        skippedFailedAttempts: 1,
        changedSourceIds: ["/project/src/components/MetricCard.tsx"],
      },
    });
  });

  test("selection.resolve exposes recent interactive results through handles", async () => {
    const { compiler, emit } = createFakeCompiler();
    const session = createInteractiveDevSession({ compiler });

    emit({
      type: "compilationFinished",
      result: {
        ok: true,
        status: "artifactUpdated",
        compilation: 1,
        diagnostics: [],
        sourceSnapshot: { changedSourceIds: ["/project/src/initial.tsx"] },
      } as unknown as DeckjsxDevCompilationResult,
    });
    emit({
      type: "compilationFinished",
      result: {
        ok: true,
        status: "artifactUpdated",
        compilation: 2,
        diagnostics: [],
        sourceSnapshot: { changedSourceIds: ["/project/src/components/MetricCard.tsx"] },
      } as unknown as DeckjsxDevCompilationResult,
    });

    const changes = await session.dispatch({ method: "history.changes" });

    await expect(
      session.dispatch({ method: "selection.resolve", params: { handle: "$0" } }),
    ).resolves.toEqual({
      ok: true,
      result: { handle: "$0", value: changes.ok ? changes.result : undefined },
    });
    await expect(
      session.dispatch({ method: "selection.resolve", params: { handle: "$$" } }),
    ).resolves.toEqual({
      ok: true,
      result: { handle: "$$", value: ["/project/src/components/MetricCard.tsx"] },
    });
  });

  test("selection.list shows available selection handles", async () => {
    const { compiler, emit } = createFakeCompiler();
    const session = createInteractiveDevSession({ compiler });

    emit({
      type: "compilationFinished",
      result: {
        ok: true,
        status: "artifactUpdated",
        compilation: 1,
        diagnostics: [],
        sourceSnapshot: { changedSourceIds: ["/project/src/initial.tsx"] },
      } as unknown as DeckjsxDevCompilationResult,
    });
    emit({
      type: "compilationFinished",
      result: {
        ok: true,
        status: "artifactUpdated",
        compilation: 2,
        diagnostics: [],
        sourceSnapshot: { changedSourceIds: ["/project/src/components/MetricCard.tsx"] },
      } as unknown as DeckjsxDevCompilationResult,
    });
    await session.dispatch({ method: "history.changes" });

    await expect(session.dispatch({ method: "selection.list" })).resolves.toEqual({
      ok: true,
      result: {
        kind: "selection.list",
        items: [
          expect.objectContaining({ handle: "$0", available: true }),
          expect.objectContaining({ handle: "$$", available: true }),
        ],
      },
    });
  });

  test("component.filter narrows the current result list and updates primary selection", async () => {
    const { compiler } = createFakeCompiler();
    const inspectionStore = createNodeDevInspectionStore();
    inspectionStore.beginAttempt({ compilation: 1 });
    const headerId = inspectionStore.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 10, column: 2 },
      props: { title: "Overview" },
    });
    const footerId = inspectionStore.recordComponent({
      name: "Footer",
      source: { file: "/project/src/slides.tsx", line: 20, column: 2 },
      props: { title: "Appendix" },
    });
    inspectionStore.recordComponent({
      name: "Chart",
      source: { file: "/project/src/charts.tsx", line: 30, column: 2 },
      props: { title: "Revenue" },
    });
    inspectionStore.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });
    const session = createInteractiveDevSession({ compiler, inspectionStore });

    await expect(
      session.dispatch({ method: "component.search", params: { query: "slides" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        kind: "component.search",
        items: [
          expect.objectContaining({ id: headerId, name: "Header" }),
          expect.objectContaining({ id: footerId, name: "Footer" }),
        ],
      },
    });
    await expect(
      session.dispatch({ method: "selection.resolve", params: { handle: "$0" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        handle: "$0",
        value: expect.objectContaining({ id: headerId, name: "Header" }),
      },
    });

    await expect(
      session.dispatch({ method: "component.filter", params: { query: "Footer" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        kind: "component.filter",
        items: [expect.objectContaining({ id: footerId, name: "Footer" })],
      },
    });
    await expect(
      session.dispatch({ method: "selection.resolve", params: { handle: "$0" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        handle: "$0",
        value: expect.objectContaining({ id: footerId, name: "Footer" }),
      },
    });

    await expect(
      session.dispatch({ method: "component.filter", params: { query: "Chart" } }),
    ).resolves.toEqual({
      ok: true,
      result: { kind: "component.filter", items: [] },
    });
    await expect(
      session.dispatch({ method: "selection.resolve", params: { handle: "$0" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        handle: "$0",
        value: expect.objectContaining({ id: footerId, name: "Footer" }),
      },
    });
    await expect(
      session.dispatch({ method: "selection.resolve", params: { handle: "$$" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        handle: "$$",
        value: [],
      },
    });
  });

  test("component inspection explains when a selection target disappeared in the latest attempt", async () => {
    const { compiler } = createFakeCompiler();
    const inspectionStore = createNodeDevInspectionStore();
    inspectionStore.beginAttempt({ compilation: 1 });
    const headerId = inspectionStore.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 10, column: 2 },
      props: { title: "Overview" },
    });
    inspectionStore.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });
    const session = createInteractiveDevSession({ compiler, inspectionStore });

    await session.dispatch({ method: "component.search", params: { query: "Header" } });

    inspectionStore.beginAttempt({ compilation: 2 });
    inspectionStore.recordComponent({
      name: "Footer",
      source: { file: "/project/src/slides.tsx", line: 20, column: 2 },
      props: { title: "Appendix" },
    });
    inspectionStore.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    await expect(
      session.dispatch({ method: "component.inspect", params: { target: "$0" } }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "deckjsx.node.interactive.componentUnavailable",
        message:
          "Selection $0 resolved to Header component from compilation 1, but it is not available in the latest inspectable attempt.",
        suggestions: [`component search Header`, `component inspect ${headerId}`],
      },
    });
    await expect(
      session.dispatch({ method: "props.inspect", params: { target: "$0", path: "title" } }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "deckjsx.node.interactive.propsUnavailable",
        message:
          "Selection $0 resolved to Header component from compilation 1, but its props are not available in the latest inspectable attempt.",
        suggestions: [`component search Header`, `component inspect ${headerId}`],
      },
    });
    await expect(
      session.dispatch({ method: "component.impact", params: { target: "$0" } }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "deckjsx.node.interactive.componentUnavailable",
        message:
          "Selection $0 resolved to Header component from compilation 1, but it is not available in the latest inspectable attempt.",
        suggestions: [`component search Header`, `component inspect ${headerId}`],
      },
    });
    await expect(
      session.dispatch({ method: "props.diff", params: { target: "$0", path: "title" } }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "deckjsx.node.interactive.propsUnavailable",
        message:
          "Selection $0 resolved to Header component from compilation 1, but its props are not available in the latest inspectable attempt.",
        suggestions: [`component search Header`, `component inspect ${headerId}`],
      },
    });
  });

  test("component search supports diagnostic and impact relational predicates", async () => {
    const { compiler, emit } = createFakeCompiler();
    const inspectionStore = createNodeDevInspectionStore();
    inspectionStore.beginAttempt({ compilation: 1 });
    const headerId = inspectionStore.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 10, column: 2 },
      props: { title: "Overview" },
      graphNodeId: "header-node",
    });
    const chartId = inspectionStore.recordComponent({
      name: "Chart",
      source: { file: "/project/src/charts.tsx", line: 20, column: 2 },
      props: { title: "Revenue" },
      graphNodeId: "chart-node",
    });
    inspectionStore.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });
    const artifactSession = createFakeArtifactSession([
      {
        slot: 0,
        artifacts: {
          graphsBySourceKey: new Map(),
          projection: {
            projection: {
              format: "pptx",
              slides: [
                {
                  payload: {
                    drawing: {
                      children: [
                        {
                          id: "header-el",
                          kind: "text",
                          origin: { graphNodeIds: ["header-node"] },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ]);
    const session = createInteractiveDevSession({ compiler, artifactSession, inspectionStore });
    emit({
      type: "compilationFinished",
      result: {
        ok: false,
        status: "entryFailed",
        compilation: 1,
        diagnostics: [
          {
            severity: "error",
            code: "E_HEADER",
            title: "Header failed",
            primary: { file: "/project/src/slides.tsx" },
          },
        ],
      } as unknown as DeckjsxDevCompilationResult,
    });

    await expect(
      session.dispatch({ method: "component.search", params: { query: "has:diagnostic" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        kind: "component.search",
        items: [expect.objectContaining({ id: headerId, name: "Header" })],
      },
    });
    await expect(
      session.dispatch({ method: "component.search", params: { query: "impact:slide" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        kind: "component.search",
        items: [expect.objectContaining({ id: headerId, name: "Header" })],
      },
    });
    await expect(
      session.dispatch({
        method: "component.search",
        params: { query: "impact:slide props.title:Revenue" },
      }),
    ).resolves.toEqual({
      ok: true,
      result: { kind: "component.search", items: [] },
    });
    await expect(
      session.dispatch({ method: "component.search", params: { query: "Chart" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        kind: "component.search",
        items: [expect.objectContaining({ id: chartId, name: "Chart" })],
      },
    });
  });

  test("component and props commands inspect the node dev inspection store", async () => {
    const { compiler, emit } = createFakeCompiler();
    const inspectionStore = createNodeDevInspectionStore();
    inspectionStore.beginAttempt({ compilation: 1 });
    const headerId = inspectionStore.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 12, column: 4 },
      props: { title: "Q4 Roadmap", items: ["one", "two"] },
      graphNodeId: "header-node",
    });
    inspectionStore.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });
    inspectionStore.beginAttempt({ compilation: 2 });
    inspectionStore.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 12, column: 4 },
      props: { title: "Q5 Roadmap", items: ["one", "two", "three"] },
      graphNodeId: "header-node",
    });
    inspectionStore.finishAttempt({ devStatus: "entryFailed", boundary: "entry" });
    const artifactSession = createFakeArtifactSession([
      {
        slot: 0,
        artifacts: {
          graphsBySourceKey: new Map(),
          projection: {
            projection: {
              format: "pptx",
              slides: [
                {
                  payload: {
                    drawing: {
                      children: [
                        {
                          id: "header-el",
                          kind: "text",
                          origin: { graphNodeIds: ["header-node"] },
                          content: { text: "Q5 Roadmap" },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ]);
    const session = createInteractiveDevSession({ compiler, artifactSession, inspectionStore });
    emit({
      type: "compilationFinished",
      result: {
        ok: false,
        status: "entryFailed",
        compilation: 2,
        diagnostics: [
          {
            severity: "error",
            code: "E_HEADER",
            title: "Header failed",
            primary: { file: "/project/src/slides.tsx" },
          },
        ],
      } as unknown as DeckjsxDevCompilationResult,
    });

    await expect(
      session.dispatch({ method: "diagnostics.explain", params: { index: 0 } }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({ kind: "diagnostics.explain", index: 0 }),
    });
    await expect(
      session.dispatch({ method: "props.diff", params: { target: "$0", path: "title" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        target: headerId,
        path: "title",
        changes: [{ path: "title", before: "Q4 Roadmap", after: "Q5 Roadmap" }],
      },
    });

    await expect(session.dispatch({ method: "component.tree" })).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({
        status: "partial",
        compilation: 2,
        items: [expect.objectContaining({ id: headerId, name: "Header" })],
      }),
    });
    await expect(
      session.dispatch({ method: "component.inspect", params: { target: "$0" } }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({
        kind: "component.inspect",
        id: headerId,
        name: "Header",
        propsSummary: { title: "Q5 Roadmap", items: { kind: "array", length: 3 } },
        childIds: [],
        graphNodeIds: ["header-node"],
        diagnostics: [{ index: 0, code: "E_HEADER", title: "Header failed" }],
        impact: { status: "available", elementCount: 1 },
        hints: [`props inspect ${headerId}`, `component impact ${headerId}`],
      }),
    });
    await expect(
      session.dispatch({ method: "component.inspect", params: { target: "header-node" } }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({
        kind: "component.inspect",
        id: headerId,
        name: "Header",
        graphNodeIds: ["header-node"],
        hints: [`props inspect ${headerId}`, `component impact ${headerId}`],
      }),
    });
    await expect(
      session.dispatch({ method: "props.inspect", params: { target: "$0", path: "title" } }),
    ).resolves.toEqual({
      ok: true,
      result: { target: headerId, path: "title", value: "Q5 Roadmap" },
    });
    await expect(
      session.dispatch({ method: "component.search", params: { query: "Header" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        kind: "component.search",
        items: [expect.objectContaining({ id: headerId, name: "Header" })],
      },
    });
    await expect(
      session.dispatch({ method: "component.filter", params: { query: "slides" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        kind: "component.filter",
        items: [expect.objectContaining({ id: headerId, name: "Header" })],
      },
    });
    await expect(
      session.dispatch({ method: "component.diff", params: { target: headerId } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        kind: "component.diff",
        target: headerId,
        changes: [
          { path: "props.title", before: "Q4 Roadmap", after: "Q5 Roadmap" },
          {
            path: "props.items",
            before: { kind: "array", length: 2 },
            after: { kind: "array", length: 3 },
          },
        ],
      },
    });
    await expect(
      session.dispatch({ method: "component.impact", params: { target: headerId } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        target: headerId,
        status: "available",
        graphNodeIds: ["header-node"],
        elements: [
          {
            slot: 0,
            slideIndex: 0,
            elementIndex: 0,
            element: {
              id: "header-el",
              kind: "text",
              origin: { graphNodeIds: ["header-node"] },
              textPreview: "Q5 Roadmap",
            },
          },
        ],
      },
    });
    await expect(
      session.dispatch({ method: "component.impact", params: { target: "header-node" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        target: "graph:header-node",
        status: "available",
        graphNodeIds: ["header-node"],
        components: [{ id: headerId, name: "Header" }],
        elements: [
          {
            slot: 0,
            slideIndex: 0,
            elementIndex: 0,
            element: {
              id: "header-el",
              kind: "text",
              origin: { graphNodeIds: ["header-node"] },
              textPreview: "Q5 Roadmap",
            },
          },
        ],
      },
    });
    await expect(
      session.dispatch({
        method: "projection.inspect",
        params: { slideIndex: 0, elementIndex: 0 },
      }),
    ).resolves.toEqual({
      ok: true,
      result: {
        slot: 0,
        slideIndex: 0,
        elementIndex: 0,
        element: {
          id: "header-el",
          kind: "text",
          origin: { graphNodeIds: ["header-node"] },
          textPreview: "Q5 Roadmap",
        },
      },
    });
    await expect(
      session.dispatch({ method: "component.impact", params: { target: "$0" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        target: "projection:@0:0:0",
        status: "available",
        graphNodeIds: ["header-node"],
        components: [{ id: headerId, name: "Header" }],
        elements: [
          {
            slot: 0,
            slideIndex: 0,
            elementIndex: 0,
            element: {
              id: "header-el",
              kind: "text",
              origin: { graphNodeIds: ["header-node"] },
              textPreview: "Q5 Roadmap",
            },
          },
        ],
      },
    });
    await expect(
      session.dispatch({ method: "component.inspect", params: { target: "$0" } }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({
        kind: "component.inspect",
        id: headerId,
        name: "Header",
        graphNodeIds: ["header-node"],
        hints: [`props inspect ${headerId}`, `component impact ${headerId}`],
      }),
    });
    await expect(
      session.dispatch({ method: "props.inspect", params: { target: headerId, path: "title" } }),
    ).resolves.toEqual({
      ok: true,
      result: { target: headerId, path: "title", value: "Q5 Roadmap" },
    });
    await expect(
      session.dispatch({
        method: "props.inspect",
        params: { target: "header-node", path: "title" },
      }),
    ).resolves.toEqual({
      ok: true,
      result: { target: headerId, path: "title", value: "Q5 Roadmap" },
    });
    await expect(
      session.dispatch({ method: "props.diff", params: { target: headerId, path: "title" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        target: headerId,
        path: "title",
        changes: [{ path: "title", before: "Q4 Roadmap", after: "Q5 Roadmap" }],
      },
    });
    await expect(
      session.dispatch({ method: "props.diff", params: { target: "header-node", path: "title" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        target: headerId,
        path: "title",
        changes: [{ path: "title", before: "Q4 Roadmap", after: "Q5 Roadmap" }],
      },
    });
  });

  test("style.explain resolves selection handles through component graph node impact", async () => {
    const { compiler } = createFakeCompiler();
    const inspectionStore = createNodeDevInspectionStore();
    inspectionStore.beginAttempt({ compilation: 1 });
    inspectionStore.recordComponent({
      name: "MetricCard",
      source: { file: "/project/src/card.tsx", line: 5, column: 2 },
      props: { title: "Revenue" },
      graphNodeId: "metric-title",
    });
    inspectionStore.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });
    const artifactSession = createFakeArtifactSession([
      {
        slot: 0,
        artifacts: {
          graphsBySourceKey: new Map([
            [
              "deck:root",
              {
                graph: {
                  nodes: new Map([["metric-title", { id: "metric-title" }]]),
                },
                resolvedStyles: new Map([
                  [
                    "metric-title",
                    {
                      style: { color: "teal" },
                      propertyTraces: {
                        color: {
                          property: "color",
                          candidates: [
                            { value: "teal", source: { layer: "style" }, applied: true },
                          ],
                        },
                      },
                    },
                  ],
                ]),
              },
            ],
          ]),
          projection: {
            projection: {
              format: "pptx",
              slides: [
                {
                  payload: {
                    drawing: {
                      children: [
                        {
                          id: "metric-el",
                          kind: "text",
                          origin: { graphNodeIds: ["metric-title"] },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ]);
    const session = createInteractiveDevSession({ compiler, artifactSession, inspectionStore });

    await session.dispatch({ method: "component.tree" });

    await expect(
      session.dispatch({ method: "style.explain", params: { nodeId: "$0", property: "color" } }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({
        nodeId: "metric-title",
        property: "color",
        trace: expect.objectContaining({ property: "color" }),
      }),
    });
    await session.dispatch({
      method: "projection.inspect",
      params: { slideIndex: 0, elementIndex: 0 },
    });
    await expect(
      session.dispatch({ method: "style.explain", params: { nodeId: "$0", property: "color" } }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({
        nodeId: "metric-title",
        property: "color",
        trace: expect.objectContaining({ property: "color" }),
      }),
    });
  });

  test("diagnostics.list and diagnostics.explain expose the latest compilation diagnostics", async () => {
    const { compiler, emit } = createFakeCompiler();
    const inspectionStore = createNodeDevInspectionStore();
    inspectionStore.beginAttempt({ compilation: 7 });
    inspectionStore.finishAttempt({ devStatus: "entryFailed", boundary: "entry" });
    const session = createInteractiveDevSession({ compiler, inspectionStore });

    emit({
      type: "compilationFinished",
      result: {
        ok: false,
        status: "entryFailed",
        compilation: 7,
        diagnostics: [
          {
            severity: "error",
            code: "deckjsx.node.dev.entryFailed",
            title: "Entry failed.",
            message: "render exploded",
            phase: "entry",
            compilation: 7,
          },
        ],
      } as unknown as DeckjsxDevCompilationResult,
    });

    await expect(session.dispatch({ method: "diagnostics.list" })).resolves.toEqual({
      ok: true,
      result: {
        compilation: 7,
        items: [
          {
            index: 0,
            severity: "error",
            code: "deckjsx.node.dev.entryFailed",
            title: "Entry failed.",
            phase: "entry",
          },
        ],
      },
    });
    await expect(
      session.dispatch({ method: "diagnostics.explain", params: { index: 0 } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        kind: "diagnostics.explain",
        index: 0,
        diagnostic: expect.objectContaining({
          code: "deckjsx.node.dev.entryFailed",
          message: "render exploded",
        }),
        relatedComponents: [],
        inspection: {
          status: "partial",
          compilation: 7,
          devStatus: "entryFailed",
          boundary: "entry",
          componentCount: 0,
          reason: "No component inspection snapshots were recorded before the entry boundary.",
        },
        hints: [],
      },
    });
  });

  test("style.explain and component.stack read retained artifact snapshots", async () => {
    const { compiler } = createFakeCompiler();
    const artifactSession = createFakeArtifactSession([
      {
        slot: 0,
        artifacts: {
          graphsBySourceKey: new Map([
            [
              "deck:root",
              {
                graph: {
                  nodes: new Map([
                    [
                      "node-1",
                      {
                        id: "node-1",
                        origin: {
                          path: "slide[0] > p",
                          componentProvenance: {
                            stack: [{ name: "MetricCard", moduleId: "/project/src/card.tsx" }],
                          },
                        },
                      },
                    ],
                  ]),
                },
                resolvedStyles: new Map([
                  [
                    "node-1",
                    {
                      style: { color: "blue" },
                      properties: {},
                      appliedClasses: [],
                      propertyTraces: {
                        color: {
                          property: "color",
                          candidates: [
                            {
                              value: "red",
                              source: { layer: "class", className: "muted" },
                              applied: false,
                            },
                            { value: "blue", source: { layer: "style" }, applied: true },
                          ],
                        },
                      },
                    },
                  ],
                ]),
              },
            ],
          ]),
        },
      },
    ]);
    const session = createInteractiveDevSession({ compiler, artifactSession });

    await expect(
      session.dispatch({
        method: "style.explain",
        params: { nodeId: "node-1", property: "color" },
      }),
    ).resolves.toEqual({
      ok: true,
      result: {
        nodeId: "node-1",
        sourceKey: "deck:root",
        slot: 0,
        property: "color",
        trace: {
          property: "color",
          candidates: [
            {
              value: "red",
              source: { layer: "class", className: "muted" },
              applied: false,
            },
            { value: "blue", source: { layer: "style" }, applied: true },
          ],
        },
      },
    });
    await expect(
      session.dispatch({
        method: "style.explain",
        params: { nodeId: "node-1" },
      }),
    ).resolves.toEqual({
      ok: true,
      result: {
        nodeId: "node-1",
        sourceKey: "deck:root",
        slot: 0,
        style: { color: "blue" },
        propertyTraces: {
          color: {
            property: "color",
            candidates: [
              {
                value: "red",
                source: { layer: "class", className: "muted" },
                applied: false,
              },
              { value: "blue", source: { layer: "style" }, applied: true },
            ],
          },
        },
        properties: ["color"],
        hints: ["style node-1 color"],
      },
    });
    await expect(
      session.dispatch({ method: "component.stack", params: { nodeId: "node-1" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        nodeId: "node-1",
        sourceKey: "deck:root",
        slot: 0,
        stack: [{ name: "MetricCard", moduleId: "/project/src/card.tsx" }],
      },
    });
    await expect(
      session.dispatch({ method: "component.stack", params: { nodeId: "$0" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        nodeId: "node-1",
        sourceKey: "deck:root",
        slot: 0,
        stack: [{ name: "MetricCard", moduleId: "/project/src/card.tsx" }],
      },
    });
  });

  test("style.explain exposes default theme inherited and inline cascade candidates", async () => {
    const { compiler } = createFakeCompiler();
    const artifactSession = createFakeArtifactSession([
      {
        slot: 0,
        artifacts: {
          graphsBySourceKey: new Map([
            [
              "deck:root",
              {
                graph: {
                  nodes: new Map([["child-text", { id: "child-text", origin: { path: "span" } }]]),
                },
                resolvedStyles: new Map([
                  [
                    "child-text",
                    {
                      style: { color: "blue" },
                      properties: {},
                      appliedClasses: [],
                      propertyTraces: {
                        color: {
                          property: "color",
                          candidates: [
                            {
                              value: "#000000",
                              source: { layer: "default" },
                              applied: false,
                            },
                            {
                              value: "gray",
                              source: { layer: "theme", defaultKey: "span" },
                              applied: false,
                            },
                            {
                              value: "red",
                              source: { layer: "inherited", parentId: "parent-text" },
                              applied: false,
                            },
                            { value: "blue", source: { layer: "style" }, applied: true },
                          ],
                        },
                      },
                    },
                  ],
                ]),
              },
            ],
          ]),
        },
      },
    ]);
    const session = createInteractiveDevSession({ compiler, artifactSession });

    await expect(
      session.dispatch({
        method: "style.explain",
        params: { nodeId: "child-text", property: "color" },
      }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({
        trace: {
          property: "color",
          candidates: [
            { value: "#000000", source: { layer: "default" }, applied: false },
            { value: "gray", source: { layer: "theme", defaultKey: "span" }, applied: false },
            {
              value: "red",
              source: { layer: "inherited", parentId: "parent-text" },
              applied: false,
            },
            { value: "blue", source: { layer: "style" }, applied: true },
          ],
        },
      }),
    });
  });

  test("diagnostics.explain exposes selector mismatch details for interactive follow-up", async () => {
    const { compiler, emit } = createFakeCompiler();
    const inspectionStore = createNodeDevInspectionStore();
    inspectionStore.beginAttempt({ compilation: 4 });
    const headerId = inspectionStore.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 12, column: 4 },
      props: { title: "Overview" },
      graphNodeId: "header-node",
    });
    inspectionStore.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });
    const artifactSession = createFakeArtifactSession([
      {
        slot: 0,
        artifacts: {
          graphsBySourceKey: new Map([
            [
              "deck:root",
              {
                graph: {
                  nodes: new Map([["header-node", { id: "header-node" }]]),
                },
                resolvedStyles: new Map([
                  [
                    "header-node",
                    {
                      style: { color: "navy" },
                      propertyTraces: {
                        color: {
                          property: "color",
                          candidates: [
                            { value: "navy", source: { layer: "style" }, applied: true },
                          ],
                        },
                      },
                    },
                  ],
                ]),
              },
            ],
          ]),
          projection: {
            projection: {
              format: "pptx",
              slides: [
                {
                  payload: {
                    drawing: {
                      children: [
                        {
                          id: "header-el",
                          kind: "text",
                          origin: { graphNodeIds: ["header-node"] },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ]);
    const session = createInteractiveDevSession({ compiler, artifactSession, inspectionStore });

    emit({
      type: "compilationFinished",
      result: {
        ok: true,
        status: "artifactUpdated",
        compilation: 4,
        diagnostics: [
          {
            severity: "error",
            code: "E_STYLE_TARGET_MISMATCH",
            title: "style class target does not match element",
            message: 'Style Class "caption" is defined but no target matches this element.',
            primary: { file: "/project/src/slides.tsx" },
            labels: [{ message: "Adjust the class target selector." }],
          },
        ],
      } as unknown as DeckjsxDevCompilationResult,
    });

    await expect(
      session.dispatch({ method: "diagnostics.explain", params: { index: 0 } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        kind: "diagnostics.explain",
        index: 0,
        diagnostic: expect.objectContaining({
          code: "E_STYLE_TARGET_MISMATCH",
          message: 'Style Class "caption" is defined but no target matches this element.',
        }),
        relatedComponents: [
          {
            id: headerId,
            name: "Header",
            impact: { status: "available", elementCount: 1 },
          },
        ],
        hints: [`component inspect ${headerId}`, `component impact ${headerId}`],
      },
    });
    await expect(
      session.dispatch({ method: "style.explain", params: { nodeId: "$0", property: "color" } }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({
        nodeId: "header-node",
        property: "color",
        trace: expect.objectContaining({ property: "color" }),
      }),
    });
    await expect(
      session.dispatch({ method: "diagnostics.explain", params: { index: 0 } }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({ kind: "diagnostics.explain", index: 0 }),
    });
    await expect(
      session.dispatch({ method: "props.inspect", params: { target: "$0", path: "title" } }),
    ).resolves.toEqual({
      ok: true,
      result: { target: headerId, path: "title", value: "Overview" },
    });
    await expect(
      session.dispatch({ method: "diagnostics.explain", params: { index: 0 } }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({ kind: "diagnostics.explain", index: 0 }),
    });
    await expect(
      session.dispatch({ method: "component.impact", params: { target: "$0" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        target: "diagnostic:0",
        status: "available",
        diagnostic: {
          index: 0,
          code: "E_STYLE_TARGET_MISMATCH",
          title: "style class target does not match element",
        },
        graphNodeIds: ["header-node"],
        components: [{ id: headerId, name: "Header" }],
        elements: [
          {
            slot: 0,
            slideIndex: 0,
            elementIndex: 0,
            element: {
              id: "header-el",
              kind: "text",
              origin: { graphNodeIds: ["header-node"] },
            },
          },
        ],
      },
    });
    await expect(
      session.dispatch({ method: "component.inspect", params: { target: "$0" } }),
    ).resolves.toEqual({
      ok: true,
      result: expect.objectContaining({
        kind: "component.inspect",
        id: headerId,
        name: "Header",
        graphNodeIds: ["header-node"],
        hints: [`props inspect ${headerId}`, `component impact ${headerId}`],
      }),
    });
  });

  test("projection.inspect reads retained PPTX projection slides and elements", async () => {
    const { compiler } = createFakeCompiler();
    const artifactSession = createFakeArtifactSession([
      {
        slot: 0,
        artifacts: {
          graphsBySourceKey: new Map([
            [
              "deck:root",
              {
                graph: {
                  nodes: new Map([
                    [
                      "text-node",
                      {
                        id: "text-node",
                        props: { style: { color: "blue" }, children: "Revenue" },
                      },
                    ],
                  ]),
                },
              },
            ],
          ]),
          projection: {
            projection: {
              format: "pptx",
              slides: [
                {
                  id: "ppt/slide-1",
                  path: "ppt/slides/slide1.xml",
                  origin: { graphNodeIds: ["slide-node"] },
                  payload: {
                    slideId: "256",
                    name: "Overview",
                    drawing: {
                      children: [
                        {
                          id: "el-1",
                          kind: "text",
                          packagePartId: "ppt/slide-1",
                          origin: {
                            graphNodeIds: ["text-node"],
                            componentProvenance: {
                              stack: [{ name: "MetricCard" }],
                            },
                          },
                          frame: { xEmu: 1, yEmu: 2, widthEmu: 3, heightEmu: 4 },
                          content: { text: "Revenue" },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ]);
    const session = createInteractiveDevSession({ compiler, artifactSession });

    await expect(session.dispatch({ method: "projection.inspect" })).resolves.toEqual({
      ok: true,
      result: {
        slot: 0,
        format: "pptx",
        slides: [
          {
            slideIndex: 0,
            partId: "ppt/slide-1",
            path: "ppt/slides/slide1.xml",
            slideId: "256",
            name: "Overview",
            origin: { graphNodeIds: ["slide-node"] },
            elementCount: 1,
          },
        ],
      },
    });
    await expect(
      session.dispatch({
        method: "projection.inspect",
        params: { slideIndex: 0, elementIndex: 0 },
      }),
    ).resolves.toEqual({
      ok: true,
      result: {
        slot: 0,
        slideIndex: 0,
        elementIndex: 0,
        element: {
          id: "el-1",
          kind: "text",
          packagePartId: "ppt/slide-1",
          origin: {
            graphNodeIds: ["text-node"],
            componentProvenance: { stack: [{ name: "MetricCard" }] },
          },
          frame: { xEmu: 1, yEmu: 2, widthEmu: 3, heightEmu: 4 },
          textPreview: "Revenue",
        },
      },
    });
    await expect(
      session.dispatch({ method: "props.inspect", params: { target: "$0", path: "style" } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        target: "projection:@0:0:0",
        path: "style",
        value: { color: "blue" },
      },
    });
  });

  test("projection.inspect can target a retained projection slot", async () => {
    const { compiler } = createFakeCompiler();
    const artifactSession = createFakeArtifactSession([
      {
        slot: 0,
        artifacts: {
          graphsBySourceKey: new Map(),
          projection: {
            projection: {
              format: "pptx",
              slides: [
                {
                  id: "ppt/slide-1",
                  payload: { name: "First slot", drawing: { children: [] } },
                },
              ],
            },
          },
        },
      },
      {
        slot: 2,
        artifacts: {
          graphsBySourceKey: new Map(),
          projection: {
            projection: {
              format: "pptx",
              slides: [
                {
                  id: "ppt/slide-2",
                  payload: { name: "Second slot", drawing: { children: [] } },
                },
              ],
            },
          },
        },
      },
    ]);
    const session = createInteractiveDevSession({ compiler, artifactSession });

    await expect(
      session.dispatch({ method: "projection.inspect", params: { slot: 2 } }),
    ).resolves.toEqual({
      ok: true,
      result: {
        slot: 2,
        format: "pptx",
        slides: [
          {
            slideIndex: 0,
            partId: "ppt/slide-2",
            name: "Second slot",
            elementCount: 0,
          },
        ],
      },
    });
  });

  test("projection.inspect rejects malformed numeric parameters", async () => {
    const { compiler } = createFakeCompiler();
    const artifactSession = createFakeArtifactSession([
      {
        slot: 0,
        artifacts: {
          graphsBySourceKey: new Map(),
          projection: { projection: { format: "pptx", slides: [] } },
        },
      },
    ]);
    const session = createInteractiveDevSession({ compiler, artifactSession });

    await expect(
      session.dispatch({ method: "projection.inspect", params: { slideIndex: "nope" } }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "deckjsx.node.interactive.invalidProjectionParams",
        message:
          "projection.inspect numeric params must be non-negative integers, and elementIndex requires slideIndex.",
      },
    });
    await expect(
      session.dispatch({ method: "projection.inspect", params: { elementIndex: 0 } }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "deckjsx.node.interactive.invalidProjectionParams",
        message:
          "projection.inspect numeric params must be non-negative integers, and elementIndex requires slideIndex.",
      },
    });
  });
});

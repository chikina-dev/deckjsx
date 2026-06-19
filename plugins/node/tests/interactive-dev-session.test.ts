import { describe, expect, test } from "vite-plus/test";
import { createInteractiveDevSession } from "../src/interactive/session.ts";
import type { DeckjsxDevCompiler, DeckjsxDevCompilerEvent } from "../src/dev-compiler.ts";
import type { DeckjsxDevCompilationResult } from "../src/dev-compilation.ts";
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
  test("session.help lists stable interactive commands and shorthand forms", async () => {
    const { compiler } = createFakeCompiler();
    const session = createInteractiveDevSession({ compiler });

    await expect(session.dispatch({ method: "session.help" })).resolves.toEqual({
      ok: true,
      result: {
        commands: expect.arrayContaining([
          expect.objectContaining({ method: "session.status", shorthand: "status" }),
          expect.objectContaining({ method: "session.timings", shorthand: "timings" }),
          expect.objectContaining({ method: "diagnostics.list", shorthand: "diagnostics" }),
          expect.objectContaining({
            method: "style.explain",
            shorthand: "style <nodeId> [property]",
          }),
          expect.objectContaining({ method: "component.stack", shorthand: "component <nodeId>" }),
          expect.objectContaining({
            method: "projection.inspect",
            shorthand: "projection [@slot] [slideIndex] [elementIndex]",
          }),
        ]),
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

  test("diagnostics.list and diagnostics.explain expose the latest compilation diagnostics", async () => {
    const { compiler, emit } = createFakeCompiler();
    const session = createInteractiveDevSession({ compiler });

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
        index: 0,
        diagnostic: expect.objectContaining({
          code: "deckjsx.node.dev.entryFailed",
          message: "render exploded",
        }),
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
    const session = createInteractiveDevSession({ compiler });

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
        index: 0,
        diagnostic: expect.objectContaining({
          code: "E_STYLE_TARGET_MISMATCH",
          message: 'Style Class "caption" is defined but no target matches this element.',
        }),
      },
    });
  });

  test("projection.inspect reads retained PPTX projection slides and elements", async () => {
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

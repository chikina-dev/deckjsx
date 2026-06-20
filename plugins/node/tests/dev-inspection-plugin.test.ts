import { describe, expect, test } from "vite-plus/test";
import { createNodeDevInspectionPlugin } from "../src/dev-inspection-plugin.ts";
import { createNodeDevInspectionStore } from "../src/dev-inspection-store.ts";

describe("@deckjsx/node dev inspection plugin", () => {
  test("records component frames from afterGraph provenance", () => {
    const store = createNodeDevInspectionStore();
    const plugin = createNodeDevInspectionPlugin({ store });

    store.beginAttempt({ compilation: 1 });
    plugin.hooks?.afterGraph?.({
      stage: "graph",
      phase: "after",
      roots: [],
      graph: {
        nodes: new Map([
          [
            "node-1",
            {
              origin: {
                componentProvenance: {
                  stack: [
                    {
                      name: "DeckShell",
                      moduleId: "/project/src/slides.tsx",
                      sourceSpan: { file: "/project/src/slides.tsx", line: 4, column: 2 },
                    },
                    {
                      name: "MetricCard",
                      moduleId: "/project/src/slides.tsx",
                      sourceSpan: { file: "/project/src/slides.tsx", line: 8, column: 4 },
                    },
                  ],
                },
              },
            },
          ],
        ]),
      } as never,
      resolvedStyles: new Map(),
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "graph" });

    const tree = store.componentTree();
    expect(tree.items).toEqual([
      expect.objectContaining({ name: "DeckShell", childIds: [expect.any(String)] }),
      expect.objectContaining({ name: "MetricCard", parentId: tree.items[0]?.id }),
    ]);
  });

  test("preserves component frame keys from graph provenance", () => {
    const store = createNodeDevInspectionStore();
    const plugin = createNodeDevInspectionPlugin({ store });

    store.beginAttempt({ compilation: 1 });
    plugin.hooks?.afterGraph?.({
      stage: "graph",
      phase: "after",
      roots: [],
      graph: {
        nodes: new Map([
          [
            "revenue-node",
            {
              origin: {
                componentProvenance: {
                  stack: [
                    {
                      name: "MetricCard",
                      key: "revenue",
                      sourceSpan: { file: "/project/src/slides.tsx", line: 8, column: 4 },
                    },
                  ],
                },
              },
            },
          ],
          [
            "margin-node",
            {
              origin: {
                componentProvenance: {
                  stack: [
                    {
                      name: "MetricCard",
                      key: "margin",
                      sourceSpan: { file: "/project/src/slides.tsx", line: 8, column: 4 },
                    },
                  ],
                },
              },
            },
          ],
        ]),
      } as never,
      resolvedStyles: new Map(),
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "graph" });

    const tree = store.componentTree();
    expect(tree.items).toEqual([
      expect.objectContaining({ name: "MetricCard", graphNodeIds: ["revenue-node"] }),
      expect.objectContaining({ name: "MetricCard", graphNodeIds: ["margin-node"] }),
    ]);
  });
});

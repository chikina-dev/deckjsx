import { describe, expect, test } from "vite-plus/test";
import { createNodeDevInspectionStore } from "../src/dev-inspection-store.ts";

describe("@deckjsx/node dev inspection store", () => {
  class WidgetConfig {
    label = "hero";
  }

  test("records component snapshots for the latest inspectable attempt", () => {
    const store = createNodeDevInspectionStore();

    store.beginAttempt({ compilation: 1 });
    const headerId = store.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 12, column: 4 },
      props: {
        title: "Q4 Roadmap",
        token: "secret-value",
        items: ["one", "two", "three", "four"],
      },
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    expect(store.componentTree()).toEqual({
      status: "complete",
      compilation: 1,
      items: [
        expect.objectContaining({
          id: headerId,
          name: "Header",
          source: { file: "/project/src/slides.tsx", line: 12, column: 4 },
          propsSummary: {
            title: "Q4 Roadmap",
            token: "[redacted]",
            items: { kind: "array", length: 4 },
          },
        }),
      ],
    });
  });

  test("searches components and inspects props paths", () => {
    const store = createNodeDevInspectionStore();

    store.beginAttempt({ compilation: 1 });
    const headerId = store.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 12, column: 4 },
      props: { title: "Q4 Roadmap", theme: { colors: { primary: "#234" } } },
    });
    store.recordComponent({
      name: "Footer",
      source: { file: "/project/src/slides.tsx", line: 30, column: 4 },
      props: { title: "Appendix" },
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    expect(store.searchComponents("Header")).toEqual([
      expect.objectContaining({ id: headerId, name: "Header" }),
    ]);
    expect(store.inspectProps(headerId, "theme.colors.primary")).toEqual({
      target: headerId,
      path: "theme.colors.primary",
      value: "#234",
    });
  });

  test("sanitizes focused props paths without leaking nested secrets or class instances", () => {
    const store = createNodeDevInspectionStore();

    store.beginAttempt({ compilation: 1 });
    const headerId = store.recordComponent({
      name: "Header",
      props: {
        credentials: { password: "before-secret" },
        widget: new WidgetConfig(),
      },
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    store.beginAttempt({ compilation: 2 });
    store.recordComponent({
      name: "Header",
      props: {
        credentials: { password: "after-secret" },
        widget: new WidgetConfig(),
      },
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    expect(store.inspectProps(headerId, "credentials.password")).toEqual({
      target: headerId,
      path: "credentials.password",
      value: "[redacted]",
    });
    expect(store.inspectProps(headerId, "widget")).toEqual({
      target: headerId,
      path: "widget",
      value: { kind: "instance", name: "WidgetConfig", keys: ["label"] },
    });
    expect(store.diffProps(headerId, "credentials.password")).toEqual({
      target: headerId,
      path: "credentials.password",
      changes: [],
    });
  });

  test("summarizes circular prop values without traversing them", () => {
    const store = createNodeDevInspectionStore();
    const theme: Record<string, unknown> = { name: "hero" };
    theme.self = theme;

    store.beginAttempt({ compilation: 1 });
    const headerId = store.recordComponent({
      name: "Header",
      props: { theme },
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    expect(store.componentTree().items[0]?.propsSummary).toEqual({
      theme: { kind: "circular", keys: ["name", "self"] },
    });
    expect(store.inspectProps(headerId, "theme")).toEqual({
      target: headerId,
      path: "theme",
      value: { kind: "circular", keys: ["name", "self"] },
    });
  });

  test("searches components with source and props query predicates", () => {
    const store = createNodeDevInspectionStore();

    store.beginAttempt({ compilation: 1 });
    const headerId = store.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 12, column: 4 },
      props: { title: "Q4 Roadmap", variant: "hero" },
    });
    const chartId = store.recordComponent({
      name: "Chart",
      source: { file: "/project/src/charts.tsx", line: 20, column: 4 },
      props: { title: "Revenue", variant: "hero" },
    });
    const footerId = store.recordComponent({
      name: "Footer",
      source: { file: "/project/src/slides.tsx", line: 30, column: 4 },
      props: { title: "Appendix", variant: "plain" },
    });
    store.recordComponent({
      name: "HeroBadge",
      source: { file: "/project/src/slides.tsx", line: 40, column: 4 },
      props: { title: "Badge", variant: "superhero" },
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    expect(store.searchComponents("source:slides props.title~Road")).toEqual([
      expect.objectContaining({ id: headerId, name: "Header" }),
    ]);
    expect(store.searchComponents("props.variant:hero")).toEqual([
      expect.objectContaining({ id: headerId, name: "Header" }),
      expect.objectContaining({ id: chartId, name: "Chart" }),
    ]);
    expect(store.searchComponents("props.variant~hero")).toEqual([
      expect.objectContaining({ id: headerId, name: "Header" }),
      expect.objectContaining({ id: chartId, name: "Chart" }),
      expect.objectContaining({ name: "HeroBadge" }),
    ]);
    expect(
      store.filterComponents({
        candidates: store.searchComponents("source:slides"),
        query: "props.title:Appendix",
      }),
    ).toEqual([expect.objectContaining({ id: footerId, name: "Footer" })]);
    expect(store.searchComponents("has:diagnostic")).toEqual([]);
  });

  test("coalesces repeated component frames while preserving parent links", () => {
    const store = createNodeDevInspectionStore();

    store.beginAttempt({ compilation: 1 });
    const parentId = store.recordComponent({
      name: "DeckShell",
      source: { file: "/project/src/slides.tsx", line: 4, column: 2 },
    });
    const childId = store.recordComponent({
      name: "MetricCard",
      source: { file: "/project/src/slides.tsx", line: 8, column: 4 },
      parentId,
      graphNodeId: "graph-node-1",
    });
    const repeatedChildId = store.recordComponent({
      name: "MetricCard",
      source: { file: "/project/src/slides.tsx", line: 8, column: 4 },
      parentId,
      graphNodeId: "graph-node-2",
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "graph" });

    expect(repeatedChildId).toBe(childId);
    expect(store.componentTree()).toEqual({
      status: "complete",
      compilation: 1,
      items: [
        expect.objectContaining({ id: parentId, childIds: [childId] }),
        expect.objectContaining({
          id: childId,
          parentId,
          graphNodeIds: ["graph-node-1", "graph-node-2"],
        }),
      ],
    });
  });

  test("keeps keyed repeated component instances distinct", () => {
    const store = createNodeDevInspectionStore();

    store.beginAttempt({ compilation: 1 });
    const firstId = store.recordComponent({
      name: "MetricCard",
      key: "revenue",
      source: { file: "/project/src/slides.tsx", line: 8, column: 4 },
      props: { title: "Revenue" },
      graphNodeId: "revenue-node",
    });
    const secondId = store.recordComponent({
      name: "MetricCard",
      key: "margin",
      source: { file: "/project/src/slides.tsx", line: 8, column: 4 },
      props: { title: "Margin" },
      graphNodeId: "margin-node",
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "graph" });

    expect(secondId).not.toBe(firstId);
    expect(store.inspectProps(firstId, "title")).toEqual({
      target: firstId,
      path: "title",
      value: "Revenue",
    });
    expect(store.inspectProps(secondId, "title")).toEqual({
      target: secondId,
      path: "title",
      value: "Margin",
    });
  });

  test("diffs props between previous and latest inspectable attempts", () => {
    const store = createNodeDevInspectionStore();

    store.beginAttempt({ compilation: 1 });
    const firstHeaderId = store.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 12, column: 4 },
      props: { title: "Q3 Roadmap", items: ["one"] },
    });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    store.beginAttempt({ compilation: 2 });
    const secondHeaderId = store.recordComponent({
      name: "Header",
      source: { file: "/project/src/slides.tsx", line: 12, column: 4 },
      props: { title: "Q4 Roadmap", items: ["one", "two"] },
    });
    store.finishAttempt({ devStatus: "entryFailed", boundary: "entry" });

    expect(secondHeaderId).toBe(firstHeaderId);
    expect(store.diffProps(secondHeaderId)).toEqual({
      target: secondHeaderId,
      changes: [
        { path: "title", before: "Q3 Roadmap", after: "Q4 Roadmap" },
        {
          path: "items",
          before: { kind: "array", length: 1 },
          after: { kind: "array", length: 2 },
        },
      ],
    });
  });

  test("diffs target component child relationships between inspectable attempts", () => {
    const store = createNodeDevInspectionStore();

    store.beginAttempt({ compilation: 1 });
    const parentId = store.recordComponent({ name: "Section" });
    const firstChildId = store.recordComponent({ name: "Metric", parentId });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    store.beginAttempt({ compilation: 2 });
    const latestParentId = store.recordComponent({ name: "Section" });
    const latestFirstChildId = store.recordComponent({ name: "Metric", parentId: latestParentId });
    const secondChildId = store.recordComponent({ name: "Chart", parentId: latestParentId });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    expect(latestParentId).toBe(parentId);
    expect(latestFirstChildId).toBe(firstChildId);
    expect(store.diffComponents(parentId)).toEqual({
      target: parentId,
      changes: [
        {
          path: "childIds",
          before: [firstChildId],
          after: [firstChildId, secondChildId],
        },
      ],
    });
  });

  test("reports latest inspection attempt boundary even when no component snapshot was recorded", () => {
    const store = createNodeDevInspectionStore();

    expect(store.inspectionStatus()).toEqual({
      status: "unavailable",
      reason: "No dev inspection attempt has finished yet.",
    });

    store.beginAttempt({ compilation: 1 });
    const headerId = store.recordComponent({ name: "Header" });
    store.finishAttempt({ devStatus: "artifactUpdated", boundary: "projection" });

    expect(store.inspectionStatus()).toEqual({
      status: "complete",
      compilation: 1,
      devStatus: "artifactUpdated",
      boundary: "projection",
      componentCount: 1,
    });

    store.beginAttempt({ compilation: 2 });
    store.finishAttempt({ devStatus: "entryFailed", boundary: "entry" });

    expect(store.inspectionStatus()).toEqual({
      status: "partial",
      compilation: 2,
      devStatus: "entryFailed",
      boundary: "entry",
      componentCount: 0,
    });
    expect(store.componentTree().items).toEqual([expect.objectContaining({ id: headerId })]);
  });
});

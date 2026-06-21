import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../../src/index.ts";
import { jsxDEV } from "../../src/jsx-dev-runtime.ts";

function values<T>(map: ReadonlyMap<PropertyKey, T>): T[] {
  return [...map.values()];
}

describe("Semantic Author Graph", () => {
  test("compile returns a graph with semantic roles, inline children, styles, and assets", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Graph" }, () => (
      <>
        <main style={{ x: 1, y: 1, width: 8, height: 4 }}>
          <h1 style={{ fontSize: 28 }}>
            Sales <span style={{ color: "red" }}>grew</span>
          </h1>
          <figure>
            <img src="chart.png" />
          </figure>
        </main>
      </>
    ));

    const graph = deck.compile().graph!;
    const nodes = values(graph.nodes);
    const heading = nodes.find((node) => node.kind === "text" && node.role?.kind === "heading");
    const image = nodes.find((node) => node.kind === "image");

    expect(graph.nodes.get(graph.documentId)).toMatchObject({
      kind: "document",
      role: { kind: "document" },
    });
    expect(heading).toMatchObject({
      kind: "text",
      authoredTag: "h1",
      role: { kind: "heading", level: 1 },
    });
    expect(heading && "inlineChildren" in heading ? heading.inlineChildren : []).toHaveLength(2);
    expect(image).toMatchObject({ kind: "image", authoredTag: "img", role: { kind: "image" } });
    expect(graph.styles.size).toBeGreaterThanOrEqual(2);
    expect(graph.assets.size).toBe(1);
  });

  test("compile preserves component provenance on semantic origins", async () => {
    function MetricCard() {
      return jsxDEV("p", { children: "Revenue" }, undefined, false, {
        fileName: "/project/src/components/MetricCard.tsx",
        lineNumber: 7,
        columnNumber: 10,
      });
    }
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Component provenance" }, () =>
      jsxDEV(MetricCard, {}, "metric-card", false, {
        fileName: "/project/src/slides/Overview.tsx",
        lineNumber: 12,
        columnNumber: 5,
      }),
    );

    const graph = deck.compile().graph!;
    const metric = values(graph.nodes).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );

    expect(metric?.origin.sourceSpan).toEqual({
      file: "/project/src/components/MetricCard.tsx",
      line: 7,
      column: 10,
    });
    expect(metric?.origin.componentProvenance).toEqual({
      stack: [
        {
          name: "MetricCard",
          sourceSpan: { file: "/project/src/slides/Overview.tsx", line: 12, column: 5 },
          key: "metric-card",
        },
      ],
    });
  });

  test("compile represents video nodes with separate video and poster assets", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Video" }, () => (
      <>
        <video src="demo.mp4" poster="demo.png" style={{ x: 1, y: 1, width: 4, height: 2.25 }} />
      </>
    ));

    const result = deck.compile();
    const graph = result.graph!;
    const nodes = values(graph.nodes);
    const video = nodes.find((node) => node.kind === "video");

    expect(result.ok).toBe(true);
    expect(video).toMatchObject({ kind: "video", authoredTag: "video", role: { kind: "video" } });
    if (video?.kind !== "video" || !video.assetRef || !video.posterAssetRef) {
      throw new Error("Expected a video node with video and poster asset refs.");
    }
    expect(graph.assets.get(video.assetRef)).toMatchObject({
      kind: "video",
      source: { kind: "path", path: "demo.mp4" },
    });
    expect(graph.assets.get(video.posterAssetRef)).toMatchObject({
      kind: "image",
      source: { kind: "path", path: "demo.png" },
    });
  });

  test("compile rejects remote video src URLs before asset loading", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Remote video" }, () => (
      <>
        <video
          src="http://127.0.0.1:8080/secret.mp4"
          poster="demo.png"
          style={{ x: 1, y: 1, width: 4, height: 2.25 }}
        />
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "E_COMPILE_VIDEO_SOURCE_INVALID",
        title: "remote video src is not supported",
        message: expect.stringContaining("must be a local path"),
      }),
    );
    expect(values(result.graph?.assets ?? new Map()).some((asset) => asset.kind === "video")).toBe(
      false,
    );
  });

  test("compile warns when a video poster is omitted", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Video" }, () => (
      <>
        <video src="demo.mp4" style={{ x: 1, y: 1, width: 4, height: 2.25 }} />
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "W_COMPILE_VIDEO_POSTER_MISSING",
      }),
    );
  });

  test("inspect mode returns diagnostics for invalid inline structure without throwing", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Invalid" }, () => (
      <>
        <div>
          <span>orphan inline</span>
        </div>
      </>
    ));

    const result = deck.compile();

    expect(result.graph).toBeDefined();
    expect(result.diagnostics.hasErrors).toBe(true);
    expect(result.diagnostics.items[0]).toMatchObject({
      severity: "error",
      code: "E_SEMANTIC_STRUCTURE",
      title: "span cannot appear here",
    });
    expect(result.ok).toBe(false);
  });

  test("fragments are transparent and preserve multiple graph children", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "HTML-like children" }, () => (
      <>
        <div>
          <>
            <p>First</p>
            <p>Second</p>
          </>
        </div>
      </>
    ));

    const graph = deck.compile().graph!;
    const view = values(graph.nodes).find(
      (node) => node.kind === "container" && node.authoredTag === "div",
    );

    expect(view && "children" in view ? view.children : []).toHaveLength(2);
  });
});

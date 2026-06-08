import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../../src/index.ts";

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

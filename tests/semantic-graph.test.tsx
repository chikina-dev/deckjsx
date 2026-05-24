import { describe, expect, test } from "vite-plus/test";
import { Deck, SemanticGraphDiagnosticError, Slide, Text, View } from "../src/index.ts";

function values<T>(map: ReadonlyMap<unknown, T>): T[] {
  return [...map.values()];
}

describe("Semantic Author Graph", () => {
  test("compile returns a graph with semantic roles, inline children, styles, and assets", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Graph">
        <main style={{ x: 1, y: 1, width: 8, height: 4 }}>
          <h1 style={{ fontSize: 28 }}>
            Sales <span style={{ color: "red" }}>grew</span>
          </h1>
          <figure>
            <img src="chart.png" />
          </figure>
        </main>
      </Slide>
    ));

    const graph = deck.compile();
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
    expect(image).toMatchObject({
      kind: "image",
      authoredTag: "img",
      role: { kind: "image" },
    });
    expect(graph.styles.size).toBeGreaterThanOrEqual(2);
    expect(graph.assets.size).toBe(1);
  });
  test("inspect mode returns diagnostics for invalid inline structure without throwing", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Invalid">
        <div>
          <span>orphan inline</span>
        </div>
      </Slide>
    ));

    const result = deck.compile({ mode: "inspect" });

    expect(result.graph).toBeDefined();
    expect(result.diagnostics.hasErrors).toBe(true);
    expect(result.diagnostics.items[0]).toMatchObject({
      severity: "error",
      code: "E_SEMANTIC_STRUCTURE",
      title: "span cannot appear here",
    });
    expect(() => deck.compile()).toThrowError(SemanticGraphDiagnosticError);
  });

  test("fragments are transparent and preserve multiple graph children", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Fragment children">
        <View>
          <>
            <Text>First</Text>
            <Text>Second</Text>
          </>
        </View>
      </Slide>
    ));

    const graph = deck.compile();
    const view = values(graph.nodes).find(
      (node) => node.kind === "container" && node.authoredComponent === "View",
    );

    expect(view && "children" in view ? view.children : []).toHaveLength(2);
  });
});

import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../../src/index.ts";

function values<T>(map: ReadonlyMap<PropertyKey, T>): T[] {
  return [...map.values()];
}

describe("Semantic Author Graph tables", () => {
  test("compile preserves authored table sections, rows, cells, and spans", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Table" }, () => (
      <>
        <table style={{ width: 8, height: 2, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th colspan={2}>Header</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: 0.5 }}>
              <td rowspan={2}>A</td>
              <td>B</td>
            </tr>
            <tr>
              <td>C</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>3</td>
            </tr>
          </tfoot>
        </table>
      </>
    ));

    const result = deck.compile();
    const graph = result.graph!;
    const nodes = values(graph.nodes);
    const table = nodes.find((node) => node.kind === "table");
    const sections = nodes.filter((node) => node.kind === "tableSection");
    const rows = nodes.filter((node) => node.kind === "tableRow");
    const cells = nodes.filter((node) => node.kind === "tableCell");

    expect(result.ok).toBe(true);
    expect(table).toMatchObject({ kind: "table", authoredTag: "table" });
    expect(sections.map((node) => (node.kind === "tableSection" ? node.sectionKind : ""))).toEqual([
      "head",
      "body",
      "foot",
    ]);
    expect(rows).toHaveLength(4);
    expect(cells.map((node) => (node.kind === "tableCell" ? node.cellKind : ""))).toEqual([
      "header",
      "data",
      "data",
      "data",
      "data",
      "data",
    ]);
    expect(cells[0]).toMatchObject({ kind: "tableCell", cellKind: "header", colSpan: 2 });
    expect(cells[1]).toMatchObject({ kind: "tableCell", cellKind: "data", rowSpan: 2 });
  });

  test("compile normalizes table row shorthand to an implicit body section", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Shorthand" }, () => (
      <>
        <table>
          <tr>
            <td>A</td>
          </tr>
        </table>
      </>
    ));

    const result = deck.compile();
    const sections = values(result.graph!.nodes).filter((node) => node.kind === "tableSection");

    expect(result.ok).toBe(true);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      kind: "tableSection",
      origin: { kind: "implicit", reason: "table-row-shorthand" },
      sectionKind: "body",
    });
  });

  test("compile rejects malformed table hierarchy as semantic structure errors", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Invalid" }, () => (
      <>
        <table>
          <td>orphan</td>
        </table>
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.hasErrors).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "E_SEMANTIC_STRUCTURE",
        title: "invalid table child",
      }),
    );
  });

  test("compile rejects table section cardinality and order violations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Invalid" }, () => (
      <>
        <table>
          <tbody>
            <tr>
              <td>A</td>
            </tr>
          </tbody>
          <thead>
            <tr>
              <th>Late</th>
            </tr>
          </thead>
        </table>
      </>
    ));

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "E_SEMANTIC_STRUCTURE",
        title: "invalid table section order",
      }),
    );
  });
});

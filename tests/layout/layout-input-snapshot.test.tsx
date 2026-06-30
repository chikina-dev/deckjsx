import { describe, expect, test } from "vite-plus/test";
import { StyleSheet } from "@/src/index.ts";
import { buildLayoutInputSnapshot } from "@/src/layout/input.ts";
import { resolveProjectedLayout } from "@/src/layout/resolve.ts";
import * as H from "../helpers.ts";

describe("layout input snapshot", () => {
  test("materializes resolved container styles and probed image metadata", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new StyleSheet({
        classes: {
          card: { target: "div.card", style: { backgroundColor: "#EEF2FF", padding: 0.25 } },
          title: { target: "p.title", style: { color: "#111827", fontSize: 24 } },
        },
      }),
    );

    deck.slide({ name: "Snapshot", className: "card" }, () => (
      <>
        <div
          className="card"
          style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2 }}
        >
          <p className="title">Revenue</p>
        </div>
        <img
          src="chart.png"
          style={{ position: "absolute", left: 6, top: 1, width: 2, height: 1 }}
        />
      </>
    ));

    const compiled = deck.compile();
    const imageNode = [...(compiled.graph?.nodes.values() ?? [])].find(
      (node) => node.kind === "image",
    );
    const built = buildLayoutInputSnapshot({
      graph: compiled.graph!,
      resolvedStyles: compiled.resolvedStyles!,
      assetProbeArtifacts: new Map(
        imageNode?.kind === "image" && imageNode.assetRef
          ? [
              [
                imageNode.assetRef,
                {
                  probe: {
                    mediaType: "image/png",
                    width: 640,
                    height: 360,
                    byteLength: 4096,
                  },
                },
              ],
            ]
          : [],
      ),
      deckSize: { widthEmu: 9144000, heightEmu: 5143500 },
      meta: { title: "Snapshot" },
    });
    const snapshot = built.snapshot;

    expect(built.diagnostics.hasErrors).toBe(false);
    expect(snapshot.size).toEqual({ widthEmu: 9144000, heightEmu: 5143500 });
    expect(snapshot.slides[0]?.children[0]?.kind).toBe("view");
    expect(snapshot.slides[0]?.children[0]?.props).toMatchObject({
      left: 1,
      top: 1,
      position: "absolute",
      width: 4,
      height: 2,
      backgroundColor: "#EEF2FF",
    });
    expect(snapshot.slides[0]?.children[1]).toMatchObject({
      kind: "image",
      assetProbe: {
        mediaType: "image/png",
        width: 640,
        height: 360,
        byteLength: 4096,
      },
    });
  });

  test("preserves table-specific structure through layout input and projected layout", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Table" }, () => (
      <>
        <table
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 6,
            height: 2,
            tableLayout: "fixed",
          }}
        >
          <thead>
            <tr style={{ height: 0.4 }}>
              <th style={{ width: 3 }}>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Revenue</td>
              <td>$10M</td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const compiled = deck.compile();
    const built = buildLayoutInputSnapshot({
      graph: compiled.graph!,
      resolvedStyles: compiled.resolvedStyles!,
      deckSize: { widthEmu: 9144000, heightEmu: 5143500 },
    });
    const tableInput = built.snapshot.slides[0]?.children[0];
    const projected = resolveProjectedLayout(
      { layout: { width: 10, height: 5.625, unit: "in" } },
      built.snapshot,
    );
    const table = projected.slides[0]?.nodes[0];

    expect(tableInput).toMatchObject({
      kind: "table",
      props: {
        position: "absolute",
        left: 1,
        top: 1,
        width: 6,
        height: 2,
        tableLayout: "fixed",
      },
      sections: [
        {
          kind: "tableSection",
          sectionKind: "head",
          rows: [
            {
              kind: "tableRow",
              props: { height: 0.4 },
              cells: [
                { kind: "tableCell", cellKind: "header", colSpan: 1, rowSpan: 1 },
                { kind: "tableCell", cellKind: "header", colSpan: 1, rowSpan: 1 },
              ],
            },
          ],
        },
        { kind: "tableSection", sectionKind: "body" },
      ],
    });
    expect(table).toMatchObject({
      kind: "table",
      frame: {
        xEmu: 914400,
        yEmu: 914400,
        widthEmu: 5486400,
        heightEmu: 1828800,
      },
    });
    expect(table && "sections" in table ? table.sections[0] : undefined).toMatchObject({
      sectionKind: "head",
      rows: [
        {
          cells: [
            { cellKind: "header", gridColumnIndex: 0, colSpan: 1, rowSpan: 1 },
            { cellKind: "header", gridColumnIndex: 1, colSpan: 1, rowSpan: 1 },
          ],
        },
      ],
    });
  });

  test("projected table layout skips columns occupied by row spans", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Row span" }, () => (
      <>
        <table
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 6,
            height: 2,
            tableLayout: "fixed",
          }}
        >
          <tbody>
            <tr>
              <td rowspan={2}>Region</td>
              <td>Q1</td>
            </tr>
            <tr>
              <td>Q2</td>
            </tr>
          </tbody>
        </table>
      </>
    ));

    const compiled = deck.compile();
    const built = buildLayoutInputSnapshot({
      graph: compiled.graph!,
      resolvedStyles: compiled.resolvedStyles!,
      deckSize: { widthEmu: 9144000, heightEmu: 5143500 },
    });
    const projected = resolveProjectedLayout(
      { layout: { width: 10, height: 5.625, unit: "in" } },
      built.snapshot,
    );
    const table = projected.slides[0]?.nodes[0];
    const secondRowCell =
      table?.kind === "table" ? table.sections[0]?.rows[1]?.cells[0] : undefined;

    expect(secondRowCell).toMatchObject({
      kind: "tableCell",
      gridColumnIndex: 1,
    });
  });
});

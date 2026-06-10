import { describe, expect, test } from "vite-plus/test";
import { Deck, StyleSheet } from "../../src/index.ts";
import { buildLayoutInputSnapshot } from "../../src/layout/input.ts";

function containsMapReference(value: unknown): boolean {
  if (value instanceof Map) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsMapReference(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((item) => containsMapReference(item));
  }

  return false;
}

describe("layout input snapshot", () => {
  test("copies graph and resolved style data without carrying authoring props or live style maps", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new StyleSheet({
        classes: {
          card: { style: { backgroundColor: "#EEF2FF", padding: 0.25 } },
          title: { target: "p.title", style: { color: "#111827", fontSize: 24 } },
        },
      }),
    );

    deck.slide({ name: "Snapshot", className: "card" }, () => (
      <>
        <div className="card" style={{ x: 1, y: 1, width: 4, height: 2 }}>
          <p className="title">Revenue</p>
        </div>
        <img src="chart.png" style={{ x: 6, y: 1, width: 2, height: 1 }} />
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
    const serialized = JSON.stringify(snapshot);

    expect(built.diagnostics.hasErrors).toBe(false);
    expect(containsMapReference(snapshot)).toBe(false);
    expect(serialized).not.toContain("className");
    expect(serialized).not.toContain("classRefs");
    expect(serialized).not.toContain("ResolvedStyleMap");
    expect(snapshot.size).toEqual({ widthEmu: 9144000, heightEmu: 5143500 });
    expect(snapshot.slides[0]?.children[0]?.kind).toBe("view");
    expect(snapshot.slides[0]?.children[0]?.props).toMatchObject({
      x: 1,
      y: 1,
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
});

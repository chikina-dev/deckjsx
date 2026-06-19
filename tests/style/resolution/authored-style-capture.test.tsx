import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("style resolution authored style capture", () => {
  test("captures className as ordered style class references", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: {
          active: {},
          accent: {},
          card: {},
          "chart-image": {},
          "deck-slide": {},
          selected: {},
          title: {},
          wide: {},
        },
      }),
    );

    deck.slide({ name: "Classes", className: "deck-slide" }, () => (
      <>
        <div
          className={[
            "card",
            false,
            ["selected", { active: true, disabled: false, "": true, "   ": true }],
            "wide card",
          ]}
          style={{ x: 1 }}
        >
          <p className={{ title: true, muted: null }}>
            Hello <span className="accent">world</span>
          </p>
          <img src="chart.png" className="chart-image" />
        </div>
      </>
    ));

    const graph = deck.compile().graph!;
    const view = H.values(graph.nodes).find(
      (node) => node.kind === "container" && node.authoredTag === "div",
    );
    const slide = H.values(graph.nodes).find((node) => node.kind === "slide");
    const image = H.values(graph.nodes).find((node) => node.kind === "image");
    const span = H.values(graph.nodes).find(
      (node) => node.kind === "textRun" && node.text === "world",
    );

    expect(view?.styleRef).toBeDefined();
    expect(graph.styles.get(view?.styleRef ?? ("" as never))?.authored).toEqual({
      style: { x: 1 },
      classRefs: [
        { name: "card", index: 0 },
        { name: "selected", index: 1 },
        { name: "active", index: 2 },
        { name: "wide", index: 3 },
        { name: "card", index: 4 },
      ],
    });
    expect(graph.styles.get(slide?.styleRef ?? ("" as never))?.authored.classRefs).toEqual([
      { name: "deck-slide", index: 0 },
    ]);
    expect(graph.styles.get(image?.styleRef ?? ("" as never))?.authored.classRefs).toEqual([
      { name: "chart-image", index: 0 },
    ]);
    expect(graph.styles.get(span?.styleRef ?? ("" as never))?.authored.classRefs).toEqual([
      { name: "accent", index: 0 },
    ]);
    expect(graph.styles.get(view?.styleRef ?? ("" as never))).not.toHaveProperty("resolved");
  });

  test("reports direct style props without merging them into authored style", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(() => (
      <>
        <div
          // @ts-expect-error direct style props are rejected by the authoring surface.
          x={1}
          y={2}
          style={{ y: 3, width: 4 }}
        >
          <p>
            Hello
            <span
              // @ts-expect-error direct style props are rejected by the authoring surface.
              color="red"
            >
              world
            </span>
          </p>
        </div>
      </>
    ));

    const result = deck.compile();
    const graph = result.graph!;
    const view = H.values(graph.nodes).find(
      (node) => node.kind === "container" && node.authoredTag === "div",
    );
    const span = H.values(graph.nodes).find(
      (node) => node.kind === "textRun" && node.text === "world",
    );

    expect(graph.styles.get(view?.styleRef ?? ("" as never))?.authored.style).toEqual({
      y: 3,
      width: 4,
    });
    expect(span?.styleRef).toBeUndefined();
    expect(result.diagnostics.items.map((item) => item.code)).toContain(
      "E_COMPILE_UNSUPPORTED_AUTHORING_PROP",
    );
    expect(result.diagnostics.items.map((item) => item.labels[0]?.path)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(".props.x"),
        expect.stringContaining(".props.y"),
        expect.stringContaining(".props.color"),
      ]),
    );
  });

  test("warns about unsupported css-like style property names while preserving authored style", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(() => (
      <div
        style={
          {
            display: "flex",
            flex: 1,
            flexFlow: "row wrap",
            marginInline: "1rem",
          } as never
        }
      >
        <p style={{ color: "#111827" }}>Text</p>
      </div>
    ));

    const result = deck.compile();
    const view = H.values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "container" && node.authoredTag === "div",
    );

    expect(result.diagnostics.hasErrors).toBe(false);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "W_COMPILE_UNSUPPORTED_STYLE_PROP",
          labels: [expect.objectContaining({ path: expect.stringContaining(".style.flex") })],
        }),
        expect.objectContaining({
          severity: "warning",
          code: "W_COMPILE_UNSUPPORTED_STYLE_PROP",
          labels: [expect.objectContaining({ path: expect.stringContaining(".style.flexFlow") })],
        }),
        expect.objectContaining({
          severity: "warning",
          code: "W_COMPILE_UNSUPPORTED_STYLE_PROP",
          labels: [
            expect.objectContaining({ path: expect.stringContaining(".style.marginInline") }),
          ],
        }),
      ]),
    );
    expect(result.graph?.styles.get(view?.styleRef ?? ("" as never))?.authored.style).toMatchObject(
      {
        display: "flex",
        flex: 1,
        flexFlow: "row wrap",
        marginInline: "1rem",
      },
    );
  });

  test("inspect mode exposes CSS-like resolved styles without changing the graph", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: {
          title: { target: "p.title", style: { color: "red", fontSize: 28 } },
          override: { style: { color: "green", fontSize: 16 } },
        },
      }),
    );

    deck.slide(() => (
      <>
        <p className={["override", "title"]} style={{ color: "blue" }}>
          Revenue
        </p>
      </>
    ));

    const result = deck.compile();
    const text = H.values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );
    const resolved = result.resolvedStyles?.get(text?.id ?? ("" as never));

    expect(result.diagnostics.hasErrors).toBe(false);
    expect(result.graph?.styles.get(text?.styleRef ?? ("" as never))?.authored).toEqual({
      style: { color: "blue" },
      classRefs: [
        { name: "override", index: 0 },
        { name: "title", index: 1 },
      ],
    });
    expect(resolved?.style).toMatchObject({ color: "blue", fontSize: 28 });
    expect(
      resolved?.appliedClasses.map((source) => source.layer === "class" && source.className),
    ).toEqual(["override", "title"]);
  });

  test("resolved element defaults use css-like static positioning", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(() => (
      <div>
        <p>Text</p>
      </div>
    ));

    const result = deck.compile();
    const nodes = H.values(result.graph?.nodes ?? new Map());
    const container = nodes.find((node) => node.kind === "container" && node.authoredTag === "div");
    const text = nodes.find((node) => node.kind === "text" && node.authoredTag === "p");

    expect(result.resolvedStyles?.get(container?.id ?? ("" as never))?.style.position).toBe(
      "static",
    );
    expect(result.resolvedStyles?.get(text?.id ?? ("" as never))?.style.position).toBe("static");
  });
});

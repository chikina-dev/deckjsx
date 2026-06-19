import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("style resolution cascade specificity", () => {
  test("stylesheet source order wins over className token order", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(new H.StyleSheet({ classes: { a: { color: "red" }, b: { color: "blue" } } }));

    deck.slide(() => (
      <>
        <p className="b a">Revenue</p>
      </>
    ));

    const result = deck.compile();
    const text = H.values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );

    expect(result.resolvedStyles?.get(text?.id ?? ("" as never))?.style).toMatchObject({
      color: "blue",
    });
    expect(result.resolvedStyles?.get(text?.id ?? ("" as never))?.propertyTraces.color).toEqual({
      property: "color",
      candidates: [
        {
          value: "#000000",
          source: { layer: "default" },
          applied: false,
        },
        {
          value: "red",
          source: expect.objectContaining({ layer: "class", className: "a" }),
          applied: false,
        },
        {
          value: "blue",
          source: expect.objectContaining({ layer: "class", className: "b" }),
          applied: true,
        },
      ],
    });
  });

  test("selector specificity wins over stylesheet source order", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: { caption: { target: ".card .caption", style: { color: "red" } } },
      }),
    );
    deck.useStyles(
      new H.StyleSheet({ classes: { caption: { target: ".caption", style: { color: "blue" } } } }),
    );

    deck.slide(() => (
      <>
        <div className="card">
          <p className="caption">Revenue</p>
        </div>
      </>
    ));

    const result = deck.compile();
    const text = H.values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );
    const resolved = result.resolvedStyles?.get(text?.id ?? ("" as never));

    expect(result.diagnostics.hasErrors).toBe(false);
    expect(resolved?.style).toMatchObject({ color: "red" });
    expect(
      resolved?.properties.color?.source.layer === "class" &&
        resolved.properties.color.source.selector,
    ).toBe(".card .caption");
  });

  test("target selectors match authored tags, classes, and descendants", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: {
          title: { target: "header.title", style: { backgroundColor: "#eef" } },
          caption: { target: "div.card p.caption", style: { color: "green" } },
          "report/title": { style: { fontWeight: 700 } },
        },
      }),
    );

    deck.slide(() => (
      <>
        <header className="title">
          <div className="card">
            <p className={["caption", "report/title"]}>Revenue</p>
          </div>
        </header>
      </>
    ));

    const result = deck.compile();
    const header = H.values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "container" && node.authoredTag === "header",
    );
    const text = H.values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );

    expect(result.diagnostics.hasErrors).toBe(false);
    expect(result.resolvedStyles?.get(header?.id ?? ("" as never))?.style).toMatchObject({
      backgroundColor: "#eef",
    });
    expect(result.resolvedStyles?.get(text?.id ?? ("" as never))?.style).toMatchObject({
      color: "green",
      fontWeight: 700,
    });
    expect(result.resolvedStyles?.get(text?.id ?? ("" as never))?.appliedClasses).toContainEqual(
      expect.objectContaining({ className: "report/title", selector: ".report\\/title" }),
    );
  });

  test("style classes resolve against the source-local stylesheet", async () => {
    const parentDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const childDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    parentDeck.useStyles(new H.StyleSheet({ classes: { note: { color: "red" } } }));
    childDeck.useStyles(new H.StyleSheet({ classes: { note: { color: "blue" } } }));

    parentDeck.slide(() => (
      <>
        <p className="note">Parent</p>
      </>
    ));
    childDeck.slide(() => (
      <>
        <p className="note">Child</p>
      </>
    ));
    parentDeck.mount("child", childDeck);

    const result = parentDeck.compile();
    const texts = H.values(result.graph?.nodes ?? new Map()).filter(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );
    const parentText = texts.find((node) => node.origin.source?.kind === "root");
    const childText = texts.find((node) => node.origin.source?.kind === "mounted");

    expect(result.resolvedStyles?.get(parentText?.id ?? ("" as never))?.style).toMatchObject({
      color: "red",
    });
    expect(result.resolvedStyles?.get(childText?.id ?? ("" as never))?.style).toMatchObject({
      color: "blue",
    });
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("style resolution selector diagnostics", () => {
  test("unknown style classes are warnings and do not fail strict compile", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(() => (
      <>
        <p className="missing">Revenue</p>
      </>
    ));

    const result = deck.compile();

    expect(result.diagnostics.items[0]).toMatchObject({
      code: "E_STYLE_UNKNOWN_CLASS",
      severity: "warning",
    });
    expect(result.ok).toBe(true);
  });

  test("selector condition classes do not require style class definitions", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: { caption: { target: ".card .caption", style: { color: "red" } } },
      }),
    );

    deck.slide(() => (
      <>
        <div className="card">
          <p className="caption">Revenue</p>
        </div>
      </>
    ));

    const result = deck.compile();

    expect(result.diagnostics.items).toHaveLength(0);
  });

  test("stylesheet definition diagnostics do not require class usage", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(new H.StyleSheet({ classes: { "bad class": { color: "red" } } }));
    deck.slide(() => <></>);

    const result = deck.compile();

    expect(result.diagnostics.items[0]).toMatchObject({
      code: "E_STYLE_INVALID_CLASS_NAME",
      severity: "error",
    });
    expect(result.ok).toBe(false);
  });

  test("slash-separated style class names resolve through CSS-escaped selectors", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: { "report/title": { target: "p.report\\/title", style: { color: "red" } } },
      }),
    );
    deck.slide(() => (
      <>
        <p className="report/title">Revenue</p>
      </>
    ));

    const result = deck.compile();
    const text = H.values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );

    expect(result.diagnostics.hasErrors).toBe(false);
    expect(result.resolvedStyles?.get(text?.id ?? ("" as never))?.style).toMatchObject({
      color: "red",
    });
  });

  test("untargeted selector provenance uses CSS.escape-compatible class selectors", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: {
          "123": { color: "red" },
          "-1": { fontWeight: 700 },
          "foo:bar": { fontSize: 24 },
          "😀": { backgroundColor: "yellow" },
        },
      }),
    );
    deck.slide(() => (
      <>
        <p className={["123", "-1", "foo:bar", "😀"]}>Revenue</p>
      </>
    ));

    const result = deck.compile();
    const text = H.values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );
    const resolved = result.resolvedStyles?.get(text?.id ?? ("" as never));

    expect(result.diagnostics.hasErrors).toBe(false);
    expect(resolved?.style).toMatchObject({
      color: "red",
      fontWeight: 700,
      fontSize: 24,
      backgroundColor: "yellow",
    });
    expect(
      resolved?.appliedClasses.map((source) => source.layer === "class" && source.selector),
    ).toEqual([".\\31 23", ".-\\31 ", ".foo\\:bar", ".😀"]);
  });

  test("style class targets must include the self class in the rightmost selector", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: {
          title: { target: "p", style: { color: "red" } },
          lead: { target: ".lead .caption", style: { fontSize: 24 } },
          kicker: { target: ["p.kicker", "h1"], style: { fontWeight: 700 } },
        },
      }),
    );
    deck.slide(() => <></>);

    const result = deck.compile();

    expect(result.diagnostics.items.map((item) => item.code)).toEqual([
      "E_STYLE_INVALID_CLASS_TARGET",
      "E_STYLE_INVALID_CLASS_TARGET",
      "E_STYLE_INVALID_CLASS_TARGET",
    ]);
    expect(result.ok).toBe(false);
  });

  test("unsupported selector features are stylesheet diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: {
          pseudo: { target: ".pseudo:hover", style: { color: "red" } },
          child: { target: ".card > .child", style: { color: "blue" } },
          button: { target: "button.button", style: { color: "green" } },
          comma: { target: "p.comma, h1.comma", style: { color: "purple" } },
        },
      }),
    );
    deck.slide(() => <></>);

    const result = deck.compile();

    expect(result.diagnostics.items.map((item) => item.code)).toEqual([
      "E_STYLE_UNSUPPORTED_SELECTOR",
      "E_STYLE_UNSUPPORTED_SELECTOR",
      "E_STYLE_UNSUPPORTED_SELECTOR",
      "E_STYLE_UNSUPPORTED_SELECTOR",
    ]);
  });

  test("style class target mismatches are compile diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({
        classes: { title: { target: "div.title", style: { backgroundColor: "red" } } },
      }),
    );

    deck.slide(() => (
      <>
        <p className="title">Revenue</p>
      </>
    ));

    const result = deck.compile();

    expect(result.diagnostics.items[0]).toMatchObject({
      code: "E_STYLE_TARGET_MISMATCH",
      severity: "error",
    });
    expect(result.ok).toBe(false);
  });

  test("empty target arrays match no elements", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new H.StyleSheet({ classes: { title: { target: [], style: { color: "red" } } } }),
    );

    deck.slide(() => (
      <>
        <p className="title">Revenue</p>
      </>
    ));

    const result = deck.compile();

    expect(result.diagnostics.items[0]).toMatchObject({
      code: "E_STYLE_TARGET_MISMATCH",
      severity: "error",
    });
  });
});

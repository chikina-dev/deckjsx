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
        classes: { caption: { target: "div.card p.caption", style: { color: "red" } } },
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
    deck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: { "bad class": { target: "p.bad-class", style: { color: "red" } } },
      }),
    );
    deck.slide(() => <></>);

    const result = deck.compile();

    expect(result.diagnostics.items[0]).toMatchObject({
      code: "E_STYLE_INVALID_CLASS_NAME",
      severity: "error",
      title: "style class name is not part of the public authoring API",
      message:
        "Style Class names must not contain whitespace. This is not part of the public authoring API.",
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
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: {
          "123": { target: "p.\\31 23", style: { color: "red" } },
          "-1": { target: "p.-\\31 ", style: { fontWeight: 700 } },
          "foo:bar": { target: "p.foo\\:bar", style: { fontSize: 24 } },
          "😀": { target: "p.😀", style: { backgroundColor: "yellow" } },
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
    ).toEqual(["p.\\31 23", "p.-\\31 ", "p.foo\\:bar", "p.😀"]);
  });

  test("style class targets must include the self class in the rightmost selector", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: {
          title: { target: "p", style: { color: "red" } },
          lead: { target: "div.lead p.caption", style: { fontSize: 24 } },
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

  test("non-public selector features are stylesheet diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
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
      "E_STYLE_NON_PUBLIC_SELECTOR",
      "E_STYLE_NON_PUBLIC_SELECTOR",
      "E_STYLE_NON_PUBLIC_SELECTOR",
      "E_STYLE_NON_PUBLIC_SELECTOR",
    ]);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "stylesheet selector is not part of the public authoring API",
          message: expect.stringContaining(
            'Selector ".pseudo:hover" is not part of the public authoring API',
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            'Selector ".card > .child" is not part of the public authoring API',
          ),
        }),
      ]),
    );
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

  test("empty target arrays are stylesheet diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: { title: { target: [], style: { color: "red" } } },
      }),
    );

    deck.slide(() => (
      <>
        <p className="title">Revenue</p>
      </>
    ));

    const result = deck.compile();

    expect(result.diagnostics.items[0]).toMatchObject({
      code: "E_STYLE_INVALID_CLASS_TARGET",
      severity: "error",
    });
    expect(result.diagnostics.items[0]?.message).toContain(
      'Style Class "title" target is not part of the public authoring API',
    );
    expect(result.ok).toBe(false);
  });

  test("class-only and targetless style declarations are runtime diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: {
          classOnly: { target: ".classOnly", style: { color: "red" } },
          targetless: { color: "blue" },
        },
      }),
    );

    deck.slide(() => (
      <>
        <p className="classOnly targetless">Revenue</p>
      </>
    ));

    const result = deck.compile();

    expect(result.diagnostics.items.map((item) => item.code)).toEqual([
      "E_STYLE_CLASS_TARGET_REQUIRES_TAG",
      "E_STYLE_CLASS_TARGET_REQUIRED",
    ]);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'Style Class "classOnly" target is not part of the public authoring API unless it names an authored tag',
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            'Style Class "targetless" targetless style declaration is not part of the public authoring API',
          ),
        }),
      ]),
    );
    expect(result.ok).toBe(false);
  });

  test("stylesheet style keys and values are runtime diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: {
          logo: { target: "img.logo", style: { fontSize: 18 } },
          title: { target: "p.title", style: { color: "definitely-not-a-color" } },
          accent: { target: "span.accent", style: { color: "red", left: 1 } },
        },
      }),
    );

    deck.slide(() => (
      <>
        <img className="logo" src="logo.png" />
        <p className="title">Revenue</p>
      </>
    ));

    const result = deck.compile();

    expect(result.diagnostics.items.map((item) => item.code)).toEqual([
      "E_COMPILE_NON_PUBLIC_STYLE_PROP",
      "E_COMPILE_INVALID_STYLE_VALUE",
      "E_COMPILE_NON_PUBLIC_STYLE_PROP",
    ]);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'Style property "fontSize" is not part of the public deckjsx authoring style API for img',
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining("color value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            'Style property "left" is not part of the public deckjsx authoring style API for span',
          ),
        }),
      ]),
    );
    expect(result.ok).toBe(false);
  });

  test("stylesheet array target style is validated against every targeted tag", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: {
          mixed: { target: ["p.mixed", "img.mixed"], style: { fontSize: 18 } },
        },
      }),
    );
    deck.slide(() => <></>);

    const result = deck.compile();

    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_COMPILE_NON_PUBLIC_STYLE_PROP",
        message: expect.stringContaining(
          'Style property "fontSize" is not part of the public deckjsx authoring style API for img',
        ),
      }),
    ]);
    expect(result.ok).toBe(false);
  });

  test("stylesheet target values outside the public authoring API are diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: {
          empty: { target: [], style: { color: "red" } },
          number: { target: 1, style: { color: "blue" } },
          mixed: { target: ["p.mixed", false], style: { fontSize: 24 } },
        },
      }),
    );
    deck.slide(() => (
      <>
        <p className="empty number mixed">Revenue</p>
      </>
    ));

    const result = deck.compile();

    expect(result.diagnostics.items.map((item) => item.code)).toEqual([
      "E_STYLE_INVALID_CLASS_TARGET",
      "E_STYLE_INVALID_CLASS_TARGET",
      "E_STYLE_INVALID_CLASS_TARGET",
    ]);
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'Style Class "empty" target is not part of the public authoring API',
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            'Style Class "number" target is not part of the public authoring API',
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            'Style Class "mixed" target is not part of the public authoring API',
          ),
        }),
      ]),
    );
    expect(result.ok).toBe(false);
  });

  test("stylesheet class containers and definitions outside the public authoring API are diagnostics", async () => {
    const invalidClassesDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidClassesDeck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: null,
      }),
    );
    invalidClassesDeck.slide(() => <p>Revenue</p>);

    const invalidDefinitionsDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidDefinitionsDeck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: {
          title: null,
          count: 1,
        },
      }),
    );
    invalidDefinitionsDeck.slide(() => <p className="title count">Revenue</p>);

    const invalidStyleDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidStyleDeck.useStyles(
      new (H.StyleSheet as { new (input: unknown): H.StyleSheet })({
        classes: {
          caption: { target: "p.caption", style: null },
        },
      }),
    );
    invalidStyleDeck.slide(() => <p className="caption">Revenue</p>);

    const invalidClassesResult = invalidClassesDeck.compile();
    const invalidDefinitionsResult = invalidDefinitionsDeck.compile();
    const invalidStyleResult = invalidStyleDeck.compile();
    const diagnostics = [
      ...invalidClassesResult.diagnostics.items,
      ...invalidDefinitionsResult.diagnostics.items,
      ...invalidStyleResult.diagnostics.items,
    ];

    expect(diagnostics.map((item) => item.code)).toEqual([
      "E_STYLE_SHEET_CLASSES_INVALID",
      "E_STYLE_CLASS_DEFINITION_INVALID",
      "E_STYLE_CLASS_DEFINITION_INVALID",
      "E_STYLE_CLASS_STYLE_INVALID",
    ]);
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            "StyleSheet classes must be an object in the public authoring API",
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            'Style Class "title" definition must be an object in the public authoring API',
          ),
        }),
        expect.objectContaining({
          message: expect.stringContaining(
            'Style Class "count" definition must be an object in the public authoring API',
          ),
        }),
        expect.objectContaining({
          title: "style class style is not part of the public authoring API",
          message: "Style Class style declarations must be objects in the public authoring API.",
        }),
      ]),
    );
    expect(invalidClassesResult.ok).toBe(false);
    expect(invalidDefinitionsResult.ok).toBe(false);
    expect(invalidStyleResult.ok).toBe(false);
  });

  test("stylesheet inputs outside the public authoring API are compile diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(new (H.StyleSheet as { new (input: unknown): H.StyleSheet })(null));
    deck.slide(() => <p>Revenue</p>);

    const result = deck.compile();

    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_STYLE_SHEET_CLASSES_INVALID",
        message: "StyleSheet classes must be an object in the public authoring API.",
      }),
    ]);
    expect(result.ok).toBe(false);
  });

  test("registered stylesheet values outside the public authoring API are compile diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    (deck.useStyles as (stylesheet: unknown) => H.Deck)(null);
    deck.slide(() => <p>Revenue</p>);

    const result = deck.compile();

    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_STYLE_SHEET_INVALID",
        message:
          "Registered StyleSheet values must be StyleSheet objects in the public authoring API.",
      }),
    ]);
    expect(result.ok).toBe(false);
  });
});

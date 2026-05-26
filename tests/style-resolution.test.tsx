import { describe, expect, test } from "vite-plus/test";
import { Deck, Image, StyleSheet, Text, Theme, View } from "../src/index.ts";
import type { ThemeInput } from "../src/index.ts";

function values<T>(map: ReadonlyMap<unknown, T>): T[] {
  return [...map.values()];
}

describe("style", () => {
  test("captures className as ordered style class references", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
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
        <View
          className={[
            "card",
            false,
            ["selected", { active: true, disabled: false, "": true, "   ": true }],
            "wide card",
          ]}
          x={1}
        >
          <Text className={{ title: true, muted: null }}>
            Hello <span className="accent">world</span>
          </Text>
          <Image src="chart.png" className="chart-image" />
        </View>
      </>
    ));

    const graph = deck.compile().graph!;
    const view = values(graph.nodes).find(
      (node) => node.kind === "container" && node.authoredComponent === "View",
    );
    const slide = values(graph.nodes).find((node) => node.kind === "slide");
    const image = values(graph.nodes).find((node) => node.kind === "image");
    const span = values(graph.nodes).find(
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

  test("normalizes direct style props into authored style for graph inspection", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide(() => (
      <>
        <View x={1} y={2} style={{ y: 3, width: 4 }}>
          <Text>
            Hello <span color="red">world</span>
          </Text>
        </View>
      </>
    ));

    const graph = deck.compile().graph!;
    const view = values(graph.nodes).find(
      (node) => node.kind === "container" && node.authoredComponent === "View",
    );
    const span = values(graph.nodes).find(
      (node) => node.kind === "textRun" && node.text === "world",
    );

    expect(graph.styles.get(view?.styleRef ?? ("" as never))?.authored.style).toEqual({
      x: 1,
      y: 3,
      width: 4,
    });
    expect(graph.styles.get(span?.styleRef ?? ("" as never))?.authored.style).toEqual({
      color: "red",
    });
  });

  test("inspect mode exposes CSS-like resolved styles without changing the graph", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
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
    const text = values(result.graph?.nodes ?? new Map()).find(
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

  test("theme defaults apply between element defaults and authored styles", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({
        defaults: {
          p: { color: "gray", fontSize: 18 },
          span: { color: "orange" },
          div: { padding: 0.25, backgroundColor: "#f8fafc" },
        },
      }),
    });
    deck.useStyles(
      new StyleSheet({
        classes: {
          title: { target: "p.title", style: { fontSize: 28 } },
        },
      }),
    );

    deck.slide(() => (
      <>
        <div>
          <p className="title" style={{ color: "blue" }}>
            Revenue <span>delta</span>
          </p>
        </div>
      </>
    ));

    const result = deck.compile();
    const nodes = values(result.graph?.nodes ?? new Map());
    const container = nodes.find((node) => node.kind === "container" && node.authoredTag === "div");
    const text = nodes.find((node) => node.kind === "text" && node.authoredTag === "p");
    const span = nodes.find((node) => node.kind === "textRun" && node.authoredTag === "span");
    const textStyle = result.resolvedStyles?.get(text?.id ?? ("" as never));
    const spanStyle = result.resolvedStyles?.get(span?.id ?? ("" as never));

    expect(result.diagnostics.hasErrors).toBe(false);
    expect(result.resolvedStyles?.get(container?.id ?? ("" as never))?.style).toMatchObject({
      padding: 0.25,
      backgroundColor: "#f8fafc",
    });
    expect(textStyle?.style).toMatchObject({ color: "blue", fontSize: 28 });
    expect(textStyle?.properties.color?.source).toEqual({ layer: "style" });
    expect(textStyle?.properties.fontSize?.source).toMatchObject({
      layer: "class",
      className: "title",
    });
    expect(textStyle?.properties.fontFamily?.source).toEqual({ layer: "default" });
    expect(spanStyle?.style).toMatchObject({ color: "orange" });
    expect(spanStyle?.properties.color?.source).toEqual({
      layer: "theme",
      defaultKey: "span",
    });
  });

  test("theme composition flows through mounted sources without changing source-local styles", () => {
    const parent = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({ defaults: { p: { color: "red", fontSize: 21 } } }),
    });
    const child = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({ defaults: { p: { color: "blue" } } }),
    });

    parent.slide(() => (
      <>
        <p>Parent</p>
      </>
    ));
    child.slide(() => (
      <>
        <p>Child</p>
      </>
    ));
    parent.mount("child", child);

    const mounted = parent.compile();
    const mountedTexts = values(mounted.graph?.nodes ?? new Map()).filter(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );
    const parentText = mountedTexts.find((node) => node.origin.source?.kind === "root");
    const childText = mountedTexts.find((node) => node.origin.source?.kind === "mounted");
    const standalone = child.compile();
    const standaloneText = values(standalone.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );

    expect(mounted.resolvedStyles?.get(parentText?.id ?? ("" as never))?.style).toMatchObject({
      color: "red",
      fontSize: 21,
    });
    expect(mounted.resolvedStyles?.get(childText?.id ?? ("" as never))?.style).toMatchObject({
      color: "blue",
      fontSize: 21,
    });
    expect(
      standalone.resolvedStyles?.get(standaloneText?.id ?? ("" as never))?.style,
    ).toMatchObject({
      color: "blue",
      fontSize: 18,
    });
  });

  test("theme extension and theme-defined styles are concrete snapshots", () => {
    const baseTheme = new Theme({
      colors: { text: "#111111", accent: "#2563eb" },
      defaults: { p: { color: "#111111" } },
      breakpoints: ["base"],
    });
    const baseStyles = baseTheme.defineStyles((theme) => ({
      classes: {
        title: { color: theme.colors.text },
      },
    }));
    const extendedTheme = baseTheme.extend((theme) => ({
      colors: { accent: "#dc2626", muted: theme.colors.text },
      defaults: { p: { fontSize: 24 } },
      breakpoints: ["extended"],
    }));
    const mergedTheme = extendedTheme.extend(
      new Theme({
        colors: { text: "#0f172a" },
        defaults: { span: { color: "#dc2626" } },
      }),
    );
    const mergedStyles = mergedTheme.defineStyles((theme) => ({
      classes: {
        title: { color: theme.colors.text, fontSize: theme.defaults.p.fontSize },
      },
    }));

    expect(baseStyles.classes.title).toEqual({ color: "#111111" });
    expect(mergedTheme.colors).toEqual({
      text: "#0f172a",
      accent: "#dc2626",
      muted: "#111111",
    });
    expect(mergedTheme.breakpoints).toEqual(["extended"]);
    expect(mergedTheme.defaults).toMatchObject({
      p: { color: "#111111", fontSize: 24 },
      span: { color: "#dc2626" },
    });
    expect(mergedStyles.classes.title).toEqual({ color: "#0f172a", fontSize: 24 });
  });

  test("invalid theme defaults are compile diagnostics", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({
        defaults: {
          Slide: { color: "red" },
          span: { x: 1 },
        },
      } as unknown as ThemeInput),
    });
    deck.slide(() => (
      <>
        <p>Revenue</p>
      </>
    ));

    const result = deck.compile();

    expect(result.diagnostics.items.map((item) => item.code)).toEqual([
      "E_THEME_INVALID_DEFAULT_KEY",
      "E_THEME_INVALID_DEFAULT_STYLE",
    ]);
    expect(result.ok).toBe(false);
  });

  test("stylesheet source order wins over className token order", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
        classes: {
          a: { color: "red" },
          b: { color: "blue" },
        },
      }),
    );

    deck.slide(() => (
      <>
        <p className="b a">Revenue</p>
      </>
    ));

    const result = deck.compile();
    const text = values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );

    expect(result.resolvedStyles?.get(text?.id ?? ("" as never))?.style).toMatchObject({
      color: "blue",
    });
  });

  test("selector specificity wins over stylesheet source order", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
        classes: {
          caption: { target: ".card .caption", style: { color: "red" } },
        },
      }),
    );
    deck.useStyles(
      new StyleSheet({
        classes: {
          caption: { target: ".caption", style: { color: "blue" } },
        },
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
    const text = values(result.graph?.nodes ?? new Map()).find(
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

  test("target selectors match authored tags, classes, and descendants", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
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
    const header = values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "container" && node.authoredTag === "header",
    );
    const text = values(result.graph?.nodes ?? new Map()).find(
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
      expect.objectContaining({
        className: "report/title",
        selector: ".report\\/title",
      }),
    );
  });

  test("style classes resolve against the source-local stylesheet", () => {
    const parent = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    const child = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    parent.useStyles(new StyleSheet({ classes: { note: { color: "red" } } }));
    child.useStyles(new StyleSheet({ classes: { note: { color: "blue" } } }));

    parent.slide(() => (
      <>
        <p className="note">Parent</p>
      </>
    ));
    child.slide(() => (
      <>
        <p className="note">Child</p>
      </>
    ));
    parent.mount("child", child);

    const result = parent.compile();
    const texts = values(result.graph?.nodes ?? new Map()).filter(
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

  test("unknown style classes are warnings and do not fail strict compile", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

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

  test("selector condition classes do not require style class definitions", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
        classes: {
          caption: { target: ".card .caption", style: { color: "red" } },
        },
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

  test("stylesheet definition diagnostics do not require class usage", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
        classes: {
          "bad class": { color: "red" },
        },
      }),
    );
    deck.slide(() => <></>);

    const result = deck.compile();

    expect(result.diagnostics.items[0]).toMatchObject({
      code: "E_STYLE_INVALID_CLASS_NAME",
      severity: "error",
    });
    expect(result.ok).toBe(false);
  });

  test("slash-separated style class names resolve through CSS-escaped selectors", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
        classes: {
          "report/title": { target: "p.report\\/title", style: { color: "red" } },
        },
      }),
    );
    deck.slide(() => (
      <>
        <p className="report/title">Revenue</p>
      </>
    ));

    const result = deck.compile();
    const text = values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );

    expect(result.diagnostics.hasErrors).toBe(false);
    expect(result.resolvedStyles?.get(text?.id ?? ("" as never))?.style).toMatchObject({
      color: "red",
    });
  });

  test("untargeted selector provenance uses CSS.escape-compatible class selectors", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
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
    const text = values(result.graph?.nodes ?? new Map()).find(
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

  test("style class targets must include the self class in the rightmost selector", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
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

  test("unsupported selector features are stylesheet diagnostics", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
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

  test("style class target mismatches are compile diagnostics", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
        classes: {
          title: { target: "div.title", style: { backgroundColor: "red" } },
        },
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

  test("empty target arrays match no elements", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    deck.useStyles(
      new StyleSheet({
        classes: {
          title: { target: [], style: { color: "red" } },
        },
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
  });
});

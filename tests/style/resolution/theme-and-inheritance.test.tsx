import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("style resolution theme and inheritance", () => {
  test("theme defaults apply between element defaults and authored styles", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({
        defaults: {
          p: { color: "gray", fontSize: 18 },
          span: { color: "orange" },
          div: { padding: 0.25, backgroundColor: "#f8fafc" },
        },
      }),
    });
    deck.useStyles(
      new H.StyleSheet({ classes: { title: { target: "p.title", style: { fontSize: 28 } } } }),
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
    const nodes = H.values(result.graph?.nodes ?? new Map());
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
    expect(spanStyle?.style).toMatchObject({ color: "orange", fontFamily: "Aptos", fontSize: 28 });
    expect(spanStyle?.properties.color?.source).toEqual({ layer: "theme", defaultKey: "span" });
    expect(spanStyle?.properties.fontFamily?.source).toEqual({
      layer: "inherited",
      parentId: text?.id,
    });
    expect(spanStyle?.properties.fontSize?.source).toEqual({
      layer: "inherited",
      parentId: text?.id,
    });
  });

  test("span text runs inherit parent text style without requiring explicit run styles", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(() => (
      <>
        <p
          style={{
            color: "#2563EB",
            fontFamily: "Aptos Display",
            fontSize: 30,
            lineHeight: 1.4,
            letterSpacing: "0.04em",
          }}
        >
          Revenue <span style={{ fontWeight: 700 }}>grew</span>
        </p>
      </>
    ));

    const result = deck.compile();
    const nodes = H.values(result.graph?.nodes ?? new Map());
    const text = nodes.find((node) => node.kind === "text" && node.authoredTag === "p");
    const span = nodes.find((node) => node.kind === "textRun" && node.authoredTag === "span");
    const spanStyle = result.resolvedStyles?.get(span?.id ?? ("" as never));

    expect(result.diagnostics.hasErrors).toBe(false);
    expect(spanStyle?.style).toMatchObject({
      color: "#2563EB",
      fontFamily: "Aptos Display",
      fontSize: 30,
      fontWeight: 700,
      lineHeight: 1.4,
      letterSpacing: "0.04em",
    });
    expect(spanStyle?.properties.color?.source).toEqual({
      layer: "inherited",
      parentId: text?.id,
    });
    expect(spanStyle?.properties.fontWeight?.source).toEqual({ layer: "style" });
  });

  test("theme composition flows through mounted sources without changing source-local styles", async () => {
    const parentDeck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({ defaults: { p: { color: "red", fontSize: 21 } } }),
    });
    const childDeck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({ defaults: { p: { color: "blue" } } }),
    });

    parentDeck.slide(() => (
      <>
        <p>Parent</p>
      </>
    ));
    childDeck.slide(() => (
      <>
        <p>Child</p>
      </>
    ));
    parentDeck.mount("child", childDeck);

    const mounted = parentDeck.compile();
    const mountedTexts = H.values(mounted.graph?.nodes ?? new Map()).filter(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );
    const parentText = mountedTexts.find((node) => node.origin.source?.kind === "root");
    const childText = mountedTexts.find((node) => node.origin.source?.kind === "mounted");
    const standalone = childDeck.compile();
    const standaloneText = H.values(standalone.graph?.nodes ?? new Map()).find(
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

  test("theme extension and theme-defined styles are concrete snapshots", async () => {
    const baseTheme = new H.Theme({
      colors: { text: "#111111", accent: "#2563eb" },
      defaults: { p: { color: "#111111" } },
      breakpoints: ["base"],
    });
    const baseStyles = baseTheme.defineStyles((theme) => ({
      classes: { title: { color: theme.colors.text } },
    }));
    const extendedTheme = baseTheme.extend((theme) => ({
      colors: { accent: "#dc2626", muted: theme.colors.text },
      defaults: { p: { fontSize: 24 } },
      breakpoints: ["extended"],
    }));
    const mergedTheme = extendedTheme.extend(
      new H.Theme({ colors: { text: "#0f172a" }, defaults: { span: { color: "#dc2626" } } }),
    );
    const mergedStyles = mergedTheme.defineStyles((theme) => ({
      classes: { title: { color: theme.colors.text, fontSize: theme.defaults.p.fontSize } },
    }));

    expect(baseStyles.classes.title).toEqual({ color: "#111111" });
    expect(mergedTheme.colors).toEqual({ text: "#0f172a", accent: "#dc2626", muted: "#111111" });
    expect(mergedTheme.breakpoints).toEqual(["extended"]);
    expect(mergedTheme.defaults).toMatchObject({
      p: { color: "#111111", fontSize: 24 },
      span: { color: "#dc2626" },
    });
    expect(mergedStyles.classes.title).toEqual({ color: "#0f172a", fontSize: 24 });
  });

  test("theme extension proto keys are cloned as own defaults instead of prototypes", async () => {
    const extension = JSON.parse(
      '{"defaults":{"__proto__":{"p":{"evilStyle":1337,"color":"red"}}}}',
    ) as { defaults: Record<string, unknown> };
    const theme = new H.Theme({ defaults: {} }).extend(extension);
    const defaults = theme.defaults as Record<string, unknown>;
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme,
    });
    deck.slide(() => (
      <>
        <p>Revenue</p>
      </>
    ));

    const result = deck.compile();
    const text = H.values(result.graph?.nodes ?? new Map()).find(
      (node) => node.kind === "text" && node.authoredTag === "p",
    );

    expect(Object.hasOwn(defaults, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(defaults)).toBe(null);
    expect(defaults.p).toBeUndefined();
    expect(result.diagnostics.items.map((item) => item.code)).toContain(
      "E_THEME_INVALID_DEFAULT_KEY",
    );
    expect(result.resolvedStyles?.get(text?.id ?? ("" as never))?.style).not.toHaveProperty(
      "evilStyle",
    );
  });

  test("invalid theme defaults are compile diagnostics", async () => {
    const invalidTheme = new H.Theme(
      { defaults: { Slide: { color: "red" }, span: { x: 1 } } },
      "Theme defaults must use authored tag styles.",
    );
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      // @ts-expect-error Invalid theme defaults should be rejected by public types and still diagnosed at runtime.
      theme: invalidTheme,
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
});

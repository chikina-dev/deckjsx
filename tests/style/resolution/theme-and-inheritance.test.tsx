import { describe, expect, test } from "vite-plus/test";
import { resolveStyles } from "@/src/style/resolve.ts";
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
            position: "absolute",
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

  test("cyclic graph style inheritance is diagnosed instead of overflowing the stack", async () => {
    const documentId = "document" as never;
    const nodeId = "cycle" as never;
    const cyclicGraph = {
      documentId,
      nodes: new Map([
        [
          documentId,
          {
            id: documentId,
            kind: "document",
            origin: { kind: "implicit", path: "graph.nodes.document" },
            children: [nodeId],
          },
        ],
        [
          nodeId,
          {
            id: nodeId,
            kind: "container",
            origin: { kind: "authored", path: "graph.nodes.cycle" },
            children: [nodeId],
          },
        ],
      ]),
      styles: new Map(),
      assets: new Map(),
      templates: new Map(),
    } as never;
    const targetDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    expect(() => targetDeck.defineGraph(cyclicGraph)).not.toThrow();

    const result = resolveStyles(cyclicGraph, []);
    expect(result.diagnostics.items.map((item) => item.code)).toContain(
      "E_STYLE_INHERITANCE_CYCLE",
    );
    expect(result.resolvedStyles.get(nodeId)).toBeDefined();
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
      classes: { title: { target: "p.title", style: { color: theme.colors.text } } },
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
      classes: {
        title: {
          target: "p.title",
          style: { color: theme.colors.text, fontSize: theme.defaults.p.fontSize },
        },
      },
    }));

    expect(baseStyles.classes.title).toEqual({
      target: "p.title",
      style: { color: "#111111" },
    });
    expect(mergedTheme.colors).toEqual({ text: "#0f172a", accent: "#dc2626", muted: "#111111" });
    expect(mergedTheme.breakpoints).toEqual(["extended"]);
    expect(mergedTheme.defaults).toMatchObject({
      p: { color: "#111111", fontSize: 24 },
      span: { color: "#dc2626" },
    });
    expect(mergedStyles.classes.title).toEqual({
      target: "p.title",
      style: { color: "#0f172a", fontSize: 24 },
    });
  });

  test("theme extension proto keys are cloned as own defaults instead of prototypes", async () => {
    const extension = JSON.parse(
      '{"defaults":{"__proto__":{"p":{"evilStyle":1337,"color":"red"}}}}',
    ) as { defaults: Record<string, unknown> };
    const theme = (
      new H.Theme({ defaults: {} }) as H.Theme & {
        extend(input: object): H.Theme;
      }
    ).extend(extension);
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
    const UnsafeTheme = H.Theme as { new (input: unknown): H.Theme };
    const invalidTheme = new UnsafeTheme({
      defaults: {
        Slide: { color: "red" },
        img: { fontSize: 18 },
        p: { color: "definitely-not-a-color" },
        span: { color: "red", left: 1 },
      },
    });
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
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
      "E_COMPILE_NON_PUBLIC_STYLE_PROP",
      "E_COMPILE_INVALID_STYLE_VALUE",
      "E_COMPILE_NON_PUBLIC_STYLE_PROP",
    ]);
    expect(result.diagnostics.items.map((item) => item.message)).toEqual([
      'Theme default key "Slide" is not part of the public authoring API. Theme defaults are keyed by authored tags.',
      'Style property "fontSize" is not part of the public deckjsx authoring style API for img.',
      "color value is not part of the public authoring API. Use a supported CSS color value.",
      'Style property "left" is not part of the public deckjsx authoring style API for span.',
    ]);
    expect(result.ok).toBe(false);
  });

  test("theme inputs outside the public authoring API are compile diagnostics", async () => {
    const UnsafeTheme = H.Theme as { new (input: unknown): H.Theme };
    const invalidTheme = new UnsafeTheme(null);
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: invalidTheme,
    });
    deck.slide(() => <p>Revenue</p>);

    const result = deck.compile();

    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_THEME_INPUT_INVALID",
        message: "Theme input must be an object in the public authoring API.",
      }),
    ]);
    expect(result.ok).toBe(false);
  });

  test("theme default containers outside the public authoring API are compile diagnostics", async () => {
    const UnsafeTheme = H.Theme as { new (input: unknown): H.Theme };
    const invalidDefaultsTheme = new UnsafeTheme({ defaults: null });
    const invalidStyleTheme = new UnsafeTheme({ defaults: { p: null } });
    const invalidDefaultsDeck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: invalidDefaultsTheme,
    });
    const invalidStyleDeck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: invalidStyleTheme,
    });
    invalidDefaultsDeck.slide(() => <p>Defaults</p>);
    invalidStyleDeck.slide(() => <p>Style</p>);

    const diagnostics = [
      ...invalidDefaultsDeck.compile().diagnostics.items,
      ...invalidStyleDeck.compile().diagnostics.items,
    ];

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "E_THEME_INVALID_DEFAULTS",
        title: "theme defaults are not part of the public authoring API",
        message:
          "Theme defaults must be an object keyed by authored tag in the public authoring API.",
      }),
      expect.objectContaining({
        code: "E_THEME_INVALID_DEFAULT_STYLE",
        title: "theme default style is not part of the public authoring API",
        message: 'Theme default "p" style must be an object in the public authoring API.',
      }),
    ]);
  });

  test("deck theme option values outside the public authoring API are compile diagnostics", async () => {
    const nullThemeDeck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: null,
    } as never);
    const numberThemeDeck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: 1,
    } as never);
    nullThemeDeck.slide(() => <p>Null theme</p>);
    numberThemeDeck.slide(() => <p>Number theme</p>);

    const nullThemeResult = nullThemeDeck.compile();
    const numberThemeResult = numberThemeDeck.compile();
    const diagnostics = [
      ...nullThemeResult.diagnostics.items,
      ...numberThemeResult.diagnostics.items,
    ];

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "E_THEME_INVALID",
        message: "Deck theme must be a Theme object in the public authoring API.",
      }),
      expect.objectContaining({
        code: "E_THEME_INVALID",
        message: "Deck theme must be a Theme object in the public authoring API.",
      }),
    ]);
    expect(nullThemeResult.ok).toBe(false);
    expect(numberThemeResult.ok).toBe(false);
  });

  test("undefined deck theme options behave like omitted theme options", async () => {
    const rootWithoutTheme = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: undefined,
    } as never);
    const root = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({ defaults: { p: { color: "purple" } } }),
    });
    const child = new H.Deck<{ label: string }>({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: undefined,
    } as never);

    rootWithoutTheme.slide(() => <p>Root</p>);
    root.slide(() => <p>Root</p>);
    child.slide(({ context }) => <p>{context.label}</p>);
    root.mount("child", child, { label: "Child" });

    const rootWithoutThemeResult = rootWithoutTheme.compile();
    const result = root.compile();
    const nodes = H.values(result.graph?.nodes ?? new Map());
    const childText = nodes.find(
      (node) => node.kind === "text" && node.origin.source.kind === "mounted",
    );
    const childTextStyle = result.resolvedStyles?.get(childText?.id ?? ("" as never));

    expect(rootWithoutThemeResult.ok).toBe(true);
    expect(rootWithoutThemeResult.diagnostics.items).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.filter((item) => item.code === "E_THEME_INVALID")).toEqual([]);
    expect(childTextStyle?.style).toMatchObject({ color: "purple" });
    expect(childTextStyle?.properties.color?.source).toEqual({ layer: "theme", defaultKey: "p" });
  });

  test("bound sources preserve invalid theme diagnostics", async () => {
    const deck = new H.Deck<{ label: string }>({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: null,
    } as never);
    deck.slide(({ context }) => <p>{context.label}</p>);

    const result = deck.withSource({ label: "Bound" }).compile();

    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_THEME_INVALID",
        message: "Deck theme must be a Theme object in the public authoring API.",
      }),
    ]);
    expect(result.ok).toBe(false);
  });
});

import { describe, expect, test } from "vite-plus/test";
import { createAuthoringExtensionValue } from "@/src/integration.ts";
import { invalidDeckPluginDiagnostic, isDeckPlugin, validateDeckPlugins } from "@/src/plugin.ts";
import * as H from "./helpers.tsx";

const layout = { width: 10, height: 5.625, unit: "in" } as const;

describe("deck plugin authoring extension lowering", () => {
  test("validates every public Plugin namespace at the ingress seam", () => {
    const invalidPlugins: readonly unknown[] = [
      null,
      { kind: "deckjsx.plugin", id: "valid", name: 1 },
      { kind: "deckjsx.plugin", id: "valid", integration: [] },
      { kind: "deckjsx.plugin", id: "valid", integration: { id: "x", extra: true } },
      { kind: "deckjsx.plugin", id: "valid", integration: { id: "" } },
      { kind: "deckjsx.plugin", id: "valid", integration: { id: "x", assetLoaders: {} } },
      { kind: "deckjsx.plugin", id: "valid", integration: { id: "x", fontAssets: {} } },
      {
        kind: "deckjsx.plugin",
        id: "valid",
        integration: { id: "x", mediaSourceOrigin: { importer: 1 } },
      },
      { kind: "deckjsx.plugin", id: "valid", authoring: [] },
      { kind: "deckjsx.plugin", id: "valid", authoring: { extra: true } },
      { kind: "deckjsx.plugin", id: "valid", authoring: { lower: true } },
      { kind: "deckjsx.plugin", id: "valid", hooks: [] },
      { kind: "deckjsx.plugin", id: "valid", hooks: { unknown: () => undefined } },
      { kind: "deckjsx.plugin", id: "valid", hooks: { beforeTree: true } },
    ];

    expect(invalidPlugins.map(isDeckPlugin)).toEqual(invalidPlugins.map(() => false));
    expect(validateDeckPlugins("not-an-array")).toContainEqual(
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        message: "Deck plugins must be an array of Deck Plugins when provided.",
      }),
    );
    expect(validateDeckPlugins(invalidPlugins)).toHaveLength(invalidPlugins.length);
    expect(invalidDeckPluginDiagnostic()).toMatchObject({ code: "E_PLUGIN_INVALID" });
  });

  test("lowers an extension value returned as slide content before graph construction", async () => {
    const value = createAuthoringExtensionValue({
      pluginId: "test:authoring-extension",
      kind: "badge",
      payload: { text: "lowered" },
    });
    const paths: string[] = [];
    const deck = new H.Deck({ layout });

    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:authoring-extension",
      authoring: {
        lower(context) {
          paths.push(context.path);
          const payload = context.value.payload as { readonly text: string };
          return {
            children: (
              <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>
                {payload.text}
              </p>
            ),
          };
        },
      },
    });
    deck.slide(() => value);

    const project = await deck.project();
    const text = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(paths).toHaveLength(1);
    expect(text?.kind).toBe("text");
    expect(text?.kind === "text" ? text.content.text : undefined).toBe("lowered");
  });

  test("lowers extension values nested in authored children", async () => {
    const value = createAuthoringExtensionValue({
      pluginId: "test:nested-extension",
      kind: "badge",
      payload: { text: "nested" },
    });
    const deck = new H.Deck({ layout });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:nested-extension",
      authoring: {
        lower(context) {
          const payload = context.value.payload as { readonly text: string };
          return {
            children: (
              <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>
                {payload.text}
              </p>
            ),
          };
        },
      },
    });
    deck.slide(() => (
      <div style={{ position: "absolute", left: 0, top: 0, width: 6, height: 2 }}>{value}</div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(project.projection?.slides[0]?.payload.drawing.children[0]?.kind).toBe("group");
  });

  test("uses the Deck-local owner when it replaces an execution-scoped Plugin", async () => {
    const value = createAuthoringExtensionValue({
      pluginId: "test:execution-extension",
      kind: "badge",
      payload: null,
    });
    const calls: string[] = [];
    const deck = new H.Deck({ layout });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:execution-extension",
      authoring: {
        lower() {
          calls.push("deck");
          return { children: <p>deck</p> };
        },
      },
    });
    deck.slide(() => value);

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        plugins: [
          {
            kind: "deckjsx.plugin",
            id: "test:execution-extension",
            authoring: {
              lower() {
                calls.push("execution");
                return { children: <p>execution</p> };
              },
            },
          },
        ],
      }),
    );

    expect(render.ok).toBe(true);
    expect(calls).toEqual(["deck"]);
    expect(render.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PLUGIN_DECK_OVERRIDE", severity: "warning" }),
    );
  });

  test("preserves package-owned Plugin properties and warns for duplicate Deck registration", () => {
    const deck = new H.Deck({ layout });
    const consumerPlugin = (enabled: boolean) => ({
      kind: "deckjsx.plugin" as const,
      id: "test:consumer",
      consumer: { enabled },
    });
    deck.plugin(consumerPlugin(true));
    deck.plugin(consumerPlugin(false));
    deck.slide(() => <p>consumer</p>);

    const result = deck.compile();

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PLUGIN_DECK_DUPLICATE", severity: "warning" }),
    );
  });

  test("does not reuse a graph lowered by a different execution Plugin Set", async () => {
    const value = createAuthoringExtensionValue({
      pluginId: "test:changing-execution-extension",
      kind: "badge",
      payload: null,
    });
    const calls: string[] = [];
    const deck = new H.Deck({ layout });
    deck.slide(() => value);

    const renderWith = (label: string) =>
      deck.render(
        H.withRenderExecutionContext(H.pptx(), {
          plugins: [
            {
              kind: "deckjsx.plugin",
              id: "test:changing-execution-extension",
              authoring: {
                lower() {
                  calls.push(label);
                  return { children: <p>{label}</p> };
                },
              },
            },
          ],
        }),
      );

    const first = await renderWith("first");
    const second = await renderWith("second");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(calls).toEqual(["first", "second"]);

    const compile = deck.compile();
    expect(compile.ok).toBe(false);
    expect(compile.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PLUGIN_AUTHORING_EXTENSION_UNRESOLVED",
      }),
    );
  });

  test("does not reuse a graph after a registered Plugin object changes", async () => {
    const value = createAuthoringExtensionValue({
      pluginId: "test:mutable-extension",
      kind: "badge",
      payload: null,
    });
    const plugin = {
      kind: "deckjsx.plugin" as const,
      id: "test:mutable-extension",
      authoring: {
        lower: () => ({ children: <p>first</p> }),
      },
    };
    const deck = new H.Deck({ layout });
    deck.plugin(plugin);
    deck.slide(() => value);
    const first = await deck.project();

    plugin.authoring.lower = () => ({ children: <p>second</p> });
    const second = await deck.project();

    const firstText = first.projection?.slides[0]?.payload.drawing.children[0];
    const secondText = second.projection?.slides[0]?.payload.drawing.children[0];
    expect(firstText?.kind === "text" ? firstText.content.text : undefined).toBe("first");
    expect(secondText?.kind === "text" ? secondText.content.text : undefined).toBe("second");
  });

  test("invalidates lowered graph snapshots after nested Map and Set Plugin state changes", async () => {
    const value = createAuthoringExtensionValue({
      pluginId: "test:collection-state",
      kind: "badge",
      payload: null,
    });
    const labels = new Map([["selected", "first"]]);
    const flags = new Set(["initial"]);
    let calls = 0;
    const deck = new H.Deck({ layout });
    const collectionPlugin = {
      kind: "deckjsx.plugin",
      id: "test:collection-state",
      consumer: { labels, flags },
      authoring: {
        lower() {
          calls += 1;
          return { children: <p>{`${labels.get("selected")}:${flags.size}`}</p> };
        },
      },
    } as const;
    deck.plugin(collectionPlugin);
    deck.slide(() => value);

    await deck.project();
    labels.set("selected", "second");
    flags.add("changed");
    const second = await deck.project();

    const text = second.projection?.slides[0]?.payload.drawing.children[0];
    expect(calls).toBe(2);
    expect(text?.kind === "text" ? text.content.text : undefined).toBe("second:2");
  });

  test.each<{
    label: string;
    lower: () => unknown;
    code: string;
  }>([
    {
      label: "throwing",
      lower: () => {
        throw new Error("lower failed");
      },
      code: "E_PLUGIN_AUTHORING_LOWERING_FAILED",
    },
    {
      label: "invalid result",
      lower: () => 42,
      code: "E_PLUGIN_AUTHORING_LOWERING_INVALID_RESULT",
    },
    {
      label: "invalid diagnostics",
      lower: () => ({ children: <p>value</p>, diagnostics: "invalid" }),
      code: "E_PLUGIN_AUTHORING_LOWERING_INVALID_DIAGNOSTICS",
    },
    {
      label: "invalid children",
      lower: () => ({ children: () => undefined }),
      code: "E_PLUGIN_AUTHORING_LOWERING_INVALID_CHILDREN",
    },
  ])(
    "reports $label authoring lowerers without escaping the compile boundary",
    ({ lower, code }: { lower: () => unknown; code: string }) => {
      const value = createAuthoringExtensionValue({
        pluginId: `test:${code}`,
        kind: "invalid",
        payload: null,
      });
      const deck = new H.Deck({ layout });
      deck.plugin({
        kind: "deckjsx.plugin",
        id: `test:${code}`,
        authoring: { lower: lower as never },
      });
      deck.slide(() => value);

      const result = deck.compile();

      expect(result.ok).toBe(false);
      expect(result.diagnostics.items).toContainEqual(expect.objectContaining({ code }));
    },
  );

  test("reports recursive carrier lowering", () => {
    const recursive = createAuthoringExtensionValue({
      pluginId: "test:recursive-extension",
      kind: "recursive",
      payload: null,
    });
    const recursiveDeck = new H.Deck({ layout });
    recursiveDeck.plugin({
      kind: "deckjsx.plugin",
      id: "test:recursive-extension",
      authoring: { lower: () => ({ children: recursive }) },
    });
    recursiveDeck.slide(() => recursive);

    const recursiveResult = recursiveDeck.compile();
    expect(recursiveResult.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PLUGIN_AUTHORING_LOWERING_CYCLE" }),
    );
  });

  test("reports an unresolved extension value as a compile diagnostic", () => {
    const value = createAuthoringExtensionValue({
      pluginId: "test:missing-extension",
      kind: "missing",
      payload: null,
    });
    const deck = new H.Deck({ layout });
    deck.slide(() => value);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PLUGIN_AUTHORING_EXTENSION_UNRESOLVED",
      }),
    );
  });

  test("only the plugin named by the carrier may resolve it", () => {
    const value = createAuthoringExtensionValue({
      pluginId: "test:owner-extension",
      kind: "badge",
      payload: { text: "owned" },
    });
    const calls: string[] = [];
    const deck = new H.Deck({ layout });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:other-extension",
      authoring: {
        lower() {
          calls.push("other");
          return { children: <p>wrong owner</p> };
        },
      },
    });
    deck.slide(() => value);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PLUGIN_AUTHORING_EXTENSION_UNRESOLVED",
      }),
    );
  });

  test("rejects async authoring lowering in the synchronous tree phase", () => {
    const value = createAuthoringExtensionValue({
      pluginId: "test:async-extension",
      kind: "async",
      payload: null,
    });
    const deck = new H.Deck({ layout });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:async-extension",
      authoring: {
        lower: (() => Promise.resolve({ children: [] })) as never,
      },
    });
    deck.slide(() => value);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PLUGIN_AUTHORING_LOWERING_ASYNC",
      }),
    );
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("deckjsx integration execution contexts", () => {
  test("invalid render execution plugins container becomes diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid render plugins container</p>);

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        plugins: null,
      } as never),
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution plugins must be an array of Deck Plugins when provided.",
      }),
    ]);
  });

  test("invalid render execution plugins container does not cascade into plugin diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid render plugins string container</p>);

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        plugins: "bad",
      } as never),
    );

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution plugins must be an array of Deck Plugins when provided.",
      }),
    ]);
  });

  test("invalid render execution plugins become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid render plugin</p>);

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        plugins: [null as never],
      }),
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        title: "deck plugin is not part of the public authoring API",
        message: 'Deck plugin must be an object with kind "deckjsx.plugin" and a string id.',
      }),
    ]);
  });

  test("invalid render execution integration becomes diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid render integration</p>);

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        integration: { id: 123, assetLoaders: [null] } as never,
      }),
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution integration.id must be a string.",
      }),
    ]);
  });

  test("invalid merged render execution integration becomes diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid merged integration</p>);

    const render = await deck.render(
      H.withRenderExecutionContext(
        H.withRenderExecutionContext(H.pptx(), {
          integration: { id: "test:valid-render-integration" as never },
        }),
        {
          integration: "bad",
        } as never,
      ),
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution integration must be an object when provided.",
      }),
    ]);
  });

  test("invalid render execution source invalidation becomes diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid source invalidation</p>);

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        sourceInvalidation: { changedSourceIds: null } as never,
      }),
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message:
          "Render execution sourceInvalidation.changedSourceIds must be an array of strings.",
      }),
    ]);
  });

  test("invalid merged render execution source invalidation becomes diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid merged source invalidation</p>);

    let thrown: unknown;
    let render: Awaited<ReturnType<typeof deck.render>> | undefined;
    try {
      render = await deck.render(
        H.withRenderExecutionContext(
          H.withRenderExecutionContext(H.pptx(), {
            sourceInvalidation: { changedSourceIds: ["deck.tsx"] },
          }),
          {
            sourceInvalidation: "bad",
          } as never,
        ),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeUndefined();
    expect(render?.ok).toBe(false);
    expect(render?.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution sourceInvalidation must be an object when provided.",
      }),
    ]);
  });

  test("unknown render execution context fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>unknown render context field</p>);

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        debug: true,
      } as never),
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution context debug is not part of the public authoring API.",
      }),
    ]);
  });

  test("invalid existing render execution context becomes diagnostics when merged", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid existing render context</p>);
    const input = H.pptx();
    Object.defineProperty(input, Symbol.for("deckjsx.renderExecutionContext"), {
      configurable: true,
      enumerable: false,
      value: {
        integration: "bad",
      },
      writable: false,
    });

    const render = await deck.render(
      H.withRenderExecutionContext(input, {
        plugins: [],
      }),
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution integration must be an object when provided.",
      }),
    ]);
  });

  test("invalid existing render execution plugins container does not cascade when merged", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid existing render plugins</p>);
    const input = H.pptx();
    Object.defineProperty(input, Symbol.for("deckjsx.renderExecutionContext"), {
      configurable: true,
      enumerable: false,
      value: {
        plugins: "bad",
      },
      writable: false,
    });

    const render = await deck.render(
      H.withRenderExecutionContext(input, {
        plugins: [],
      }),
    );

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution plugins must be an array of Deck Plugins when provided.",
      }),
    ]);
  });

  test("invalid direct render execution context becomes diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid direct render context</p>);
    const input = H.pptx();
    Object.defineProperty(input, Symbol.for("deckjsx.renderExecutionContext"), {
      configurable: true,
      enumerable: false,
      value: "bad",
      writable: false,
    });

    const render = await deck.render(input);

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution context must be an object.",
      }),
    ]);
  });

  test("invalid direct render execution plugins container does not duplicate diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(() => <p>invalid direct render plugins</p>);
    const input = H.pptx();
    Object.defineProperty(input, Symbol.for("deckjsx.renderExecutionContext"), {
      configurable: true,
      enumerable: false,
      value: {
        plugins: "bad",
      },
      writable: false,
    });

    const render = await deck.render(input);

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution plugins must be an array of Deck Plugins when provided.",
      }),
    ]);
  });

  test("render execution plugins participate in lifecycle hooks", async () => {
    const events: string[] = [];
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Render plugin context" }, () => <p>plugin context</p>);

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        plugins: [
          {
            kind: "deckjsx.plugin",
            id: "test:render-execution-plugin",
            hooks: {
              afterGraph() {
                events.push("afterGraph");
              },
            },
          },
        ],
      }),
    );

    expect(render.ok).toBe(true);
    expect(events).toEqual(["afterGraph"]);
  });

  test("render execution integration loaders participate in project asset probing", async () => {
    const events: string[] = [];
    const loader = {
      resolverIdentity: "test:render-execution-project-probe-loader",
      async probe() {
        events.push("probe");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            hash: "fnv1a32:render-execution-project-probe",
          },
        };
      },
      async load() {
        events.push("load");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            hash: "fnv1a32:render-execution-project-probe",
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Render integration loader" }, () => (
      <img
        {...H.mediaSourceOrigins({
          src: { importer: "/project/src/deck.tsx", source: "./asset.png" },
        })}
        src="./asset.png"
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        integration: {
          id: H.integrationContextId("test:render-execution-project-probe"),
          assetLoaders: [loader],
        },
      }),
    );

    expect(render.ok).toBe(true);
    expect(events).toEqual(["probe", "load"]);
  });

  test("render execution integration rejects unknown asset loader fields", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Unknown render execution asset loader field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown loader field
      </p>
    ));

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        integration: {
          id: H.integrationContextId("test:unknown-render-execution-loader-field"),
          assetLoaders: [{ resolverIdentity: "test:loader", cacheKey: "not public" }],
        },
      } as never),
    );

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message: "Render execution integration.assetLoaders must be an array of Asset Loaders.",
      }),
    ]);
  });

  test("render execution integration rejects unknown media source origin fields", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Unknown render execution media source origin field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown media source origin field
      </p>
    ));

    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        integration: {
          id: H.integrationContextId("test:unknown-render-execution-media-origin-field"),
          mediaSourceOrigin: { importer: "entry.tsx", source: "./asset.png", directory: "." },
        },
      } as never),
    );

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_RENDER_EXECUTION_CONTEXT_INVALID",
        title: "render execution context is not part of the public authoring API",
        message:
          "Render execution integration.mediaSourceOrigin must be a Media Source Origin object.",
      }),
    ]);
  });

  test("render execution integration contexts compose instead of replacing each other", async () => {
    const events: string[] = [];
    const firstLoader = {
      resolverIdentity: "test:first-render-execution-loader",
      async probe({ source }) {
        if (source.kind !== "path" || source.path !== "./first.png") {
          return undefined;
        }
        events.push("first:probe");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
          },
        };
      },
      async load({ source }) {
        if (source.kind !== "path" || source.path !== "./first.png") {
          return undefined;
        }
        events.push("first:load");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const secondLoader = {
      resolverIdentity: "test:second-render-execution-loader",
      async probe({ source }) {
        if (source.kind !== "path" || source.path !== "./second.png") {
          return undefined;
        }
        events.push("second:probe");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
          },
        };
      },
      async load({ source }) {
        if (source.kind !== "path" || source.path !== "./second.png") {
          return undefined;
        }
        events.push("second:load");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Composable render integrations" }, () => (
      <>
        <img
          src="./first.png"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
        <img
          src="./second.png"
          style={{ position: "absolute", left: 2, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const input = H.withRenderExecutionContext(
      H.withRenderExecutionContext(H.pptx(), {
        integration: {
          id: H.integrationContextId("test:first-render-execution"),
          assetLoaders: [firstLoader],
        },
      }),
      {
        integration: {
          id: H.integrationContextId("test:second-render-execution"),
          assetLoaders: [secondLoader],
        },
      },
    );
    const render = await deck.render(input);

    expect(render.ok).toBe(true);
    expect(events).toEqual(["first:probe", "second:probe", "first:load", "second:load"]);
  });

  test("asset hooks wrap render-time byte loading as the load phase", async () => {
    const events: string[] = [];
    const loader = {
      resolverIdentity: "test:asset-hook-load-loader",
      async probe() {
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
          },
        };
      },
      async load() {
        events.push("load");
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: H.pngBytes.byteLength,
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:asset-load-hooks",
      integration: { id: H.integrationContextId("test:asset-load-hooks"), assetLoaders: [loader] },
      hooks: {
        beforeAsset(context) {
          events.push(`${context.phase}:${context.operation}`);
        },
        afterAsset(context) {
          events.push(`${context.phase}:${context.operation}`);
        },
      },
    });
    deck.slide({ name: "Asset load hooks" }, () => (
      <img
        src="./asset.png"
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(true);
    expect(events).toEqual(["before:probe", "after:probe", "before:load", "load", "after:load"]);
  });
});

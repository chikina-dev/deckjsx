import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("deckjsx integration hook diagnostics", () => {
  test("invalid plugin hook updates become diagnostics instead of leaking across stages", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:invalid-hook-update",
      hooks: {
        beforeRender() {
          return { assetsById: new Map() } as never;
        },
      },
    });
    deck.slide({ name: "Invalid hook" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>invalid</p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE",
        }),
      ]),
    );
  });

  test("invalid plugin hook update values become diagnostics before downstream stages consume them", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:invalid-hook-update-value",
      hooks: {
        beforeRender() {
          return { projection: "not-a-projection" } as never;
        },
      },
    });
    deck.slide({ name: "Invalid hook value" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>invalid value</p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
        }),
      ]),
    );
  });

  test("malformed graph plugin hook updates are rejected at the plugin seam", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:malformed-graph-hook-update",
      hooks: {
        beforeProject() {
          return { graph: { documentId: "graph:missing-maps" } } as never;
        },
      },
    });
    deck.slide({ name: "Malformed graph hook" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>bad graph</p>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
          message: expect.stringContaining("graph"),
        }),
      ]),
    );
  });

  test("plugin hook context mutations do not leak without returned updates", async () => {
    const loader = {
      resolverIdentity: "test:snapshot-mutation-loader",
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
    const observedNodeCounts: number[] = [];
    const observedAssetCounts: number[] = [];
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:hook-context-snapshots",
      integration: {
        id: H.integrationContextId("test:hook-context-snapshots"),
        assetLoaders: [loader],
      },
      hooks: {
        afterGraph(context) {
          (context.graph?.nodes as Map<unknown, unknown> | undefined)?.clear();
          (context.resolvedStyles as Map<unknown, unknown> | undefined)?.clear();
        },
        afterAsset(context) {
          (context.assetsById as Map<unknown, unknown>).clear();
        },
        beforeProject(context) {
          observedNodeCounts.push(context.graph.nodes.size);
          observedAssetCounts.push(context.assetsById.size);
        },
      },
    });
    deck.slide({ name: "Snapshot mutation" }, () => (
      <img src="./asset.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(true);
    expect(observedNodeCounts[0]).toBeGreaterThan(0);
    expect(observedAssetCounts).toEqual([1]);
  });

  test("plugin hook throws become stage diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:throwing-hook",
      hooks: {
        beforeRender() {
          throw new Error("boom");
        },
      },
    });
    deck.slide({ name: "Throwing hook" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>throw</p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_FAILED",
        }),
      ]),
    );
  });
});

import { describe, expect, test } from "vite-plus/test";
import { validateDeckPlugins, validDeckPlugins } from "@/src/plugin.ts";
import * as H from "./helpers.tsx";

describe("deckjsx integration hook diagnostics", () => {
  test("invalid deck plugin list container becomes one diagnostic", () => {
    const diagnostics = validateDeckPlugins("bad" as never);

    expect(validDeckPlugins("bad" as never)).toEqual([]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        title: "deck plugin is not part of the public authoring API",
        message: "Deck plugins must be an array of Deck Plugins when provided.",
      }),
    ]);
  });

  test("invalid deck plugins become diagnostics instead of runtime failures", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(null as never);
    deck.plugin({ kind: "deckjsx.plugin", name: "missing id" } as never);
    deck.plugin({ id: "missing-kind" } as never);
    deck.slide(() => <p>invalid plugins</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PLUGIN_INVALID",
          title: "deck plugin is not part of the public authoring API",
          message: 'Deck plugin must be an object with kind "deckjsx.plugin" and a string id.',
        }),
      ]),
    );
    expect(
      result.diagnostics.items.filter((item) => item.code === "E_PLUGIN_INVALID"),
    ).toHaveLength(3);
  });

  test("invalid deck plugin hook values are rejected at the plugin contract", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:invalid-hook-shape",
      hooks: { beforeTree: 123 },
    } as never);
    deck.slide(() => <p>invalid hook shape</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        title: "deck plugin is not part of the public authoring API",
        message: "Deck plugin hooks.beforeTree must be a function when provided.",
      }),
    ]);
  });

  test("invalid deck plugin integration values are rejected at the plugin contract", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:invalid-integration",
      integration: { id: 123, assetLoaders: [null] },
    } as never);
    deck.slide(() => <p>invalid integration</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        title: "deck plugin is not part of the public authoring API",
        message: "Deck plugin integration.id must be a string.",
      }),
    ]);
  });

  test("unknown deck plugin asset loader fields are rejected at the plugin contract", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-asset-loader-field",
      integration: {
        id: "test:unknown-asset-loader-field",
        assetLoaders: [{ resolverIdentity: "test:loader", cacheKey: "not public" }],
      },
    } as never);
    deck.slide(() => <p>unknown asset loader field</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        title: "deck plugin is not part of the public authoring API",
        message: "Deck plugin integration.assetLoaders must be an array of Asset Loaders.",
      }),
    ]);
  });

  test("unknown deck plugin media source origin fields are rejected at the plugin contract", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-media-source-origin-field",
      integration: {
        id: "test:unknown-media-source-origin-field",
        mediaSourceOrigin: { importer: "entry.tsx", source: "./image.png", directory: "." },
      },
    } as never);
    deck.slide(() => <p>unknown media source origin field</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        title: "deck plugin is not part of the public authoring API",
        message: "Deck plugin integration.mediaSourceOrigin must be a Media Source Origin object.",
      }),
    ]);
  });

  test("unknown deck plugin fields are rejected at the plugin contract", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-plugin-field",
      priority: 1,
    } as never);
    deck.slide(() => <p>unknown plugin field</p>);

    const result = deck.compile();

    expect(result.ok).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        title: "deck plugin is not part of the public authoring API",
        message: "Deck plugin priority is not part of the public authoring API.",
      }),
    ]);
  });

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
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>invalid</p>
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

  test("invalid plugin hook result shape becomes diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:invalid-hook-result",
      hooks: {
        beforeRender() {
          return "bad" as never;
        },
      },
    });
    deck.slide({ name: "Invalid hook result" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>invalid result</p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "E_PLUGIN_HOOK_INVALID_RESULT",
        message: "test:invalid-hook-result.beforeRender must return an object or void.",
      }),
    ]);
  });

  test("invalid plugin hook result diagnostics field becomes diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:invalid-hook-result-diagnostics",
      hooks: {
        beforeRender() {
          return { diagnostics: "bad" } as never;
        },
      },
    });
    deck.slide({ name: "Invalid hook result diagnostics" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        invalid diagnostics
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "E_PLUGIN_HOOK_INVALID_RESULT",
        message:
          "test:invalid-hook-result-diagnostics.beforeRender diagnostics must be an array of diagnostics when provided.",
      }),
    ]);
  });

  test("invalid plugin hook diagnostic labels become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:invalid-hook-diagnostic-label",
      hooks: {
        beforeRender() {
          return {
            diagnostics: [
              {
                severity: "warning",
                code: "W_PLUGIN_DIAGNOSTIC",
                title: "plugin diagnostic",
                labels: ["bad"],
              },
            ],
          } as never;
        },
      },
    });
    deck.slide({ name: "Invalid hook diagnostic label" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>invalid label</p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "E_PLUGIN_HOOK_INVALID_RESULT",
        message:
          "test:invalid-hook-diagnostic-label.beforeRender diagnostics must be an array of diagnostics when provided.",
      }),
    ]);
  });

  test("invalid plugin hook diagnostic label source spans become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:invalid-hook-diagnostic-source-span",
      hooks: {
        beforeRender() {
          return {
            diagnostics: [
              {
                severity: "warning",
                code: "W_PLUGIN_DIAGNOSTIC",
                title: "plugin diagnostic",
                labels: [{ path: "plugin", message: "bad span", sourceSpan: "bad" }],
              },
            ],
          } as never;
        },
      },
    });
    deck.slide({ name: "Invalid hook diagnostic source span" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        invalid source span
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "E_PLUGIN_HOOK_INVALID_RESULT",
        message:
          "test:invalid-hook-diagnostic-source-span.beforeRender diagnostics must be an array of diagnostics when provided.",
      }),
    ]);
  });

  test("unknown plugin hook diagnostic fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-hook-diagnostic-field",
      hooks: {
        beforeRender() {
          return {
            diagnostics: [
              {
                severity: "warning",
                code: "W_PLUGIN_DIAGNOSTIC",
                title: "plugin diagnostic",
                labels: [],
                detail: "not public",
              },
            ],
          } as never;
        },
      },
    });
    deck.slide({ name: "Unknown hook diagnostic field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>unknown field</p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "E_PLUGIN_HOOK_INVALID_RESULT",
        message:
          "test:unknown-hook-diagnostic-field.beforeRender diagnostics must be an array of diagnostics when provided.",
      }),
    ]);
  });

  test("unknown plugin hook diagnostic label fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-hook-diagnostic-label-field",
      hooks: {
        beforeRender() {
          return {
            diagnostics: [
              {
                severity: "warning",
                code: "W_PLUGIN_DIAGNOSTIC",
                title: "plugin diagnostic",
                labels: [{ path: "plugin", message: "bad label", hint: "not public" }],
              },
            ],
          } as never;
        },
      },
    });
    deck.slide({ name: "Unknown hook diagnostic label field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown label field
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "E_PLUGIN_HOOK_INVALID_RESULT",
        message:
          "test:unknown-hook-diagnostic-label-field.beforeRender diagnostics must be an array of diagnostics when provided.",
      }),
    ]);
  });

  test("unknown plugin hook diagnostic source span fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-hook-diagnostic-source-span-field",
      hooks: {
        beforeRender() {
          return {
            diagnostics: [
              {
                severity: "warning",
                code: "W_PLUGIN_DIAGNOSTIC",
                title: "plugin diagnostic",
                labels: [
                  {
                    path: "plugin",
                    message: "bad span",
                    sourceSpan: { file: "plugin.ts", line: 1, column: 1, endLine: 2 },
                  },
                ],
              },
            ],
          } as never;
        },
      },
    });
    deck.slide({ name: "Unknown hook diagnostic source span field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown source span field
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "E_PLUGIN_HOOK_INVALID_RESULT",
        message:
          "test:unknown-hook-diagnostic-source-span-field.beforeRender diagnostics must be an array of diagnostics when provided.",
      }),
    ]);
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
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>invalid value</p>
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

  test("unknown plugin hook integration context fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-hook-integration-context-field",
      hooks: {
        beforeAsset() {
          return {
            integrationContext: {
              id: "test:unknown-hook-integration-context-field",
              debug: true,
            },
          } as never;
        },
      },
    });
    deck.slide({ name: "Unknown hook integration context field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown integration context field
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
          message:
            "test:unknown-hook-integration-context-field.beforeAsset returned an invalid value for update key: integrationContext",
        }),
      ]),
    );
  });

  test("unknown plugin hook rendered artifact fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-rendered-artifact-field",
      hooks: {
        afterRender() {
          return {
            artifact: {
              format: "pptx",
              mediaType:
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              extension: "pptx",
              bytes: new Uint8Array(),
              debug: true,
            },
          } as never;
        },
      },
    });
    deck.slide({ name: "Unknown rendered artifact field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown artifact field
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
          message:
            "test:unknown-rendered-artifact-field.afterRender returned an invalid value for update key: artifact",
        }),
      ]),
    );
  });

  test("unknown plugin hook asset source fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-asset-source-field",
      hooks: {
        afterAsset() {
          return {
            assetsById: new Map([
              [
                "asset:unknown-source-field",
                {
                  assetEntityId: "asset:unknown-source-field",
                  source: { kind: "data", data: "image-data", cacheKey: "not public" },
                  sourceField: "src",
                  diagnostics: { items: [] },
                },
              ],
            ]),
          } as never;
        },
      },
    });
    deck.slide({ name: "Unknown asset source field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown asset source field
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
          message:
            "test:unknown-asset-source-field.afterAsset returned an invalid value for update key: assetsById",
        }),
      ]),
    );
  });

  test("plugin hook asset bytes source metadata remains valid", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:asset-bytes-source-metadata",
      hooks: {
        afterAsset() {
          return {
            assetsById: new Map([
              [
                "asset:bytes-source-metadata",
                {
                  assetEntityId: "asset:bytes-source-metadata",
                  source: {
                    kind: "bytes",
                    bytes: H.pngBytes,
                    mediaType: "image/png",
                    extension: "png",
                  },
                  sourceField: "src",
                  diagnostics: { items: [] },
                },
              ],
            ]),
          } as never;
        },
      },
    });
    deck.slide({ name: "Asset bytes source metadata" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        bytes source metadata
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(true);
  });

  test("unknown plugin hook asset artifact fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-asset-artifact-field",
      hooks: {
        afterAsset() {
          return {
            assetsById: new Map([
              [
                "asset:unknown-artifact-field",
                {
                  assetEntityId: "asset:unknown-artifact-field",
                  source: { kind: "data", data: "image-data" },
                  sourceField: "src",
                  diagnostics: { items: [] },
                  cacheKey: "not public",
                },
              ],
            ]),
          } as never;
        },
      },
    });
    deck.slide({ name: "Unknown asset artifact field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown asset artifact field
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
          message:
            "test:unknown-asset-artifact-field.afterAsset returned an invalid value for update key: assetsById",
        }),
      ]),
    );
  });

  test("unknown plugin hook asset diagnostics fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-asset-diagnostics-field",
      hooks: {
        afterAsset() {
          return {
            assetsById: new Map([
              [
                "asset:unknown-diagnostics-field",
                {
                  assetEntityId: "asset:unknown-diagnostics-field",
                  source: { kind: "data", data: "image-data" },
                  sourceField: "src",
                  diagnostics: { items: [], debug: true },
                },
              ],
            ]),
          } as never;
        },
      },
    });
    deck.slide({ name: "Unknown asset diagnostics field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown asset diagnostics field
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
          message:
            "test:unknown-asset-diagnostics-field.afterAsset returned an invalid value for update key: assetsById",
        }),
      ]),
    );
  });

  test("invalid plugin hook asset diagnostic items become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:invalid-asset-diagnostic-item",
      hooks: {
        afterAsset() {
          return {
            assetsById: new Map([
              [
                "asset:invalid-diagnostic-item",
                {
                  assetEntityId: "asset:invalid-diagnostic-item",
                  source: { kind: "data", data: "image-data" },
                  sourceField: "src",
                  diagnostics: {
                    items: [{ severity: "warning", code: "W_ASSET", title: "asset warning" }],
                  },
                },
              ],
            ]),
          } as never;
        },
      },
    });
    deck.slide({ name: "Invalid asset diagnostic item" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        invalid asset diagnostic item
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
          message:
            "test:invalid-asset-diagnostic-item.afterAsset returned an invalid value for update key: assetsById",
        }),
      ]),
    );
  });

  test("unknown plugin hook asset probe fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-asset-probe-field",
      hooks: {
        afterAsset() {
          return {
            assetsById: new Map([
              [
                "asset:unknown-probe-field",
                {
                  assetEntityId: "asset:unknown-probe-field",
                  source: { kind: "data", data: "image-data" },
                  sourceField: "src",
                  probe: { mediaType: "image/png", extension: "png", cacheKey: "not public" },
                  diagnostics: { items: [] },
                },
              ],
            ]),
          } as never;
        },
      },
    });
    deck.slide({ name: "Unknown asset probe field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown asset probe field
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
          message:
            "test:unknown-asset-probe-field.afterAsset returned an invalid value for update key: assetsById",
        }),
      ]),
    );
  });

  test("unknown plugin hook asset load fields become diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:unknown-asset-load-field",
      hooks: {
        afterAsset() {
          return {
            assetsById: new Map([
              [
                "asset:unknown-load-field",
                {
                  assetEntityId: "asset:unknown-load-field",
                  source: { kind: "data", data: "image-data" },
                  sourceField: "src",
                  load: {
                    mediaType: "image/png",
                    extension: "png",
                    bytes: H.pngBytes,
                    cacheKey: "not public",
                  },
                  diagnostics: { items: [] },
                },
              ],
            ]),
          } as never;
        },
      },
    });
    deck.slide({ name: "Unknown asset load field" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unknown asset load field
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(false);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "E_PLUGIN_HOOK_INVALID_UPDATE_VALUE",
          message:
            "test:unknown-asset-load-field.afterAsset returned an invalid value for update key: assetsById",
        }),
      ]),
    );
  });

  test("plugin hook asset load result remains valid", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:asset-load-result",
      hooks: {
        afterAsset() {
          return {
            assetsById: new Map([
              [
                "asset:load-result",
                {
                  assetEntityId: "asset:load-result",
                  source: { kind: "data", data: "image-data" },
                  sourceField: "src",
                  load: {
                    mediaType: "image/png",
                    extension: "png",
                    width: 1,
                    height: 1,
                    byteLength: H.pngBytes.byteLength,
                    hash: "fnv1a32:asset-load-result",
                    bytes: H.pngBytes,
                  },
                  diagnostics: { items: [] },
                },
              ],
            ]),
          } as never;
        },
      },
    });
    deck.slide({ name: "Asset load result" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        asset load result
      </p>
    ));

    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(true);
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
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>bad graph</p>
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
      <img
        src="./asset.png"
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
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
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>throw</p>
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

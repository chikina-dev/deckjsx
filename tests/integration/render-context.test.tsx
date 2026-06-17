import { describe, expect, test } from "vite-plus/test";
import { pptx, type WriterAdapter, type WriterRenderContext } from "../../src/adapter.ts";
import { createDiagnostics } from "../../src/diagnostics/index.ts";
import { Deck } from "../../src/index.ts";
import type { PptxPackageModel } from "../../src/inspect.ts";
import {
  integrationContextId,
  mediaSourceOrigins,
  withRenderExecutionContext,
  type AssetLoader,
  type DeckPlugin,
} from "../../src/integration.ts";
import { unzipSync } from "../helpers.ts";

const textDecoder = new TextDecoder();

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);
const mp4Bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

function assetExtension(input: {
  readonly name: string;
  readonly loader?: AssetLoader;
  readonly importer?: string;
}): DeckPlugin {
  return {
    kind: "deckjsx.plugin",
    id: input.name,
    name: input.name,
    integration: {
      id: integrationContextId(input.name),
      ...(input.loader ? { assetLoaders: [input.loader] } : {}),
      ...(input.importer ? { mediaSourceOrigin: { importer: input.importer } } : {}),
    },
  };
}

describe("deckjsx/integration", () => {
  test("runs plugin hooks across the deck lifecycle cycle", async () => {
    const events: string[] = [];
    const loader = {
      resolverIdentity: "test:lifecycle-loader",
      async probe() {
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
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
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    } satisfies AssetLoader;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:lifecycle-cycle",
      name: "test:lifecycle-cycle",
      integration: { id: integrationContextId("test:lifecycle-cycle"), assetLoaders: [loader] },
      hooks: {
        beforeTree: () => {
          events.push("beforeTree");
        },
        afterTree: () => {
          events.push("afterTree");
        },
        beforeGraph: () => {
          events.push("beforeGraph");
        },
        afterGraph: () => {
          events.push("afterGraph");
        },
        beforeAsset: (context) => {
          events.push(`beforeAsset:${context.operation}`);
        },
        afterAsset: (context) => {
          events.push(`afterAsset:${context.operation}`);
        },
        beforeProject: () => {
          events.push("beforeProject");
        },
        afterProject: () => {
          events.push("afterProject");
        },
        beforeRender: () => {
          events.push("beforeRender");
        },
        afterRender: () => {
          events.push("afterRender");
        },
      },
    });
    deck.slide({ name: "Lifecycle" }, () => (
      <img src="./asset.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const render = await deck.render(pptx());

    expect(render.ok).toBe(true);
    expect(events).toEqual([
      "beforeTree",
      "afterTree",
      "beforeGraph",
      "afterGraph",
      "beforeAsset:probe",
      "afterAsset:probe",
      "beforeProject",
      "afterProject",
      "beforeRender",
      "beforeAsset:load",
      "afterAsset:load",
      "afterRender",
    ]);
  });

  test("tree lifecycle hooks can replace composed roots before graph projection", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:tree-transform",
      name: "test:tree-transform",
      hooks: {
        afterTree(context) {
          return {
            roots: context.roots.map((root) => ({
              ...root,
              root: {
                ...root.root,
                props: {
                  ...root.root.props,
                  name: "Tree Hook Slide",
                },
              } as typeof root.root,
            })),
          };
        },
      },
    });
    deck.slide({ name: "Original Slide" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>tree transformed</p>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(project.projection?.slides[0]?.payload.name).toBe("Tree Hook Slide");
  });

  test("project lifecycle hooks can replace projection models before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:project-transform",
      name: "test:project-transform",
      hooks: {
        afterProject(context) {
          return {
            projection: {
              ...context.projection,
              slides: context.projection.slides.map((slide, index) =>
                index === 0
                  ? {
                      ...slide,
                      payload: {
                        ...slide.payload,
                        name: "Project Hook Slide",
                      },
                    }
                  : slide,
              ),
              parts: context.projection.parts.map((part) =>
                part.kind === "slide" && part.id === context.projection.slides[0]?.id
                  ? {
                      ...part,
                      payload: {
                        ...part.payload,
                        name: "Project Hook Slide",
                      },
                    }
                  : part,
              ),
            },
          };
        },
      },
    });
    deck.slide({ name: "Original Slide" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>project transformed</p>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(project.projection?.slides[0]?.payload.name).toBe("Project Hook Slide");
  });

  test("render lifecycle hooks run around prototype writer adapter methods", async () => {
    const events: string[] = [];
    class PrototypeWriter implements WriterAdapter<PptxPackageModel, "pptx"> {
      readonly kind = "deckjsx.writerAdapter";
      readonly name = "test-prototype-writer";
      readonly projectionFormat = "pptx";
      readonly format = "pptx";
      readonly options = {};

      async render(_projection: PptxPackageModel, _context?: WriterRenderContext) {
        return {
          diagnostics: createDiagnostics(),
          artifact: {
            format: "pptx" as const,
            mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            extension: "pptx",
            bytes: new Uint8Array([1, 2, 3]),
          },
        };
      }
    }

    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:render-hooks",
      name: "test:render-hooks",
      hooks: {
        beforeRender() {
          events.push("beforeRender");
        },
        afterRender() {
          events.push("afterRender");
        },
      },
    });
    deck.slide({ name: "Prototype writer" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>prototype</p>
    ));

    const render = await deck.render(new PrototypeWriter());

    expect(render.ok).toBe(true);
    expect(render.artifact?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(events).toEqual(["beforeRender", "afterRender"]);
  });

  test("Deck plugins carry AssetLoaders through ordinary deck.render(pptx())", async () => {
    const seenSources: string[] = [];
    const seenOrigins: string[] = [];
    const loader = {
      resolverIdentity: "test:integration-loader",
      async probe(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        seenSources.push(`${context.sourceField}:${context.source.path}`);
        if (context.origin?.importer) {
          seenOrigins.push(`probe:${context.origin.importer}`);
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            hash: "fnv1a32:test-image",
          },
        };
      },
      async load(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        if (context.origin?.importer) {
          seenOrigins.push(`load:${context.origin.importer}`);
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            hash: "fnv1a32:test-image",
            bytes: pngBytes,
          },
        };
      },
    } satisfies AssetLoader;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Asset" }, () => (
      <img src="./asset.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    deck.plugin(
      assetExtension({
        name: "test:asset-extension",
        loader,
        importer: "/project/src/deck.tsx",
      }),
    );
    const render = await deck.render(
      withRenderExecutionContext(pptx(), {
        hmrInvalidation: {
          importer: "/project/src/deck.tsx",
          changedModuleIds: ["/project/src/deck.tsx"],
        },
      }),
    );
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());

    expect(render.ok).toBe(true);
    expect(seenSources).toContain("src:./asset.png");
    expect(seenOrigins).toEqual(["probe:/project/src/deck.tsx", "load:/project/src/deck.tsx"]);
    expect(render.patchPlan?.hmrInvalidation).toEqual({
      importer: "/project/src/deck.tsx",
      changedModuleIds: ["/project/src/deck.tsx"],
    });
    expect(Array.from(zip["ppt/media/media1.png"] ?? [])).toEqual(Array.from(pngBytes));
  });

  test("child Deck plugins are ignored while root AssetLoaders cover composed assets", async () => {
    const parentProbes: string[] = [];
    const childProbes: string[] = [];
    const parentLoader = {
      resolverIdentity: "test:parent-loader",
      async probe(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        parentProbes.push(context.source.path);
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
          },
        };
      },
      async load(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    } satisfies AssetLoader;
    const childLoader = {
      resolverIdentity: "test:child-loader",
      async probe(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        childProbes.push(context.source.path);
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
          },
        };
      },
      async load(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    } satisfies AssetLoader;
    const parent = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    parent.plugin(assetExtension({ name: "test:parent-assets", loader: parentLoader }));
    child.plugin(assetExtension({ name: "test:child-assets", loader: childLoader }));
    parent.slide({ name: "Parent" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>parent</p>
    ));
    child.slide({ name: "Child asset" }, () => (
      <img src="./child.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));
    parent.mount("child", child);

    const render = await parent.render(pptx());

    expect(render.ok).toBe(true);
    expect(parentProbes).toEqual(["./child.png"]);
    expect(childProbes).toEqual([]);
    expect(render.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "W_COMPOSITION_CHILD_PLUGIN_IGNORED",
        }),
      ]),
    );
  });

  test("hmr invalidation refreshes cached graph and projection during ordinary render", async () => {
    let title = "before";
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "HMR" }, () => <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>{title}</p>);
    deck.slide({ name: "Stable" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>stable</p>
    ));

    const first = await deck.render(pptx({ inspection: "summary" }));
    title = "after";
    const stale = await deck.render(pptx());
    deck.plugin(
      assetExtension({
        name: "test:hmr-code-extension",
        importer: "/project/src/deck.tsx",
      }),
    );
    const refreshed = await deck.render(
      withRenderExecutionContext(pptx({ inspection: "summary" }), {
        hmrInvalidation: {
          importer: "/project/src/deck.tsx",
          changedModuleIds: ["/project/src/deck.tsx"],
        },
      }),
    );
    const firstSlideXml = textDecoder.decode(
      unzipSync(first.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const staleSlideXml = textDecoder.decode(
      unzipSync(stale.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const refreshedSlideXml = textDecoder.decode(
      unzipSync(refreshed.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const refreshedStableSlideXml = textDecoder.decode(
      unzipSync(refreshed.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide2.xml"],
    );

    expect(first.ok).toBe(true);
    expect(stale.ok).toBe(true);
    expect(refreshed.ok).toBe(true);
    expect(firstSlideXml).toContain("before");
    expect(staleSlideXml).toContain("before");
    expect(refreshedSlideXml).toContain("after");
    expect(refreshedStableSlideXml).toContain("stable");
    expect(refreshed.patchPlan?.hmrInvalidation).toEqual({
      importer: "/project/src/deck.tsx",
      changedModuleIds: ["/project/src/deck.tsx"],
    });
  });

  test("hmr invalidation refreshes importer-relative media assets when asset files change", async () => {
    let currentBytes = new Uint8Array([137, 80, 78, 71, 1]);
    let loadCount = 0;
    const loader = {
      resolverIdentity: "test:hmr-media-loader",
      async probe(context) {
        return context.source.kind === "path"
          ? {
              ok: true,
              value: {
                mediaType: "image/png",
                extension: "png",
                width: 1,
                height: 1,
                byteLength: currentBytes.byteLength,
                hash: `fnv1a32:media-${currentBytes.at(-1)}`,
              },
            }
          : undefined;
      },
      async load(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        loadCount += 1;
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: currentBytes.byteLength,
            hash: `fnv1a32:media-${currentBytes.at(-1)}`,
            bytes: currentBytes,
          },
        };
      },
    } satisfies AssetLoader;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "HMR media" }, () => (
      <img
        {...mediaSourceOrigins({
          src: { importer: "/project/src/deck.tsx", source: "./asset.png" },
        })}
        src="./asset.png"
        style={{ x: 1, y: 1, width: 1, height: 1 }}
      />
    ));

    deck.plugin(
      assetExtension({
        name: "test:hmr-media-extension",
        loader,
      }),
    );
    const first = await deck.render(pptx());
    currentBytes = new Uint8Array([137, 80, 78, 71, 2]);
    deck.plugin(
      assetExtension({
        name: "test:hmr-media-extension",
        loader,
      }),
    );
    const refreshed = await deck.render(
      withRenderExecutionContext(pptx(), {
        hmrInvalidation: {
          importer: "/project/src/deck.tsx",
          changedModuleIds: ["/project/src/asset.png"],
        },
      }),
    );
    const firstMediaBytes = unzipSync(first.artifact?.bytes ?? new Uint8Array())[
      "ppt/media/media1.png"
    ];
    const refreshedMediaBytes = unzipSync(refreshed.artifact?.bytes ?? new Uint8Array())[
      "ppt/media/media1.png"
    ];

    expect(first.ok).toBe(true);
    expect(refreshed.ok).toBe(true);
    expect(loadCount).toBe(2);
    expect(Array.from(firstMediaBytes ?? [])).toEqual([137, 80, 78, 71, 1]);
    expect(Array.from(refreshedMediaBytes ?? [])).toEqual([137, 80, 78, 71, 2]);
  });

  test("render execution HMR state is consumed without durable plugin configuration", async () => {
    let title = "first";
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:stable-plugin",
      name: "test:stable-plugin",
    });
    deck.slide({ name: "Execution HMR" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>{title}</p>
    ));

    await deck.render(pptx());
    title = "second";
    const stale = await deck.render(pptx());
    const refreshed = await deck.render(
      withRenderExecutionContext(pptx(), {
        hmrInvalidation: {
          importer: "/project/src/deck.tsx",
          changedModuleIds: ["/project/src/deck.tsx"],
        },
      }),
    );
    title = "third";
    const later = await deck.render(pptx());
    const staleXml = textDecoder.decode(
      unzipSync(stale.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const refreshedXml = textDecoder.decode(
      unzipSync(refreshed.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const laterXml = textDecoder.decode(
      unzipSync(later.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );

    expect(staleXml).toContain("first");
    expect(refreshedXml).toContain("second");
    expect(laterXml).toContain("second");
    expect(refreshed.patchPlan?.hmrInvalidation).toEqual({
      importer: "/project/src/deck.tsx",
      changedModuleIds: ["/project/src/deck.tsx"],
    });
    expect(later.patchPlan?.hmrInvalidation).toBeUndefined();
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
            byteLength: pngBytes.byteLength,
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
            byteLength: pngBytes.byteLength,
            hash: "fnv1a32:render-execution-project-probe",
            bytes: pngBytes,
          },
        };
      },
    } satisfies AssetLoader;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Render integration loader" }, () => (
      <img
        {...mediaSourceOrigins({
          src: { importer: "/project/src/deck.tsx", source: "./asset.png" },
        })}
        src="./asset.png"
        style={{ x: 1, y: 1, width: 1, height: 1 }}
      />
    ));

    const render = await deck.render(
      withRenderExecutionContext(pptx(), {
        integration: {
          id: integrationContextId("test:render-execution-project-probe"),
          assetLoaders: [loader],
        },
      }),
    );

    expect(render.ok).toBe(true);
    expect(events).toEqual(["probe", "load"]);
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
            byteLength: pngBytes.byteLength,
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
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    } satisfies AssetLoader;
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
            byteLength: pngBytes.byteLength,
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
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    } satisfies AssetLoader;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Composable render integrations" }, () => (
      <>
        <img src="./first.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
        <img src="./second.png" style={{ x: 2, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const input = withRenderExecutionContext(
      withRenderExecutionContext(pptx(), {
        integration: {
          id: integrationContextId("test:first-render-execution"),
          assetLoaders: [firstLoader],
        },
      }),
      {
        integration: {
          id: integrationContextId("test:second-render-execution"),
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
            byteLength: pngBytes.byteLength,
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
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    } satisfies AssetLoader;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:asset-load-hooks",
      integration: { id: integrationContextId("test:asset-load-hooks"), assetLoaders: [loader] },
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
      <img src="./asset.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const render = await deck.render(pptx());

    expect(render.ok).toBe(true);
    expect(events).toEqual(["before:probe", "after:probe", "before:load", "load", "after:load"]);
  });

  test("invalid plugin hook updates become diagnostics instead of leaking across stages", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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

    const render = await deck.render(pptx());

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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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

    const render = await deck.render(pptx());

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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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
            byteLength: pngBytes.byteLength,
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
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    } satisfies AssetLoader;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const observedNodeCounts: number[] = [];
    const observedAssetCounts: number[] = [];
    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:hook-context-snapshots",
      integration: {
        id: integrationContextId("test:hook-context-snapshots"),
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

    const render = await deck.render(pptx());

    expect(render.ok).toBe(true);
    expect(observedNodeCounts[0]).toBeGreaterThan(0);
    expect(observedAssetCounts).toEqual([1]);
  });

  test("plugin hook throws become stage diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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

    const render = await deck.render(pptx());

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

  test("prop-level media origin metadata overrides module integration origin", async () => {
    const seenOrigins: string[] = [];
    const loader = {
      resolverIdentity: "test:prop-origin-loader",
      async probe(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        if (context.origin?.importer) {
          seenOrigins.push(`probe:${context.origin.importer}`);
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            hash: "fnv1a32:prop-origin-image",
          },
        };
      },
      async load(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        if (context.origin?.importer) {
          seenOrigins.push(`load:${context.origin.importer}`);
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            hash: "fnv1a32:prop-origin-image",
            bytes: pngBytes,
          },
        };
      },
    } satisfies AssetLoader;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Prop origin" }, () => (
      <img
        {...mediaSourceOrigins({
          src: {
            importer: "/project/src/components/Card.tsx",
            source: "/project/src/components/Card.tsx",
          },
        })}
        src="./asset.png"
        style={{ x: 1, y: 1, width: 1, height: 1 }}
      />
    ));

    deck.plugin(
      assetExtension({
        name: "test:prop-origin-extension",
        loader,
        importer: "/project/src/deck.tsx",
      }),
    );
    const render = await deck.render(pptx());

    expect(render.ok).toBe(true);
    expect(seenOrigins).toEqual([
      "probe:/project/src/components/Card.tsx",
      "load:/project/src/components/Card.tsx",
    ]);
  });

  test("component-forwarded video src and poster origins override module integration origin", async () => {
    const seenOrigins: string[] = [];
    const loader = {
      resolverIdentity: "test:component-video-origin-loader",
      async probe(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        if (context.origin?.importer) {
          seenOrigins.push(`probe:${context.sourceField}:${context.origin.importer}`);
        }
        return {
          ok: true,
          value:
            context.sourceField === "src"
              ? {
                  mediaType: "video/mp4",
                  extension: "mp4",
                  byteLength: mp4Bytes.byteLength,
                  hash: "fnv1a32:component-video-origin",
                }
              : {
                  mediaType: "image/png",
                  extension: "png",
                  width: 1,
                  height: 1,
                  byteLength: pngBytes.byteLength,
                  hash: "fnv1a32:component-poster-origin",
                },
        };
      },
      async load(context) {
        if (context.source.kind !== "path") {
          return undefined;
        }
        if (context.origin?.importer) {
          seenOrigins.push(`load:${context.sourceField}:${context.origin.importer}`);
        }
        return {
          ok: true,
          value:
            context.sourceField === "src"
              ? {
                  mediaType: "video/mp4",
                  extension: "mp4",
                  byteLength: mp4Bytes.byteLength,
                  hash: "fnv1a32:component-video-origin",
                  bytes: mp4Bytes,
                }
              : {
                  mediaType: "image/png",
                  extension: "png",
                  width: 1,
                  height: 1,
                  byteLength: pngBytes.byteLength,
                  hash: "fnv1a32:component-poster-origin",
                  bytes: pngBytes,
                },
        };
      },
    } satisfies AssetLoader;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Video prop origin" }, () => (
      <video
        {...mediaSourceOrigins({
          src: {
            importer: "/project/src/components/VideoCard.tsx",
            source: "./clip.mp4",
          },
          poster: {
            importer: "/project/src/components/VideoCard.tsx",
            source: "./poster.png",
          },
        })}
        src="./clip.mp4"
        poster="./poster.png"
        style={{ x: 1, y: 1, width: 2, height: 1 }}
      />
    ));

    deck.plugin(
      assetExtension({
        name: "test:component-video-origin-extension",
        loader,
        importer: "/project/src/deck.tsx",
      }),
    );
    const render = await deck.render(pptx());

    expect(render.ok).toBe(true);
    expect(seenOrigins).toEqual([
      "probe:src:/project/src/components/VideoCard.tsx",
      "probe:poster:/project/src/components/VideoCard.tsx",
      "load:src:/project/src/components/VideoCard.tsx",
      "load:poster:/project/src/components/VideoCard.tsx",
    ]);
  });
});

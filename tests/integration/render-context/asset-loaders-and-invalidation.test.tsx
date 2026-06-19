import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("deckjsx integration asset loaders and invalidation", () => {
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
            byteLength: H.pngBytes.byteLength,
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
            byteLength: H.pngBytes.byteLength,
            hash: "fnv1a32:test-image",
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Asset" }, () => (
      <img src="./asset.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    deck.plugin(
      H.assetExtension({
        name: "test:asset-extension",
        loader,
        importer: "/project/src/deck.tsx",
      }),
    );
    const render = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        sourceInvalidation: {
          changedSourceIds: ["/project/src/deck.tsx"],
        },
      }),
    );
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());

    expect(render.ok).toBe(true);
    expect(seenSources).toContain("src:./asset.png");
    expect(seenOrigins).toEqual(["probe:/project/src/deck.tsx", "load:/project/src/deck.tsx"]);
    expect(render.patchPlan?.sourceInvalidation).toEqual({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    expect(Array.from(zip["ppt/media/media1.png"] ?? [])).toEqual(Array.from(H.pngBytes));
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
            byteLength: H.pngBytes.byteLength,
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
            byteLength: H.pngBytes.byteLength,
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
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
            byteLength: H.pngBytes.byteLength,
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
            byteLength: H.pngBytes.byteLength,
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const parent = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const child = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    parent.plugin(H.assetExtension({ name: "test:parent-assets", loader: parentLoader }));
    child.plugin(H.assetExtension({ name: "test:child-assets", loader: childLoader }));
    parent.slide({ name: "Parent" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>parent</p>
    ));
    child.slide({ name: "Child asset" }, () => (
      <img src="./child.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));
    parent.mount("child", child);

    const render = await parent.render(H.pptx());

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

  test("source invalidation refreshes cached graph and projection during ordinary render", async () => {
    let title = "before";
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Incremental" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>{title}</p>
    ));
    deck.slide({ name: "Stable" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>stable</p>
    ));

    const first = await deck.render(H.pptx({ inspection: "summary" }));
    title = "after";
    const stale = await deck.render(H.pptx());
    deck.plugin(
      H.assetExtension({
        name: "test:incremental-code-extension",
        importer: "/project/src/deck.tsx",
      }),
    );
    const refreshed = await deck.render(
      H.withRenderExecutionContext(H.pptx({ inspection: "summary" }), {
        sourceInvalidation: {
          changedSourceIds: ["/project/src/deck.tsx"],
        },
      }),
    );
    const firstSlideXml = H.textDecoder.decode(
      H.unzipSync(first.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const staleSlideXml = H.textDecoder.decode(
      H.unzipSync(stale.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const refreshedSlideXml = H.textDecoder.decode(
      H.unzipSync(refreshed.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const refreshedStableSlideXml = H.textDecoder.decode(
      H.unzipSync(refreshed.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide2.xml"],
    );

    expect(first.ok).toBe(true);
    expect(stale.ok).toBe(true);
    expect(refreshed.ok).toBe(true);
    expect(firstSlideXml).toContain("before");
    expect(staleSlideXml).toContain("before");
    expect(refreshedSlideXml).toContain("after");
    expect(refreshedStableSlideXml).toContain("stable");
    expect(refreshed.patchPlan?.sourceInvalidation).toEqual({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
  });

  test("source invalidation refreshes importer-relative media assets when asset files change", async () => {
    let currentBytes = new Uint8Array([137, 80, 78, 71, 1]);
    let loadCount = 0;
    const loader = {
      resolverIdentity: "test:incremental-media-loader",
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
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Incremental media" }, () => (
      <img
        {...H.mediaSourceOrigins({
          src: { importer: "/project/src/deck.tsx", source: "./asset.png" },
        })}
        src="./asset.png"
        style={{ x: 1, y: 1, width: 1, height: 1 }}
      />
    ));

    deck.plugin(
      H.assetExtension({
        name: "test:incremental-media-extension",
        loader,
      }),
    );
    const first = await deck.render(H.pptx());
    currentBytes = new Uint8Array([137, 80, 78, 71, 2]);
    deck.plugin(
      H.assetExtension({
        name: "test:incremental-media-extension",
        loader,
      }),
    );
    const refreshed = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        sourceInvalidation: {
          changedSourceIds: ["/project/src/asset.png"],
        },
      }),
    );
    const firstMediaBytes = H.unzipSync(first.artifact?.bytes ?? new Uint8Array())[
      "ppt/media/media1.png"
    ];
    const refreshedMediaBytes = H.unzipSync(refreshed.artifact?.bytes ?? new Uint8Array())[
      "ppt/media/media1.png"
    ];

    expect(first.ok).toBe(true);
    expect(refreshed.ok).toBe(true);
    expect(loadCount).toBe(2);
    expect(Array.from(firstMediaBytes ?? [])).toEqual([137, 80, 78, 71, 1]);
    expect(Array.from(refreshedMediaBytes ?? [])).toEqual([137, 80, 78, 71, 2]);
  });

  test("render execution source invalidation is consumed without durable plugin configuration", async () => {
    let title = "first";
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.plugin({
      kind: "deckjsx.plugin",
      id: "test:stable-plugin",
      name: "test:stable-plugin",
    });
    deck.slide({ name: "Execution invalidation" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>{title}</p>
    ));

    await deck.render(H.pptx());
    title = "second";
    const stale = await deck.render(H.pptx());
    const refreshed = await deck.render(
      H.withRenderExecutionContext(H.pptx(), {
        sourceInvalidation: {
          changedSourceIds: ["/project/src/deck.tsx"],
        },
      }),
    );
    title = "third";
    const later = await deck.render(H.pptx());
    const staleXml = H.textDecoder.decode(
      H.unzipSync(stale.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const refreshedXml = H.textDecoder.decode(
      H.unzipSync(refreshed.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );
    const laterXml = H.textDecoder.decode(
      H.unzipSync(later.artifact?.bytes ?? new Uint8Array())["ppt/slides/slide1.xml"],
    );

    expect(staleXml).toContain("first");
    expect(refreshedXml).toContain("second");
    expect(laterXml).toContain("second");
    expect(refreshed.patchPlan?.sourceInvalidation).toEqual({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    expect(later.patchPlan?.sourceInvalidation).toBeUndefined();
  });
});

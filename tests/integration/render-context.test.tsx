import { describe, expect, test } from "vite-plus/test";
import { pptx } from "../../src/adapter.ts";
import { Deck } from "../../src/index.ts";
import {
  mediaSourceOrigins,
  withIntegrationContext,
  type AssetLoader,
} from "../../src/integration.ts";
import { unzipSync } from "../helpers.ts";

const textDecoder = new TextDecoder();

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);
const mp4Bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

describe("deckjsx/integration", () => {
  test("withIntegrationContext carries AssetLoaders through ordinary deck.render(pptx())", async () => {
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

    const render = await deck.render(
      withIntegrationContext(pptx(), {
        assetLoaders: [loader],
        mediaSourceOrigin: {
          importer: "/project/src/deck.tsx",
          source: "/project/src/deck.tsx",
        },
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

  test("hmr invalidation refreshes cached graph and projection during ordinary render", async () => {
    let title = "before";
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "HMR" }, () => <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>{title}</p>);

    const first = await deck.render(pptx({ inspection: "summary" }));
    title = "after";
    const stale = await deck.render(pptx());
    const refreshed = await deck.render(
      withIntegrationContext(pptx({ inspection: "summary" }), {
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

    expect(first.ok).toBe(true);
    expect(stale.ok).toBe(true);
    expect(refreshed.ok).toBe(true);
    expect(firstSlideXml).toContain("before");
    expect(staleSlideXml).toContain("before");
    expect(refreshedSlideXml).toContain("after");
    expect(refreshed.summary?.assembly?.reusedCount).toBeGreaterThan(0);
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

    const first = await deck.render(
      withIntegrationContext(pptx(), {
        assetLoaders: [loader],
      }),
    );
    currentBytes = new Uint8Array([137, 80, 78, 71, 2]);
    const refreshed = await deck.render(
      withIntegrationContext(pptx(), {
        assetLoaders: [loader],
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

    const render = await deck.render(
      withIntegrationContext(pptx(), {
        assetLoaders: [loader],
        mediaSourceOrigin: { importer: "/project/src/deck.tsx" },
      }),
    );

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

    const render = await deck.render(
      withIntegrationContext(pptx(), {
        assetLoaders: [loader],
        mediaSourceOrigin: { importer: "/project/src/deck.tsx" },
      }),
    );

    expect(render.ok).toBe(true);
    expect(seenOrigins).toEqual([
      "probe:src:/project/src/components/VideoCard.tsx",
      "probe:poster:/project/src/components/VideoCard.tsx",
      "load:src:/project/src/components/VideoCard.tsx",
      "load:poster:/project/src/components/VideoCard.tsx",
    ]);
  });
});

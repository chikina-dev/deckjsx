import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("deckjsx integration media origin", () => {
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
            byteLength: H.pngBytes.byteLength,
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
            byteLength: H.pngBytes.byteLength,
            hash: "fnv1a32:prop-origin-image",
            bytes: H.pngBytes,
          },
        };
      },
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Prop origin" }, () => (
      <img
        {...H.mediaSourceOrigins({
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
      H.assetExtension({
        name: "test:prop-origin-extension",
        loader,
        importer: "/project/src/deck.tsx",
      }),
    );
    const render = await deck.render(H.pptx());

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
                  byteLength: H.mp4Bytes.byteLength,
                  hash: "fnv1a32:component-video-origin",
                }
              : {
                  mediaType: "image/png",
                  extension: "png",
                  width: 1,
                  height: 1,
                  byteLength: H.pngBytes.byteLength,
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
                  byteLength: H.mp4Bytes.byteLength,
                  hash: "fnv1a32:component-video-origin",
                  bytes: H.mp4Bytes,
                }
              : {
                  mediaType: "image/png",
                  extension: "png",
                  width: 1,
                  height: 1,
                  byteLength: H.pngBytes.byteLength,
                  hash: "fnv1a32:component-poster-origin",
                  bytes: H.pngBytes,
                },
        };
      },
    } satisfies H.AssetLoader;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Video prop origin" }, () => (
      <video
        {...H.mediaSourceOrigins({
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
      H.assetExtension({
        name: "test:component-video-origin-extension",
        loader,
        importer: "/project/src/deck.tsx",
      }),
    );
    const render = await deck.render(H.pptx());

    expect(render.ok).toBe(true);
    expect(seenOrigins).toEqual([
      "probe:src:/project/src/components/VideoCard.tsx",
      "probe:poster:/project/src/components/VideoCard.tsx",
      "load:src:/project/src/components/VideoCard.tsx",
      "load:poster:/project/src/components/VideoCard.tsx",
    ]);
  });
});

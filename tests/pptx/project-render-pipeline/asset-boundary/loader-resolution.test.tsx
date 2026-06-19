import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render asset loader resolution", () => {
  test("registered asset loaders resolve in order before the built-in boundary", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();
    const loader = H.testAssetLoader({
      resolverIdentity: "signed-url-assets",
      async probe({ source, resolverIdentity }) {
        if (source.kind !== "url" || resolverIdentity !== "signed-url-assets") {
          return undefined;
        }
        return {
          mediaType: "image/png",
          extension: "png",
          width: 320,
          height: 180,
          byteLength: 4096,
        };
      },
    });

    deck.slide({ name: "Signed URL" }, () => (
      <>
        <img
          src="https://assets.example.test/chart.png"
          style={{ x: 1, y: 1, width: 2, height: 1 }}
        />
      </>
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      artifacts,
      assetLoaders: [loader],
    });
    const [asset] = [...artifacts.assetsById.values()];
    const mediaPart = project.projection?.parts.find((part) => part.kind === "media");

    expect(project.ok).toBe(true);
    expect(asset?.resolverIdentity).toBe("signed-url-assets");
    expect(mediaPart?.payload).toMatchObject({
      metadata: { mediaType: "image/png", widthPx: 320, heightPx: 180, byteLength: 4096 },
    });
  });

  test("render loads asset bytes from the resolver that won Project probing", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2]);
    const calls: string[] = [];

    const firstLoader = H.testAssetLoader({
      resolverIdentity: "first-assets",
      async probe({ source }) {
        calls.push(`first:probe:${source.kind}`);
        return undefined;
      },
      async load({ source }) {
        calls.push(`first:load:${source.kind}`);
        return { mediaType: "image/png", extension: "png", bytes: new Uint8Array([0]) };
      },
    });
    const secondLoader = H.testAssetLoader({
      resolverIdentity: "second-assets",
      async probe({ source }) {
        calls.push(`second:probe:${source.kind}`);
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
      async load({ source, resolverIdentity }) {
        calls.push(`second:load:${resolverIdentity}:${source.kind}`);
        return source.kind === "path" && resolverIdentity === "second-assets"
          ? { mediaType: "image/png", extension: "png", bytes: pngBytes }
          : undefined;
      },
    });
    deck.slide({ name: "Resolver scoped load" }, () => (
      <>
        <img src="/public/scoped.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const render = await H.renderSource({
      source: deck,
      options: deck.options,
      assetLoaders: [firstLoader, secondLoader],
    });
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());

    expect(render.ok).toBe(true);
    expect(calls).toEqual([
      "first:probe:path",
      "second:probe:path",
      "second:load:second-assets:path",
    ]);
    expect(Array.from(zip["ppt/media/media1.png"] ?? [])).toEqual(Array.from(pngBytes));
  });

  test("render reports missing bytes from the Project-winning asset resolver", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const loader = H.testAssetLoader({
      resolverIdentity: "probe-only-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1 }
          : undefined;
      },
    });
    deck.slide({ name: "Missing load" }, () => (
      <>
        <img src="/public/missing-load.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const render = await H.renderSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });
    const diagnostic = render.diagnostics.items.find(
      (item) => item.code === "E_RENDER_ASSET_LOAD_FAILED",
    );

    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(diagnostic).toMatchObject({
      message: "No asset loader returned bytes for this media source.",
      labels: [
        expect.objectContaining({
          path: "ppt/media/media1.png",
          message: "/public/missing-load.png",
        }),
      ],
      notes: expect.arrayContaining([
        "phase=load",
        "resolverIdentity=probe-only-assets",
        "packagePartPath=ppt/media/media1.png",
        "sourceKind=path",
      ]),
    });
  });
});

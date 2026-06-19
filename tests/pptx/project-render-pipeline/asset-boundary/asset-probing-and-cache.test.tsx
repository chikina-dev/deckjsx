import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render asset probing and cache", () => {
  test("Incremental projection recomputes a slide when asset probe metadata changes", async () => {
    let imageWidth = 2;
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();
    const loader = H.testAssetLoader({
      resolverIdentity: "test:incremental-probe-sensitive-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? {
              mediaType: "image/png",
              extension: "png",
              width: imageWidth,
              height: 2,
              byteLength: H.pngHeaderBytes(imageWidth, 2).byteLength,
              hash: `fnv1a32:image-width-${imageWidth}`,
            }
          : undefined;
      },
    });

    deck.slide({ name: "Probe sensitive" }, () => (
      <img src="./chart.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const first = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
      assetLoaders: [loader],
      mediaSourceOrigin: { importer: "/project/src/deck.tsx" },
    });
    const firstSlide = first.projection?.slides[0];

    imageWidth = 3;
    artifacts.invalidateForSourceChange({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    const second = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
      assetLoaders: [loader],
      mediaSourceOrigin: { importer: "/project/src/deck.tsx" },
    });
    const secondSlide = second.projection?.slides[0];

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(firstSlide).toBeDefined();
    expect(secondSlide).toBeDefined();
    expect(secondSlide).not.toBe(firstSlide);
  });

  test("project probes Deck-owned asset loaders into asset artifacts", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();
    const probedSources: string[] = [];
    const loader = H.testAssetLoader({
      resolverIdentity: "test-assets",
      async probe({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }

        probedSources.push(source.path);
        return {
          mediaType: "image/png",
          extension: "png",
          width: 640,
          height: 360,
          byteLength: 1024,
        };
      },
    });

    deck.slide({ name: "Assets" }, () => (
      <>
        <img src="/public/chart.png" style={{ x: 1, y: 1, width: 2, height: 1 }} />
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
    expect(probedSources).toEqual(["/public/chart.png"]);
    expect(asset?.resolverIdentity).toBe("test-assets");
    expect(asset?.source).toEqual({ kind: "path", path: "/public/chart.png" });
    expect(asset?.probe).toMatchObject({
      mediaType: "image/png",
      width: 640,
      height: 360,
      byteLength: 1024,
    });
    expect(mediaPart?.path).toBe("ppt/media/media1.png");
    expect(mediaPart?.payload).toMatchObject({
      assetEntityId: asset?.assetEntityId,
      metadata: {
        mediaType: "image/png",
        extension: "png",
        widthPx: 640,
        heightPx: 360,
        byteLength: 1024,
      },
    });
  });

  test("asset artifacts reuse loader probe and load results by source cache key", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    let probeCount = 0;
    let loadCount = 0;
    const loader = H.testAssetLoader({
      resolverIdentity: "shared-assets",
      async probe({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        probeCount += 1;
        return { mediaType: "image/png", extension: "png", width: 1, height: 1 };
      },
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        loadCount += 1;
        return { mediaType: "image/png", extension: "png", bytes: pngBytes };
      },
    });

    deck.slide({ name: "Shared assets" }, () => (
      <>
        <img src="/public/shared.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
        <img src="/public/shared.png" style={{ x: 2, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const render = await H.renderSource({
      source: deck,
      options: deck.options,
      assetLoaders: [loader],
    });

    expect(render.ok).toBe(true);
    expect(probeCount).toBe(1);
    expect(loadCount).toBe(1);
  });

  test("render skips media asset loading when a hashed media build artifact can be reused", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    let loadCount = 0;
    const loader = H.testAssetLoader({
      resolverIdentity: "hashed-reuse-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? {
              mediaType: "image/png",
              extension: "png",
              width: 1,
              height: 1,
              hash: "sha256:stable-media",
            }
          : undefined;
      },
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        loadCount += 1;
        return {
          mediaType: "image/png",
          extension: "png",
          hash: "sha256:stable-media",
          bytes: pngBytes,
        };
      },
    });
    const firstArtifacts = new H.PipelineArtifactCollection();
    const secondArtifacts = new H.PipelineArtifactCollection();

    deck.slide({ name: "Hashed media reuse" }, () => (
      <>
        <img src="/public/hashed-media.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const cold = await H.renderSource({
      source: deck,
      options: deck.options,
      artifacts: firstArtifacts,
      assetLoaders: [loader],
    });
    secondArtifacts.materializePptxBuildArtifacts([
      ...firstArtifacts.pptxBuildArtifactsByPartId.values(),
    ]);
    const warm = await H.renderSource({
      source: deck,
      options: deck.options,
      definedProjection: firstArtifacts.projection,
      artifacts: secondArtifacts,
      assetLoaders: [loader],
    });

    expect(cold.ok).toBe(true);
    expect(loadCount).toBe(1);
    expect(
      [...firstArtifacts.pptxBuildArtifactsByPartId.values()].find((artifact) =>
        artifact.path.startsWith("ppt/media/"),
      )?.mediaByteFingerprint,
    ).toBe("asset:sha256:stable-media");
    expect(warm.ok).toBe(true);
    expect(loadCount).toBe(1);
    expect(warm.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/media/media1.png",
        status: "reused",
        reason: "buildArtifactFingerprintMatched",
        build: expect.objectContaining({
          mediaByteFingerprint: "asset:sha256:stable-media",
          mediaByteFingerprintSource: "projectedMetadataHash",
        }),
      }),
    );
  });
});

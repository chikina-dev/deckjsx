import { describe, expect, test } from "vite-plus/test";
import type { AssetLoader, DeckPlugin } from "@/src/integration";
import { integrationContextId } from "@/src/integration";
import { isPdfPageModel } from "@/src/projection/pdf/model";
import { PipelineArtifactCollection } from "@/src/pipeline/artifacts";
import { projectSource } from "@/src/pipeline/runner";
import { Deck } from "@/tests/helpers";

const firstFontBytes = new Uint8Array([0, 1, 0, 0]);
const secondFontBytes = new Uint8Array([0, 1, 0, 1]);
const fontPath = "./CacheFont.ttf";
const resolvedFontPath = "/project/src/CacheFont.ttf";

function fontPlugin(loader: AssetLoader): DeckPlugin {
  return {
    kind: "deckjsx.plugin",
    id: "test:font-asset-artifacts",
    name: "test:font-asset-artifacts",
    integration: {
      id: integrationContextId("test:font-asset-artifacts"),
      assetLoaders: [loader],
      fontAssets: [
        {
          key: "cache-font",
          family: "Cache Font",
          source: { kind: "path", path: fontPath },
        },
      ],
    },
  };
}

function fontDeck(loader: AssetLoader): Deck {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.plugin(fontPlugin(loader));
  deck.slide({ name: "Font artifact" }, () => (
    <p style={{ fontFamily: "Cache Font" }}>cached font</p>
  ));
  return deck;
}

function projectedFontBytes(projection: unknown): Uint8Array | undefined {
  if (!isPdfPageModel(projection)) {
    return undefined;
  }
  return projection.resources.fonts.find((font) => font.sourceKey === "cache-font")?.data;
}

describe("PDF font asset artifacts", () => {
  test("materializes and reuses font loads with stable diagnostics", async () => {
    let probeCount = 0;
    let loadCount = 0;
    const loader: AssetLoader = {
      resolverIdentity: "test:font-artifact-cache-loader",
      async probe({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        probeCount += 1;
        return {
          ok: true,
          value: {
            mediaType: "font/ttf",
            extension: "ttf",
            byteLength: firstFontBytes.byteLength,
            provenance: {
              kind: "file",
              resolvedId: resolvedFontPath,
              hashSource: "bytes",
            },
          },
          diagnostics: [
            {
              severity: "warning",
              code: "W_TEST_FONT_CACHE",
              title: "font cache diagnostic",
              labels: [],
            },
          ],
        };
      },
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        loadCount += 1;
        return {
          ok: true,
          value: {
            bytes: firstFontBytes,
            mediaType: "font/ttf",
            extension: "ttf",
            byteLength: firstFontBytes.byteLength,
            provenance: {
              kind: "file",
              resolvedId: resolvedFontPath,
              hashSource: "bytes",
            },
          },
        };
      },
    };
    const deck = fontDeck(loader);
    const artifacts = new PipelineArtifactCollection();

    const first = await projectSource({
      source: deck,
      options: deck.options,
      projectionFormat: "pdf",
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const firstArtifact = [...artifacts.assetsById.values()].find(
      (artifact) => artifact.sourceField === "font",
    );
    const second = await projectSource({
      source: deck,
      options: deck.options,
      projectionFormat: "pdf",
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const secondArtifact = [...artifacts.assetsById.values()].find(
      (artifact) => artifact.sourceField === "font",
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(probeCount).toBe(1);
    expect(loadCount).toBe(1);
    expect(secondArtifact?.assetEntityId).toBe(firstArtifact?.assetEntityId);
    expect(secondArtifact).toEqual(
      expect.objectContaining({
        source: { kind: "path", path: fontPath },
        sourceField: "font",
        resolverIdentity: "test:font-artifact-cache-loader",
        probe: expect.objectContaining({
          provenance: expect.objectContaining({ resolvedId: resolvedFontPath }),
        }),
        load: expect.objectContaining({
          bytes: firstFontBytes,
          provenance: expect.objectContaining({ resolvedId: resolvedFontPath }),
        }),
        probeDiagnostics: expect.objectContaining({
          items: [expect.objectContaining({ code: "W_TEST_FONT_CACHE" })],
        }),
        loadDiagnostics: expect.objectContaining({ items: [] }),
      }),
    );
    expect(
      first.diagnostics.items.filter((item) => item.code === "W_TEST_FONT_CACHE"),
    ).toHaveLength(1);
    expect(
      second.diagnostics.items.filter((item) => item.code === "W_TEST_FONT_CACHE"),
    ).toHaveLength(1);
  });

  test("invalidates a retained PDF projection when the resolved font source changes", async () => {
    let currentBytes = firstFontBytes;
    let loadCount = 0;
    const loader: AssetLoader = {
      resolverIdentity: "test:font-source-invalidation-loader",
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        loadCount += 1;
        return {
          ok: true,
          value: {
            bytes: currentBytes,
            mediaType: "font/ttf",
            extension: "ttf",
            byteLength: currentBytes.byteLength,
            provenance: {
              kind: "file",
              resolvedId: resolvedFontPath,
              hashSource: "bytes",
            },
          },
        };
      },
    };
    const deck = fontDeck(loader);
    const artifacts = new PipelineArtifactCollection();
    const first = await projectSource({
      source: deck,
      options: deck.options,
      projectionFormat: "pdf",
      projectOptions: { inspection: "none" },
      artifacts,
    });

    currentBytes = secondFontBytes;
    const invalidated = artifacts.invalidateForSourceChange({
      changedSourceIds: [resolvedFontPath],
    });
    const second = await projectSource({
      source: deck,
      options: deck.options,
      projectionFormat: "pdf",
      projectOptions: { inspection: "none" },
      definedProjection: artifacts.projection,
      artifacts,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(invalidated).toBe(true);
    expect(loadCount).toBe(2);
    expect(projectedFontBytes(first.projection)).toEqual(firstFontBytes);
    expect(projectedFontBytes(second.projection)).toEqual(secondFontBytes);
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation media support payloads", () => {
  test("project validates media payloads before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken media payload" }, () => (
      <img
        data={H.SAMPLE_SVG_DATA_URI}
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "media"
          ? {
              ...part,
              payload: {
                ...(part.payload as H.PptxMediaPartPayload),
                source: { kind: "file", path: "" },
                sources: [{ kind: "url", url: "" }],
                elementId: "",
                elementIds: [""],
                assetEntityId: "",
                assetEntityIds: [""],
                allocationKey: "",
                metadata: {
                  mediaType: "",
                  extension: "",
                  widthPx: 0,
                  heightPx: Number.NaN,
                  byteLength: -1,
                  hash: "",
                },
              } as never,
            }
          : part,
      ),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".source.kind") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".sources.0.url") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".elementId") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".assetEntityIds.0") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".metadata.widthPx") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".metadata.byteLength") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project requires media payload source aliases before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing media sources" }, () => (
      <img
        data={H.SAMPLE_SVG_DATA_URI}
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind !== "media") {
          return part;
        }

        const payload = part.payload as H.PptxMediaPartPayload;
        const { sources: _sources, ...payloadWithoutSources } = payload;
        return { ...part, payload: payloadWithoutSources as H.PptxMediaPartPayload };
      }),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".payload.sources"),
            message: "invalid media sources",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates media dimensions required by image fitting before render", async () => {
    const withoutMediaDimensions = (projection: H.PptxPackageModel): H.PptxPackageModel =>
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.kind !== "media") {
            return part;
          }

          const payload = part.payload as H.PptxMediaPartPayload;
          const { widthPx: _widthPx, heightPx: _heightPx, ...metadata } = payload.metadata ?? {};
          return {
            ...part,
            payload: {
              ...payload,
              ...(Object.keys(metadata).length > 0 ? { metadata } : { metadata: undefined }),
            },
          };
        }),
      });

    const imageDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    imageDeck.slide({ name: "Missing image dimensions" }, () => (
      <img
        data={H.SAMPLE_SVG_DATA_URI}
        style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1, objectFit: "contain" }}
      />
    ));
    const imageProjection = (await imageDeck.project()).projection!;
    imageDeck.defineProjection(withoutMediaDimensions(imageProjection));

    const imageProject = await imageDeck.project();
    const imageRender = await imageDeck.render();
    expect(imageProject.ok).toBe(false);
    expect(imageProject.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.mediaPartId"),
            message: "image contain requires projected media metadata widthPx and heightPx",
          }),
        ]),
      }),
    );
    expect(imageRender.ok).toBe(false);
    expect(imageRender.artifact).toBeUndefined();

    const backgroundDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    backgroundDeck.slide({ name: "Missing background dimensions" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 2,
          background: `url("${H.SAMPLE_SVG_DATA_URI}")`,
          backgroundSize: "auto auto",
        }}
      />
    ));
    const backgroundProjection = (await backgroundDeck.project()).projection!;
    backgroundDeck.defineProjection(withoutMediaDimensions(backgroundProjection));

    const backgroundProject = await backgroundDeck.project();
    const backgroundRender = await backgroundDeck.render();
    expect(backgroundProject.ok).toBe(false);
    expect(backgroundProject.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".backgroundLayers.0.source"),
            message: "background image size requires projected media metadata widthPx and heightPx",
          }),
        ]),
      }),
    );
    expect(backgroundRender.ok).toBe(false);
    expect(backgroundRender.artifact).toBeUndefined();
  });

  test("project validates media payload cross-field consistency before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Inconsistent media payload" }, () => (
      <img
        data={H.SAMPLE_SVG_DATA_URI}
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = H.expectPptxPart(projection.parts, "media");
    const mediaPayload = mediaPart.payload;
    const sourceAlias = { kind: "url" as const, url: "https://assets.example.test/chart.png" };
    const primaryElementId = "pptx:test:primary-element" as H.PptxElementId;
    const otherElementId = "pptx:test:other-element" as H.PptxElementId;
    const primaryAssetId = "asset:test:primary" as H.AssetEntityId;
    const otherAssetId = "asset:test:other" as H.AssetEntityId;
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === mediaPart.id
            ? {
                ...part,
                payload: {
                  ...mediaPayload,
                  sources: [sourceAlias, sourceAlias],
                  elementId: primaryElementId,
                  elementIds: [otherElementId, otherElementId],
                  assetEntityId: primaryAssetId,
                  assetEntityIds: [otherAssetId, otherAssetId],
                  allocationKey: "source:test:media",
                  metadata: {
                    mediaType: "image/png",
                    extension: "png",
                    hash: "sha256:inconsistent-media",
                  },
                } satisfies H.PptxMediaPartPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".metadata.extension"),
              message: expect.stringContaining("package path extension"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".metadata.mediaType"),
              message: expect.stringContaining("manifest default"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".sources"),
              message: "media sources do not include primary source",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".sources.1"),
              message: "duplicate media source entry",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".elementIds"),
              message: expect.stringContaining("primary value"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".elementIds.1"),
              message: expect.stringContaining("duplicate media element ids entry"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".assetEntityIds"),
              message: expect.stringContaining("primary value"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".assetEntityIds.1"),
              message: expect.stringContaining("duplicate media asset ids entry"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".allocationKey"),
              message: "media allocation key does not include metadata hash",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

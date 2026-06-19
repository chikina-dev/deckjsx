import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation media and fallback payloads", () => {
  test("project validates drawing element id uniqueness across generated strokes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate generated element id" }, () => (
      <div style={{ x: 0.5, y: 0.5, width: 4, height: 2, outline: "2pt solid #cc5500" }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => {
            if (element.kind !== "group" || !element.generatedStrokes?.[0]) {
              return element;
            }

            return {
              ...element,
              generatedStrokes: element.generatedStrokes.map((layer, index) =>
                index === 0 ? { ...layer, id: element.id } : layer,
              ),
            };
          }),
        },
      },
    } as H.PptxSlidePart;

    deck.defineProjection({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
        title: "pptx drawing element identity is duplicated",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.generatedStrokes.0.id"),
          }),
          expect.objectContaining({ path: expect.stringContaining(".drawing.children.0.id") }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates media payload element references against drawing ids", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Orphan media element" }, () => (
      <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = H.expectPptxPart(projection.parts, "media");
    const mediaPayload = mediaPart.payload;
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === mediaPart.id
            ? {
                ...part,
                payload: {
                  ...mediaPayload,
                  elementId: "pptx:test:missing-media-owner" as H.PptxElementId,
                  elementIds: [
                    mediaPayload.elementId!,
                    "pptx:test:missing-media-owner" as H.PptxElementId,
                  ],
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
              path: expect.stringContaining(".elementId"),
              message: expect.stringContaining("does not reference a projected drawing element"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".elementIds.1"),
              message: expect.stringContaining("does not reference a projected drawing element"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates media payload asset references against drawing origins", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const loader = H.testAssetLoader({
      resolverIdentity: "asset-reference-test",
      async probe({ source }) {
        return source.kind === "path"
          ? { mediaType: "image/png", extension: "png", width: 1, height: 1, byteLength: 8 }
          : undefined;
      },
    });
    deck.slide({ name: "Orphan media asset" }, () => (
      <img src="/public/chart.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (
      await H.projectSource({
        source: deck,
        options: deck.options,
        assetLoaders: [loader],
      })
    ).projection!;
    const mediaPart = H.expectPptxPart(projection.parts, "media");
    const mediaPayload = mediaPart.payload;
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === mediaPart.id
            ? {
                ...part,
                payload: {
                  ...mediaPayload,
                  assetEntityId: "asset:test:missing-media-origin" as H.AssetEntityId,
                  assetEntityIds: [
                    mediaPayload.assetEntityId!,
                    "asset:test:missing-media-origin" as H.AssetEntityId,
                  ],
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
              path: expect.stringContaining(".assetEntityId"),
              message: expect.stringContaining("does not reference a projected drawing origin"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MEDIA_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".assetEntityIds.1"),
              message: expect.stringContaining("does not reference a projected drawing origin"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates drawing unsupported semantic fallback payloads", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken unsupported fallback" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5, opacity: 0.4 }}>Faded</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.kind === "slide"
          ? {
              ...part,
              payload: {
                ...H.slidePartPayload(part),
                drawing: {
                  ...H.slidePartPayload(part).drawing,
                  children: H.slidePartPayload(part).drawing.children.map((element) => ({
                    ...element,
                    unsupportedSemantics: [
                      {
                        feature: "opacity",
                        property: "stackingContext",
                        value: "0.4",
                        reason: "opacity fallback",
                        fallback: {
                          strategy: "paintWithMagic",
                          preserves: ["projectedOpacity", ""],
                          missing: "cssStackingContext",
                        },
                      },
                    ],
                  })),
                },
              } as never,
            }
          : part,
      ),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC" }),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unsupportedSemantics.0.fallback.strategy"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unsupportedSemantics.0.fallback.preserves.1"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unsupportedSemantics.0.fallback.missing"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

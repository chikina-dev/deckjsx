import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render media asset diagnostics", () => {
  test("projected video parts keep playable mp4 media and poster image relationships", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Video" }, () => (
      <>
        <video
          data={H.dataUriFromBytes("video/mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))}
          posterData={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 4, height: 2.25, objectFit: "contain" }}
        />
      </>
    ));

    const project = await deck.project();
    const slide = project.projection?.slides[0];
    const video = slide?.payload.drawing.children.find((element) => element.kind === "video");
    const videoRelationship = slide?.relationships?.find(
      (relationship) => relationship.type === "video",
    );
    const embeddedMediaRelationship = slide?.relationships?.find(
      (relationship) => relationship.type === "media",
    );
    const posterRelationship = slide?.relationships?.find(
      (relationship) => relationship.type === "image",
    );
    const mediaParts = project.projection?.parts.filter(H.isPptxMediaPart) ?? [];
    const videoPart = mediaParts.find((part) => part.payload.mediaKind === "video");
    const posterPart = mediaParts.find((part) => part.payload.mediaKind === "image");

    expect(project.ok).toBe(true);
    expect(video?.kind).toBe("video");
    expect(video?.kind === "video" ? video.mediaPartId : undefined).toBe(videoPart?.id);
    expect(video?.kind === "video" ? video.posterMediaPartId : undefined).toBe(posterPart?.id);
    expect(videoPart?.path).toBe("ppt/media/media1.mp4");
    expect(videoPart?.payload.metadata).toMatchObject({
      mediaType: "video/mp4",
      extension: "mp4",
    });
    expect(posterPart?.path).toBe("ppt/media/media2.png");
    expect(videoRelationship?.targetPartId).toBe(videoPart?.id);
    expect(embeddedMediaRelationship?.targetPartId).toBe(videoPart?.id);
    expect(video?.kind === "video" ? video.serialized.mediaRelationshipId : undefined).toBe(
      embeddedMediaRelationship?.id,
    );
    expect(posterRelationship?.targetPartId).toBe(posterPart?.id);
  });

  test("defined projection reports valid model-owned unsupported semantic records as warnings", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Defined unsupported semantic" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>Defined fallback</p>
    ));

    const projection = (await deck.project()).projection!;
    const changedProjection = H.withFreshPackageFingerprints({
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
                        feature: "background",
                        property: "background",
                        value: "paint(deckjsx-custom)",
                        reason: "custom background fallback",
                        fallback: {
                          strategy: "preserveAuthoredValueOnly",
                          preserves: ["authoredBackgroundInput"],
                          missing: ["pptxBackgroundLayer"],
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
    deck.defineProjection(changedProjection);

    const project = await deck.project();
    const element = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        message: "custom background fallback",
        notes: expect.arrayContaining([
          `elementId=${element?.id}`,
          "feature=background",
          "property=background",
          "value=paint(deckjsx-custom)",
          "fallbackStrategy=preserveAuthoredValueOnly",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "background",
        property: "background",
        value: "paint(deckjsx-custom)",
        elementId: element?.id,
        fallback: expect.objectContaining({ strategy: "preserveAuthoredValueOnly" }),
      }),
    );
  });

  test("project inspection summary exposes top-level clipping metadata", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Summary clip" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>Clipped summary</p>
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const element = slide.payload.drawing.children[0]!;
    const originalFrame = element.frame;
    const clipFrame = {
      ...originalFrame,
      widthEmu: Math.max(1, Math.floor(originalFrame.widthEmu / 2)),
    };
    const clip = {
      strategy: "intersectParentOverflow",
      originalFrame,
      clipFrame,
      visibleFrame: clipFrame,
    } as const;
    const drawing = {
      ...slide.payload.drawing,
      children: slide.payload.drawing.children.map((drawingElement, index) =>
        index === 0 ? { ...drawingElement, clip } : drawingElement,
      ),
    };
    const parts = H.withPackagePartFingerprints(
      projection.parts.map((part) =>
        part.id === slide.id ? { ...part, payload: { ...slide.payload, drawing } as never } : part,
      ),
    );
    const updatedSlidePart =
      parts.find(
        (part): part is (typeof parts)[number] & H.PptxSlidePart =>
          part.id === slide.id && H.isPptxSlidePart(part),
      ) ?? slide;

    deck.defineProjection({
      ...projection,
      parts,
      slides: projection.slides.map((projectedSlide) =>
        projectedSlide.id === slide.id
          ? { ...updatedSlidePart, payload: { ...projectedSlide.payload, drawing } }
          : projectedSlide,
      ),
    });

    const project = await deck.project();
    const summaryElement = project.summary?.slides[0]?.elements[0];

    expect(project.ok).toBe(true);
    expect(summaryElement?.clip).toEqual(clip);
    expect(summaryElement?.resolvedValues?.clip).toEqual(clip);
  });

  test("project stops asset probing after a handled loader failure", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    let fallbackProbeCount = 0;
    const failingLoader: H.AssetLoader = {
      resolverIdentity: "terminal-failure",
      async probe({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        return {
          ok: false as const,
          diagnostics: [
            {
              severity: "error" as const,
              code: "E_TEST_TERMINAL_ASSET_FAILURE",
              title: "terminal asset failure",
              message: "The first loader handled this path and failed.",
              labels: [],
            },
          ],
        };
      },
    };
    const fallbackLoader = H.testAssetLoader({
      resolverIdentity: "fallback-loader",
      async probe({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        fallbackProbeCount += 1;
        return { mediaType: "image/png", extension: "png", width: 1, height: 1 };
      },
    });
    deck.slide({ name: "Terminal failure" }, () => (
      <img src="/public/terminal.png" style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      assetLoaders: [failingLoader, fallbackLoader],
    });

    expect(project.ok).toBe(false);
    expect(fallbackProbeCount).toBe(0);
    expect(
      project.diagnostics.items.some((item) => item.code === "E_TEST_TERMINAL_ASSET_FAILURE"),
    ).toBe(true);
  });

  test("project inspection exposes asset resolution provenance", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const pngBytes = H.pngHeaderBytes(1, 1);
    const loader = H.testAssetLoader({
      resolverIdentity: "inspect-assets",
      async probe({ source }) {
        return source.kind === "path"
          ? {
              mediaType: "image/png",
              extension: "png",
              width: 1,
              height: 1,
              byteLength: pngBytes.byteLength,
              hash: "fnv1a32:inspect",
            }
          : undefined;
      },
    });
    deck.slide({ name: "Inspect assets" }, () => (
      <img
        src="./inspect.png"
        style={{ x: 1, y: 1, width: 1, height: 1 }}
        {...H.mediaSourceOrigins({
          src: {
            importer: "/project/src/deck.tsx",
            source: "./inspect.png",
            sourceIdentity: "project-src-deck",
          },
        })}
      />
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "summary" },
      assetLoaders: [loader],
    });

    expect(project.diagnostics.items.map((item) => item.code)).toEqual([]);
    expect(project.ok).toBe(true);
    expect(project.summary?.assetResolutions).toEqual([
      expect.objectContaining({
        sourceKind: "path",
        sourceField: "src",
        resolverIdentity: "inspect-assets",
        provenanceKind: "file",
        resolvedId: "fnv1a32:inspect",
        importer: "/project/src/deck.tsx",
        sourceIdentity: "project-src-deck",
        hashSource: "loader",
        diagnosticCodes: [],
      }),
    ]);
    expect(project.summary?.assetResolutions[0]?.assetEntityId).toContain("asset");
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer slide emitter guards", () => {
  test("package emission rejects malformed slide payloads before invoking the slide writer", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Malformed slide payload" }, () => <></>);
    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    let writerCalled = false;

    expect(() =>
      H.emitPartBytes(
        { ...slide, payload: { kind: "malformed-slide-payload" } } as H.PptxPackagePart,
        projection,
        {
          slideBytes: () => {
            writerCalled = true;
            return new Uint8Array();
          },
        },
      ),
    ).toThrow("Slide package parts must carry a structured slide payload.");
    expect(writerCalled).toBe(false);
  });

  test("slide XML emitter rejects missing image and hyperlink relationship ids", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Slide relationship validation" }, () => (
      <>
        <img
          data={H.SAMPLE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 1,
            height: 1,
            href: "https://example.test/image",
          }}
        />
        <p
          style={{
            position: "absolute",
            left: 3,
            top: 1,
            width: 2,
            height: 0.5,
            href: "https://example.test/text",
          }}
        >
          Link
        </p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const imageElement = slide.payload.drawing.children.find((element) => element.kind === "image");
    const textElement = slide.payload.drawing.children.find((element) => element.kind === "text");
    const withSlide = (nextSlide: H.PptxSlidePart): H.PptxPackageModel => ({
      ...projection,
      slides: projection.slides.map((candidate) =>
        candidate.id === nextSlide.id ? nextSlide : candidate,
      ),
      parts: projection.parts.map((part) => (part.id === nextSlide.id ? nextSlide : part)),
    });

    expect(imageElement?.kind).toBe("image");
    expect(textElement?.kind).toBe("text");

    const missingImageRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? { ...element, serialized: { ...element.serialized, relationshipId: undefined } }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() =>
      H.slideBytes(missingImageRelationship, withSlide(missingImageRelationship)),
    ).toThrow(
      ` drawing element ${imageElement?.id} must reference projected image relationship id.`,
    );

    const missingImageObjectPosition = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) => {
            if (element.kind !== "image") {
              return element;
            }
            const { objectPosition: _objectPosition, ...rest } = element;
            return rest;
          }),
        },
      },
    } as H.PptxSlidePart;

    expect(() =>
      H.slideBytes(missingImageObjectPosition, withSlide(missingImageObjectPosition)),
    ).toThrow(" requires projected image objectPosition.");

    const malformedImageCrop = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? { ...element, crop: { top: -0.1, right: 0, bottom: 0, left: 0 } }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() => H.slideBytes(malformedImageCrop, withSlide(malformedImageCrop))).toThrow(
      "PPTX picture XML requires image crop.top between 0 and 1.",
    );

    const overcropped = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? { ...element, crop: { top: 0, right: 0.7, bottom: 0, left: 0.4 } }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() => H.slideBytes(overcropped, withSlide(overcropped))).toThrow(
      "PPTX picture XML requires image crop to leave positive source width.",
    );

    const missingImageHyperlinkRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? {
                  ...element,
                  serialized: { ...element.serialized, hyperlinkRelationshipId: undefined },
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() =>
      H.slideBytes(missingImageHyperlinkRelationship, withSlide(missingImageHyperlinkRelationship)),
    ).toThrow(
      ` drawing element ${imageElement?.id} must reference projected hyperlink relationship id.`,
    );

    const missingTextHyperlinkRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "text"
              ? {
                  ...element,
                  serialized: { ...element.serialized, hyperlinkRelationshipId: undefined },
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() =>
      H.slideBytes(missingTextHyperlinkRelationship, withSlide(missingTextHyperlinkRelationship)),
    ).toThrow(
      `text drawing element ${textElement?.id} must reference projected hyperlink relationship id.`,
    );

    const staleImageRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? { ...element, serialized: { ...element.serialized, relationshipId: "rIdStale" } }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() => H.slideBytes(staleImageRelationship, withSlide(staleImageRelationship))).toThrow(
      ` drawing element ${imageElement?.id} must reference existing projected image relationship rIdStale.`,
    );

    const staleImageHyperlinkRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? {
                  ...element,
                  serialized: {
                    ...element.serialized,
                    hyperlinkRelationshipId: "rIdStaleImageLink",
                  },
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() =>
      H.slideBytes(staleImageHyperlinkRelationship, withSlide(staleImageHyperlinkRelationship)),
    ).toThrow(
      ` drawing element ${imageElement?.id} must reference existing projected hyperlink relationship rIdStaleImageLink.`,
    );

    const staleTextHyperlinkRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "text"
              ? {
                  ...element,
                  serialized: {
                    ...element.serialized,
                    hyperlinkRelationshipId: "rIdStaleTextLink",
                  },
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() =>
      H.slideBytes(staleTextHyperlinkRelationship, withSlide(staleTextHyperlinkRelationship)),
    ).toThrow(
      `text drawing element ${textElement?.id} must reference existing projected hyperlink relationship rIdStaleTextLink.`,
    );
  });

  test("slide XML emitter rejects missing background image relationship ids", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background relationship validation" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${H.SAMPLE_SVG_DATA_URI}")`,
          backgroundRepeat: "no-repeat",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const missingBackgroundRelationship = {
      ...slide,
      relationships: slide.relationships?.filter((relationship) => relationship.type !== "image"),
    } satisfies H.PptxSlidePart;
    const nextProjection = {
      ...projection,
      slides: projection.slides.map((candidate) =>
        candidate.id === slide.id ? missingBackgroundRelationship : candidate,
      ),
      parts: projection.parts.map((part) =>
        part.id === slide.id ? missingBackgroundRelationship : part,
      ),
    } satisfies H.PptxPackageModel;

    expect(() => H.slideBytes(missingBackgroundRelationship, nextProjection)).toThrow(
      /Background image layer .* must reference projected image relationship id\./,
    );

    const missingBackgroundImageSerialized = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  backgroundLayers: element.backgroundLayers?.map((layer) =>
                    layer.kind === "background-image" ? { ...layer, serialized: undefined } : layer,
                  ),
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() => H.slideBytes(missingBackgroundImageSerialized, projection)).toThrow(
      "Background image layer must carry a projected shape object id.",
    );

    const missingBackgroundImageObjectPosition = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  backgroundLayers: element.backgroundLayers?.map((layer) => {
                    if (layer.kind !== "background-image") {
                      return layer;
                    }
                    const { objectPosition: _objectPosition, ...rest } = layer;
                    return rest;
                  }),
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() => H.slideBytes(missingBackgroundImageObjectPosition, projection)).toThrow(
      "Background image requires projected image objectPosition.",
    );
  });

  test("slide XML emitter requires projected frames for non-image background layers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background layer frame validation" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#2563EB",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const missingBackgroundLayerFrame = {
      ...slide,
      payload: {
        ...slide.payload,
        backgroundLayers: [H.malformedBackgroundLayer({ kind: "solid", color: "111111" })],
      },
    } as H.PptxSlidePart;

    expect(() => H.slideBytes(missingBackgroundLayerFrame, projection)).toThrow(
      "Background layer 5000 is missing projected frame",
    );

    const missingBackgroundLayerSerialized = {
      ...slide,
      payload: {
        ...slide.payload,
        backgroundLayers: [
          H.malformedBackgroundLayer({
            kind: "solid",
            color: "111111",
            frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
          }),
        ],
      },
    } as H.PptxSlidePart;

    expect(() => H.slideBytes(missingBackgroundLayerSerialized, projection)).toThrow(
      "Background layer 5000 must carry a projected shape object id",
    );
  });

  test("slide XML emitter requires projected generated stroke layers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Generated stroke validation" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderTop: "1pt solid #111111",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const sourceElement = slide.payload.drawing.children[0];
    const missingGeneratedStrokeLayers = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "group" ? { ...element, generatedStrokes: undefined } : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() => H.slideBytes(missingGeneratedStrokeLayers, projection)).toThrow(
      `Drawing element ${sourceElement?.id} is missing projected generated stroke layers`,
    );
  });

  test("slide XML emitter requires projected generated stroke shape geometry", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Generated stroke geometry validation" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderTop: "1pt solid #111111",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const sourceElement = slide.payload.drawing.children[0];
    if (sourceElement?.kind !== "group" || !sourceElement.generatedStrokes?.[0]) {
      throw new Error("Expected generated stroke layer fixture");
    }

    const malformedGeneratedStroke = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  generatedStrokes: element.generatedStrokes?.map((layer, index) =>
                    index === 0 ? { ...layer, shape: "curve" as never } : layer,
                  ),
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() => H.slideBytes(malformedGeneratedStroke, projection)).toThrow(
      `Generated stroke layer ${sourceElement.generatedStrokes[0].id} is missing projected shape geometry`,
    );
  });

  test("slide XML emitter requires projected shape geometry", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " geometry validation" }, () => (
      <shape
        shape="ellipse"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#111111",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const sourceElement = slide.payload.drawing.children[0];
    if (sourceElement?.kind !== "shape") {
      throw new Error("Expected shape element fixture");
    }

    const malformedShapeGeometry = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "shape" ? { ...element, shape: "triangle" as never } : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    expect(() => H.slideBytes(malformedShapeGeometry, projection)).toThrow(
      ` element ${sourceElement.id} is missing projected shape geometry`,
    );
  });

  test("picture XML emitter requires projected media dimensions for fit calculations", async () => {
    const withoutMediaDimensions = (projection: H.PptxPackageModel): H.PptxPackageModel => ({
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
    const withoutMediaSources = (projection: H.PptxPackageModel): H.PptxPackageModel => ({
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

    const imageDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    imageDeck.slide({ name: " metadata required" }, () => (
      <img
        data={H.WIDE_SVG_DATA_URI}
        style={{ position: "absolute", left: 1, top: 1, width: 2, height: 2, objectFit: "contain" }}
      />
    ));

    const imageProjection = (await imageDeck.project()).projection!;
    expect(() =>
      H.slideBytes(imageProjection.slides[0]!, withoutMediaDimensions(imageProjection)),
    ).toThrow(" contain fit requires projected media metadata widthPx and heightPx.");
    expect(() =>
      H.slideBytes(imageProjection.slides[0]!, withoutMediaSources(imageProjection)),
    ).toThrow("Media package parts must carry structured media payload sources.");

    const backgroundDeck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    backgroundDeck.slide({ name: "Background metadata required" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 2,
          background: `url("${H.WIDE_SVG_DATA_URI}")`,
          backgroundSize: "auto auto",
        }}
      />
    ));

    const backgroundProjection = (await backgroundDeck.project()).projection!;
    expect(() =>
      H.slideBytes(backgroundProjection.slides[0]!, withoutMediaDimensions(backgroundProjection)),
    ).toThrow(
      "Background image size calculation requires projected media metadata widthPx and heightPx.",
    );
  });
});

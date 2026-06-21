import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation drawing core payloads", () => {
  test("direct writer validates drawing origin metadata shape", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid drawing origin" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>origin</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const [firstChild, ...remainingChildren] = slidePart.payload.drawing.children;
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: [
            {
              ...firstChild!,
              origin: {
                graphNodeIds: ["", "graph:test:duplicate", "graph:test:duplicate"],
                styleEntityIds: ["style:test:duplicate", "style:test:duplicate"],
                assetEntityIds: ["", "asset:test:duplicate", "asset:test:duplicate"],
                source: { kind: "mounted", sourceKey: "", sourceIdentity: "" },
              },
            },
            ...remainingChildren,
          ],
        },
      },
    } as H.PptxSlidePart;
    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_ORIGIN"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.graphNodeIds.0"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.graphNodeIds.2"),
            message: expect.stringContaining("duplicate graph node ids entry"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.styleEntityIds.1"),
            message: expect.stringContaining("duplicate style entity ids entry"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.assetEntityIds.0"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.assetEntityIds.2"),
            message: expect.stringContaining("duplicate asset entity ids entry"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.source.sourceKey"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.origin.source.sourceIdentity"),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates drawing element payload shape", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid drawing payload" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>payload</p>
        <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 2, height: 1 }} />
      </>
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
            if (element.kind === "text") {
              return {
                ...element,
                content: { text: 42, runs: [{ text: 7, style: "invalid" }] },
                style: "invalid",
                hyperlink: { url: "", tooltip: 3 },
              };
            }
            if (element.kind === "image") {
              return {
                ...element,
                mediaPartId: 7,
                sourceFrame: { xEmu: Number.NaN, yEmu: 0, widthEmu: 0, heightEmu: -1 },
                source: { kind: "url", url: "" },
                fit: "tile",
                objectPosition: { x: Number.NaN, y: 0.5 },
                crop: { top: 0, right: "bad", bottom: 0, left: 0 },
                transparency: "transparent",
                rounding: "yes",
                hyperlink: { url: "javascript:alert(1)" },
              };
            }
            return element;
          }),
        },
      },
    } as H.PptxSlidePart;
    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.content.text"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.content.runs.0.text"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.content.runs.0.style"),
          }),
          expect.objectContaining({ path: expect.stringContaining(".drawing.children.0.style") }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.hyperlink.url"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.mediaPartId"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.sourceFrame.xEmu"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.sourceFrame.widthEmu"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.sourceFrame.heightEmu"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.source.url"),
          }),
          expect.objectContaining({ path: expect.stringContaining(".drawing.children.1.fit") }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.objectPosition.x"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.crop.right"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.transparency"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.rounding"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.hyperlink.url"),
          }),
        ]),
      }),
    );
  });

  test("direct writer diagnoses malformed table sections without throwing", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Malformed table" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>table</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: [
            {
              kind: "table",
              sections: [{}],
            },
            ...slidePart.payload.drawing.children,
          ],
        },
      },
    } as H.PptxSlidePart;
    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.sections.0"),
            message: "invalid table section",
          }),
        ]),
      }),
    );
  });

  test("render validation requires projected image objectPosition values", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing objectPosition" }, () => (
      <>
        <div
          style={{
            x: 0,
            y: 0,
            width: 2,
            height: 1,
            background: `url("${H.SAMPLE_SVG_DATA_URI}")`,
            backgroundRepeat: "no-repeat",
          }}
        />
        <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 3, y: 0, width: 1, height: 1 }} />
      </>
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
            if (element.kind === "group") {
              return {
                ...element,
                backgroundLayers: element.backgroundLayers?.map((layer) => {
                  if (layer.kind !== "background-image") {
                    return layer;
                  }
                  const { objectPosition: _objectPosition, ...rest } = layer;
                  return rest;
                }),
              };
            }
            if (element.kind === "image") {
              const { objectPosition: _objectPosition, ...rest } = element;
              return rest;
            }
            return element;
          }),
        },
      },
    } as H.PptxSlidePart;

    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.backgroundLayers.0.objectPosition"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.1.objectPosition"),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates malformed group drawing children before recursion", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid group payload" }, () => (
      <div style={{ x: 1, y: 1, width: 2, height: 1 }}>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>group child</p>
      </div>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const [groupElement, ...remainingChildren] = slidePart.payload.drawing.children;
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: [{ ...groupElement!, children: "invalid" }, ...remainingChildren],
        },
      },
    } as H.PptxSlidePart;
    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.children"),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates projected image crop ratios before source-rect emission", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid crop payload" }, () => (
      <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 2, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? { ...element, crop: { top: -0.1, right: 0.7, bottom: 0, left: 0.4 } }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.crop.top"),
            message: "invalid image crop top",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.crop"),
            message: "image crop left and right must leave positive source width",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates malformed drawing fill before part emission", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Emitter failure" }, () => (
      <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>emitter failure</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "text"
              ? { ...element, fill: { kind: "solid", color: Symbol("emitter failure") } }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;
    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: [malformedSlide],
        parts: projection.parts.map((part) => (part.kind === "slide" ? malformedSlide : part)),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.buildArtifacts).toBeUndefined();
    expect(result.summary?.assembly).toMatchObject({
      entries: [],
      failedCount: 0,
      missingCount: 0,
      rebuiltCount: 0,
      reusedCount: 0,
    });
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.fill.color"),
          }),
        ]),
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD"),
        ]),
      }),
    );
  });

  test("project assigns and validates background layer shape object ids", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Background layer ids" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            background:
              "linear-gradient(90deg, #111111 0%, #333333 100%), linear-gradient(180deg, #444444 0%, #666666 100%)",
          }}
        />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const group = slide.payload.drawing.children[0];
    const backgroundLayer = group?.kind === "group" ? group.backgroundLayers?.[0] : undefined;

    expect(backgroundLayer?.kind).toBe("linear-gradient");
    expect(backgroundLayer && "serialized" in backgroundLayer).toBe(true);
    expect(
      backgroundLayer && "serialized" in backgroundLayer
        ? backgroundLayer.serialized.shapeObjectId
        : undefined,
    ).toMatch(/^[1-9]\d*$/);
    expect(backgroundLayer?.paintOrder).toMatchObject({
      siblingOrder: 0,
      generatedLayerRole: "background",
    });

    const malformedSlide = {
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
                    layer.kind === "background-image"
                      ? layer
                      : { ...layer, paintOrder: undefined, serialized: undefined },
                  ),
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;
    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((candidate) =>
          candidate.id === slide.id ? malformedSlide : candidate,
        ),
        parts: projection.parts.map((part) => (part.id === slide.id ? malformedSlide : part)),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.backgroundLayers.0.serialized"),
            message: "invalid background layer serialized identity metadata",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.backgroundLayers.0.paintOrder"),
            message: "invalid background paint order",
          }),
        ]),
      }),
    );
  });
});

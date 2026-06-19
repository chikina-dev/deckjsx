import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation drawing metadata payloads", () => {
  test("project rejects non-object unsupported semantic records and empty fallback lists", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Malformed unsupported semantic" }, () => (
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
                      null,
                      {
                        feature: "opacity",
                        property: "stackingContext",
                        value: "0.4",
                        reason: "opacity fallback",
                        fallback: {
                          strategy: "preserveOpacityWithoutCompositedSubtree",
                          preserves: [],
                          missing: [],
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
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".unsupportedSemantics.0") }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unsupportedSemantics.1.fallback.preserves"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_UNSUPPORTED_SEMANTIC",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".unsupportedSemantics.1.fallback.missing"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates drawing metadata payloads before render", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      templates: {
        report: {
          areas: { title: { kind: "title", frame: { x: 0.5, y: 0.5, width: 8, height: 1 } } },
        },
      },
    });
    deck.slide({ template: "report" }, ({ template }) => (
      <p area={template.title}>Broken drawing metadata</p>
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
                    id: "",
                    kind: "magic",
                    frame: { xEmu: Number.NaN, yEmu: 0, widthEmu: -1, heightEmu: 914400 },
                    opacity: 1.5,
                    rotation: Number.POSITIVE_INFINITY,
                    zIndex: "front",
                    flipH: "yes",
                    flipV: 1,
                    visibility: "collapse",
                    serialized: { shapeObjectId: "9007199254740991" },
                    emissionTarget: "notes",
                    paintOrderIndex: -1,
                    paintOrder: {
                      siblingOrder: -1,
                      zIndex: Number.NaN,
                      generatedLayerRole: "magic",
                    },
                    layoutAnchor: {
                      template: "",
                      area: "",
                      kind: "headline",
                      frame: { xEmu: 0, yEmu: 0, widthEmu: Number.NaN, heightEmu: 914400 },
                    },
                    clip: {
                      strategy: "magicClip",
                      originalFrame: "missing",
                      clipFrame: { xEmu: 0, yEmu: 0, widthEmu: Number.NaN, heightEmu: 914400 },
                      visibleFrame: { xEmu: 0, yEmu: 0, widthEmu: 914400, heightEmu: 914400 },
                    },
                    measurement: {
                      frame: { xEmu: 0, yEmu: Number.NaN, widthEmu: 914400, heightEmu: 914400 },
                      overflow: "scroll",
                    },
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
      expect.objectContaining({ code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA" }),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".id") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".kind") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".frame.xEmu") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".frame.widthEmu") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".opacity") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".rotation") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".zIndex") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".flipH") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".flipV") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".visibility") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".serialized.shapeObjectId") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".emissionTarget") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".paintOrderIndex") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".paintOrder.generatedLayerRole"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".layoutAnchor.kind") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".layoutAnchor.frame.widthEmu"),
            }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".clip.strategy") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".clip.originalFrame") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".clip.clipFrame.widthEmu") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".measurement.frame.yEmu") }),
          ]),
        }),
        expect.objectContaining({
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(".measurement.overflow") }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates drawing node package part ownership before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken drawing ownership" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>ownership</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const presentationPart = H.expectPptxPart(projection.parts, "presentation");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element) => ({
            ...element,
            packagePartId: presentationPart.id,
          })),
        },
      },
    } satisfies H.PptxSlidePart;

    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.packagePartId"),
            message: `drawing node does not belong to ${slidePart.id}`,
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates root drawing order metadata before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken root drawing order" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>One</p>
        <p style={{ x: 1, y: 2, width: 2, height: 0.5 }}>Two</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element, index) =>
            index === 0
              ? {
                  ...element,
                  emissionTarget: "slideLayout",
                  paintOrderIndex: 1,
                  paintOrder: undefined,
                }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;

    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.0.emissionTarget"),
              message: "emission target does not match slide",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.0.paintOrderIndex"),
              message: "paint order index does not match drawing order 0",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_METADATA",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.0.paintOrder"),
              message: "invalid paint order",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

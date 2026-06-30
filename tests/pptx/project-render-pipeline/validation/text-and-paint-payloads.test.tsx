import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation text and paint payloads", () => {
  test("project validates text drawing style payloads before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken text style" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}> style</p>
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
            element.kind === "text"
              ? {
                  ...element,
                  content: {
                    ...element.content,
                    runs: [
                      {
                        text: "run",
                        style: {
                          textAlign: "middle",
                          tabStops: [{ positionIn: Number.NaN, alignment: "center" }],
                          list: { type: "number", style: "decimal", startAt: -1 },
                          fontWeight: 0,
                        },
                      },
                    ],
                  },
                  style: {
                    ...element.style,
                    fontSizePt: Number.NaN,
                    fontWeight: 2000,
                    underlineColor: "#123456",
                    underlineStyle: "wave",
                    textDirection: "vertical",
                    verticalAlign: "center",
                    paddingPt: [0, 1, "bad", 3],
                    lineSpacing: -1,
                    lineSpacingMultiple: 0,
                    paragraphSpacingBefore: Number.NaN,
                    paragraphSpacingAfter: -1,
                    charSpacing: "wide",
                    list: { type: "bullet", characterCode: "1" },
                    fit: "stretch",
                    wrap: "yes",
                  },
                }
              : element,
          ),
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
    for (const path of [
      ".drawing.children.0.content.runs.0.style.textAlign",
      ".drawing.children.0.content.runs.0.style.tabStops.0.positionIn",
      ".drawing.children.0.content.runs.0.style.tabStops.0.alignment",
      ".drawing.children.0.content.runs.0.style.list.style",
      ".drawing.children.0.content.runs.0.style.list.startAt",
      ".drawing.children.0.content.runs.0.style.fontWeight",
      ".drawing.children.0.style.fontSizePt",
      ".drawing.children.0.style.fontWeight",
      ".drawing.children.0.style.underlineColor",
      ".drawing.children.0.style.underlineStyle",
      ".drawing.children.0.style.textDirection",
      ".drawing.children.0.style.verticalAlign",
      ".drawing.children.0.style.paddingPt.2",
      ".drawing.children.0.style.lineSpacing",
      ".drawing.children.0.style.lineSpacingMultiple",
      ".drawing.children.0.style.paragraphSpacingBefore",
      ".drawing.children.0.style.paragraphSpacingAfter",
      ".drawing.children.0.style.charSpacing",
      ".drawing.children.0.style.list.characterCode",
      ".drawing.children.0.style.fit",
      ".drawing.children.0.style.wrap",
    ]) {
      expect(project.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(path) }),
          ]),
        }),
      );
    }
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates drawing paint and effect payloads before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken drawing paint" }, () => (
      <>
        <div style={{ position: "absolute", left: 0.5, top: 0.5, width: 4, height: 2 }}>
          <p style={{ position: "absolute", left: 0.25, top: 0.25, width: 2, height: 0.5 }}>
            Paint
          </p>
        </div>
        <img
          data={H.SAMPLE_SVG_DATA_URI}
          style={{ position: "absolute", left: 5, top: 0.5, width: 1, height: 1 }}
        />
        <shape
          shape="rect"
          style={{ position: "absolute", left: 6.5, top: 0.5, width: 1, height: 1 }}
        />
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
                fill: { kind: "solid", color: "#111111", transparency: -1 },
                backgroundLayers: [
                  {
                    kind: "background-image",
                    frame: { xEmu: 0, yEmu: 0, widthEmu: 0, heightEmu: 914400 },
                    sourceFrame: { xEmu: 0, yEmu: 0, widthEmu: Number.NaN, heightEmu: 914400 },
                    source: { kind: "url", url: "" },
                    fit: "tile",
                    repeat: "sometimes",
                    size: { widthEmu: -1 },
                    objectPosition: { x: Number.NaN, y: 0.5 },
                    transparency: 101,
                  },
                  { kind: "linear-gradient", angle: Number.NaN, stops: [] },
                ],
                stroke: {
                  color: "not-a-color",
                  widthPt: Number.NaN,
                  style: "double",
                  dashType: "dots",
                  lineCap: "flat",
                  lineJoin: "curve",
                  transparency: 101,
                },
                edgeStrokes: { left: { color: "not-a-color", widthPt: Number.NaN } },
                outline: { color: "not-a-color", widthPt: Number.NaN },
                generatedStrokes: [
                  {
                    kind: "stroke",
                    role: "border",
                    id: "",
                    serialized: { shapeObjectId: "9007199254740991" },
                    frame: { xEmu: 0, yEmu: 0, widthEmu: Number.NaN, heightEmu: 0 },
                    stroke: { color: "not-a-color", widthPt: Number.NaN },
                    shape: "curve",
                    paintOrder: {
                      siblingOrder: -1,
                      zIndex: Number.NaN,
                      generatedLayerRole: "outline",
                    },
                  },
                ],
                shadow: {
                  type: "drop",
                  color: "not-a-color",
                  opacity: 2,
                  blurPt: Number.NaN,
                  offsetPt: Number.NaN,
                  angle: Number.NaN,
                },
                radiusEmu: -1,
              };
            }
            if (element.kind === "image") {
              return { ...element, shadow: { type: "drop", color: "not-a-color", opacity: -0.1 } };
            }
            if (element.kind === "shape") {
              return {
                ...element,
                fill: {
                  kind: "radial-gradient",
                  shape: "square",
                  center: { x: Number.NaN, y: 0.5 },
                  radius: { x: -1, y: Number.NaN },
                  stops: [{ color: "not-a-color", position: Number.NaN, transparency: -1 }],
                },
                stroke: { color: "not-a-color", widthPt: Number.NaN },
                radiusEmu: Number.NaN,
              };
            }
            return element;
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
    for (const path of [
      ".drawing.children.0.fill.color",
      ".drawing.children.0.fill.transparency",
      ".drawing.children.0.backgroundLayers.0.frame.widthEmu",
      ".drawing.children.0.backgroundLayers.0.sourceFrame.widthEmu",
      ".drawing.children.0.backgroundLayers.0.source.url",
      ".drawing.children.0.backgroundLayers.0.fit",
      ".drawing.children.0.backgroundLayers.0.repeat",
      ".drawing.children.0.backgroundLayers.0.size.widthEmu",
      ".drawing.children.0.backgroundLayers.0.objectPosition.x",
      ".drawing.children.0.backgroundLayers.0.transparency",
      ".drawing.children.0.backgroundLayers.1.frame",
      ".drawing.children.0.backgroundLayers.1.angle",
      ".drawing.children.0.backgroundLayers.1.stops",
      ".drawing.children.0.stroke.color",
      ".drawing.children.0.stroke.widthPt",
      ".drawing.children.0.stroke.style",
      ".drawing.children.0.stroke.dashType",
      ".drawing.children.0.stroke.lineCap",
      ".drawing.children.0.stroke.lineJoin",
      ".drawing.children.0.stroke.transparency",
      ".drawing.children.0.edgeStrokes.left.color",
      ".drawing.children.0.edgeStrokes.left.widthPt",
      ".drawing.children.0.outline.color",
      ".drawing.children.0.outline.widthPt",
      ".drawing.children.0.generatedStrokes.0.id",
      ".drawing.children.0.generatedStrokes.0.serialized.shapeObjectId",
      ".drawing.children.0.generatedStrokes.0.frame.widthEmu",
      ".drawing.children.0.generatedStrokes.0.stroke.color",
      ".drawing.children.0.generatedStrokes.0.stroke.widthPt",
      ".drawing.children.0.generatedStrokes.0.shape",
      ".drawing.children.0.generatedStrokes.0.paintOrder.siblingOrder",
      ".drawing.children.0.generatedStrokes.0.paintOrder.zIndex",
      ".drawing.children.0.generatedStrokes.0.paintOrder.generatedLayerRole",
      ".drawing.children.0.shadow.type",
      ".drawing.children.0.shadow.color",
      ".drawing.children.0.shadow.opacity",
      ".drawing.children.0.shadow.blurPt",
      ".drawing.children.0.shadow.offsetPt",
      ".drawing.children.0.shadow.angle",
      ".drawing.children.0.radiusEmu",
      ".drawing.children.1.shadow.type",
      ".drawing.children.1.shadow.color",
      ".drawing.children.1.shadow.opacity",
      ".drawing.children.2.fill.shape",
      ".drawing.children.2.fill.center.x",
      ".drawing.children.2.fill.radius.x",
      ".drawing.children.2.fill.radius.y",
      ".drawing.children.2.fill.stops.0.color",
      ".drawing.children.2.fill.stops.0.position",
      ".drawing.children.2.fill.stops.0.transparency",
      ".drawing.children.2.stroke.color",
      ".drawing.children.2.stroke.widthPt",
      ".drawing.children.2.radiusEmu",
    ]) {
      expect(project.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(path) }),
          ]),
        }),
      );
    }
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

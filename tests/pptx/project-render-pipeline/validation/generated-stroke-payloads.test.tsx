import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation generated stroke payloads", () => {
  test("project validates generated stroke paint order against owner paint order", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Generated stroke order" }, () => (
      <div
        style={{
          position: "absolute",
          left: 0.5,
          top: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          zIndex: 4,
        }}
      />
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
                index === 0
                  ? {
                      ...layer,
                      paintOrder: {
                        ...layer.paintOrder,
                        siblingOrder: layer.paintOrder.siblingOrder + 1,
                        zIndex: (layer.paintOrder.zIndex ?? 0) + 1,
                      },
                    }
                  : layer,
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
    for (const path of [
      ".drawing.children.0.generatedStrokes.0.paintOrder.siblingOrder",
      ".drawing.children.0.generatedStrokes.0.paintOrder.zIndex",
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

  test("project validates required generated stroke layers before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing generated strokes" }, () => (
      <div
        style={{
          position: "absolute",
          left: 0.5,
          top: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          outline: "1pt solid #00aa66",
        }}
      />
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
            element.kind === "group" ? { ...element, generatedStrokes: undefined } : element,
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
    for (const message of [
      "missing generated border stroke layer for top edge",
      "missing generated outline stroke layer",
    ]) {
      expect(project.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.0.generatedStrokes"),
              message,
            }),
          ]),
        }),
      );
    }
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates partially missing generated stroke layers before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Partially missing generated strokes" }, () => (
      <div
        style={{
          position: "absolute",
          left: 0.5,
          top: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          outline: "1pt solid #00aa66",
        }}
      />
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
            element.kind === "group"
              ? {
                  ...element,
                  generatedStrokes: element.generatedStrokes?.filter(
                    (layer) => layer.role !== "outline",
                  ),
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
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.generatedStrokes"),
            message: "missing generated outline stroke layer",
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).not.toContainEqual(
      expect.objectContaining({
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.generatedStrokes"),
            message: "missing generated border stroke layer for top edge",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates generated stroke layers against owner stroke semantics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Stale generated stroke payloads" }, () => (
      <div
        style={{
          position: "absolute",
          left: 0.5,
          top: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          outline: "1pt solid #00aa66",
        }}
      />
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
            element.kind === "group"
              ? {
                  ...element,
                  generatedStrokes: element.generatedStrokes?.map((layer) => {
                    if (layer.role === "border" && layer.edge === "top") {
                      return { ...layer, shape: "rect", frame: { ...layer.frame, heightEmu: 1 } };
                    }
                    if (layer.role === "outline") {
                      return {
                        ...layer,
                        frame: { ...layer.frame, xEmu: layer.frame.xEmu + 1 },
                        stroke: { ...layer.stroke, color: "000000" },
                      };
                    }
                    return layer;
                  }),
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
    for (const [path, message] of [
      [
        ".drawing.children.0.generatedStrokes.0.shape",
        "generated border stroke shape must be line",
      ],
      [
        ".drawing.children.0.generatedStrokes.0.frame",
        "generated border stroke frame must match owner top edge frame",
      ],
      [
        ".drawing.children.0.generatedStrokes.1.frame",
        "generated outline stroke frame must match owner frame",
      ],
      [
        ".drawing.children.0.generatedStrokes.1.stroke",
        "generated outline stroke must match owner outline stroke",
      ],
    ] as const) {
      expect(project.diagnostics.items).toContainEqual(
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: expect.stringContaining(path), message }),
          ]),
        }),
      );
    }
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates generated stroke element ids against owner identity", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Stale generated stroke identity" }, () => (
      <div
        style={{
          position: "absolute",
          left: 0.5,
          top: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          outline: "1pt solid #00aa66",
        }}
      />
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
            element.kind === "group"
              ? {
                  ...element,
                  generatedStrokes: element.generatedStrokes?.map((layer) =>
                    layer.role === "outline"
                      ? { ...layer, id: `${element.id}:generated:outline:stale` }
                      : layer,
                  ),
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
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.generatedStrokes.1.id"),
            message: "generated stroke id must be derived from owner element id and layer role",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates generated stroke shape object ids against owner identity", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Stale generated shape id" }, () => (
      <div
        style={{
          position: "absolute",
          left: 0.5,
          top: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
          outline: "1pt solid #00aa66",
        }}
      />
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
            element.kind === "group"
              ? {
                  ...element,
                  generatedStrokes: element.generatedStrokes?.map((layer) =>
                    layer.role === "outline"
                      ? { ...layer, serialized: { ...layer.serialized, shapeObjectId: "99999" } }
                      : layer,
                  ),
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
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(
              ".drawing.children.0.generatedStrokes.1.serialized.shapeObjectId",
            ),
            message:
              "generated stroke shape object id must be derived from owner shape object id and layer index",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates generated stroke shape object ids stay derivable in writer-safe range", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Overflow generated shape id" }, () => (
      <div
        style={{
          position: "absolute",
          left: 0.5,
          top: 0.5,
          width: 4,
          height: 2,
          borderTop: "2pt solid #ff0000",
        }}
      />
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
            element.kind === "group"
              ? {
                  ...element,
                  serialized: { ...element.serialized, shapeObjectId: "90071992547410" },
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
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_DRAWING_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(
              ".drawing.children.0.generatedStrokes.0.serialized.shapeObjectId",
            ),
            message:
              "generated stroke shape object id must be derived from owner shape object id within the writer-safe range",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates serialized shape object id uniqueness across generated strokes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate generated shape id" }, () => (
      <div
        style={{
          position: "absolute",
          left: 0.5,
          top: 0.5,
          width: 4,
          height: 2,
          outline: "2pt solid #00aa66",
        }}
      />
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
                index === 0
                  ? {
                      ...layer,
                      serialized: {
                        ...layer.serialized,
                        shapeObjectId: element.serialized.shapeObjectId,
                      },
                    }
                  : layer,
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
        title: "pptx drawing serialized identity is duplicated",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(
              ".drawing.children.0.generatedStrokes.0.serialized.shapeObjectId",
            ),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".drawing.children.0.serialized.shapeObjectId"),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH } from "../../src/index.ts";
import type {
  ProjectInspectionBackgroundLayerSummary,
  PptxBackgroundLayer,
  PptxPaintOrderInput,
} from "../../src/inspect.ts";
import { SAMPLE_SVG_DATA_URI, WIDE_SVG_DATA_URI } from "../helpers.ts";

type BackgroundLayerExpectation = PptxBackgroundLayer | ProjectInspectionBackgroundLayerSummary;
type BackgroundLayerExpectationWithPaintOrder = BackgroundLayerExpectation & {
  readonly paintOrder?: PptxPaintOrderInput;
};

function stripBackgroundLayerPaintOrder(
  layers: readonly BackgroundLayerExpectationWithPaintOrder[] | undefined,
): readonly Omit<BackgroundLayerExpectation, "paintOrder">[] | undefined {
  return layers?.map((layer) => {
    const { paintOrder: _paintOrder, ...withoutPaintOrder } = layer;
    return withoutPaintOrder;
  });
}

describe("background layers", () => {
  test("render supports background shorthand with image layers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Background shorthand image layers",
        style: {
          background: `url("${WIDE_SVG_DATA_URI}") no-repeat right bottom / contain, linear-gradient(180deg, #111111 0%, #333333 100%)`,
        },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 2,
              height: 1,
              background: `url("${SAMPLE_SVG_DATA_URI}") repeat-x left top / contain`,
            }}
          />
        </>
      ),
    );

    const project = await deck.project();
    const ir = project.projection!;
    const [viewNode] = ir.slides[0].payload.drawing.children;

    expect(ir.slides[0].payload.background).toBeUndefined();
    expect(stripBackgroundLayerPaintOrder(ir.slides[0].payload.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        frame: { xEmu: 0, yEmu: 0, widthEmu: 10 * EMU_PER_INCH, heightEmu: 5.625 * EMU_PER_INCH },
        stops: [
          { color: "111111", transparency: undefined, position: 0 },
          { color: "333333", transparency: undefined, position: 1 },
        ],
        serialized: { shapeObjectId: "500151" },
      },
      {
        kind: "background-image",
        frame: { xEmu: 0, yEmu: 0, widthEmu: 10 * EMU_PER_INCH, heightEmu: 5.625 * EMU_PER_INCH },
        sourceFrame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * EMU_PER_INCH,
          heightEmu: 5.625 * EMU_PER_INCH,
        },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "contain",
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 1 },
        serialized: { shapeObjectId: "500251" },
      },
    ]);

    expect(viewNode?.kind).toBe("group");
    if (viewNode?.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(viewNode.fill).toBeUndefined();
    expect(stripBackgroundLayerPaintOrder(viewNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
        source: { kind: "data", data: SAMPLE_SVG_DATA_URI },
        fit: "contain",
        repeat: "repeat-x",
        objectPosition: { x: 0, y: 0 },
        serialized: { shapeObjectId: "151" },
      },
    ]);

    const slideSummary = project.summary?.slides[0];
    expect(stripBackgroundLayerPaintOrder(slideSummary?.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        frame: { xEmu: 0, yEmu: 0, widthEmu: 10 * EMU_PER_INCH, heightEmu: 5.625 * EMU_PER_INCH },
        stops: [
          { color: "111111", transparency: undefined, position: 0 },
          { color: "333333", transparency: undefined, position: 1 },
        ],
      },
      {
        kind: "background-image",
        frame: { xEmu: 0, yEmu: 0, widthEmu: 10 * EMU_PER_INCH, heightEmu: 5.625 * EMU_PER_INCH },
        sourceFrame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * EMU_PER_INCH,
          heightEmu: 5.625 * EMU_PER_INCH,
        },
        sourceKind: "data",
        fit: "contain",
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 1 },
      },
    ]);
    expect(stripBackgroundLayerPaintOrder(slideSummary?.elements[0]?.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
        sourceKind: "data",
        fit: "contain",
        repeat: "repeat-x",
        objectPosition: { x: 0, y: 0 },
      },
    ]);
    expect(
      stripBackgroundLayerPaintOrder(slideSummary?.elements[0]?.resolvedValues?.backgroundLayers),
    ).toEqual(slideSummary?.elements[0]?.backgroundLayers);
  });

  test("render resolves background image layer size and position", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Background image layers",
        style: {
          background: `url("${WIDE_SVG_DATA_URI}"), linear-gradient(180deg, #111111 0%, #333333 100%)`,
          backgroundSize: "contain, 100% 100%",
          backgroundPosition: "right bottom, center",
        },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 2,
              height: 2,
              background: `url("${WIDE_SVG_DATA_URI}")`,
              backgroundSize: "cover",
              backgroundPosition: "right center",
            }}
          />
        </>
      ),
    );

    const ir = (await deck.project()).projection!;
    const [viewNode] = ir.slides[0].payload.drawing.children;

    expect(ir.slides[0].payload.background).toBeUndefined();
    expect(stripBackgroundLayerPaintOrder(ir.slides[0].payload.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        frame: { xEmu: 0, yEmu: 0, widthEmu: 10 * EMU_PER_INCH, heightEmu: 5.625 * EMU_PER_INCH },
        stops: [
          { color: "111111", transparency: undefined, position: 0 },
          { color: "333333", transparency: undefined, position: 1 },
        ],
        serialized: { shapeObjectId: "500151" },
      },
      {
        kind: "background-image",
        frame: { xEmu: 0, yEmu: 0, widthEmu: 10 * EMU_PER_INCH, heightEmu: 5.625 * EMU_PER_INCH },
        sourceFrame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * EMU_PER_INCH,
          heightEmu: 5.625 * EMU_PER_INCH,
        },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "contain",
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 1 },
        serialized: { shapeObjectId: "500251" },
      },
    ]);

    expect(viewNode?.kind).toBe("group");
    if (viewNode?.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(viewNode.fill).toBeUndefined();
    expect(stripBackgroundLayerPaintOrder(viewNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "cover",
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 0.5 },
        serialized: { shapeObjectId: "151" },
      },
    ]);
  });

  test("render resolves backgroundRepeat on image layers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background repeat" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-y",
          }}
        />
        <div
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 1,
            background: `url("${SAMPLE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-x",
          }}
        />
      </>
    ));

    const [repeatYNode, repeatXNode] = (await deck.project()).projection!.slides[0].payload.drawing
      .children;

    expect(repeatYNode?.kind).toBe("group");
    if (repeatYNode?.kind !== "group") {
      throw new Error("Expected repeat-y group node.");
    }
    expect(stripBackgroundLayerPaintOrder(repeatYNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "contain",
        repeat: "repeat-y",
        objectPosition: { x: 0, y: 0 },
        serialized: { shapeObjectId: "151" },
      },
    ]);

    expect(repeatXNode?.kind).toBe("group");
    if (repeatXNode?.kind !== "group") {
      throw new Error("Expected repeat-x group node.");
    }
    expect(stripBackgroundLayerPaintOrder(repeatXNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 4 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 4 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
        source: { kind: "data", data: SAMPLE_SVG_DATA_URI },
        fit: "contain",
        repeat: "repeat-x",
        objectPosition: { x: 0, y: 0 },
        serialized: { shapeObjectId: "251" },
      },
    ]);
  });

  test("render resolves explicit backgroundSize values on image layers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Explicit background size" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "50% auto",
            backgroundPosition: "right bottom",
          }}
        />
        <div
          style={{
            x: 1,
            y: 3.5,
            width: 4,
            height: 1.5,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto 50%",
            backgroundPosition: "left top",
          }}
        />
      </>
    ));

    const [firstNode, secondNode] = (await deck.project()).projection!.slides[0].payload.drawing
      .children;

    expect(firstNode?.kind).toBe("group");
    if (firstNode?.kind !== "group") {
      throw new Error("Expected first group node.");
    }
    expect(stripBackgroundLayerPaintOrder(firstNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "size",
        size: { widthEmu: 2 * EMU_PER_INCH },
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 1 },
        serialized: { shapeObjectId: "151" },
      },
    ]);

    expect(secondNode?.kind).toBe("group");
    if (secondNode?.kind !== "group") {
      throw new Error("Expected second group node.");
    }
    expect(stripBackgroundLayerPaintOrder(secondNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 3.5 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 1.5 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 3.5 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 1.5 * EMU_PER_INCH,
        },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "size",
        size: { heightEmu: 0.75 * EMU_PER_INCH },
        repeat: "no-repeat",
        objectPosition: { x: 0, y: 0 },
        serialized: { shapeObjectId: "251" },
      },
    ]);
  });

  test("render resolves intrinsic auto backgroundSize values on image layers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Auto background size" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto auto",
            backgroundPosition: "right bottom",
          }}
        />
        <div
          style={{
            x: 1,
            y: 3.5,
            width: 4,
            height: 1.5,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto",
            backgroundPosition: "left top",
          }}
        />
      </>
    ));

    const [firstNode, secondNode] = (await deck.project()).projection!.slides[0].payload.drawing
      .children;

    expect(firstNode?.kind).toBe("group");
    if (firstNode?.kind !== "group") {
      throw new Error("Expected first group node.");
    }
    expect(stripBackgroundLayerPaintOrder(firstNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "size",
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 1 },
        serialized: { shapeObjectId: "151" },
      },
    ]);

    expect(secondNode?.kind).toBe("group");
    if (secondNode?.kind !== "group") {
      throw new Error("Expected second group node.");
    }
    expect(stripBackgroundLayerPaintOrder(secondNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 3.5 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 1.5 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 3.5 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 1.5 * EMU_PER_INCH,
        },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "size",
        repeat: "no-repeat",
        objectPosition: { x: 0, y: 0 },
        serialized: { shapeObjectId: "251" },
      },
    ]);
  });

  test("render clips background image layers to the content box", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background clip" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundClip: "content-box",
          }}
        />
      </>
    ));

    const [imageNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(imageNode?.kind).toBe("group");
    if (imageNode?.kind !== "group") {
      throw new Error("Expected image group node.");
    }
    expect(imageNode.fill).toBeUndefined();
    expect(stripBackgroundLayerPaintOrder(imageNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: { xEmu: 1374775, yEmu: 1374775, widthEmu: 2736850, heightEmu: 908050 },
        sourceFrame: { xEmu: 914400, yEmu: 914400, widthEmu: 3657600, heightEmu: 1828800 },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "stretch",
        objectPosition: { x: 0.5, y: 0.5 },
        repeat: "no-repeat",
        serialized: { shapeObjectId: "151" },
      },
    ]);
  });

  test("render resolves background image origin separately from clip", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background origin" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
          }}
        />
      </>
    ));

    const [imageNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(imageNode?.kind).toBe("group");
    if (imageNode?.kind !== "group") {
      throw new Error("Expected image group node.");
    }
    expect(imageNode.fill).toBeUndefined();
    expect(stripBackgroundLayerPaintOrder(imageNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: { xEmu: 1374775, yEmu: 1374775, widthEmu: 2736850, heightEmu: 908050 },
        sourceFrame: { xEmu: 917575, yEmu: 917575, widthEmu: 3651250, heightEmu: 1822450 },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "stretch",
        objectPosition: { x: 0.5, y: 0.5 },
        repeat: "no-repeat",
        serialized: { shapeObjectId: "151" },
      },
    ]);
  });

  test("render resolves visual-box shorthand values on image background layers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background shorthand boxes" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: `url("${WIDE_SVG_DATA_URI}") no-repeat padding-box content-box / 100% 100%`,
          }}
        />
      </>
    ));

    const [imageNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(imageNode?.kind).toBe("group");
    if (imageNode?.kind !== "group") {
      throw new Error("Expected image group node.");
    }
    expect(imageNode.fill).toBeUndefined();
    expect(stripBackgroundLayerPaintOrder(imageNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: { xEmu: 1374775, yEmu: 1374775, widthEmu: 2736850, heightEmu: 908050 },
        sourceFrame: { xEmu: 917575, yEmu: 917575, widthEmu: 3651250, heightEmu: 1822450 },
        source: { kind: "data", data: WIDE_SVG_DATA_URI },
        fit: "stretch",
        objectPosition: { x: 0.5, y: 0.5 },
        repeat: "no-repeat",
        serialized: { shapeObjectId: "151" },
      },
    ]);
  });

  test("render clips gradient background layers to the content box", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background clip gradient" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: "linear-gradient(180deg, #111111 0%, #333333 100%)",
            backgroundClip: "content-box",
          }}
        />
      </>
    ));

    const [gradientNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(gradientNode?.kind).toBe("group");
    if (gradientNode?.kind !== "group") {
      throw new Error("Expected gradient group node.");
    }
    expect(gradientNode.fill).toBeUndefined();
    expect(stripBackgroundLayerPaintOrder(gradientNode.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        stops: [
          { color: "111111", transparency: undefined, position: 0 },
          { color: "333333", transparency: undefined, position: 1 },
        ],
        frame: { xEmu: 1374775, yEmu: 1374775, widthEmu: 2736850, heightEmu: 908050 },
        serialized: { shapeObjectId: "151" },
      },
    ]);
  });

  test("render resolves gradient background origin separately from clip", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background origin gradient" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: "linear-gradient(180deg, #111111 0in, #333333 1in)",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
          }}
        />
      </>
    ));

    const [gradientNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(gradientNode?.kind).toBe("group");
    if (gradientNode?.kind !== "group") {
      throw new Error("Expected gradient group node.");
    }
    expect(gradientNode.fill).toBeUndefined();
    expect(gradientNode.backgroundLayers).toHaveLength(1);
    const [backgroundLayer] = gradientNode.backgroundLayers ?? [];
    expect(backgroundLayer && "kind" in backgroundLayer ? backgroundLayer.kind : undefined).toBe(
      "linear-gradient",
    );
    if (
      !backgroundLayer ||
      !("kind" in backgroundLayer) ||
      backgroundLayer.kind !== "linear-gradient"
    ) {
      throw new Error("Expected linear-gradient background layer.");
    }
    expect(backgroundLayer.frame).toEqual({
      xEmu: 1374775,
      yEmu: 1374775,
      widthEmu: 2736850,
      heightEmu: 908050,
    });
    expect(backgroundLayer.stops[0]).toEqual({
      color: "111111",
      transparency: undefined,
      position: 0,
    });
    expect(backgroundLayer.stops[1]?.color).toBe("333333");
    expect(backgroundLayer.stops[1]?.position).toBeCloseTo(0.501742, 6);
  });

  test("render resolves visual-box shorthand values on gradient background layers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background shorthand gradient boxes" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: "linear-gradient(180deg, #111111 0in, #333333 1in) padding-box content-box",
          }}
        />
      </>
    ));

    const [gradientNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(gradientNode?.kind).toBe("group");
    if (gradientNode?.kind !== "group") {
      throw new Error("Expected gradient group node.");
    }
    expect(gradientNode.fill).toBeUndefined();
    expect(gradientNode.backgroundLayers).toHaveLength(1);
    const [backgroundLayer] = gradientNode.backgroundLayers ?? [];
    expect(backgroundLayer && "kind" in backgroundLayer ? backgroundLayer.kind : undefined).toBe(
      "linear-gradient",
    );
    if (
      !backgroundLayer ||
      !("kind" in backgroundLayer) ||
      backgroundLayer.kind !== "linear-gradient"
    ) {
      throw new Error("Expected linear-gradient background layer.");
    }
    expect(backgroundLayer.frame).toEqual({
      xEmu: 1374775,
      yEmu: 1374775,
      widthEmu: 2736850,
      heightEmu: 908050,
    });
    expect(backgroundLayer.stops[1]?.position).toBeCloseTo(0.501742, 6);
  });

  test("render preserves gradient background layer color fallback order", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background shorthand gradient fallback" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background:
              "linear-gradient(180deg, #111111 0in, #333333 1in) #AAAAAA padding-box content-box",
          }}
        />
      </>
    ));

    const [gradientNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(gradientNode?.kind).toBe("group");
    if (gradientNode?.kind !== "group") {
      throw new Error("Expected gradient group node.");
    }
    expect(gradientNode.fill).toBeUndefined();
    expect(stripBackgroundLayerPaintOrder(gradientNode.backgroundLayers)).toEqual([
      {
        kind: "solid",
        color: "AAAAAA",
        transparency: undefined,
        frame: { xEmu: 1374775, yEmu: 1374775, widthEmu: 2736850, heightEmu: 908050 },
        serialized: { shapeObjectId: "151" },
      },
      {
        kind: "linear-gradient",
        angle: 180,
        stops: [
          { color: "111111", transparency: undefined, position: 0 },
          { color: "333333", transparency: undefined, position: 0.5017421602787455 },
        ],
        frame: { xEmu: 1374775, yEmu: 1374775, widthEmu: 2736850, heightEmu: 908050 },
        serialized: { shapeObjectId: "251" },
      },
    ]);
  });

  test("render resolves per-layer backgroundOrigin and backgroundClip lists", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background layer boxes" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background:
              "linear-gradient(180deg, #111111 0in, #333333 1in), linear-gradient(180deg, #AAAAAA 0in, #CCCCCC 1in)",
            backgroundOrigin: "padding-box, border-box",
            backgroundClip: "content-box, padding-box",
          }}
        />
      </>
    ));

    const [viewNode] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(viewNode?.kind).toBe("group");
    if (viewNode?.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(viewNode.fill).toBeUndefined();
    expect(viewNode.backgroundLayers).toHaveLength(2);

    const [bottomLayer, topLayer] = viewNode.backgroundLayers ?? [];
    expect(bottomLayer && "kind" in bottomLayer ? bottomLayer.kind : undefined).toBe(
      "linear-gradient",
    );
    expect(topLayer && "kind" in topLayer ? topLayer.kind : undefined).toBe("linear-gradient");

    if (
      !bottomLayer ||
      !("kind" in bottomLayer) ||
      bottomLayer.kind !== "linear-gradient" ||
      !topLayer ||
      !("kind" in topLayer) ||
      topLayer.kind !== "linear-gradient"
    ) {
      throw new Error("Expected linear-gradient background layers.");
    }

    expect(bottomLayer.frame).toEqual({
      xEmu: 917575,
      yEmu: 917575,
      widthEmu: 3651250,
      heightEmu: 1822450,
    });
    expect(bottomLayer.stops[0]).toEqual({ color: "AAAAAA", transparency: undefined, position: 0 });
    expect(bottomLayer.stops[1]?.color).toBe("CCCCCC");
    expect(bottomLayer.stops[1]?.position).toBeCloseTo(0.5, 6);

    expect(topLayer.frame).toEqual({
      xEmu: 1374775,
      yEmu: 1374775,
      widthEmu: 2736850,
      heightEmu: 908050,
    });
    expect(topLayer.stops[0]).toEqual({ color: "111111", transparency: undefined, position: 0 });
    expect(topLayer.stops[1]?.color).toBe("333333");
    expect(topLayer.stops[1]?.position).toBeCloseTo(0.501742, 6);
  });

  test("render preserves multiple background layer ordering across node kinds", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Multiple backgrounds",
        style: {
          background:
            "linear-gradient(90deg, #FF0000 0%, #00FF00 100%), linear-gradient(180deg, #0000FF 0%, #FFFFFF 100%), #111111",
        },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 2,
              height: 1,
              background:
                "linear-gradient(45deg, #123456 0%, #654321 100%), linear-gradient(180deg, #ABCDEF 0%, #FEDCBA 100%)",
            }}
          />
          <p
            style={{
              x: 1,
              y: 2.5,
              width: 3,
              height: 0.75,
              fontSize: 18,
              background:
                "linear-gradient(180deg, #FFEEDD 0%, #221100 100%), linear-gradient(90deg, #00AAFF 0%, #AA00FF 100%)",
            }}
          >
            Layered text
          </p>
          <shape
            shape="rect"
            style={{
              x: 5,
              y: 1,
              width: 2,
              height: 1.5,
              background: "linear-gradient(30deg, #EF4444 0%, #F59E0B 100%), #222222",
            }}
          />
        </>
      ),
    );

    const ir = (await deck.project()).projection!;
    const [viewNode, textNode, shapeNode] = ir.slides[0].payload.drawing.children;

    expect(ir.slides[0].payload.background).toEqual({
      kind: "linear-gradient",
      angle: 90,
      stops: [
        { color: "FF0000", transparency: undefined, position: 0 },
        { color: "00FF00", transparency: undefined, position: 1 },
      ],
    });
    expect(stripBackgroundLayerPaintOrder(ir.slides[0].payload.backgroundLayers)).toEqual([
      {
        kind: "solid",
        color: "111111",
        transparency: undefined,
        frame: { xEmu: 0, yEmu: 0, widthEmu: 10 * EMU_PER_INCH, heightEmu: 5.625 * EMU_PER_INCH },
        serialized: { shapeObjectId: "500151" },
      },
      {
        kind: "linear-gradient",
        angle: 180,
        frame: { xEmu: 0, yEmu: 0, widthEmu: 10 * EMU_PER_INCH, heightEmu: 5.625 * EMU_PER_INCH },
        stops: [
          { color: "0000FF", transparency: undefined, position: 0 },
          { color: "FFFFFF", transparency: undefined, position: 1 },
        ],
        serialized: { shapeObjectId: "500251" },
      },
    ]);

    expect(viewNode?.kind).toBe("group");
    if (viewNode?.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(viewNode.fill).toEqual({
      kind: "linear-gradient",
      angle: 45,
      stops: [
        { color: "123456", transparency: undefined, position: 0 },
        { color: "654321", transparency: undefined, position: 1 },
      ],
    });
    expect(stripBackgroundLayerPaintOrder(viewNode.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
        stops: [
          { color: "ABCDEF", transparency: undefined, position: 0 },
          { color: "FEDCBA", transparency: undefined, position: 1 },
        ],
        serialized: { shapeObjectId: "151" },
      },
    ]);

    expect(textNode?.kind).toBe("text");
    if (textNode?.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(textNode.fill).toEqual({
      kind: "linear-gradient",
      angle: 180,
      stops: [
        { color: "FFEEDD", transparency: undefined, position: 0 },
        { color: "221100", transparency: undefined, position: 1 },
      ],
    });
    expect(stripBackgroundLayerPaintOrder(textNode.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 90,
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 2.5 * EMU_PER_INCH,
          widthEmu: 3 * EMU_PER_INCH,
          heightEmu: 0.75 * EMU_PER_INCH,
        },
        stops: [
          { color: "00AAFF", transparency: undefined, position: 0 },
          { color: "AA00FF", transparency: undefined, position: 1 },
        ],
        serialized: { shapeObjectId: "251" },
      },
    ]);

    expect(shapeNode?.kind).toBe("shape");
    if (shapeNode?.kind !== "shape") {
      throw new Error("Expected shape node.");
    }
    expect(shapeNode.fill).toEqual({
      kind: "linear-gradient",
      angle: 30,
      stops: [
        { color: "EF4444", transparency: undefined, position: 0 },
        { color: "F59E0B", transparency: undefined, position: 1 },
      ],
    });
    expect(stripBackgroundLayerPaintOrder(shapeNode.backgroundLayers)).toEqual([
      {
        kind: "solid",
        color: "222222",
        transparency: undefined,
        frame: {
          xEmu: 5 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1.5 * EMU_PER_INCH,
        },
        serialized: { shapeObjectId: "351" },
      },
    ]);
  });
});

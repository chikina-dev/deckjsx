import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("background image layers", () => {
  test("render supports background shorthand with image layers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Background shorthand image layers",
        style: {
          background: `url("${H.WIDE_SVG_DATA_URI}") no-repeat right bottom / contain, linear-gradient(180deg, #111111 0%, #333333 100%)`,
        },
      },
      () => (
        <>
          <div
            style={{
              position: "absolute",
              left: 1,
              top: 1,
              width: 2,
              height: 1,
              background: `url("${H.SAMPLE_SVG_DATA_URI}") repeat-x left top / contain`,
            }}
          />
        </>
      ),
    );

    const project = await deck.project();
    const ir = project.projection!;
    const [viewNode] = ir.slides[0].payload.drawing.children;

    expect(ir.slides[0].payload.background).toBeUndefined();
    expect(H.stripBackgroundLayerPaintOrder(ir.slides[0].payload.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        frame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 5.625 * H.EMU_PER_INCH,
        },
        stops: [
          { color: "111111", transparency: undefined, position: 0 },
          { color: "333333", transparency: undefined, position: 1 },
        ],
        serialized: { shapeObjectId: "500151" },
      },
      {
        kind: "background-image",
        frame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 5.625 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 5.625 * H.EMU_PER_INCH,
        },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
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
    expect(H.stripBackgroundLayerPaintOrder(viewNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1 * H.EMU_PER_INCH,
        },
        source: { kind: "data", data: H.SAMPLE_SVG_DATA_URI },
        fit: "contain",
        repeat: "repeat-x",
        objectPosition: { x: 0, y: 0 },
        serialized: { shapeObjectId: "151" },
      },
    ]);

    const slideSummary = project.summary?.slides[0];
    expect(H.stripBackgroundLayerPaintOrder(slideSummary?.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        frame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 5.625 * H.EMU_PER_INCH,
        },
        stops: [
          { color: "111111", transparency: undefined, position: 0 },
          { color: "333333", transparency: undefined, position: 1 },
        ],
      },
      {
        kind: "background-image",
        frame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 5.625 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 5.625 * H.EMU_PER_INCH,
        },
        sourceKind: "data",
        fit: "contain",
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 1 },
      },
    ]);
    expect(H.stripBackgroundLayerPaintOrder(slideSummary?.elements[0]?.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1 * H.EMU_PER_INCH,
        },
        sourceKind: "data",
        fit: "contain",
        repeat: "repeat-x",
        objectPosition: { x: 0, y: 0 },
      },
    ]);
    expect(
      H.stripBackgroundLayerPaintOrder(slideSummary?.elements[0]?.resolvedValues?.backgroundLayers),
    ).toEqual(slideSummary?.elements[0]?.backgroundLayers);
  });

  test("render resolves background image layer size and position", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Background image layers",
        style: {
          background: `url("${H.WIDE_SVG_DATA_URI}"), linear-gradient(180deg, #111111 0%, #333333 100%)`,
          backgroundSize: "contain, 100% 100%",
          backgroundPosition: "right bottom, center",
        },
      },
      () => (
        <>
          <div
            style={{
              position: "absolute",
              left: 1,
              top: 1,
              width: 2,
              height: 2,
              background: `url("${H.WIDE_SVG_DATA_URI}")`,
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
    expect(H.stripBackgroundLayerPaintOrder(ir.slides[0].payload.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        frame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 5.625 * H.EMU_PER_INCH,
        },
        stops: [
          { color: "111111", transparency: undefined, position: 0 },
          { color: "333333", transparency: undefined, position: 1 },
        ],
        serialized: { shapeObjectId: "500151" },
      },
      {
        kind: "background-image",
        frame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 5.625 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 5.625 * H.EMU_PER_INCH,
        },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
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
    expect(H.stripBackgroundLayerPaintOrder(viewNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
        fit: "cover",
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 0.5 },
        serialized: { shapeObjectId: "151" },
      },
    ]);
  });

  test("render resolves backgroundRepeat on image layers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background repeat" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 2,
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-y",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 1,
            width: 2,
            height: 1,
            background: `url("${H.SAMPLE_SVG_DATA_URI}")`,
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
    expect(H.stripBackgroundLayerPaintOrder(repeatYNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
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
    expect(H.stripBackgroundLayerPaintOrder(repeatXNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 4 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 4 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1 * H.EMU_PER_INCH,
        },
        source: { kind: "data", data: H.SAMPLE_SVG_DATA_URI },
        fit: "contain",
        repeat: "repeat-x",
        objectPosition: { x: 0, y: 0 },
        serialized: { shapeObjectId: "251" },
      },
    ]);
  });

  test("render resolves explicit backgroundSize values on image layers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Explicit background size" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 2,
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
            backgroundSize: "50% auto",
            backgroundPosition: "right bottom",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 3.5,
            width: 4,
            height: 1.5,
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
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
    expect(H.stripBackgroundLayerPaintOrder(firstNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 4 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 4 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
        fit: "size",
        size: { widthEmu: 2 * H.EMU_PER_INCH },
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 1 },
        serialized: { shapeObjectId: "151" },
      },
    ]);

    expect(secondNode?.kind).toBe("group");
    if (secondNode?.kind !== "group") {
      throw new Error("Expected second group node.");
    }
    expect(H.stripBackgroundLayerPaintOrder(secondNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 3.5 * H.EMU_PER_INCH,
          widthEmu: 4 * H.EMU_PER_INCH,
          heightEmu: 1.5 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 3.5 * H.EMU_PER_INCH,
          widthEmu: 4 * H.EMU_PER_INCH,
          heightEmu: 1.5 * H.EMU_PER_INCH,
        },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
        fit: "size",
        size: { heightEmu: 0.75 * H.EMU_PER_INCH },
        repeat: "no-repeat",
        objectPosition: { x: 0, y: 0 },
        serialized: { shapeObjectId: "251" },
      },
    ]);
  });

  test("render resolves intrinsic auto backgroundSize values on image layers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Auto background size" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 2,
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto auto",
            backgroundPosition: "right bottom",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 3.5,
            width: 4,
            height: 1.5,
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
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
    expect(H.stripBackgroundLayerPaintOrder(firstNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 4 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 4 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
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
    expect(H.stripBackgroundLayerPaintOrder(secondNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 3.5 * H.EMU_PER_INCH,
          widthEmu: 4 * H.EMU_PER_INCH,
          heightEmu: 1.5 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 3.5 * H.EMU_PER_INCH,
          widthEmu: 4 * H.EMU_PER_INCH,
          heightEmu: 1.5 * H.EMU_PER_INCH,
        },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
        fit: "size",
        repeat: "no-repeat",
        objectPosition: { x: 0, y: 0 },
        serialized: { shapeObjectId: "251" },
      },
    ]);
  });

  test("render clips background image layers to the content box", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background clip" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
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
    expect(H.stripBackgroundLayerPaintOrder(imageNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: { xEmu: 1374775, yEmu: 1374775, widthEmu: 2736850, heightEmu: 908050 },
        sourceFrame: { xEmu: 914400, yEmu: 914400, widthEmu: 3657600, heightEmu: 1828800 },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
        fit: "stretch",
        objectPosition: { x: 0.5, y: 0.5 },
        repeat: "no-repeat",
        serialized: { shapeObjectId: "151" },
      },
    ]);
  });
});

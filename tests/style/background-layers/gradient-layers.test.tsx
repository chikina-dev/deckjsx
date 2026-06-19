import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("background gradient layers", () => {
  test("render resolves background image origin separately from clip", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
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
    expect(H.stripBackgroundLayerPaintOrder(imageNode.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: { xEmu: 1374775, yEmu: 1374775, widthEmu: 2736850, heightEmu: 908050 },
        sourceFrame: { xEmu: 917575, yEmu: 917575, widthEmu: 3651250, heightEmu: 1822450 },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
        fit: "stretch",
        objectPosition: { x: 0.5, y: 0.5 },
        repeat: "no-repeat",
        serialized: { shapeObjectId: "151" },
      },
    ]);
  });

  test("render resolves visual-box shorthand values on image background layers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
            background: `url("${H.WIDE_SVG_DATA_URI}") no-repeat padding-box content-box / 100% 100%`,
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
        sourceFrame: { xEmu: 917575, yEmu: 917575, widthEmu: 3651250, heightEmu: 1822450 },
        source: { kind: "data", data: H.WIDE_SVG_DATA_URI },
        fit: "stretch",
        objectPosition: { x: 0.5, y: 0.5 },
        repeat: "no-repeat",
        serialized: { shapeObjectId: "151" },
      },
    ]);
  });

  test("render clips gradient background layers to the content box", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    expect(H.stripBackgroundLayerPaintOrder(gradientNode.backgroundLayers)).toEqual([
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
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    expect(H.stripBackgroundLayerPaintOrder(gradientNode.backgroundLayers)).toEqual([
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
});

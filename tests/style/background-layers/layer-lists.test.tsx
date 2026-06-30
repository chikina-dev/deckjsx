import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("background layer lists", () => {
  test("render resolves per-layer backgroundOrigin and backgroundClip lists", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background layer boxes" }, () => (
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
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
              position: "absolute",
              left: 1,
              top: 1,
              width: 2,
              height: 1,
              background:
                "linear-gradient(45deg, #123456 0%, #654321 100%), linear-gradient(180deg, #ABCDEF 0%, #FEDCBA 100%)",
            }}
          />
          <p
            style={{
              position: "absolute",
              left: 1,
              top: 2.5,
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
              position: "absolute",
              left: 5,
              top: 1,
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
    expect(H.stripBackgroundLayerPaintOrder(ir.slides[0].payload.backgroundLayers)).toEqual([
      {
        kind: "solid",
        color: "111111",
        transparency: undefined,
        frame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 5.625 * H.EMU_PER_INCH,
        },
        serialized: { shapeObjectId: "500151" },
      },
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
    expect(H.stripBackgroundLayerPaintOrder(viewNode.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1 * H.EMU_PER_INCH,
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
    expect(H.stripBackgroundLayerPaintOrder(textNode.backgroundLayers)).toEqual([
      {
        kind: "linear-gradient",
        angle: 90,
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 2.5 * H.EMU_PER_INCH,
          widthEmu: 3 * H.EMU_PER_INCH,
          heightEmu: 0.75 * H.EMU_PER_INCH,
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
    expect(H.stripBackgroundLayerPaintOrder(shapeNode.backgroundLayers)).toEqual([
      {
        kind: "solid",
        color: "222222",
        transparency: undefined,
        frame: {
          xEmu: 5 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1.5 * H.EMU_PER_INCH,
        },
        serialized: { shapeObjectId: "351" },
      },
    ]);
  });
});

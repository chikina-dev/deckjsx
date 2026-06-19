import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("style value colors and backgrounds", () => {
  test("render normalizes hex, alpha hex, rgb, hsl, and hsla colors", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Color functions", style: { backgroundColor: "#11223380" } }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            backgroundColor: "rgba(255, 0, 0, 0.25)",
            border: "thick dashed hsl(210, 100%, 50%)",
          }}
        >
          <p
            style={{
              x: 0.5,
              y: 0.5,
              width: 2,
              height: 0.5,
              fontSize: 18,
              color: "rgb(15 23 42)",
              border: "solid #00FF0080 2pt",
            }}
          >
            Color
          </p>
          <shape
            shape="rect"
            style={{
              x: 2.75,
              y: 0.5,
              width: 0.75,
              height: 0.75,
              fill: "hsla(120, 100%, 25%, 0.4)",
            }}
          />
        </div>
      </>
    ));

    const slide = (await deck.project()).projection!.slides[0];
    const view = slide.payload.drawing.children[0];

    expect(slide.payload.background).toEqual({ kind: "solid", color: "112233", transparency: 50 });
    expect(view?.kind).toBe("group");
    if (!view || view.kind !== "group") {
      throw new Error("Expected group node.");
    }

    expect(view.fill).toEqual({ kind: "solid", color: "FF0000", transparency: 75 });
    expect(view.stroke).toEqual({
      color: "0080FF",
      dashType: "dash",
      style: "dash",
      transparency: undefined,
      widthPt: 5,
    });

    const text = view.children[0];
    const shape = view.children[1];

    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(text.style.color).toBe("0F172A");
    expect(text.stroke).toEqual({ color: "00FF00", style: "solid", transparency: 50, widthPt: 2 });

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape node.");
    }
    expect(shape.fill).toEqual({ kind: "solid", color: "008000", transparency: 60 });
  });

  test("render normalizes named colors and transparent", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Named colors", style: { backgroundColor: "papayawhip" } }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            backgroundColor: "rebeccapurple",
            border: "2pt solid dodgerblue",
          }}
        >
          <p
            style={{
              x: 0.5,
              y: 0.5,
              width: 2,
              height: 0.5,
              fontSize: 18,
              color: "slategray",
              backgroundColor: "transparent",
            }}
          >
            Named
          </p>
          <shape
            shape="rect"
            style={{ x: 2.75, y: 0.5, width: 0.75, height: 0.75, fill: "mediumseagreen" }}
          />
        </div>
      </>
    ));

    const slide = (await deck.project()).projection!.slides[0];
    const view = slide.payload.drawing.children[0];

    expect(slide.payload.background).toEqual({
      kind: "solid",
      color: "FFEFD5",
      transparency: undefined,
    });
    expect(view?.kind).toBe("group");
    if (!view || view.kind !== "group") {
      throw new Error("Expected group node.");
    }

    expect(view.fill).toEqual({ kind: "solid", color: "663399", transparency: undefined });
    expect(view.stroke).toEqual({
      color: "1E90FF",
      style: "solid",
      transparency: undefined,
      widthPt: 2,
    });

    const text = view.children[0];
    const shape = view.children[1];

    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(text.style.color).toBe("708090");
    expect(text.fill).toEqual({ kind: "solid", color: "000000", transparency: 100 });

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape node.");
    }
    expect(shape.fill).toEqual({ kind: "solid", color: "3CB371", transparency: undefined });
  });

  test("render normalizes background shorthand and backgroundColor precedence", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      { name: "Background precedence", style: { background: "rgba(17, 34, 51, 0.4)" } },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 3,
              height: 1,
              background: "hsl(210, 100%, 50%)",
              backgroundColor: "#00FF00",
            }}
          />
          <p
            style={{ x: 1, y: 2.25, width: 3, height: 0.75, fontSize: 18, background: "#FF000080" }}
          >
            Background
          </p>
          <shape
            shape="rect"
            style={{
              x: 5,
              y: 1,
              width: 2,
              height: 1,
              fill: "rgba(239, 68, 68, 0.25)",
              backgroundColor: "#111111",
            }}
          />
        </>
      ),
    );

    const ir = (await deck.project()).projection!;
    const [view, text, shape] = ir.slides[0].payload.drawing.children;

    expect(ir.slides[0].payload.background).toEqual({
      kind: "solid",
      color: "112233",
      transparency: 60,
    });

    expect(view?.kind).toBe("group");
    if (!view || view.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(view.fill).toEqual({ kind: "solid", color: "00FF00", transparency: undefined });

    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(text.fill).toEqual({ kind: "solid", color: "FF0000", transparency: 50 });

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape node.");
    }
    expect(shape.fill).toEqual({ kind: "solid", color: "EF4444", transparency: 75 });
  });

  test("render normalizes gradient backgrounds and multiple background layers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Gradient backgrounds",
        style: {
          background:
            "linear-gradient(90deg, rgba(37, 99, 235, 0.4) 0%, #F97316 100%), linear-gradient(180deg, #111111 0%, #333333 100%)",
        },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 3,
              height: 1,
              background: "linear-gradient(to bottom, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
            }}
          />
          <p
            style={{
              x: 1,
              y: 2.25,
              width: 3,
              height: 0.75,
              fontSize: 18,
              background: "linear-gradient(180deg, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
            }}
          >
            Gradient
          </p>
          <shape
            shape="rect"
            style={{
              x: 5,
              y: 1,
              width: 2,
              height: 1,
              background: "linear-gradient(45deg, #EF4444 0%, #F59E0B 100%)",
            }}
          />
          <div
            style={{
              x: 5,
              y: 2.5,
              width: 2,
              height: 0.75,
              backgroundColor: "#10B981",
              background: "linear-gradient(90deg, #111111 0%, #222222 100%)",
            }}
          />
        </>
      ),
    );

    const ir = (await deck.project()).projection!;
    const [view, text, shape, override] = ir.slides[0].payload.drawing.children;

    expect(ir.slides[0].payload.background).toEqual({
      kind: "linear-gradient",
      angle: 90,
      stops: [
        { color: "2563EB", transparency: 60, position: 0 },
        { color: "F97316", transparency: undefined, position: 1 },
      ],
    });
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
    ]);

    expect(view?.kind).toBe("group");
    if (!view || view.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(view.fill).toEqual({
      kind: "linear-gradient",
      angle: 180,
      stops: [
        { color: "22C55E", transparency: undefined, position: 0 },
        { color: "0EA5E9", transparency: 50, position: 1 },
      ],
    });

    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(text.fill).toEqual({
      kind: "linear-gradient",
      angle: 180,
      stops: [
        { color: "FFFFFF", transparency: undefined, position: 0 },
        { color: "0F172A", transparency: 75, position: 1 },
      ],
    });

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape node.");
    }
    expect(shape.fill).toEqual({
      kind: "linear-gradient",
      angle: 45,
      stops: [
        { color: "EF4444", transparency: undefined, position: 0 },
        { color: "F59E0B", transparency: undefined, position: 1 },
      ],
    });

    expect(override?.kind).toBe("group");
    if (!override || override.kind !== "group") {
      throw new Error("Expected override group node.");
    }
    expect(override.fill).toEqual({ kind: "solid", color: "10B981", transparency: undefined });
  });

  test("render normalizes background image sizing, positioning, repeat, clip, and origin", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background image controls" }, () => (
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
            background: `url("${H.BACKGROUND_IMAGE_PATH}")`,
            backgroundSize: "100% 100%",
            backgroundPosition: "right bottom",
            backgroundRepeat: "repeat-x",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
          }}
        />
        <div
          style={{
            x: 6,
            y: 1,
            width: 2,
            height: 1,
            background: `url("${H.BACKGROUND_IMAGE_PATH}") no-repeat right bottom / contain`,
          }}
        />
      </>
    ));

    const [clipped, shorthand] = (await deck.project()).projection!.slides[0].payload.drawing
      .children;

    expect(clipped?.kind).toBe("group");
    if (!clipped || clipped.kind !== "group") {
      throw new Error("Expected clipped group node.");
    }
    expect(clipped.fill).toBeUndefined();
    expect(H.stripBackgroundLayerPaintOrder(clipped.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: { xEmu: 1374775, yEmu: 1374775, widthEmu: 2736850, heightEmu: 908050 },
        sourceFrame: { xEmu: 917575, yEmu: 917575, widthEmu: 3651250, heightEmu: 1822450 },
        source: { kind: "path", path: H.BACKGROUND_IMAGE_PATH },
        fit: "stretch",
        repeat: "repeat-x",
        objectPosition: { x: 1, y: 1 },
        serialized: { shapeObjectId: "151" },
      },
    ]);

    expect(shorthand?.kind).toBe("group");
    if (!shorthand || shorthand.kind !== "group") {
      throw new Error("Expected shorthand group node.");
    }
    expect(shorthand.fill).toBeUndefined();
    expect(H.stripBackgroundLayerPaintOrder(shorthand.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 6 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1 * H.EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 6 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1 * H.EMU_PER_INCH,
        },
        source: { kind: "path", path: H.BACKGROUND_IMAGE_PATH },
        fit: "contain",
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 1 },
        serialized: { shapeObjectId: "251" },
      },
    ]);
  });
});

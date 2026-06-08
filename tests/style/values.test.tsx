import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH } from "../../src/index.ts";
import type { PptxBackgroundLayer } from "../../src/inspect.ts";

const BACKGROUND_IMAGE_PATH = "/tmp/deckjsx-background.png";

function stripBackgroundLayerPaintOrder(
  layers: readonly PptxBackgroundLayer[] | undefined,
): readonly Omit<PptxBackgroundLayer, "paintOrder">[] | undefined {
  return layers?.map((layer) => {
    const { paintOrder: _paintOrder, ...withoutPaintOrder } = layer;
    return withoutPaintOrder;
  });
}

describe("style value normalization", () => {
  test("render supports em rem vh vw and ch units", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5, unit: "in" } });

    deck.slide({ name: "Relative units" }, () => (
      <>
        <div
          style={{
            left: "1rem",
            top: "2rem",
            width: "10vw",
            height: "20vh",
            backgroundColor: "#E5E7EB",
          }}
        />
        <p
          style={{
            left: "5vw",
            top: "10vh",
            width: "10em",
            height: "4ch",
            fontSize: "2rem",
            padding: "1em",
            lineHeight: "1.5em",
            textIndent: "2ch",
            listStyleType: "circle",
            listIndent: "3ch",
            tabStops: [{ position: "4ch", alignment: "center" }],
          }}
        >
          Units
        </p>
      </>
    ));

    const nodes = (await deck.project()).projection!.slides[0].payload.drawing.children;
    const box = nodes[0];
    const text = nodes[1];

    expect(box?.kind).toBe("group");
    if (!box || box.kind !== "group") {
      throw new Error("Expected group node.");
    }

    expect(box.frame).toEqual({
      xEmu: EMU_PER_INCH / 6,
      yEmu: EMU_PER_INCH / 3,
      widthEmu: EMU_PER_INCH,
      heightEmu: EMU_PER_INCH,
    });

    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text node.");
    }

    expect(text.frame).toEqual({
      xEmu: 0.5 * EMU_PER_INCH,
      yEmu: 0.5 * EMU_PER_INCH,
      widthEmu: (10 / 3) * EMU_PER_INCH,
      heightEmu: (2 / 3) * EMU_PER_INCH,
    });
    expect(text.style.fontSizePt).toBe(24);
    expect(text.style.paddingPt).toEqual([24, 24, 24, 24]);
    expect(text.style.lineSpacing).toBe(36);
    expect(text.style.textIndentPt).toBe(24);
    expect(text.style.list).toEqual({ type: "bullet", characterCode: "25E6", indentPt: 36 });
    expect(text.style.tabStops).toEqual([{ positionIn: 2 / 3, alignment: "ctr" }]);
  });

  test("render resolves viewport units inside nested stack layout sizing", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5, unit: "in" } });

    deck.slide({ name: "Stack viewport units" }, () => (
      <>
        <div
          style={{
            x: 0,
            y: 0,
            width: "100vw",
            height: "100vh",
            layout: "stack",
            direction: "vertical",
            padding: ["10vh", "10vw", 0, "10vw"],
            gap: "5vh",
          }}
        >
          <p style={{ width: "20vw", height: "10vh", marginBottom: "5vh", fontSize: 12 }}>
            Stack viewport
          </p>
        </div>
      </>
    ));

    const group = (await deck.project()).projection!.slides[0].payload.drawing.children[0];

    expect(group?.kind).toBe("group");
    if (!group || group.kind !== "group") {
      throw new Error("Expected group node.");
    }

    expect(group.frame).toEqual({
      xEmu: 0,
      yEmu: 0,
      widthEmu: 10 * EMU_PER_INCH,
      heightEmu: 5 * EMU_PER_INCH,
    });
    expect(group.children[0]?.frame).toEqual({
      xEmu: 1 * EMU_PER_INCH,
      yEmu: 0.5 * EMU_PER_INCH,
      widthEmu: 2 * EMU_PER_INCH,
      heightEmu: 0.5 * EMU_PER_INCH,
    });
  });

  test("render resolves viewport units inside nested grid layout sizing", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5, unit: "in" } });

    deck.slide({ name: "Grid viewport units" }, () => (
      <>
        <div
          style={{
            x: 0,
            y: 0,
            width: "100vw",
            height: "100vh",
            display: "grid",
            padding: ["10vh", "10vw", 0, "10vw"],
            columnGap: "5vw",
            rowGap: "5vh",
            gridTemplateColumns: ["20vw", "1fr"],
            gridTemplateRows: ["10vh", "1fr"],
          }}
        >
          <p style={{ gridColumn: 1, gridRow: 1, width: "15vw", height: "8vh", fontSize: 12 }}>
            Grid viewport
          </p>
        </div>
      </>
    ));

    const group = (await deck.project()).projection!.slides[0].payload.drawing.children[0];

    expect(group?.kind).toBe("group");
    if (!group || group.kind !== "group") {
      throw new Error("Expected group node.");
    }

    expect(group.frame).toEqual({
      xEmu: 0,
      yEmu: 0,
      widthEmu: 10 * EMU_PER_INCH,
      heightEmu: 5 * EMU_PER_INCH,
    });
    expect(group.children[0]?.frame).toEqual({
      xEmu: 1 * EMU_PER_INCH,
      yEmu: 0.5 * EMU_PER_INCH,
      widthEmu: 1.5 * EMU_PER_INCH,
      heightEmu: 0.4 * EMU_PER_INCH,
    });
  });

  test("render normalizes hex, alpha hex, rgb, hsl, and hsla colors", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
            background: `url("${BACKGROUND_IMAGE_PATH}")`,
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
            background: `url("${BACKGROUND_IMAGE_PATH}") no-repeat right bottom / contain`,
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
    expect(stripBackgroundLayerPaintOrder(clipped.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: { xEmu: 1374775, yEmu: 1374775, widthEmu: 2736850, heightEmu: 908050 },
        sourceFrame: { xEmu: 917575, yEmu: 917575, widthEmu: 3651250, heightEmu: 1822450 },
        source: { kind: "path", path: BACKGROUND_IMAGE_PATH },
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
    expect(stripBackgroundLayerPaintOrder(shorthand.backgroundLayers)).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 6 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 6 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
        source: { kind: "path", path: BACKGROUND_IMAGE_PATH },
        fit: "contain",
        repeat: "no-repeat",
        objectPosition: { x: 1, y: 1 },
        serialized: { shapeObjectId: "251" },
      },
    ]);
  });

  test("render normalizes spacing shorthands and side aliases", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5, unit: "in" } });

    deck.slide({ name: "Spacing values" }, () => (
      <>
        <div style={{ inset: [1, 2, 1.5, 3], backgroundColor: "#E5E7EB" }} />
        <div
          style={{
            x: 0,
            y: 0,
            width: 6,
            height: 2,
            layout: "stack",
            direction: "horizontal",
            paddingTop: "0.25in",
            paddingRight: "0.5in",
            paddingBottom: "0.25in",
            paddingLeft: "0.5in",
          }}
        >
          <p
            style={{
              width: 1,
              height: 0.5,
              margin: ["0.25in", "0.5in", "0.25in", "0.5in"],
              padding: ["6pt", "12pt", "6pt", "12pt"],
            }}
          >
            Spacing
          </p>
        </div>
      </>
    ));

    const [insetBox, stack] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(insetBox?.kind).toBe("group");
    if (!insetBox || insetBox.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(insetBox.frame).toEqual({
      xEmu: 3 * EMU_PER_INCH,
      yEmu: 1 * EMU_PER_INCH,
      widthEmu: 5 * EMU_PER_INCH,
      heightEmu: 2.5 * EMU_PER_INCH,
    });

    expect(stack?.kind).toBe("group");
    if (!stack || stack.kind !== "group") {
      throw new Error("Expected stack group node.");
    }

    const text = stack.children[0];
    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(text.frame).toEqual({
      xEmu: 1 * EMU_PER_INCH,
      yEmu: 0.5 * EMU_PER_INCH,
      widthEmu: 1 * EMU_PER_INCH,
      heightEmu: 0.5 * EMU_PER_INCH,
    });
    expect(text.style.paddingPt).toEqual([6, 12, 6, 12]);
  });

  test("render normalizes border, outline, and stroke aliases", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Stroke values" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            border: "thick dashed dodgerblue",
            outline: "2pt dotted rgba(255, 0, 0, 0.5)",
          }}
        />
        <p
          style={{
            x: 1,
            y: 2.25,
            width: 2,
            height: 0.5,
            borderTop: "1pt solid #111111",
            borderRight: "2pt dotted #222222",
            borderBottomColor: "#333333",
            borderBottomWidth: "3pt",
            borderBottomStyle: "solid",
          }}
        >
          Borders
        </p>
        <shape
          shape="rect"
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 1,
            fill: "#F97316",
            stroke: "rebeccapurple",
            strokeWidth: "3pt",
            strokeOpacity: 0.25,
            strokeDasharray: "1 4",
            strokeLinecap: "square",
            strokeLinejoin: "bevel",
          }}
        />
      </>
    ));

    const [view, text, shape] = (await deck.project()).projection!.slides[0].payload.drawing
      .children;

    expect(view?.kind).toBe("group");
    if (!view || view.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(view.stroke).toEqual({
      color: "1E90FF",
      dashType: "dash",
      style: "dash",
      transparency: undefined,
      widthPt: 5,
    });
    expect(view.outline).toEqual({
      color: "FF0000",
      dashType: "sysDot",
      style: "dash",
      transparency: 50,
      widthPt: 2,
    });
    expect(view.generatedStrokes).toEqual([
      expect.objectContaining({
        kind: "stroke",
        role: "outline",
        frame: view.frame,
        stroke: view.outline,
        shape: "rect",
        paintOrder: expect.objectContaining({ generatedLayerRole: "outline" }),
      }),
    ]);

    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(text.edgeStrokes).toEqual({
      top: { color: "111111", style: "solid", transparency: undefined, widthPt: 1 },
      right: {
        color: "222222",
        dashType: "sysDot",
        style: "dash",
        transparency: undefined,
        widthPt: 2,
      },
      bottom: { color: "333333", style: "solid", transparency: undefined, widthPt: 3 },
    });
    expect(text.generatedStrokes?.map((layer) => layer.edge)).toEqual(["top", "right", "bottom"]);
    expect(text.generatedStrokes?.map((layer) => layer.paintOrder.generatedLayerRole)).toEqual([
      "border",
      "border",
      "border",
    ]);
    expect(text.generatedStrokes?.[0]?.frame).toEqual({ ...text.frame, heightEmu: 0 });
    expect(text.generatedStrokes?.[1]?.frame).toEqual({
      ...text.frame,
      xEmu: text.frame.xEmu + text.frame.widthEmu,
      widthEmu: 0,
    });
    expect(text.generatedStrokes?.[2]?.frame).toEqual({
      ...text.frame,
      yEmu: text.frame.yEmu + text.frame.heightEmu,
      heightEmu: 0,
    });

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape node.");
    }
    expect(shape.stroke).toEqual({
      color: "663399",
      widthPt: 3,
      dashType: "sysDot",
      lineCap: "square",
      lineJoin: "bevel",
      transparency: 75,
    });
  });
  test("render rejects ambiguous or unsupported style values", async () => {
    const unsupportedLength = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    unsupportedLength.slide({ name: "Unsupported length" }, () => (
      <>
        <div style={{ x: "1qu" as never, y: 1, width: 2, height: 1 }} />
      </>
    ));
    const unsupportedLengthResult = await unsupportedLength.project();
    expect(unsupportedLengthResult.ok).toBe(false);
    expect(unsupportedLengthResult.diagnostics.items[0]?.message).toContain(
      "Unsupported length value: 1qu",
    );

    const unsupportedRepeat = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    unsupportedRepeat.slide({ name: "Unsupported repeat" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            background: `url("${BACKGROUND_IMAGE_PATH}")`,
            backgroundRepeat: "space",
          }}
        />
      </>
    ));
    const unsupportedRepeatResult = await unsupportedRepeat.project();
    const [unsupportedRepeatNode] =
      unsupportedRepeatResult.projection!.slides[0].payload.drawing.children;
    expect(unsupportedRepeatResult.ok).toBe(true);
    expect(unsupportedRepeatResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        message:
          "Unsupported backgroundRepeat value: space. Supported values are no-repeat, repeat-x, repeat-y, and repeat.",
      }),
    );
    expect(unsupportedRepeatNode?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "background",
        property: "background",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["authoredBackgroundInput"]),
          missing: expect.arrayContaining(["pptxBackgroundLayer"]),
        }),
      }),
    );

    const unsupportedGradient = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    unsupportedGradient.slide({ name: "Unsupported gradient" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            background: "repeating-linear-gradient(90deg, #FFFFFF 0%, #000000 0%)",
          }}
        />
      </>
    ));
    const unsupportedGradientResult = await unsupportedGradient.project();
    const [unsupportedGradientNode] =
      unsupportedGradientResult.projection!.slides[0].payload.drawing.children;
    expect(unsupportedGradientResult.ok).toBe(true);
    expect(unsupportedGradientResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        message: "repeating-linear-gradient() requires a positive repeat span.",
      }),
    );
    expect(unsupportedGradientNode?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "background",
        property: "background",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["authoredBackgroundInput"]),
          missing: expect.arrayContaining(["pptxBackgroundLayer"]),
        }),
      }),
    );

    const invalidGrid = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidGrid.slide({ name: "Invalid grid shorthand" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 6, height: 4, grid: "auto-flow 1in / auto-flow 2in" }} />
      </>
    ));
    const invalidGridResult = await invalidGrid.project();
    expect(invalidGridResult.ok).toBe(false);
    expect(invalidGridResult.diagnostics.items[0]?.message).toContain(
      'grid shorthand cannot contain "auto-flow" on both sides of "/".',
    );

    const invalidScript = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    invalidScript.slide({ name: "Invalid text script" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 3, height: 1, superscript: true, subscript: true }}>
          Script
        </p>
      </>
    ));
    const invalidScriptResult = await invalidScript.project();
    expect(invalidScriptResult.ok).toBe(false);
    expect(invalidScriptResult.diagnostics.items[0]?.message).toContain(
      " cannot be both superscript and subscript.",
    );
  });

  test("render normalizes typography aliases", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Typography aliases" }, () => (
      <>
        <p
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 1,
            fontSize: 20,
            fontStyle: "italic",
            letterSpacing: 1.5,
            lineHeight: "30pt",
            textDecoration: "underline line-through",
            textDecorationStyle: "wavy",
            textDecorationColor: "dodgerblue",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            direction: "rtl",
            writingMode: "vertical-rl",
          }}
        >
          typography
        </p>
        <p
          style={{
            x: 1,
            y: 2.25,
            width: 3,
            height: 1,
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }}
        >
          Wrap
        </p>
      </>
    ));

    const [decorated, wrapping] = (await deck.project()).projection!.slides[0].payload.drawing
      .children;

    expect(decorated?.kind).toBe("text");
    if (!decorated || decorated.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(decorated.content.text).toBe("TYPOGRAPHY");
    expect(decorated.style).toMatchObject({
      italic: true,
      underline: true,
      underlineStyle: "wavy",
      underlineColor: "1E90FF",
      strike: true,
      charSpacing: 1.5,
      lineSpacing: 30,
      wrap: false,
      rtlMode: true,
      textDirection: "vert270",
    });

    expect(wrapping?.kind).toBe("text");
    if (!wrapping || wrapping.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(wrapping.style.wrap).toBe(true);
  });

  test("render normalizes image value aliases", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " aliases" }, () => (
      <>
        <img
          src="/tmp/demo.png"
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            objectFit: "cover",
            objectPosition: "right 25% bottom 10%",
            crop: { top: "10%", right: "20%", bottom: 0.3, left: 0.4 },
            borderRadius: "1px",
            opacity: 0.5,
            transparency: 25,
          }}
        />
      </>
    ));

    const image = (await deck.project()).projection!.slides[0].payload.drawing.children[0];

    expect(image?.kind).toBe("image");
    if (!image || image.kind !== "image") {
      throw new Error("Expected image node.");
    }
    expect(image.fit).toBe("cover");
    expect(image.objectPosition).toEqual({ x: 0.75, y: 0.9 });
    expect(image.crop).toEqual({ top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 });
    expect(image.rounding).toBe(true);
    expect(image.opacity).toBe(0.5);
    expect(image.transparency).toBe(25);
  });
});

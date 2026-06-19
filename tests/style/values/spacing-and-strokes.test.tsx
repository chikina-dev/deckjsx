import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("style value spacing and strokes", () => {
  test("render normalizes spacing shorthands and side aliases", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5, unit: "in" } });

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
      xEmu: 3 * H.EMU_PER_INCH,
      yEmu: 1 * H.EMU_PER_INCH,
      widthEmu: 5 * H.EMU_PER_INCH,
      heightEmu: 2.5 * H.EMU_PER_INCH,
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
      xEmu: 1 * H.EMU_PER_INCH,
      yEmu: 0.5 * H.EMU_PER_INCH,
      widthEmu: 1 * H.EMU_PER_INCH,
      heightEmu: 0.5 * H.EMU_PER_INCH,
    });
    expect(text.style.paddingPt).toEqual([6, 12, 6, 12]);
  });

  test("render normalizes border, outline, and stroke aliases", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
});

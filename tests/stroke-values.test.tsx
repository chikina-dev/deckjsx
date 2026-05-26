import { describe, expect, test } from "vite-plus/test";
import { Deck, Shape, Text, View } from "../src/index.ts";

describe("stroke-values", () => {
  test("render supports border shorthand and css color functions", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Border and color", style: { backgroundColor: "#11223380" } }, () => (
      <>
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            backgroundColor: "rgba(255, 0, 0, 0.25)",
            border: "thick dashed hsl(210, 100%, 50%)",
          }}
        >
          <Text
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
          </Text>
          <Shape
            shape="rect"
            style={{
              x: 2.75,
              y: 0.5,
              width: 0.75,
              height: 0.75,
              fill: "hsla(120, 100%, 25%, 0.4)",
            }}
          />
        </View>
      </>
    ));

    const ir = deck.project().projection!;

    const slide = ir.slides[0]?.payload;
    const group = slide?.elements[0];

    expect(ir.version).toBe("0.6");
    expect(slide?.background).toEqual({
      kind: "solid",
      color: "112233",
      transparency: 50,
    });
    expect(group?.kind).toBe("group");
    if (!group || group.kind !== "group") {
      throw new Error("Expected group element.");
    }

    const [text, shape] = group.children;
    expect(group.fill).toEqual({ kind: "solid", color: "FF0000", transparency: 75 });
    expect(group.stroke).toEqual({
      color: "0080FF",
      style: "dash",
      transparency: undefined,
      widthPt: 5,
    });
    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text element.");
    }
    expect(text.stroke).toEqual({
      color: "00FF00",
      style: "solid",
      transparency: 50,
      widthPt: 2,
    });
    expect(text.style.color).toBe("0F172A");
    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape element.");
    }
    expect(shape.fill).toEqual({ kind: "solid", color: "008000", transparency: 60 });
  });

  test("render supports shape strokeDasharray", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Shape stroke dasharray" }, () => (
      <>
        <Shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "dodgerblue",
            strokeWidth: "3pt",
            strokeDasharray: "1 4",
          }}
        />
      </>
    ));

    const ir = deck.project().projection!;
    const shape = ir.slides[0]?.payload.elements[0];

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape element.");
    }
    expect(shape.fill).toEqual({
      color: "F97316",
      kind: "solid",
      transparency: undefined,
    });
    expect(shape.stroke).toEqual({
      color: "1E90FF",
      dashType: "sysDot",
      style: undefined,
      transparency: undefined,
      widthPt: 3,
    });
  });

  test("render supports strokeLinecap and strokeLinejoin", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Stroke cap and join" }, () => (
      <>
        <Shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "dodgerblue",
            strokeWidth: "3pt",
            strokeLinecap: "square",
            strokeLinejoin: "bevel",
          }}
        />
      </>
    ));

    const ir = deck.project().projection!;
    const shape = ir.slides[0]?.payload.elements[0];

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape element.");
    }
    expect(shape.stroke).toEqual({
      color: "1E90FF",
      lineCap: "square",
      lineJoin: "bevel",
      style: undefined,
      transparency: undefined,
      widthPt: 3,
    });
  });
});

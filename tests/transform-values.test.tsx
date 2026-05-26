import { describe, expect, test } from "vite-plus/test";
import { Deck, Image, Shape, Text, View } from "../src/index.ts";

describe("transform-values", () => {
  test("render normalizes transform rotate, translate, scale, and mirror aliases", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Transform aliases" }, () => (
      <>
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            transform: "rotate(15deg) translate(50%, 25%) scaleX(-1)",
          }}
        />
        <Text
          style={{
            x: 1,
            y: 2.5,
            width: 2,
            height: 0.75,
            fontSize: 18,
            transform: "rotate(0.5turn) translateY(50%) scaleY(-1)",
          }}
        >
          Transform text
        </Text>
        <Shape
          shape="rect"
          style={{
            x: 4,
            y: 1,
            width: 1.5,
            height: 1.5,
            fill: "#2563EB",
            transform: "scale(2, 0.5)",
          }}
        />
        <Image
          src="/tmp/transform.png"
          style={{
            x: 6,
            y: 1,
            width: 1,
            height: 1,
            transform: "rotate(1rad) scale(-1, -1)",
          }}
        />
      </>
    ));

    const [view, text, shape, image] = deck.project().projection!.slides[0].payload.elements;

    expect(view?.rotation).toBe(15);
    expect(view?.flipH).toBe(true);
    expect(view?.flipV).toBeUndefined();
    expect(view?.frame).toEqual({
      xEmu: 1828800,
      yEmu: 1143000,
      widthEmu: 1828800,
      heightEmu: 914400,
    });

    expect(text?.rotation).toBe(180);
    expect(text?.flipH).toBeUndefined();
    expect(text?.flipV).toBe(true);
    expect(text?.frame).toEqual({
      xEmu: 914400,
      yEmu: 2628900,
      widthEmu: 1828800,
      heightEmu: 685800,
    });

    expect(shape?.rotation).toBeUndefined();
    expect(shape?.flipH).toBeUndefined();
    expect(shape?.flipV).toBeUndefined();
    expect(shape?.frame).toEqual({
      xEmu: 2971800,
      yEmu: 1257300,
      widthEmu: 2743200,
      heightEmu: 685800,
    });

    expect(image?.rotation).toBeCloseTo(57.29577951308232);
    expect(image?.flipH).toBe(true);
    expect(image?.flipV).toBe(true);
  });

  test("render normalizes transformOrigin, skew, and matrix bounding boxes", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Transform boxes" }, () => (
      <>
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            transformOrigin: "left top",
            transform: "scale(2, 0.5)",
          }}
        />
        <Shape
          shape="rect"
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 1,
            fill: "#2563EB",
            transformOrigin: "left top",
            transform: "rotate(90deg)",
          }}
        />
        <View
          style={{
            x: 1,
            y: 3,
            width: 2,
            height: 1,
            transformOrigin: "left top",
            transform: "skewX(45deg)",
          }}
        />
        <Shape
          shape="rect"
          style={{
            x: 4,
            y: 3,
            width: 1,
            height: 1,
            fill: "#10B981",
            transformOrigin: "left top",
            transform: "skewY(45deg)",
          }}
        />
        <View
          style={{
            x: 6,
            y: 1,
            width: 2,
            height: 1,
            transformOrigin: "left top",
            transform: "matrix(1, 0.5, 0.25, 1, 96, 48)",
          }}
        />
      </>
    ));

    const [scaled, rotated, skewX, skewY, matrix] =
      deck.project().projection!.slides[0].payload.elements;

    expect(scaled?.frame).toEqual({
      xEmu: 914400,
      yEmu: 914400,
      widthEmu: 3657600,
      heightEmu: 457200,
    });
    expect(scaled?.rotation).toBeUndefined();

    expect(rotated?.frame).toEqual({
      xEmu: 3200400,
      yEmu: -457200,
      widthEmu: 1828800,
      heightEmu: 914400,
    });
    expect(rotated?.rotation).toBe(90);

    expect(skewX?.frame).toEqual({
      xEmu: 914400,
      yEmu: 2743200,
      widthEmu: 2743200,
      heightEmu: 914400,
    });

    expect(skewY?.frame).toEqual({
      xEmu: 3657600,
      yEmu: 2743200,
      widthEmu: 914400,
      heightEmu: 1828800,
    });

    expect(matrix?.frame).toEqual({
      xEmu: 6400800,
      yEmu: 1371600,
      widthEmu: 2057400,
      heightEmu: 1828800,
    });
    expect(matrix?.rotation).toBeUndefined();
  });

  test("render rejects unsupported transform functions", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Unsupported transform" }, () => (
      <>
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            transform: "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
          }}
        />
      </>
    ));

    const result = deck.project();
    expect(result.ok).toBe(false);
    expect(result.diagnostics.items[0]?.message).toContain(
      "Unsupported transform function: matrix3d",
    );
  });
});

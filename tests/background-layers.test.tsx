import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH, Shape, Slide, Text, View } from "../src/index.ts";
import { SAMPLE_SVG_DATA_URI, WIDE_SVG_DATA_URI } from "./helpers.ts";

describe("background layers", () => {
  test("render supports background shorthand with image layers", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide
        name="Background shorthand image layers"
        style={{
          background: `url("${WIDE_SVG_DATA_URI}") no-repeat right bottom / contain, linear-gradient(180deg, #111111 0%, #333333 100%)`,
        }}
      >
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            background: `url("${SAMPLE_SVG_DATA_URI}") repeat-x left top / contain`,
          }}
        />
      </Slide>
    ));

    const ir = deck.project().projection!;
    const [viewNode] = ir.slides[0].payload.elements;

    expect(ir.slides[0].payload.background).toBeUndefined();
    expect(ir.slides[0].payload.backgroundLayers).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
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
          widthEmu: 10 * EMU_PER_INCH,
          heightEmu: 5.625 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * EMU_PER_INCH,
          heightEmu: 5.625 * EMU_PER_INCH,
        },
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "contain",
        repeat: "no-repeat",
        objectPosition: {
          x: 1,
          y: 1,
        },
        transparency: undefined,
      },
    ]);

    expect(viewNode?.kind).toBe("group");
    if (viewNode?.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(viewNode.fill).toBeUndefined();
    expect(viewNode.backgroundLayers).toEqual([
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
        source: {
          kind: "data",
          data: SAMPLE_SVG_DATA_URI,
        },
        fit: "contain",
        repeat: "repeat-x",
        objectPosition: {
          x: 0,
          y: 0,
        },
        transparency: undefined,
      },
    ]);
  });

  test("render resolves background image layer size and position", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide
        name="Background image layers"
        style={{
          backgroundImage: `url("${WIDE_SVG_DATA_URI}"), linear-gradient(180deg, #111111 0%, #333333 100%)`,
          backgroundSize: "contain, 100% 100%",
          backgroundPosition: "right bottom, center",
        }}
      >
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "cover",
            backgroundPosition: "right center",
          }}
        />
      </Slide>
    ));

    const ir = deck.project().projection!;
    const [viewNode] = ir.slides[0].payload.elements;

    expect(ir.slides[0].payload.background).toBeUndefined();
    expect(ir.slides[0].payload.backgroundLayers).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
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
          widthEmu: 10 * EMU_PER_INCH,
          heightEmu: 5.625 * EMU_PER_INCH,
        },
        sourceFrame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * EMU_PER_INCH,
          heightEmu: 5.625 * EMU_PER_INCH,
        },
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "contain",
        repeat: "no-repeat",
        objectPosition: {
          x: 1,
          y: 1,
        },
        transparency: undefined,
      },
    ]);

    expect(viewNode?.kind).toBe("group");
    if (viewNode?.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(viewNode.fill).toBeUndefined();
    expect(viewNode.backgroundLayers).toEqual([
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
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "cover",
        repeat: "no-repeat",
        objectPosition: {
          x: 1,
          y: 0.5,
        },
        transparency: undefined,
      },
    ]);
  });

  test("render resolves backgroundRepeat on image layers", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Background repeat">
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-y",
          }}
        />
        <View
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 1,
            backgroundImage: `url("${SAMPLE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-x",
          }}
        />
      </Slide>
    ));

    const [repeatYNode, repeatXNode] = deck.project().projection!.slides[0].payload.elements;

    expect(repeatYNode?.kind).toBe("group");
    if (repeatYNode?.kind !== "group") {
      throw new Error("Expected repeat-y group node.");
    }
    expect(repeatYNode.backgroundLayers).toEqual([
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
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "contain",
        repeat: "repeat-y",
        objectPosition: {
          x: 0,
          y: 0,
        },
        transparency: undefined,
      },
    ]);

    expect(repeatXNode?.kind).toBe("group");
    if (repeatXNode?.kind !== "group") {
      throw new Error("Expected repeat-x group node.");
    }
    expect(repeatXNode.backgroundLayers).toEqual([
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
        source: {
          kind: "data",
          data: SAMPLE_SVG_DATA_URI,
        },
        fit: "contain",
        repeat: "repeat-x",
        objectPosition: {
          x: 0,
          y: 0,
        },
        transparency: undefined,
      },
    ]);
  });

  test("render resolves explicit backgroundSize values on image layers", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Explicit background size">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "50% auto",
            backgroundPosition: "right bottom",
          }}
        />
        <View
          style={{
            x: 1,
            y: 3.5,
            width: 4,
            height: 1.5,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto 50%",
            backgroundPosition: "left top",
          }}
        />
      </Slide>
    ));

    const [firstNode, secondNode] = deck.project().projection!.slides[0].payload.elements;

    expect(firstNode?.kind).toBe("group");
    if (firstNode?.kind !== "group") {
      throw new Error("Expected first group node.");
    }
    expect(firstNode.backgroundLayers).toEqual([
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
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "size",
        size: {
          widthEmu: 2 * EMU_PER_INCH,
        },
        repeat: "no-repeat",
        objectPosition: {
          x: 1,
          y: 1,
        },
        transparency: undefined,
      },
    ]);

    expect(secondNode?.kind).toBe("group");
    if (secondNode?.kind !== "group") {
      throw new Error("Expected second group node.");
    }
    expect(secondNode.backgroundLayers).toEqual([
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
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "size",
        size: {
          heightEmu: 0.75 * EMU_PER_INCH,
        },
        repeat: "no-repeat",
        objectPosition: {
          x: 0,
          y: 0,
        },
        transparency: undefined,
      },
    ]);
  });

  test("render resolves intrinsic auto backgroundSize values on image layers", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Auto background size">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto auto",
            backgroundPosition: "right bottom",
          }}
        />
        <View
          style={{
            x: 1,
            y: 3.5,
            width: 4,
            height: 1.5,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto",
            backgroundPosition: "left top",
          }}
        />
      </Slide>
    ));

    const [firstNode, secondNode] = deck.project().projection!.slides[0].payload.elements;

    expect(firstNode?.kind).toBe("group");
    if (firstNode?.kind !== "group") {
      throw new Error("Expected first group node.");
    }
    expect(firstNode.backgroundLayers).toEqual([
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
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "size",
        repeat: "no-repeat",
        objectPosition: {
          x: 1,
          y: 1,
        },
        transparency: undefined,
      },
    ]);

    expect(secondNode?.kind).toBe("group");
    if (secondNode?.kind !== "group") {
      throw new Error("Expected second group node.");
    }
    expect(secondNode.backgroundLayers).toEqual([
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
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "size",
        repeat: "no-repeat",
        objectPosition: {
          x: 0,
          y: 0,
        },
        transparency: undefined,
      },
    ]);
  });

  test("render clips background image layers to the content box", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Background clip">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundClip: "content-box",
          }}
        />
      </Slide>
    ));

    const [imageNode] = deck.project().projection!.slides[0].payload.elements;

    expect(imageNode?.kind).toBe("group");
    if (imageNode?.kind !== "group") {
      throw new Error("Expected image group node.");
    }
    expect(imageNode.fill).toBeUndefined();
    expect(imageNode.backgroundLayers).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1374775,
          yEmu: 1374775,
          widthEmu: 2736850,
          heightEmu: 908050,
        },
        sourceFrame: {
          xEmu: 914400,
          yEmu: 914400,
          widthEmu: 3657600,
          heightEmu: 1828800,
        },
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "stretch",
        repeat: "no-repeat",
      },
    ]);
  });

  test("render resolves background image origin separately from clip", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Background origin">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            backgroundImage: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
          }}
        />
      </Slide>
    ));

    const [imageNode] = deck.project().projection!.slides[0].payload.elements;

    expect(imageNode?.kind).toBe("group");
    if (imageNode?.kind !== "group") {
      throw new Error("Expected image group node.");
    }
    expect(imageNode.fill).toBeUndefined();
    expect(imageNode.backgroundLayers).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1374775,
          yEmu: 1374775,
          widthEmu: 2736850,
          heightEmu: 908050,
        },
        sourceFrame: {
          xEmu: 917575,
          yEmu: 917575,
          widthEmu: 3651250,
          heightEmu: 1822450,
        },
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "stretch",
        repeat: "no-repeat",
      },
    ]);
  });

  test("render resolves visual-box shorthand values on image background layers", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Background shorthand boxes">
        <View
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
      </Slide>
    ));

    const [imageNode] = deck.project().projection!.slides[0].payload.elements;

    expect(imageNode?.kind).toBe("group");
    if (imageNode?.kind !== "group") {
      throw new Error("Expected image group node.");
    }
    expect(imageNode.fill).toBeUndefined();
    expect(imageNode.backgroundLayers).toEqual([
      {
        kind: "background-image",
        frame: {
          xEmu: 1374775,
          yEmu: 1374775,
          widthEmu: 2736850,
          heightEmu: 908050,
        },
        sourceFrame: {
          xEmu: 917575,
          yEmu: 917575,
          widthEmu: 3651250,
          heightEmu: 1822450,
        },
        source: {
          kind: "data",
          data: WIDE_SVG_DATA_URI,
        },
        fit: "stretch",
        repeat: "no-repeat",
      },
    ]);
  });

  test("render clips gradient background layers to the content box", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Background clip gradient">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            backgroundImage: "linear-gradient(180deg, #111111 0%, #333333 100%)",
            backgroundClip: "content-box",
          }}
        />
      </Slide>
    ));

    const [gradientNode] = deck.project().projection!.slides[0].payload.elements;

    expect(gradientNode?.kind).toBe("group");
    if (gradientNode?.kind !== "group") {
      throw new Error("Expected gradient group node.");
    }
    expect(gradientNode.fill).toBeUndefined();
    expect(gradientNode.backgroundLayers).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        stops: [
          { color: "111111", transparency: undefined, position: 0 },
          { color: "333333", transparency: undefined, position: 1 },
        ],
        frame: {
          xEmu: 1374775,
          yEmu: 1374775,
          widthEmu: 2736850,
          heightEmu: 908050,
        },
      },
    ]);
  });

  test("render resolves gradient background origin separately from clip", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Background origin gradient">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            backgroundImage: "linear-gradient(180deg, #111111 0in, #333333 1in)",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
          }}
        />
      </Slide>
    ));

    const [gradientNode] = deck.project().projection!.slides[0].payload.elements;

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

  test("render resolves visual-box shorthand values on gradient background layers", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Background shorthand gradient boxes">
        <View
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
      </Slide>
    ));

    const [gradientNode] = deck.project().projection!.slides[0].payload.elements;

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

  test("render preserves gradient background layer color fallback order", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Background shorthand gradient fallback">
        <View
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
      </Slide>
    ));

    const [gradientNode] = deck.project().projection!.slides[0].payload.elements;

    expect(gradientNode?.kind).toBe("group");
    if (gradientNode?.kind !== "group") {
      throw new Error("Expected gradient group node.");
    }
    expect(gradientNode.fill).toBeUndefined();
    expect(gradientNode.backgroundLayers).toEqual([
      {
        kind: "solid",
        color: "AAAAAA",
        transparency: undefined,
        frame: {
          xEmu: 1374775,
          yEmu: 1374775,
          widthEmu: 2736850,
          heightEmu: 908050,
        },
      },
      {
        kind: "linear-gradient",
        angle: 180,
        stops: [
          { color: "111111", transparency: undefined, position: 0 },
          { color: "333333", transparency: undefined, position: 0.5017421602787455 },
        ],
        frame: {
          xEmu: 1374775,
          yEmu: 1374775,
          widthEmu: 2736850,
          heightEmu: 908050,
        },
      },
    ]);
  });

  test("render resolves per-layer backgroundOrigin and backgroundClip lists", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Background layer boxes">
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            backgroundImage:
              "linear-gradient(180deg, #111111 0in, #333333 1in), linear-gradient(180deg, #AAAAAA 0in, #CCCCCC 1in)",
            backgroundOrigin: "padding-box, border-box",
            backgroundClip: "content-box, padding-box",
          }}
        />
      </Slide>
    ));

    const [viewNode] = deck.project().projection!.slides[0].payload.elements;

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
    expect(bottomLayer.stops[0]).toEqual({
      color: "AAAAAA",
      transparency: undefined,
      position: 0,
    });
    expect(bottomLayer.stops[1]?.color).toBe("CCCCCC");
    expect(bottomLayer.stops[1]?.position).toBeCloseTo(0.5, 6);

    expect(topLayer.frame).toEqual({
      xEmu: 1374775,
      yEmu: 1374775,
      widthEmu: 2736850,
      heightEmu: 908050,
    });
    expect(topLayer.stops[0]).toEqual({
      color: "111111",
      transparency: undefined,
      position: 0,
    });
    expect(topLayer.stops[1]?.color).toBe("333333");
    expect(topLayer.stops[1]?.position).toBeCloseTo(0.501742, 6);
  });

  test("render preserves multiple background layer ordering across node kinds", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide
        name="Multiple backgrounds"
        style={{
          backgroundImage:
            "linear-gradient(90deg, #FF0000 0%, #00FF00 100%), linear-gradient(180deg, #0000FF 0%, #FFFFFF 100%), #111111",
        }}
      >
        <View
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundImage:
              "linear-gradient(45deg, #123456 0%, #654321 100%), linear-gradient(180deg, #ABCDEF 0%, #FEDCBA 100%)",
          }}
        />
        <Text
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
        </Text>
        <Shape
          shape="rect"
          style={{
            x: 5,
            y: 1,
            width: 2,
            height: 1.5,
            backgroundImage: "linear-gradient(30deg, #EF4444 0%, #F59E0B 100%), #222222",
          }}
        />
      </Slide>
    ));

    const ir = deck.project().projection!;
    const [viewNode, textNode, shapeNode] = ir.slides[0].payload.elements;

    expect(ir.slides[0].payload.background).toEqual({
      kind: "linear-gradient",
      angle: 90,
      stops: [
        { color: "FF0000", transparency: undefined, position: 0 },
        { color: "00FF00", transparency: undefined, position: 1 },
      ],
    });
    expect(ir.slides[0].payload.backgroundLayers).toEqual([
      { kind: "solid", color: "111111", transparency: undefined },
      {
        kind: "linear-gradient",
        angle: 180,
        stops: [
          { color: "0000FF", transparency: undefined, position: 0 },
          { color: "FFFFFF", transparency: undefined, position: 1 },
        ],
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
    expect(viewNode.backgroundLayers).toEqual([
      {
        kind: "linear-gradient",
        angle: 180,
        stops: [
          { color: "ABCDEF", transparency: undefined, position: 0 },
          { color: "FEDCBA", transparency: undefined, position: 1 },
        ],
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
    expect(textNode.backgroundLayers).toEqual([
      {
        kind: "linear-gradient",
        angle: 90,
        stops: [
          { color: "00AAFF", transparency: undefined, position: 0 },
          { color: "AA00FF", transparency: undefined, position: 1 },
        ],
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
    expect(shapeNode.backgroundLayers).toEqual([
      { kind: "solid", color: "222222", transparency: undefined },
    ]);
  });
});

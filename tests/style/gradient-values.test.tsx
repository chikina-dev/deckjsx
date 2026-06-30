import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../helpers.ts";

describe("gradient-values", () => {
  test("render supports radial-gradient fills", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Radial gradient",
        style: {
          background:
            "radial-gradient(ellipse 20% 30% at 25% 75%, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)",
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
              background:
                "radial-gradient(circle closest-side at 75% 25%, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
            }}
          />
          <p
            style={{
              position: "absolute",
              left: 1,
              top: 3,
              width: 3,
              height: 0.75,
              fontSize: 18,
              background:
                "radial-gradient(ellipse farthest-side at center, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
            }}
          >
            Radial text
          </p>
          <shape
            shape="rect"
            style={{
              position: "absolute",
              left: 5,
              top: 1,
              width: 2,
              height: 2,
              background: "radial-gradient(circle 40% at 20% 30%, #EF4444 0%, #F59E0B 100%)",
            }}
          />
        </>
      ),
    );

    const ir = (await deck.project()).projection!;
    const [viewNode, textNode, shapeNode] = ir.slides[0].payload.drawing.children;

    expect(ir.slides[0].payload.background).toEqual({
      kind: "radial-gradient",
      shape: "ellipse",
      center: { x: 0.25, y: 0.75 },
      radius: { x: 0.2, y: 0.3 },
      stops: [
        { color: "2563EB", transparency: 60, position: 0 },
        { color: "F97316", transparency: undefined, position: 1 },
      ],
    });

    expect(viewNode?.kind).toBe("group");
    if (viewNode?.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(viewNode.fill).toEqual({
      kind: "radial-gradient",
      shape: "circle",
      center: { x: 0.75, y: 0.25 },
      radius: { x: 0.25, y: 0.25 },
      stops: [
        { color: "22C55E", transparency: undefined, position: 0 },
        { color: "0EA5E9", transparency: 50, position: 1 },
      ],
    });

    expect(textNode?.kind).toBe("text");
    if (textNode?.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(textNode.fill).toEqual({
      kind: "radial-gradient",
      shape: "ellipse",
      center: { x: 0.5, y: 0.5 },
      radius: { x: 0.5, y: 0.5 },
      stops: [
        { color: "FFFFFF", transparency: undefined, position: 0 },
        { color: "0F172A", transparency: 75, position: 1 },
      ],
    });

    expect(shapeNode?.kind).toBe("shape");
    if (shapeNode?.kind !== "shape") {
      throw new Error("Expected shape node.");
    }
    expect(shapeNode.fill).toEqual({
      kind: "radial-gradient",
      shape: "circle",
      center: { x: 0.2, y: 0.3 },
      radius: { x: 0.4, y: 0.4 },
      stops: [
        { color: "EF4444", transparency: undefined, position: 0 },
        { color: "F59E0B", transparency: undefined, position: 1 },
      ],
    });
  });

  test("render supports repeating gradient fills", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Repeating gradients",
        style: {
          background: "repeating-linear-gradient(90deg, #111111 0%, #EEEEEE 25%, #111111 50%)",
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
              background:
                "repeating-radial-gradient(circle 40% at center, #EF4444 0%, #F59E0B 20%, #EF4444 40%)",
            }}
          />
        </>
      ),
    );

    const ir = (await deck.project()).projection!;
    const background = ir.slides[0].payload.background;
    const [viewNode] = ir.slides[0].payload.drawing.children;

    if (!background || !("kind" in background) || background.kind !== "linear-gradient") {
      throw new Error("Expected repeating linear gradient background.");
    }
    expect(background.kind).toBe("linear-gradient");
    expect(background.angle).toBe(90);
    expect(background.stops.length).toBeGreaterThanOrEqual(7);
    expect(background.stops.some((stop) => stop.position === 0.75 && stop.color === "EEEEEE")).toBe(
      true,
    );

    expect(viewNode?.kind).toBe("group");
    if (viewNode?.kind !== "group") {
      throw new Error("Expected group node.");
    }
    if (!viewNode.fill || !("kind" in viewNode.fill) || viewNode.fill.kind !== "radial-gradient") {
      throw new Error("Expected repeating radial gradient fill.");
    }
    expect(viewNode.fill.kind).toBe("radial-gradient");
    expect(viewNode.fill.shape).toBe("circle");
    expect(viewNode.fill.radius).toEqual({ x: 0.4, y: 0.4 });
    expect(viewNode.fill.stops.length).toBeGreaterThanOrEqual(6);
    expect(
      viewNode.fill.stops.some(
        (stop) => Math.abs(stop.position - 0.6) < 1e-9 && stop.color === "F59E0B",
      ),
    ).toBe(true);
  });

  test("render supports length-based gradient stop positions", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Length stops" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            background: "linear-gradient(90deg, #111111 0in, #777777 1in, #EEEEEE 2in)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 1,
            width: 2,
            height: 2,
            background:
              "radial-gradient(circle 40% at center, #EF4444 0in, #F59E0B 0.4in, #FDE68A 0.8in)",
          }}
        />
      </>
    ));

    const ir = (await deck.project()).projection!;
    const [linearNode, radialNode] = ir.slides[0].payload.drawing.children;

    expect(linearNode?.kind).toBe("group");
    if (linearNode?.kind !== "group") {
      throw new Error("Expected linear group node.");
    }
    expect(linearNode.fill).toEqual({
      kind: "linear-gradient",
      angle: 90,
      stops: [
        { color: "111111", transparency: undefined, position: 0 },
        { color: "777777", transparency: undefined, position: 0.5 },
        { color: "EEEEEE", transparency: undefined, position: 1 },
      ],
    });

    expect(radialNode?.kind).toBe("group");
    if (radialNode?.kind !== "group") {
      throw new Error("Expected radial group node.");
    }
    expect(radialNode.fill).toEqual({
      kind: "radial-gradient",
      shape: "circle",
      center: { x: 0.5, y: 0.5 },
      radius: { x: 0.4, y: 0.4 },
      stops: [
        { color: "EF4444", transparency: undefined, position: 0 },
        { color: "F59E0B", transparency: undefined, position: 0.5 },
        { color: "FDE68A", transparency: undefined, position: 1 },
      ],
    });
  });

  test("render supports multi-position stops and color hints", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Gradient hints" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            background: "linear-gradient(90deg, #FF0000 0 50%, 75%, #0000FF 100%)",
          }}
        />
      </>
    ));

    const ir = (await deck.project()).projection!;
    const [viewNode] = ir.slides[0].payload.drawing.children;

    expect(viewNode?.kind).toBe("group");
    if (viewNode?.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(viewNode.fill).toEqual({
      kind: "linear-gradient",
      angle: 90,
      stops: [
        { color: "FF0000", transparency: undefined, position: 0 },
        { color: "FF0000", transparency: undefined, position: 0.5 },
        { color: "800080", transparency: undefined, position: 0.75 },
        { color: "0000FF", transparency: undefined, position: 1 },
      ],
    });
  });

  test("render supports linear-gradient fills for slide, view, text, and shape backgrounds", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Gradient",
        style: { background: "linear-gradient(90deg, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)" },
      },
      () => (
        <>
          <div
            style={{
              position: "absolute",
              left: 1,
              top: 1,
              width: 3,
              height: 1.5,
              background: "linear-gradient(to bottom, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
            }}
          />
          <p
            style={{
              position: "absolute",
              left: 1,
              top: 3,
              width: 3,
              height: 0.75,
              fontSize: 18,
              background: "linear-gradient(180deg, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
            }}
          >
            Gradient text
          </p>
          <shape
            shape="rect"
            style={{
              position: "absolute",
              left: 5,
              top: 1,
              width: 2,
              height: 2,
              fill: "linear-gradient(45deg, #EF4444 0%, #F59E0B 100%)",
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
        { color: "2563EB", transparency: 60, position: 0 },
        { color: "F97316", transparency: undefined, position: 1 },
      ],
    });

    expect(viewNode.kind).toBe("group");
    if (viewNode.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(viewNode.fill).toEqual({
      kind: "linear-gradient",
      angle: 180,
      stops: [
        { color: "22C55E", transparency: undefined, position: 0 },
        { color: "0EA5E9", transparency: 50, position: 1 },
      ],
    });

    expect(textNode.kind).toBe("text");
    if (textNode.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(textNode.fill).toEqual({
      kind: "linear-gradient",
      angle: 180,
      stops: [
        { color: "FFFFFF", transparency: undefined, position: 0 },
        { color: "0F172A", transparency: 75, position: 1 },
      ],
    });

    expect(shapeNode.kind).toBe("shape");
    if (shapeNode.kind !== "shape") {
      throw new Error("Expected shape node.");
    }
    expect(shapeNode.fill).toEqual({
      kind: "linear-gradient",
      angle: 45,
      stops: [
        { color: "EF4444", transparency: undefined, position: 0 },
        { color: "F59E0B", transparency: undefined, position: 1 },
      ],
    });
  });

  test("project warns and preserves unsupported radial-gradient descriptors", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Unsupported radial" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            background: "radial-gradient(circle 10% 20% at center, #FFFFFF 0%, #000000 100%)",
          }}
        />
      </>
    ));

    const result = await deck.project();
    const [view] = result.projection!.slides[0].payload.drawing.children;

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        message:
          "Unsupported radial-gradient descriptor: circle 10% 20% at center. circle gradients accept only one explicit radius.",
      }),
    );
    expect(view?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "background",
        property: "background",
        reason:
          "Unsupported radial-gradient descriptor: circle 10% 20% at center. circle gradients accept only one explicit radius.",
      }),
    );
  });
});

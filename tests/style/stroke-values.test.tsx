import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../../src/index.ts";

describe("stroke-values", () => {
  test("render supports border shorthand and css color functions", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Border and color", style: { backgroundColor: "#11223380" } }, () => (
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

    const ir = (await deck.project()).projection!;

    const slide = ir.slides[0]?.payload;
    const group = slide?.drawing.children[0];

    expect(slide?.background).toEqual({ kind: "solid", color: "112233", transparency: 50 });
    expect(group?.kind).toBe("group");
    if (!group || group.kind !== "group") {
      throw new Error("Expected group element.");
    }

    const [text, shape] = group.children;
    expect(group.fill).toEqual({ kind: "solid", color: "FF0000", transparency: 75 });
    expect(group.stroke).toEqual({
      color: "0080FF",
      dashType: "dash",
      style: "dash",
      transparency: undefined,
      widthPt: 5,
    });
    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text element.");
    }
    expect(text.stroke).toEqual({ color: "00FF00", style: "solid", transparency: 50, widthPt: 2 });
    expect(text.style.color).toBe("0F172A");
    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape element.");
    }
    expect(shape.fill).toEqual({ kind: "solid", color: "008000", transparency: 60 });
  });

  test("render supports shape strokeDasharray", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " stroke dasharray" }, () => (
      <>
        <shape
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

    const ir = (await deck.project()).projection!;
    const shape = ir.slides[0]?.payload.drawing.children[0];

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape element.");
    }
    expect(shape.fill).toEqual({ color: "F97316", kind: "solid", transparency: undefined });
    expect(shape.stroke).toEqual({
      color: "1E90FF",
      dashType: "sysDot",
      style: undefined,
      transparency: undefined,
      widthPt: 3,
    });
  });

  test("render supports shape stroke shorthand", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " stroke shorthand" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "1.5pt dashed #2563EB",
            strokeWidth: "2pt",
          }}
        />
      </>
    ));

    const result = await deck.project();
    const shape = result.projection!.slides[0]?.payload.drawing.children[0];

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).not.toContainEqual(
      expect.objectContaining({ code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC", severity: "warning" }),
    );
    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape element.");
    }
    expect(shape.stroke).toEqual({
      color: "2563EB",
      dashType: "dash",
      style: "dash",
      transparency: undefined,
      widthPt: 2,
    });
  });

  test("render reports css-wide stroke width fallback", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "CSS-wide stroke width" }, () => (
      <shape
        shape="rect"
        style={
          {
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "#2563EB",
            strokeWidth: "initial",
          } as never
        }
      />
    ));

    const result = await deck.project();
    const shape = result.projection!.slides[0]?.payload.drawing.children[0];

    expect(result.ok).toBe(true);
    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape element.");
    }
    expect(shape.stroke).toEqual({
      color: "2563EB",
      style: undefined,
      transparency: undefined,
      widthPt: 1,
    });
    expect(shape.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "strokeWidth",
        value: "initial",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          missing: expect.arrayContaining(["cssWideKeywordCascade"]),
        }),
      }),
    );
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          "feature=layout",
          "property=strokeWidth",
          "fallbackMissing=cssWideKeywordCascade",
        ]),
      }),
    );
  });

  test("render supports shape dotted stroke shorthand", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " dotted stroke shorthand" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "1pt dotted #2563EB",
          }}
        />
      </>
    ));

    const result = await deck.project();
    const shape = result.projection!.slides[0]?.payload.drawing.children[0];

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).not.toContainEqual(
      expect.objectContaining({ code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC", severity: "warning" }),
    );
    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape element.");
    }
    expect(shape.stroke).toEqual({
      color: "2563EB",
      dashType: "sysDot",
      style: "dash",
      transparency: undefined,
      widthPt: 1,
    });
  });

  test("render supports strokeLinecap and strokeLinejoin", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Stroke cap and join" }, () => (
      <>
        <shape
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

    const ir = (await deck.project()).projection!;
    const shape = ir.slides[0]?.payload.drawing.children[0];

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

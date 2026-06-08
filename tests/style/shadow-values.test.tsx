import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../../src/index.ts";

describe("shadow-values", () => {
  test("render normalizes boxShadow and textShadow shorthands", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Shadow values" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            boxShadow: "inset 4px 8px 12px rgba(15, 23, 42, 0.3)",
          }}
        />
        <p
          style={{
            x: 1,
            y: 2.25,
            width: 2,
            height: 0.5,
            textShadow: "6px 3px 9px rgba(37, 99, 235, 0.4)",
          }}
        >
          Shadow
        </p>
        <shape
          shape="rect"
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 1,
            fill: "#F97316",
            boxShadow: "3px 3px 6px rebeccapurple",
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
    expect(view.shadow).toMatchObject({ type: "inner", color: "0F172A", opacity: 0.3, blurPt: 9 });

    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text node.");
    }
    expect(text.shadow).toMatchObject({
      type: "outer",
      color: "2563EB",
      opacity: 0.4,
      blurPt: 6.75,
    });

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape node.");
    }
    expect(shape.shadow).toMatchObject({ type: "outer", color: "663399", opacity: 1, blurPt: 4.5 });
  });

  test("project warns and preserves unsupported multi-layer shadows", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Invalid shadow" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            boxShadow: "1px 1px 2px red, 2px 2px 4px blue",
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
          "Only a single shadow layer is currently supported: 1px 1px 2px red, 2px 2px 4px blue",
      }),
    );
    expect(view?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "shadow",
        property: "boxShadow",
        reason:
          "Only a single shadow layer is currently supported: 1px 1px 2px red, 2px 2px 4px blue",
      }),
    );
  });
});

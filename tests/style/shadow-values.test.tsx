import { describe, expect, test } from "vite-plus/test";
import { Deck } from "../helpers.ts";

describe("shadow-values", () => {
  test("render normalizes boxShadow and textShadow shorthands", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Shadow values" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            boxShadow: "inset 4px 8px 12px rgba(15, 23, 42, 0.3)",
          }}
        />
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2.25,
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
            position: "absolute",
            left: 4,
            top: 1,
            width: 2,
            height: 1,
            fill: "#F97316",
            boxShadow: "3px 3px 6px #663399",
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

  test("compile rejects casted multi-layer shadows outside the public authoring API", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Invalid shadow" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            boxShadow: "1px 1px 2px red, 2px 2px 4px blue" as never,
          }}
        />
      </>
    ));

    const result = await deck.project();

    expect(result.ok).toBe(false);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_COMPILE_INVALID_STYLE_VALUE",
        severity: "error",
        message: expect.stringContaining("boxShadow value is not part of the public authoring API"),
      }),
    );
  });

  test("project preserves shadow spread radius as unsupported fallback metadata", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Shadow spread" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            boxShadow: "4px 8px 12px 6px rgba(15, 23, 42, 0.3)",
          }}
        />
      </>
    ));

    const result = await deck.project();
    const [view] = result.projection!.slides[0].payload.drawing.children;

    expect(result.ok).toBe(true);
    expect(view?.kind).toBe("group");
    if (!view || view.kind !== "group") {
      throw new Error("Expected group node.");
    }
    expect(view.shadow).toMatchObject({ color: "0F172A", opacity: 0.3, blurPt: 9 });
    expect(view.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "shadow",
        property: "boxShadow",
        value: "4px 8px 12px 6px rgba(15, 23, 42, 0.3)",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["projectedShadowWithoutSpread"]),
          missing: expect.arrayContaining(["cssShadowSpreadRadius"]),
        }),
      }),
    );
    expect(result.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "shadow",
        property: "boxShadow",
      }),
    );
  });
});

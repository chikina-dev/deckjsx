import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("style value unsupported inputs", () => {
  test("render rejects ambiguous or unsupported style values", async () => {
    const unsupportedLength = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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

    const unsupportedRepeat = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    unsupportedRepeat.slide({ name: "Unsupported repeat" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            background: `url("${H.BACKGROUND_IMAGE_PATH}")`,
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

    const unsupportedGradient = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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

    const invalidGrid = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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

    const invalidScript = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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
});

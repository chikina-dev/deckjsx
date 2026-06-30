import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render CSS fallback groups", () => {
  test("project summary aggregates unsupported CSS-like semantics with drawing context", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Unsupported paint summary" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            background: "repeating-linear-gradient(90deg, #FFFFFF 0%, #000000 0%)",
          }}
        />
      </>
    ));

    const project = await deck.project();
    const element = project.projection?.slides[0]?.payload.drawing.children[0];
    const unsupported = project.summary?.unsupportedSemantics ?? [];

    expect(project.ok).toBe(true);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC", severity: "warning" }),
    );
    expect(unsupported).toContainEqual(
      expect.objectContaining({
        feature: "background",
        property: "background",
        value: "repeating-linear-gradient(90deg, #FFFFFF 0%, #000000 0%)",
        elementId: element?.id,
        kind: "group",
        packagePartId: element?.packagePartId,
        slidePartId: project.projection?.slides[0]?.id,
        slideId: project.projection?.slides[0]?.payload.slideId,
        origin: element?.origin,
        emissionTarget: "slide",
        paintOrderIndex: 0,
        paintOrder: expect.objectContaining({ siblingOrder: 0, generatedLayerRole: "authored" }),
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["authoredBackgroundInput"]),
          missing: expect.arrayContaining(["pptxBackgroundLayer"]),
        }),
      }),
    );
  });

  test("project warns and summarizes group opacity compositing fallback", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Group opacity" }, () => (
      <>
        <div style={{ position: "absolute", left: 1, top: 1, width: 3, height: 2, opacity: 0.5 }}>
          <p style={{ position: "absolute", left: 0.2, top: 0.2, width: 2, height: 0.4 }}>Child</p>
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(group?.kind).toBe("group");
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "opacity",
        property: "opacity",
        value: "0.5",
        fallback: expect.objectContaining({
          strategy: "cascadeOpacityToChildren",
          preserves: expect.arrayContaining(["projectedOpacity", "childDrawingValues"]),
          missing: expect.arrayContaining(["compositedSubtree", "cssStackingContext"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          "feature=opacity",
          "property=opacity",
          "value=0.5",
          "fallbackStrategy=cascadeOpacityToChildren",
          "fallbackPreserves=projectedOpacity,childDrawingValues",
          "fallbackMissing=compositedSubtree,cssStackingContext",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "opacity",
        property: "opacity",
        value: "0.5",
        elementId: group?.id,
        kind: "group",
        emissionTarget: "slide",
        paintOrderIndex: 0,
        fallback: expect.objectContaining({ strategy: "cascadeOpacityToChildren" }),
      }),
    );
  });

  test("project warns and summarizes opacity stacking-context fallback on drawing nodes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Opacity stacking context" }, () => (
      <>
        <p style={{ position: "absolute", left: 1, top: 1, width: 2, height: 0.5, opacity: 0.4 }}>
          Faded
        </p>
      </>
    ));

    const project = await deck.project();
    const text = project.projection?.slides[0]?.payload.drawing.children[0];
    const summary = project.summary?.slides[0]?.elements[0];

    expect(project.ok).toBe(true);
    expect(text?.kind).toBe("text");
    expect(text?.opacity).toBe(0.4);
    expect(summary?.opacity).toBe(0.4);
    expect(summary?.resolvedValues?.opacity).toBe(0.4);
    expect(text?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "opacity",
        property: "stackingContext",
        value: "0.4",
        fallback: expect.objectContaining({
          strategy: "preserveOpacityWithoutCompositedSubtree",
          preserves: expect.arrayContaining(["projectedOpacity", "drawingNode"]),
          missing: expect.arrayContaining(["compositedSubtree", "cssStackingContext"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          `elementId=${text?.id}`,
          "elementKind=text",
          "feature=opacity",
          "property=stackingContext",
          "value=0.4",
          "fallbackStrategy=preserveOpacityWithoutCompositedSubtree",
          "fallbackMissing=compositedSubtree,cssStackingContext",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "opacity",
        property: "stackingContext",
        value: "0.4",
        elementId: text?.id,
        kind: "text",
        fallback: expect.objectContaining({ strategy: "preserveOpacityWithoutCompositedSubtree" }),
      }),
    );
  });

  test("project warns and summarizes transform stacking-context fallback", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Transform stacking context" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 2,
            transform: "rotate(8deg)",
          }}
        >
          <p
            style={{ position: "absolute", left: 0.2, top: 0.2, width: 2, height: 0.4, zIndex: 2 }}
          >
            Front
          </p>
          <p
            style={{ position: "absolute", left: 0.2, top: 0.7, width: 2, height: 0.4, zIndex: -1 }}
          >
            Back
          </p>
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];
    const summaryGroup = project.summary?.slides[0]?.elements[0];

    expect(project.ok).toBe(true);
    expect(group?.kind).toBe("group");
    expect(group?.rotation).toBe(8);
    expect(summaryGroup?.rotation).toBe(8);
    expect(summaryGroup?.resolvedValues?.rotation).toBe(8);
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "transform",
        property: "stackingContext",
        value: "rotate(8deg)",
        fallback: expect.objectContaining({
          strategy: "preserveTransformWithoutStackingContext",
          preserves: expect.arrayContaining(["projectedTransform", "paintOrderInputs"]),
          missing: expect.arrayContaining(["cssStackingContext"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          `elementId=${group?.id}`,
          "elementKind=group",
          "feature=transform",
          "property=stackingContext",
          "value=rotate(8deg)",
          "fallbackStrategy=preserveTransformWithoutStackingContext",
          "fallbackMissing=cssStackingContext",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "transform",
        property: "stackingContext",
        value: "rotate(8deg)",
        elementId: group?.id,
        kind: "group",
        emissionTarget: "slide",
        fallback: expect.objectContaining({ strategy: "preserveTransformWithoutStackingContext" }),
      }),
    );
  });

  test("project warns and summarizes filter, blend, and isolation fallbacks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Compositing fallbacks" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 2,
            filter: "blur(2px)",
            mixBlendMode: "multiply",
            isolation: "isolate",
          }}
        >
          <p style={{ position: "absolute", left: 0.2, top: 0.2, width: 2, height: 0.4 }}>
            Composite
          </p>
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(group?.kind).toBe("group");
    expect(group?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "blur(2px)",
          fallback: expect.objectContaining({
            strategy: "dropFilterEffect",
            preserves: expect.arrayContaining(["authoredFilter"]),
            missing: expect.arrayContaining(["filterEffect"]),
          }),
        }),
        expect.objectContaining({
          feature: "blend",
          property: "mixBlendMode",
          value: "multiply",
          fallback: expect.objectContaining({
            strategy: "dropBlendMode",
            preserves: expect.arrayContaining(["authoredBlendMode"]),
            missing: expect.arrayContaining(["blendCompositing"]),
          }),
        }),
        expect.objectContaining({
          feature: "isolation",
          property: "isolation",
          value: "isolate",
          fallback: expect.objectContaining({
            strategy: "dropIsolationGroup",
            preserves: expect.arrayContaining(["authoredIsolation"]),
            missing: expect.arrayContaining(["isolatedCompositingGroup"]),
          }),
        }),
      ]),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            "feature=filter",
            "property=filter",
            "value=blur(2px)",
            "fallbackStrategy=dropFilterEffect",
            "fallbackMissing=filterEffect",
          ]),
        }),
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            "feature=blend",
            "property=mixBlendMode",
            "value=multiply",
            "fallbackStrategy=dropBlendMode",
            "fallbackMissing=blendCompositing",
          ]),
        }),
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            "feature=isolation",
            "property=isolation",
            "value=isolate",
            "fallbackStrategy=dropIsolationGroup",
            "fallbackMissing=isolatedCompositingGroup",
          ]),
        }),
      ]),
    );
    expect(project.summary?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "blur(2px)",
          elementId: group?.id,
          kind: "group",
          fallback: expect.objectContaining({ strategy: "dropFilterEffect" }),
        }),
        expect.objectContaining({
          feature: "blend",
          property: "mixBlendMode",
          value: "multiply",
          elementId: group?.id,
          kind: "group",
          fallback: expect.objectContaining({ strategy: "dropBlendMode" }),
        }),
        expect.objectContaining({
          feature: "isolation",
          property: "isolation",
          value: "isolate",
          elementId: group?.id,
          kind: "group",
          fallback: expect.objectContaining({ strategy: "dropIsolationGroup" }),
        }),
      ]),
    );
  });

  test("project warns and summarizes stroke fallbacks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Stroke fallbacks" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            fill: "#F8FAFC",
            stroke: "2pt solid #334155",
            strokeDasharray: "0 0",
          }}
        />
      </>
    ));

    const project = await deck.project();
    const shape = project.projection?.slides[0]?.payload.drawing.children[0];

    expect(project.ok).toBe(true);
    expect(shape?.kind).toBe("shape");
    expect(shape?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "stroke",
        property: "strokeDasharray",
        value: "0 0",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["authoredStrokeInput"]),
          missing: expect.arrayContaining(["pptxStroke"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            "feature=stroke",
            "property=strokeDasharray",
            "value=0 0",
            "fallbackStrategy=preserveAuthoredValueOnly",
            "fallbackMissing=pptxStroke",
          ]),
        }),
      ]),
    );
    expect(project.summary?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "stroke",
          property: "strokeDasharray",
          value: "0 0",
          elementId: shape?.id,
          kind: "shape",
          fallback: expect.objectContaining({ strategy: "preserveAuthoredValueOnly" }),
        }),
      ]),
    );
  });
});

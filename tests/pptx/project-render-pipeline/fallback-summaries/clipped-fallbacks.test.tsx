import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render clipped fallbacks", () => {
  test("project summarizes nested unsupported semantics with the child paint context", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Nested unsupported semantics" }, () => (
      <>
        <div style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2, zIndex: 7 }}>
          <p
            style={{
              position: "absolute",
              left: 0.25,
              top: 0.25,
              width: 2,
              height: 0.5,
              zIndex: 2,
              filter: "blur(3px)",
            }}
          >
            Child fallback
          </p>
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];
    const child = group?.kind === "group" ? group.children[0] : undefined;
    const record = project.summary?.unsupportedSemantics.find(
      (item) => item.elementId === child?.id && item.property === "filter",
    );

    expect(project.ok).toBe(true);
    expect(group?.kind).toBe("group");
    expect(group?.paintOrder?.zIndex).toBe(7);
    expect(child?.kind).toBe("text");
    expect(child?.paintOrder?.zIndex).toBe(2);
    expect(record).toEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "blur(3px)",
        elementId: child?.id,
        kind: "text",
        paintOrder: expect.objectContaining({ siblingOrder: 0, zIndex: 2 }),
        fallback: expect.objectContaining({ strategy: "dropFilterEffect" }),
      }),
    );
    expect(record).not.toHaveProperty("emissionTarget");
    expect(record).not.toHaveProperty("paintOrderIndex");
  });

  test("project warns and summarizes clipped transform fallback", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Clipped transform" }, () => (
      <>
        <div
          style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1, overflow: "hidden" }}
        >
          <p
            style={{
              position: "absolute",
              left: 1.6,
              top: 0.2,
              width: 1,
              height: 0.4,
              transform: "rotate(15deg)",
            }}
          >
            Clipped transform
          </p>
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];
    const child = group?.kind === "group" ? group.children[0] : undefined;

    expect(project.ok).toBe(true);
    expect(child?.kind).toBe("text");
    expect(child?.clip?.strategy).toBe("intersectParentOverflow");
    expect(child?.rotation).toBe(15);
    expect(child?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "clipping",
        property: "overflow",
        value: "hidden + transform:intersectParentOverflow",
        fallback: expect.objectContaining({
          strategy: "axisAlignedClipWithoutTransformedMask",
          preserves: expect.arrayContaining([
            "originalFrame",
            "clipFrame",
            "visibleFrame",
            "projectedTransform",
          ]),
          missing: expect.arrayContaining(["transformedClipMask"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          `elementId=${child?.id}`,
          "elementKind=text",
          "feature=clipping",
          "property=overflow",
          "value=hidden + transform:intersectParentOverflow",
          "fallbackStrategy=axisAlignedClipWithoutTransformedMask",
          "fallbackMissing=transformedClipMask",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "clipping",
        property: "overflow",
        value: "hidden + transform:intersectParentOverflow",
        elementId: child?.id,
        kind: "text",
        slidePartId: project.projection?.slides[0]?.id,
        fallback: expect.objectContaining({ strategy: "axisAlignedClipWithoutTransformedMask" }),
      }),
    );
  });

  test("project warns and summarizes clipped image source-rect transform fallback", async () => {
    const image =
      "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22200%22%3E%3Crect%20width%3D%22400%22%20height%3D%22200%22%20fill%3D%22%230EA5E9%22%2F%3E%3C%2Fsvg%3E";
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Clipped image transform" }, () => (
      <>
        <div
          style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1, overflow: "hidden" }}
        >
          <img
            data={image}
            style={{
              position: "absolute",
              left: 0.5,
              top: 0,
              width: 2,
              height: 1,
              objectFit: "cover",
              crop: { left: "10%", right: "5%" },
              transform: "rotate(12deg)",
            }}
          />
        </div>
      </>
    ));

    const project = await deck.project();
    const group = project.projection?.slides[0]?.payload.drawing.children[0];
    const child = group?.kind === "group" ? group.children[0] : undefined;
    const imageChild = child?.kind === "image" ? child : undefined;

    expect(project.ok).toBe(true);
    expect(child?.kind).toBe("image");
    expect(imageChild?.clip?.strategy).toBe("intersectParentOverflow");
    expect(imageChild?.rotation).toBe(12);
    expect(imageChild?.sourceFrame).toBeDefined();
    expect(imageChild?.crop).toEqual(expect.objectContaining({ left: 0.1, right: 0.05 }));
    expect(imageChild?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "clipping",
        property: "imageSourceRect",
        value: "clip:intersectParentOverflow+transform+fit:cover+crop",
        fallback: expect.objectContaining({
          strategy: "sourceRectBeforeTransform",
          preserves: expect.arrayContaining([
            "sourceFrame",
            "crop",
            "objectPosition",
            "projectedTransform",
          ]),
          missing: expect.arrayContaining(["transformedImageClip"]),
        }),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          `elementId=${imageChild?.id}`,
          "elementKind=image",
          "feature=clipping",
          "property=imageSourceRect",
          "value=clip:intersectParentOverflow+transform+fit:cover+crop",
          "fallbackStrategy=sourceRectBeforeTransform",
          "fallbackMissing=transformedImageClip",
        ]),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "clipping",
        property: "imageSourceRect",
        value: "clip:intersectParentOverflow+transform+fit:cover+crop",
        elementId: imageChild?.id,
        kind: "image",
        fallback: expect.objectContaining({ strategy: "sourceRectBeforeTransform" }),
      }),
    );
  });

  test("project reports unsupported semantics for filtered nodes without adding drawing records", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Filtered unsupported paint" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            display: "none",
            filter: "blur(3px)",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
          }}
        >
          Hidden transform
        </p>
      </>
    ));

    const compile = deck.compile();
    const hiddenId = H.textNodeIdBy(compile.graph!, "Hidden transform");
    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(project.projection?.slides[0]?.payload.drawing.children).toHaveLength(0);
    expect(project.summary?.filtered).toContainEqual(
      expect.objectContaining({
        reason: "displayNone",
        graphNodeId: hiddenId,
        textPreview: "Hidden transform",
      }),
    );
    expect(project.summary?.unsupportedSemantics).toEqual([]);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
        severity: "warning",
        notes: expect.arrayContaining([
          `graphNodeId=${hiddenId}`,
          "nodeKind=text",
          "feature=filter",
          "property=filter",
        ]),
      }),
    );
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render fallback inspection and origin", () => {
  test("project derives detailed paint fallback aggregation only when requested", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Paint fallback aggregation" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 3,
          height: 2,
          background: `url("/public/texture.png")`,
          backgroundRepeat: "space",
          filter: "blur(2px)",
        }}
      />
    ));

    const summaryProject = await deck.project();
    const detailedProject = await deck.project({ inspection: "details" });
    const fallbackEntries =
      detailedProject.summary?.details?.paintFallbackAggregation.entries ?? [];
    const backgroundFallback = fallbackEntries.find(
      (entry) => entry.feature === "background" && entry.property === "background",
    );
    const filterFallback = fallbackEntries.find(
      (entry) => entry.feature === "filter" && entry.property === "filter",
    );

    expect(summaryProject.ok).toBe(true);
    expect(summaryProject.summary?.details).toBeUndefined();
    expect(detailedProject.ok).toBe(true);
    expect(backgroundFallback).toEqual(
      expect.objectContaining({
        fallbackStrategy: "preserveAuthoredValueOnly",
        count: 1,
        slidePartIds: [detailedProject.projection?.slides[0]?.id],
        slideIds: [detailedProject.projection?.slides[0]?.payload.slideId],
        kinds: ["group"],
        values: [`url("/public/texture.png")`],
        preserves: expect.arrayContaining(["authoredBackgroundInput"]),
        missing: expect.arrayContaining(["pptxBackgroundLayer"]),
        recordIndexes: expect.arrayContaining([expect.any(Number)]),
      }),
    );
    expect(filterFallback).toEqual(
      expect.objectContaining({
        fallbackStrategy: "dropFilterEffect",
        count: 1,
        kinds: ["group"],
        values: ["blur(2px)"],
        preserves: expect.arrayContaining(["authoredFilter"]),
        missing: expect.arrayContaining(["filterEffect"]),
      }),
    );
  });

  test("project synthesizes a fallback frame for video without authored size", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Video" }, () => (
      <>
        <video
          data={H.dataUriFromBytes("video/mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))}
          posterData={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
        />
      </>
    ));

    const project = await deck.project();
    const video = project.projection?.slides[0]?.payload.drawing.children.find(
      (element) => element.kind === "video",
    );

    expect(project.ok).toBe(true);
    expect(video?.frame).toMatchObject({
      xEmu: 0,
      yEmu: 0,
      widthEmu: 4572000,
      heightEmu: 2571750,
    });
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
      }),
    );
    expect(
      project.diagnostics.items.some((item) =>
        item.notes?.some((note) => note === "fallbackStrategy=synthesizeFallbackFrame"),
      ),
    ).toBe(true);
  });

  test("explicit writer adapter format mismatches are warnings", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Adapter mismatch" }, () => <></>);
    const adapter: H.WriterAdapter<H.PptxPackageModel, "pdf"> = {
      kind: "deckjsx.writerAdapter",
      name: "fake-pdf",
      projectionFormat: "pptx",
      format: "pdf",
      options: {},
      async render() {
        return {
          diagnostics: H.createDiagnostics(),
          artifact: {
            format: "pdf",
            mediaType: "application/pdf",
            extension: "pdf",
            bytes: new Uint8Array([1, 2, 3]),
          },
        };
      },
    };

    const result = await deck.render(adapter);

    expect(result.ok).toBe(true);
    expect(result.artifact?.extension).toBe("pdf");
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_RENDER_ADAPTER_FORMAT_MISMATCH", severity: "warning" }),
    );
  });

  test("partial projection keeps computable elements for inspection", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Partially invalid" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 1, opacity: 0.4, filter: "blur(2px)" }}>Kept</p>
        <div
          style={{
            x: 3,
            y: 1,
            width: 2,
            height: 1,
            background: `url("/public/texture.png")`,
            backgroundRepeat: "space",
            boxShadow: "1px 1px 2px red, 2px 2px 4px blue",
          }}
        />
        <div style={{ x: "1qu" as never, y: 1, width: 2, height: 1 }} />
      </>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.stages.project.artifact).toBe("partial");
    expect(project.projection?.slides[0]?.payload.drawing.children).toHaveLength(2);
    const [text, view] = project.projection?.slides[0]?.payload.drawing.children ?? [];
    expect(project.summary?.slides[0]?.elements[0]?.textPreview).toBe("Kept");
    expect(project.summary?.slides[0]?.elements[0]?.resolvedValues?.frame).toBeDefined();
    expect(text?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "blur(2px)",
          fallback: expect.objectContaining({ strategy: "dropFilterEffect" }),
        }),
        expect.objectContaining({
          feature: "opacity",
          property: "stackingContext",
          value: "0.4",
          fallback: expect.objectContaining({
            strategy: "preserveOpacityWithoutCompositedSubtree",
          }),
        }),
      ]),
    );
    expect(view?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "background",
          property: "background",
          fallback: expect.objectContaining({ strategy: "preserveAuthoredValueOnly" }),
        }),
        expect.objectContaining({ feature: "shadow", property: "boxShadow" }),
      ]),
    );
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            `elementId=${view?.id}`,
            "feature=background",
            "property=background",
          ]),
        }),
        expect.objectContaining({
          code: "W_PROJECT_UNSUPPORTED_PPTX_SEMANTIC",
          severity: "warning",
          notes: expect.arrayContaining([
            `elementId=${view?.id}`,
            "feature=shadow",
            "property=boxShadow",
          ]),
        }),
      ]),
    );
    expect(project.summary?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "filter", property: "filter", elementId: text?.id }),
        expect.objectContaining({
          feature: "opacity",
          property: "stackingContext",
          elementId: text?.id,
        }),
        expect.objectContaining({
          feature: "background",
          property: "background",
          elementId: view?.id,
        }),
        expect.objectContaining({ feature: "shadow", property: "boxShadow", elementId: view?.id }),
      ]),
    );
  });

  test("projected element origins survive layout filtering and paint ordering", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Origin stability" }, () => (
      <>
        <p style={{ display: "none", x: 1, y: 1, width: 2, height: 1 }}>Hidden</p>
        <p style={{ zIndex: 10, x: 1, y: 1, width: 2, height: 1 }}>First</p>
        <p style={{ zIndex: 0, x: 1, y: 2, width: 2, height: 1 }}>Second</p>
      </>
    ));

    const compile = deck.compile();
    const hiddenId = H.textNodeIdBy(compile.graph!, "Hidden");
    const firstId = H.textNodeIdBy(compile.graph!, "First");
    const secondId = H.textNodeIdBy(compile.graph!, "Second");
    const project = await deck.project();
    const elements = project.projection?.slides[0]?.payload.drawing.children ?? [];
    const summaryElements = project.summary?.slides[0]?.elements ?? [];
    const filtered = project.summary?.filtered ?? [];

    expect(project.ok).toBe(true);
    expect(
      elements.map((element) => (element.kind === "text" ? element.content.text : "")),
    ).toEqual(["Second", "First"]);
    expect(elements.map((element) => element.zIndex)).toEqual([0, 10]);
    expect(elements[0]?.paintOrder).toMatchObject({ zIndex: 0, siblingOrder: 1 });
    expect(elements[1]?.paintOrder).toMatchObject({ zIndex: 10, siblingOrder: 0 });
    expect(summaryElements.map((element) => element.zIndex)).toEqual([0, 10]);
    expect(summaryElements.map((element) => element.resolvedValues?.zIndex)).toEqual([0, 10]);
    expect(elements[0]?.origin.graphNodeIds).toContain(secondId);
    expect(elements[0]?.origin.graphNodeIds).not.toContain(firstId);
    expect(elements[0]?.origin.graphNodeIds).not.toContain(hiddenId);
    expect(elements[1]?.origin.graphNodeIds).toContain(firstId);
    expect(filtered).toContainEqual(
      expect.objectContaining({
        reason: "displayNone",
        kind: "text",
        graphNodeId: hiddenId,
        textPreview: "Hidden",
        slidePartId: project.projection?.slides[0]?.id,
      }),
    );
  });

  test("project preserves source sibling order as the zIndex tie breaker", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Sibling order" }, () => (
      <>
        <p style={{ zIndex: 1, x: 1, y: 1, width: 2, height: 1 }}>One</p>
        <p style={{ zIndex: 1, x: 1, y: 2, width: 2, height: 1 }}>Two</p>
        <p style={{ zIndex: 1, x: 1, y: 3, width: 2, height: 1 }}>Three</p>
      </>
    ));

    const project = await deck.project();
    const elements = project.projection?.slides[0]?.payload.drawing.children ?? [];

    expect(project.ok).toBe(true);
    expect(
      elements.map((element) => (element.kind === "text" ? element.content.text : "")),
    ).toEqual(["One", "Two", "Three"]);
    expect(elements.map((element) => element.paintOrder.siblingOrder)).toEqual([0, 1, 2]);
    expect(elements.map((element) => element.paintOrderIndex)).toEqual([0, 1, 2]);
    expect(
      project.summary?.slides[0]?.elements.map((element) => element.paintOrder?.siblingOrder),
    ).toEqual([0, 1, 2]);
  });
});

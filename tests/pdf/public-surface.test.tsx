import { describe, expect, test } from "vite-plus/test";
import { unzlibSync } from "fflate";
import { Deck } from "@/src";
import { pdf, pptx } from "@/src/adapter";
import {
  integrationContextId,
  withRenderExecutionContext,
  type AssetLoader,
} from "@/src/integration";
import type { GraphNodeId } from "@/src/inspect";
import type {
  PdfLineVisualElement,
  PdfPageModel,
  PdfShapeVisualElement,
} from "@/src/projection/pdf/model";

describe("pdf public surface", () => {
  function expectPdfProjectionAvailable(result: Awaited<ReturnType<Deck["project"]>>) {
    expect(result.format).toBe("pdf");
    expect(result.ok).toBe(true);
    expect(result.projection?.format).toBe("pdf");
    expect(result.stages.project.artifact).toBe("available");
  }

  function expectPdfPageModel(value: unknown): PdfPageModel {
    expect(value).toMatchObject({ format: "pdf" });
    return value as PdfPageModel;
  }

  function firstPdfImageStreamData(bytes: Uint8Array | undefined): Uint8Array {
    expect(bytes).toBeInstanceOf(Uint8Array);
    const pdfText = new TextDecoder("latin1").decode(bytes);
    const imageIndex = pdfText.indexOf("/Subtype /Image");
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    const streamMarker = "stream";
    const streamStart = pdfText.indexOf(streamMarker, imageIndex);
    expect(streamStart).toBeGreaterThanOrEqual(0);
    let dataStart = streamStart + streamMarker.length;
    if (pdfText[dataStart] === "\r") {
      dataStart += 1;
    }
    if (pdfText[dataStart] === "\n") {
      dataStart += 1;
    }
    const dataEnd = pdfText.indexOf("\nendstream", dataStart);
    expect(dataEnd).toBeGreaterThan(dataStart);
    return bytes!.slice(dataStart, dataEnd);
  }

  function textNodeIdBy(
    graph: NonNullable<ReturnType<Deck["compile"]>["graph"]>,
    text: string,
  ): GraphNodeId | undefined {
    for (const node of graph.nodes.values()) {
      if (node.kind !== "text" || !Array.isArray(node.inlineChildren)) {
        continue;
      }
      const inlineText = node.inlineChildren
        .map((childId) => graph.nodes.get(childId as GraphNodeId))
        .filter((child) => child?.kind === "textRun")
        .map((child) => child.text)
        .join("");
      if (inlineText === text) {
        return node.id as GraphNodeId;
      }
    }
    return undefined;
  }

  test("exports a PDF writer adapter", () => {
    const adapter = pdf({ inspection: "none" });

    expect(adapter).toMatchObject({
      kind: "deckjsx.writerAdapter",
      name: "pdf",
      projectionFormat: "pdf",
      format: "pdf",
      options: { inspection: "none" },
    });
  });

  test("projects pdf for explicit project format", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expectPdfProjectionAvailable(result);
  });

  test("preserves overflow-clipped shape geometry and clip metadata", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Clipped shape" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          overflow: "hidden",
        }}
      >
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 1.5,
            top: 0,
            width: 1,
            height: 1,
            fill: "linear-gradient(90deg, #FF0000 0%, #0000FF 100%)",
            stroke: "2pt solid #111111",
            transform: "rotate(30deg)",
          }}
        />
      </div>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const visual = projection.pages[0]?.visuals?.find(
      (candidate): candidate is PdfShapeVisualElement =>
        candidate.kind === "shape" &&
        candidate.paintOrder.generatedLayerRole === "authored" &&
        candidate.fill?.kind === "linear-gradient",
    );
    const content = projection.pages[0]?.content ?? [];
    const clipBox = { x: 72, y: 72, width: 144, height: 72 };

    expect(result.ok).toBe(true);
    expect(visual).toMatchObject({
      box: { x: 180, y: 72, width: 72, height: 72 },
      clipBox,
      rotation: 30,
    });
    expect(content).toContainEqual(
      expect.objectContaining({
        op: "fillLinearGradientRect",
        box: { x: 180, y: 72, width: 72, height: 72 },
        clipBox,
      }),
    );
    expect(content).toContainEqual(
      expect.objectContaining({
        op: "strokeRect",
        box: { x: 180, y: 72, width: 72, height: 72 },
        clipBox,
      }),
    );
  });

  test("renders flow flex containers with auto content height to pdf", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Flow Auto Height" }, () => (
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12pt",
          padding: "18pt",
          width: 4,
          backgroundColor: "#F7F3EC",
        }}
      >
        <p style={{ fontSize: 18, margin: 0 }}>First flow line</p>
        <p style={{ fontSize: 14, margin: 0 }}>Second flow line</p>
      </main>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const backgroundVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape",
    );
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      box: expect.objectContaining({
        width: 288,
        height: expect.closeTo(86.4, 1),
      }),
    });
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({
      op: "text",
      text: "First flow line",
      x: 18,
      y: 18,
      fontSize: 18,
      box: expect.objectContaining({ height: expect.closeTo(21.6, 1) }),
    });
    expect(textOps[1]).toMatchObject({
      op: "text",
      text: "Second flow line",
      x: 18,
      y: 51.6,
      fontSize: 14,
      box: expect.objectContaining({ height: expect.closeTo(16.8, 1) }),
    });
  });

  test("sizes auto-height pdf text boxes for wrapped flow text", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Wrapped Auto Height" }, () => (
      <p style={{ width: "100pt", fontSize: 20, margin: 0 }}>Alpha beta gamma</p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];

    expect(projectResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[0]).toMatchObject({
      op: "text",
      text: "Alpha",
      x: 0,
      y: 0,
      fontSize: 20,
      box: expect.objectContaining({ width: 100, height: expect.closeTo(48, 1) }),
    });
    expect(textOps[1]).toMatchObject({ op: "text", text: "beta", y: 0 });
    expect(textOps[2]).toMatchObject({ op: "text", text: "gamma", x: 0, y: 24 });
  });

  test("rejects unknown project formats from JavaScript callers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({
      format: "odp",
      inspection: "none",
    } as never);

    expect(result.ok).toBe(false);
    expect(result.format).toBe("pptx");
    expect(result.projection).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PROJECT_FORMAT_INVALID" }),
    );
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("E_PROJECT_FAILED");
  });

  test("projects authored text into pdf page content operations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expectPdfProjectionAvailable(result);
    expect(projection.pages[0]?.content).toContainEqual(
      expect.objectContaining({ op: "text", text: "PDF" }),
    );
  });

  test("returns a PDF project inspection summary", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Summary" }, () => <p>PDF summary text</p>);

    const result = await deck.project({ format: "pdf", inspection: "summary" });

    expectPdfProjectionAvailable(result);
    expect(result.summary).toMatchObject({
      format: "pdf",
      slides: [
        expect.objectContaining({
          slideId: expect.any(String),
          name: "PDF Summary",
          elements: [expect.objectContaining({ kind: "text" })],
        }),
      ],
      pptx: {
        packageParts: [],
        relationshipCount: 0,
        packageDependencyCount: 0,
      },
    });
  });

  test("includes PDF image resources in project inspection media summary", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Media Summary" }, () => (
      <img data={pngData} style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1 }} />
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as { readonly media?: readonly unknown[] } | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.media).toContainEqual(
      expect.objectContaining({
        partPath: "pdf/images/Im1",
        sourceKind: "data",
        origin: expect.objectContaining({
          assetEntityIds: expect.arrayContaining([expect.any(String)]),
        }),
        metadata: expect.objectContaining({
          mediaType: "image/png",
          widthPx: 1,
          heightPx: 1,
        }),
      }),
    );
  });

  test("includes PDF media metrics in project inspection elements", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Media Metrics" }, () => (
      <img
        data={pngData}
        style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1, objectFit: "fill" }}
      />
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.elements?.[0]).toMatchObject({
      kind: "image",
      mediaMetrics: expect.objectContaining({
        sourceKind: "data",
        fit: "stretch",
        cropped: false,
      }),
    });
  });

  test("preserves contained PDF media fit in project inspection elements", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AIi2L3//Z";
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Contain Metrics" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          objectFit: "contain",
          objectPosition: "right bottom",
        }}
      />
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.elements?.[0]).toMatchObject({
      kind: "image",
      mediaMetrics: expect.objectContaining({
        fit: "contain",
        objectPosition: { x: 1, y: 1 },
        cropped: false,
      }),
    });
  });

  test("approximates solid group blur filters with layered pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Blur Filter" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          filter: "blur(2px)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(blurVisuals.map((visual) => (visual.kind === "shape" ? visual.box : undefined))).toEqual(
      [
        { x: 70, y: 70, width: 148, height: 76 },
        {
          x: 70.66666666666667,
          y: 70.66666666666667,
          width: 146.66666666666666,
          height: 74.66666666666667,
        },
        {
          x: 71.33333333333333,
          y: 71.33333333333333,
          width: 145.33333333333334,
          height: 73.33333333333333,
        },
        { x: 72, y: 72, width: 144, height: 72 },
      ],
    );
    expect(
      blurVisuals.map((visual) =>
        visual.kind === "shape" && visual.fill?.opacity !== undefined
          ? Number(visual.fill.opacity.toFixed(4))
          : undefined,
      ),
    ).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(2px)" }),
    );
  });

  test("preserves rounded group blur filters with layered pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Rounded Blur Filter" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          borderRadius: "12pt",
          filter: "blur(2px)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(
      blurVisuals.map((visual) => (visual.kind === "shape" ? visual.shape : undefined)),
    ).toEqual(["roundRect", "roundRect", "roundRect", "roundRect"]);
    expect(
      blurVisuals.map((visual) => (visual.kind === "shape" ? visual.radius : undefined)),
    ).toEqual([14, 13.333333333333334, 12.666666666666666, 12]);
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(2px)" }),
    );
  });

  test("approximates solid shape blur filters with layered pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Shape Blur Filter" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "blur(2px)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const authoredVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(authoredVisuals).toHaveLength(0);
    expect(
      blurVisuals.map((visual) => (visual.kind === "shape" ? visual.shape : undefined)),
    ).toEqual(["rect", "rect", "rect", "rect"]);
    expect(blurVisuals.map((visual) => (visual.kind === "shape" ? visual.box : undefined))).toEqual(
      [
        { x: 70, y: 70, width: 148, height: 76 },
        {
          x: 70.66666666666667,
          y: 70.66666666666667,
          width: 146.66666666666666,
          height: 74.66666666666667,
        },
        {
          x: 71.33333333333333,
          y: 71.33333333333333,
          width: 145.33333333333334,
          height: 73.33333333333333,
        },
        { x: 72, y: 72, width: 144, height: 72 },
      ],
    );
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(2px)" }),
    );
  });

  test("approximates solid shape inch blur filters with layered pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Inch Blur Filter" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "blur(0.05in)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(blurVisuals[0]).toMatchObject({
      kind: "shape",
      box: { x: 68.4, y: 68.4, width: 151.2, height: 79.2 },
    });
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(0.05in)" }),
    );
  });

  test("approximates solid shape rem blur filters with layered pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Rem Blur Filter" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "blur(0.25rem)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(blurVisuals[0]).toMatchObject({
      kind: "shape",
      box: { x: 69, y: 69, width: 150, height: 78 },
    });
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(0.25rem)" }),
    );
  });

  test("approximates solid shape em blur filters with default font-size context", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Em Blur Filter" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "blur(0.25em)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(blurVisuals[0]).toMatchObject({
      kind: "shape",
      box: { x: 69, y: 69, width: 150, height: 78 },
    });
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(0.25em)" }),
    );
  });

  test("approximates solid shape ch blur filters with default font-size context", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Ch Blur Filter" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "blur(0.5ch)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(blurVisuals[0]).toMatchObject({
      kind: "shape",
      box: { x: 69, y: 69, width: 150, height: 78 },
    });
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(0.5ch)" }),
    );
  });

  test("approximates solid shape viewport-width blur filters with layered pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Viewport Blur Filter" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "blur(1vw)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(blurVisuals[0]).toMatchObject({
      kind: "shape",
      box: { x: 64.8, y: 64.8, width: 158.4, height: 86.4 },
    });
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(1vw)" }),
    );
  });

  test("rotates solid shape blur filter layers around the shape frame", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Rotated Shape Blur Filter" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "blur(2px)",
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const blurOps = content.filter((op) => op.op === "fillRect");
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(blurVisuals).toEqual(
      blurVisuals.map(() =>
        expect.objectContaining({
          kind: "shape",
          rotation: 90,
          rotationBox: { x: 72, y: 72, width: 144, height: 72 },
        }),
      ),
    );
    expect(blurOps).toEqual(
      blurOps.map(() =>
        expect.objectContaining({
          op: "fillRect",
          rotation: 90,
          rotationBox: { x: 72, y: 72, width: 144, height: 72 },
        }),
      ),
    );
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(2px)" }),
    );
  });

  test("expands solid roundRect blur filter radius with layered pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF RoundRect Blur Filter" }, () => (
      <shape
        shape="roundRect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "blur(2px)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const authoredVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(authoredVisuals).toHaveLength(0);
    expect(
      blurVisuals.map((visual) => (visual.kind === "shape" ? visual.shape : undefined)),
    ).toEqual(["roundRect", "roundRect", "roundRect", "roundRect"]);
    expect(
      blurVisuals.map((visual) => (visual.kind === "shape" ? visual.radius : undefined)),
    ).toEqual([14, 13.333333333333334, 12.666666666666666, 12]);
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(2px)" }),
    );
  });

  test("approximates solid ellipse blur filters with layered pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF Ellipse Blur Filter" }, () => (
      <shape
        shape="ellipse"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "blur(2px)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const authoredVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(blurVisuals).toHaveLength(4);
    expect(authoredVisuals).toHaveLength(0);
    expect(
      blurVisuals.map((visual) => (visual.kind === "shape" ? visual.shape : undefined)),
    ).toEqual(["ellipse", "ellipse", "ellipse", "ellipse"]);
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "filter", property: "filter", value: "blur(2px)" }),
    );
  });

  test("aggregates PDF fallback semantics in detailed inspection", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Unsupported Details" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "saturate(120%) blur(2px)",
        }}
      />
    ));

    const result = await deck.project({ format: "pdf", inspection: "details" });
    const summary = result.summary as
      | {
          readonly details?: {
            readonly paintFallbackAggregation?: {
              readonly entries?: readonly unknown[];
            };
          };
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.details?.paintFallbackAggregation?.entries).toContainEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        count: 1,
        slideIds: expect.arrayContaining([expect.any(String)]),
        elementIds: expect.arrayContaining([expect.any(String)]),
        kinds: expect.arrayContaining(["shape"]),
        values: expect.arrayContaining(["saturate(120%) blur(2px)"]),
        missing: expect.arrayContaining(["filterEffect"]),
      }),
    );
  });

  test("includes small PDF image warnings in project inspection visual checks", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Small Media" }, () => (
      <img
        data={pngData}
        style={{ position: "absolute", left: 1, top: 1, width: 0.25, height: 0.25 }}
      />
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly visualChecks?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.visualChecks).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "W_VISUAL_MEDIA_SMALL",
        kind: "image",
        message: expect.stringContaining("smaller than 0.5in"),
        metrics: expect.objectContaining({
          sourceKind: "data",
          cropped: false,
        }),
      }),
    );
  });

  test("includes cropped PDF image info in project inspection visual checks", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AIi2L3//Z";
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Cropped Media" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          objectFit: "cover",
        }}
      />
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly visualChecks?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.visualChecks).toContainEqual(
      expect.objectContaining({
        severity: "info",
        code: "I_VISUAL_MEDIA_CROPPED",
        kind: "image",
        message: expect.stringContaining("cropped"),
        metrics: expect.objectContaining({
          cropped: true,
          fit: "cover",
        }),
      }),
    );
  });

  test("includes small PDF text warnings in project inspection visual checks", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Small Text" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5, fontSize: 5 }}>
        Tiny PDF label
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly visualChecks?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.visualChecks).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "W_VISUAL_TEXT_SMALL",
        kind: "text",
        textPreview: "Tiny PDF label",
        message: expect.stringContaining("5pt"),
        metrics: expect.objectContaining({
          fontSizePt: 5,
          characterCount: 14,
        }),
      }),
    );
  });

  test("includes PDF text metrics in project inspection elements", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Text Metrics" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5, fontSize: 12 }}>
        Metric text
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.elements?.[0]).toMatchObject({
      kind: "text",
      textPreview: "Metric text",
      textMetrics: expect.objectContaining({
        characterCount: 11,
        fontSizePt: 12,
        availableWidthPt: 216,
        availableHeightPt: 36,
      }),
    });
  });

  test("preserves PDF text fit and wrap in project inspection elements", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Text Fit Metrics" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "33pt",
          height: 1,
          fontSize: 20,
          fit: "shrink",
          whiteSpace: "nowrap",
        }}
      >
        ABCDEF
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.elements?.[0]).toMatchObject({
      kind: "text",
      textPreview: "ABCDEF",
      textMetrics: expect.objectContaining({
        availableWidthPt: 33,
        estimatedLineCount: 1,
        fit: "shrink",
        wrap: false,
      }),
    });
  });

  test("preserves PDF text direction in project inspection metrics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Text Direction Metrics" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          fontSize: 24,
          writingMode: "vertical-rl",
        }}
      >
        Tall
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.elements?.[0]).toMatchObject({
      kind: "text",
      rotation: 270,
      textPreview: "Tall",
      textMetrics: expect.objectContaining({
        textDirection: "vert270",
      }),
    });
  });

  test("resizes PDF text boxes for resize fit without unsupported semantic fallbacks", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Resize Fit Metrics" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 0.8,
          height: 0.25,
          backgroundColor: "#EEF2FF",
          border: "1pt solid #334455",
          fit: "resize",
          margin: 0,
        }}
      >
        Resize autofit text should be called out separately
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const projection = expectPdfPageModel(result.projection);
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements?: readonly unknown[];
            readonly visualChecks?: readonly unknown[];
          }[];
          readonly unsupportedSemantics?: readonly unknown[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    const textVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.text === "Resize",
    );
    const backgroundVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      box: expect.objectContaining({
        width: 57.6,
        height: expect.closeTo(169.2, 5),
      }),
    });
    expect(textVisual).toMatchObject({
      kind: "text",
      style: expect.objectContaining({ fit: "resize" }),
      box: expect.objectContaining({
        width: 57.6,
        height: expect.closeTo(169.2, 5),
      }),
    });
    expect(summary?.slides?.[0]?.elements).toContainEqual(
      expect.objectContaining({
        kind: "text",
        textPreview: "Resize",
        textMetrics: expect.objectContaining({
          fit: "resize",
          wrap: true,
          availableHeightPt: expect.closeTo(169.2, 5),
          estimatedLineCapacity: 7,
        }),
      }),
    );
    expect(summary?.slides?.[0]?.visualChecks).not.toContainEqual(
      expect.objectContaining({ code: "W_VISUAL_TEXT_MAY_RESIZE" }),
    );
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({ feature: "layout", property: "fit", value: "resize" }),
    );
  });

  test("includes PDF element frames in project inspection elements", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Element Frames" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 2, height: 0.5, fontSize: 12 }}>
        Framed
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.elements?.[0]).toMatchObject({
      kind: "text",
      frame: {
        xEmu: 914400,
        yEmu: 914400,
        widthEmu: 1828800,
        heightEmu: 457200,
      },
    });
  });

  test("includes PDF element origins in project inspection elements", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Element Origins" }, () => (
      <>
        <p style={{ position: "absolute", zIndex: 10, left: 1, top: 1, width: 2, height: 0.5 }}>
          First
        </p>
        <p style={{ position: "absolute", zIndex: 0, left: 1, top: 2, width: 2, height: 0.5 }}>
          Second
        </p>
      </>
    ));

    const compile = deck.compile();
    const firstId = textNodeIdBy(compile.graph!, "First");
    const secondId = textNodeIdBy(compile.graph!, "Second");
    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements?: readonly {
              readonly kind?: unknown;
              readonly origin?: { readonly graphNodeIds?: readonly unknown[] };
              readonly textPreview?: unknown;
            }[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    const textElements =
      summary?.slides?.[0]?.elements?.filter((element) => element.kind === "text") ?? [];
    expect(textElements).toHaveLength(2);
    expect(textElements[0]).toMatchObject({
      textPreview: "Second",
      origin: { graphNodeIds: expect.arrayContaining([secondId]) },
    });
    expect(textElements[0]?.origin?.graphNodeIds).not.toContain(firstId);
    expect(textElements[1]).toMatchObject({
      textPreview: "First",
      origin: { graphNodeIds: expect.arrayContaining([firstId]) },
    });
  });

  test("includes PDF table generated visual origins in project inspection elements", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Table Origins" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          backgroundColor: "#EEF2FF",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF", border: "1pt solid #112233" }}>Cell</td>
          </tr>
        </tbody>
      </table>
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements?: readonly {
              readonly kind?: unknown;
              readonly origin?: { readonly graphNodeIds?: readonly unknown[] };
              readonly paintOrder?: { readonly generatedLayerRole?: unknown };
            }[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    const generatedBackgrounds =
      summary?.slides?.[0]?.elements?.filter(
        (element) =>
          element.kind === "shape" && element.paintOrder?.generatedLayerRole === "background",
      ) ?? [];
    expect(generatedBackgrounds.length).toBeGreaterThan(0);
    expect(
      generatedBackgrounds.some((element) => (element.origin?.graphNodeIds?.length ?? 0) > 0),
    ).toBe(true);
  });

  test("includes PDF paint order in project inspection elements", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Paint Order" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 0.5,
          backgroundColor: "#DDEEFF",
          fontSize: 12,
        }}
      >
        Ordered
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.elements).toContainEqual(
      expect.objectContaining({
        kind: "shape",
        paintOrderIndex: 0,
        paintOrder: expect.objectContaining({
          generatedLayerRole: "background",
        }),
      }),
    );
    expect(summary?.slides?.[0]?.elements).toContainEqual(
      expect.objectContaining({
        kind: "text",
        textPreview: "Ordered",
        paintOrderIndex: 1,
        paintOrder: expect.objectContaining({
          generatedLayerRole: "authored",
        }),
      }),
    );
  });

  test("includes PDF composed paint order details only for detailed inspection", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Paint Order Details" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 0.5,
          backgroundColor: "#DDEEFF",
          fontSize: 12,
        }}
      >
        Detailed
      </p>
    ));

    const summaryResult = await deck.project({ format: "pdf", inspection: "summary" });
    const detailedResult = await deck.project({ format: "pdf", inspection: "details" });
    const summary = summaryResult.summary as { readonly details?: unknown } | undefined;
    const detailed = detailedResult.summary as
      | {
          readonly details?: {
            readonly composedPaintOrder?: readonly {
              readonly entries?: readonly {
                readonly kind?: unknown;
                readonly origin?: { readonly graphNodeIds?: readonly unknown[] };
                readonly paintOrder?: { readonly generatedLayerRole?: unknown };
                readonly source?: unknown;
              }[];
            }[];
          };
        }
      | undefined;

    expectPdfProjectionAvailable(summaryResult);
    expectPdfProjectionAvailable(detailedResult);
    expect(summary?.details).toBeUndefined();
    expect(detailed?.details?.composedPaintOrder?.[0]?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "visualElement",
          kind: "shape",
          paintOrder: expect.objectContaining({ generatedLayerRole: "background" }),
          origin: expect.objectContaining({
            graphNodeIds: expect.arrayContaining([expect.any(String)]),
          }),
        }),
        expect.objectContaining({
          source: "visualElement",
          kind: "text",
          paintOrder: expect.objectContaining({ generatedLayerRole: "authored" }),
          origin: expect.objectContaining({
            graphNodeIds: expect.arrayContaining([expect.any(String)]),
          }),
        }),
      ]),
    );
  });

  test("includes PDF slide background origins in detailed paint order", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide(
      {
        name: "PDF Slide Background Origin",
        style: { backgroundColor: "#112233" },
      },
      () => <p>Foreground</p>,
    );

    const result = await deck.project({ format: "pdf", inspection: "details" });
    const summary = result.summary as
      | {
          readonly details?: {
            readonly composedPaintOrder?: readonly {
              readonly entries?: readonly {
                readonly origin?: { readonly graphNodeIds?: readonly unknown[] };
                readonly paintOrder?: { readonly generatedLayerRole?: unknown };
                readonly source?: unknown;
              }[];
            }[];
          };
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.details?.composedPaintOrder?.[0]?.entries).toContainEqual(
      expect.objectContaining({
        source: "visualElement",
        paintOrder: expect.objectContaining({ generatedLayerRole: "background" }),
        origin: expect.objectContaining({
          graphNodeIds: expect.arrayContaining([expect.any(String)]),
        }),
      }),
    );
  });

  test("includes PDF effective projected style details for detailed inspection", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Effective Style Details" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 0.5,
          fontSize: 18,
          opacity: 0.5,
          transform: "rotate(90deg)",
          zIndex: 3,
        }}
      >
        Styled
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "details" });
    const summary = result.summary as
      | {
          readonly details?: {
            readonly effectiveProjectedStyles?: readonly {
              readonly entries?: readonly unknown[];
            }[];
          };
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.details?.effectiveProjectedStyles?.[0]?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "text",
          paintOrder: expect.objectContaining({ zIndex: 3 }),
          origin: expect.objectContaining({
            graphNodeIds: expect.arrayContaining([expect.any(String)]),
          }),
          values: expect.objectContaining({
            frame: {
              xEmu: 914400,
              yEmu: 914400,
              widthEmu: 1828800,
              heightEmu: 457200,
            },
            opacity: 0.5,
            rotation: 90,
            zIndex: 3,
            textStyle: expect.objectContaining({ fontSizePt: 18 }),
          }),
        }),
      ]),
    );
  });

  test("includes PDF text overflow warnings in project inspection visual checks", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Overflow Text" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 0.75,
          height: 0.2,
          fontSize: 20,
        }}
      >
        One Two Three
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly visualChecks?: readonly unknown[];
          }[];
        }
      | undefined;

    expectPdfProjectionAvailable(result);
    expect(summary?.slides?.[0]?.visualChecks).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "W_VISUAL_TEXT_MAY_OVERFLOW",
        kind: "text",
        message: expect.stringContaining("may overflow or clip"),
        metrics: expect.objectContaining({
          estimatedLineCount: expect.any(Number),
          estimatedLineCapacity: 1,
        }),
      }),
    );
  });

  test("does not report padded one-line auto-height PDF text as overflowing", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Padded PDF auto height" }, () => (
      <p style={{ width: 4, fontSize: 15, lineHeight: 1.2, padding: 0.14, margin: 0 }}>
        One padded line
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "summary" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly elements: readonly {
              readonly kind: string;
              readonly textMetrics?: unknown;
            }[];
            readonly visualChecks?: readonly { readonly code: string }[];
          }[];
        }
      | undefined;
    const slide = summary?.slides?.[0];
    const text = slide?.elements.find((element) => element.kind === "text");

    expectPdfProjectionAvailable(result);
    expect(text?.textMetrics).toMatchObject({
      lineHeightPt: 18,
      estimatedLineCount: 1,
      estimatedLineCapacity: 1,
    });
    expect(slide?.visualChecks).not.toContainEqual(
      expect.objectContaining({ code: "W_VISUAL_TEXT_MAY_OVERFLOW" }),
    );
  });

  test("projects authored text into pdf visual elements before content operations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Visual" }, () => (
      <p style={{ color: "#336699", fontSize: 24 }}>PDF visual text</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const visual = projection.pages[0]?.visuals?.find((item) => item.kind === "text");
    const content = projection.pages[0]?.content.find((item) => item.op === "text");

    expectPdfProjectionAvailable(result);
    expect(visual).toMatchObject({
      kind: "text",
      text: "PDF visual text",
      style: {
        fontSize: 24,
        color: { r: 0.2, g: 0.4, b: 0.6 },
      },
    });
    expect(visual?.fontId).toBe(content?.fontId);
    expect(content).toMatchObject({
      op: "text",
      text: "PDF visual text",
      fontSize: 24,
      color: { r: 0.2, g: 0.4, b: 0.6 },
    });
  });

  test("projects text font resources for pdf writer validation", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");

    expectPdfProjectionAvailable(result);
    expect(textOp).toMatchObject({ op: "text", text: "PDF" });
    expect(textOp?.fontId).toEqual(expect.any(String));
    expect(projection.pages[0]?.resources.fonts).toContain(textOp?.fontId);
    expect(projection.resources.fonts.map((font) => font.id)).toContain(textOp?.fontId);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_MODEL_TEXT_MISSING_FONT_RESOURCE",
    );
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_MODEL_PAGE_MISSING_FONT_RESOURCE",
    );
  });

  test("reports missing asset context for local pdf image assets", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Unsupported PDF" }, () => (
      <>
        <p>Supported text</p>
        <img
          src="chart.png"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expect(result.ok).toBe(false);
    expect(result.format).toBe("pdf");
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PROJECT_ASSET_CONTEXT_MISSING" }),
    );
  });

  test("renders authored text into pdf content bytes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.render(pdf({ inspection: "none" }));
    const bytes = new TextDecoder().decode(result.artifact?.bytes);

    expect(result.ok).toBe(true);
    expect(bytes).toContain("(PDF) Tj");
  });

  test("returns a PDF render inspection summary", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF Render Summary" }, () => <p>PDF render summary</p>);

    const result = await deck.render(pdf({ inspection: "summary" }));

    expect(result.ok).toBe(true);
    expect(result.artifact?.format).toBe("pdf");
    expect(result.summary).toMatchObject({
      assembly: {
        entryCount: 1,
        rebuiltCount: 1,
        reusedCount: 0,
        missingCount: 0,
        failedCount: 0,
        entries: [
          expect.objectContaining({
            path: "document.pdf",
            status: "rebuilt",
            reason: "contentChanged",
          }),
        ],
      },
    });
  });

  test("projects centered text into an aligned pdf text position", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Centered PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          fontSize: 20,
          textAlign: "center",
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({
      op: "text",
      text: "PDF",
      x: 196,
      y: 72,
      fontSize: 20,
    });
    expect(bytes).toContain("1 0 0 1 196 313 Tm");
  });

  test("projects justified pdf text by expanding word positions", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Justified PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          fontSize: 20,
          textAlign: "justify",
          whiteSpace: "nowrap",
        }}
      >
        A B C
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[0]).toMatchObject({ op: "text", text: "A", x: 72, y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "B", x: 100.78, y: 72, fontSize: 20 });
    expect(textOps[2]).toMatchObject({ op: "text", text: "C", x: 129.56, y: 72, fontSize: 20 });
    expect(bytes).toContain("(A) Tj");
    expect(bytes).toContain("(B) Tj");
    expect(bytes).toContain("(C) Tj");
    expect(bytes).not.toContain("(A B C) Tj");
  });

  test("justifies wrapped pdf text without double-counting preserved spaces", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Justified Wrapped PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          fontSize: 20,
          textAlign: "justify",
        }}
      >
        A B C
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[0]).toMatchObject({ op: "text", text: "A", x: 72, y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "B", x: 100.78, y: 72, fontSize: 20 });
    expect(textOps[2]).toMatchObject({ op: "text", text: "C", x: 129.56, y: 72, fontSize: 20 });
    expect(bytes).not.toContain("(A B C) Tj");
  });

  test("projects padded text into the pdf text content box", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Padded PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          fontSize: 20,
          padding: ["10pt", "30pt", "12pt", "20pt"],
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({
      op: "text",
      text: "PDF",
      x: 92,
      y: 82,
      fontSize: 20,
    });
    expect(bytes).toContain("1 0 0 1 92 303 Tm");
  });

  test("projects text indentation into the first pdf text line", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Indented PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          fontSize: 20,
          textIndent: "18pt",
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({
      op: "text",
      text: "PDF",
      x: 90,
      y: 72,
      fontSize: 20,
    });
    expect(bytes).toContain("1 0 0 1 90 313 Tm");
  });

  test("applies text indentation only to the first wrapped pdf text line", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrapped Indent PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 2,
          fontSize: 20,
          textIndent: "18pt",
        }}
      >
        One Two
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];

    expect(projectResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "One", x: 90, y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "Two", x: 72, y: 96, fontSize: 20 });
  });

  test("projects paragraph spacing before into the pdf text line y position", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Paragraph Before PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          fontSize: 20,
          paragraphSpacingBefore: "12pt",
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({
      op: "text",
      text: "PDF",
      x: 72,
      y: 84,
      fontSize: 20,
    });
    expect(bytes).toContain("1 0 0 1 72 301 Tm");
  });

  test("uses paragraph spacing after when bottom-aligning pdf text", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Paragraph After PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          fontSize: 20,
          paragraphSpacingAfter: "12pt",
          verticalAlign: "bottom",
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({
      op: "text",
      text: "PDF",
      x: 72,
      y: 112,
      fontSize: 20,
    });
    expect(bytes).toContain("1 0 0 1 72 273 Tm");
  });

  test("projects middle-aligned text into the pdf text content box", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Middle PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          fontSize: 20,
          verticalAlign: "middle",
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({
      op: "text",
      text: "PDF",
      x: 72,
      y: 98,
      fontSize: 20,
    });
    expect(bytes).toContain("1 0 0 1 72 287 Tm");
  });

  test("projects and renders rich text runs as positioned pdf text operations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Rich PDF" }, () => (
      <p style={{ color: "#111111", fontSize: 20, margin: 0 }}>
        Sales <span style={{ color: "#DC2626" }}>grew</span> YoY
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[0]).toMatchObject({
      op: "text",
      text: "Sales ",
      x: 0,
      y: 0,
      fontSize: 20,
      color: { r: 0x11 / 255, g: 0x11 / 255, b: 0x11 / 255 },
    });
    expect(textOps[1]).toMatchObject({
      op: "text",
      text: "grew",
      x: expect.closeTo(55.58, 5),
      y: 0,
      fontSize: 20,
      color: { r: 0xdc / 255, g: 0x26 / 255, b: 0x26 / 255 },
    });
    expect(textOps[2]).toMatchObject({
      op: "text",
      text: " YoY",
      x: expect.closeTo(98.92, 5),
      y: 0,
      fontSize: 20,
      color: { r: 0x11 / 255, g: 0x11 / 255, b: 0x11 / 255 },
    });
    expect(bytes.match(/\(Sales \) Tj/g)).toHaveLength(1);
    expect(bytes.match(/\(grew\) Tj/g)).toHaveLength(1);
    expect(bytes.match(/\( YoY\) Tj/g)).toHaveLength(1);
    expect(bytes).not.toContain("(Sales grew YoY) Tj");
  });

  test("uses Helvetica-Bold metrics between centered rich text runs", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Centered Bold Metrics PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 5,
          height: 0.5,
          fontSize: 17,
          textAlign: "center",
        }}
      >
        Prefix <span style={{ fontWeight: 700 }}>rich red</span> suffix
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const richRed = textOps.find((op) => op.op === "text" && op.text === "rich red");
    const suffix = textOps.find((op) => op.op === "text" && op.text === " suffix");

    expect(result.ok).toBe(true);
    expect(richRed).toMatchObject({ op: "text", fontSize: 17 });
    expect(suffix).toMatchObject({ op: "text", fontSize: 17 });
    expect(
      (suffix?.op === "text" ? suffix.x : 0) - (richRed?.op === "text" ? richRed.x : 0),
    ).toBeCloseTo(62.356, 2);
  });

  test("projects and renders default bold italic text as a standard pdf font", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Bold Italic PDF" }, () => (
      <p style={{ fontWeight: 700, fontStyle: "italic" }}>Bold Italic</p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const font = projection.resources.fonts.find((resource) => resource.id === textOp?.fontId);
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({ op: "text", text: "Bold Italic" });
    expect(font).toMatchObject({
      family: "Helvetica",
      weight: 700,
      style: "italic",
      fallback: false,
    });
    expect(bytes).toContain("/BaseFont /Helvetica-BoldOblique");
  });

  test("projects inline bold spans as separate standard pdf font resources", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Inline Bold PDF" }, () => (
      <p>
        Plain <span style={{ fontWeight: 700 }}>Bold</span>
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const boldFont = projection.resources.fonts.find(
      (resource) => resource.id === textOps[1]?.fontId,
    );
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "Plain " });
    expect(textOps[1]).toMatchObject({ op: "text", text: "Bold" });
    expect(textOps[1]?.fontId).not.toBe(textOps[0]?.fontId);
    expect(boldFont).toMatchObject({
      family: "Helvetica",
      weight: 700,
      style: "normal",
      fallback: false,
    });
    expect(bytes).toContain("/BaseFont /Helvetica-Bold");
  });

  test("projects and renders text letter spacing as pdf character spacing", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Letter Spacing PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          fontSize: 20,
          letterSpacing: 1.5,
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({
      op: "text",
      text: "PDF",
      x: 72,
      y: 72,
      fontSize: 20,
      charSpacing: 1.5,
    });
    expect(bytes.indexOf("1.5 Tc")).toBeLessThan(bytes.indexOf("(PDF) Tj"));
    expect(bytes.indexOf("(PDF) Tj")).toBeLessThan(bytes.indexOf("0 Tc"));
  });

  test("projects pdf tab stops as separate text positions", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Tab Stop PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          fontSize: 20,
          tabStops: [{ position: "1.5in", alignment: "left" }],
        }}
      >
        {"Alpha\tBeta"}
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "Alpha", x: 72, y: 72 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "Beta", x: 180, y: 72 });
    expect(bytes).toContain("(Alpha) Tj");
    expect(bytes).toContain("(Beta) Tj");
    expect(bytes).not.toContain("(Alpha\\tBeta) Tj");
  });

  test("projects right-aligned pdf tab stops using the following segment width", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Right Tab Stop PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          fontSize: 20,
          tabStops: [{ position: "1.5in", alignment: "right" }],
        }}
      >
        {"Alpha\tBeta"}
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "Alpha", x: 72, y: 72 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "Beta", x: 138.86, y: 72 });
    expect(bytes).toContain("1 0 0 1 138.86 313 Tm");
  });

  test("projects right-aligned pdf tab stops across following inline runs", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Right Tab Stop Rich Run PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          fontSize: 20,
          tabStops: [{ position: "1.5in", alignment: "right" }],
        }}
      >
        {"Label\t"}
        <span style={{ fontWeight: 700 }}>Beta</span>
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "Label", x: 72, y: 72 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "Beta", x: 138.86, y: 72 });
    expect(bytes).toContain("1 0 0 1 138.86 313 Tm");
  });

  test("does not shrink right-aligned pdf tab stops across following inline runs that already fit", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Right Tab Stop Rich Run Shrink PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1.8,
          height: 1,
          fit: "shrink",
          fontSize: 20,
          tabStops: [{ position: "1.5in", alignment: "right" }],
        }}
      >
        {"Label\t"}
        <span style={{ fontWeight: 700 }}>Beta</span>
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "Label", fontSize: 20 });
    expect(textOps[1]).toMatchObject({
      op: "text",
      text: "Beta",
      x: 138.86,
      y: 72,
      fontSize: 20,
    });
    expect(bytes).toContain("1 0 0 1 138.86 313 Tm");
  });

  test("projects decimal-aligned pdf tab stops using the following segment decimal point", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Decimal Tab Stop PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          fontSize: 20,
          tabStops: [{ position: "1.5in", alignment: "decimal" }],
        }}
      >
        {"Total\t123.45"}
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "Total", x: 72, y: 72 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "123.45", x: 146.64, y: 72 });
    expect(bytes).toContain("1 0 0 1 146.64 313 Tm");
  });

  test("projects and renders superscript text as pdf text rise", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Superscript PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          fontSize: 20,
        }}
      >
        H<span style={{ superscript: true }}>2</span>O
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[1]).toMatchObject({
      op: "text",
      text: "2",
      fontSize: 13,
      textRise: 7,
    });
    expect(bytes.indexOf("7 Ts")).toBeLessThan(bytes.indexOf("(2) Tj"));
    expect(bytes.indexOf("(2) Tj")).toBeLessThan(bytes.indexOf("0 Ts"));
  });

  test("projects and renders subscript text as negative pdf text rise", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Subscript PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          fontSize: 20,
        }}
      >
        H<span style={{ subscript: true }}>2</span>O
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[1]).toMatchObject({
      op: "text",
      text: "2",
      fontSize: 13,
      textRise: -4,
    });
    expect(bytes.indexOf("-4 Ts")).toBeLessThan(bytes.indexOf("(2) Tj"));
    expect(bytes.indexOf("(2) Tj")).toBeLessThan(bytes.indexOf("0 Ts"));
  });

  test("projects explicit text newlines as separate pdf text operations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Multiline PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 2,
          fontSize: 20,
          lineHeight: "30pt",
        }}
      >
        {"One\nTwo"}
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({
      op: "text",
      text: "One",
      x: 72,
      y: 72,
      fontSize: 20,
    });
    expect(textOps[1]).toMatchObject({
      op: "text",
      text: "Two",
      x: 72,
      y: 102,
      fontSize: 20,
    });
    expect(bytes).toContain("1 0 0 1 72 313 Tm");
    expect(bytes).toContain("1 0 0 1 72 283 Tm");
    expect(bytes).not.toContain("(One\\nTwo) Tj");
  });

  test("uses normal text line height for multiline pdf text", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Normal Line Height PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 2,
          fontSize: 20,
        }}
      >
        {"One\nTwo"}
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];

    expect(projectResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "One", y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "Two", y: 96, fontSize: 20 });
  });

  test("wraps pdf text at word boundaries using the text content box width", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrapped PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 0.75,
          height: 2,
          fontSize: 20,
        }}
      >
        One Two
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "One", x: 72, y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "Two", x: 72, y: 96, fontSize: 20 });
    expect(bytes.match(/\(One\) Tj/g)).toHaveLength(1);
    expect(bytes.match(/\(Two\) Tj/g)).toHaveLength(1);
    expect(bytes).not.toContain("(One Two) Tj");
  });

  test("preserves spaces between pdf words that remain on the same wrapped line", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrapped PDF Spaces" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "86pt",
          height: 2,
          fontSize: 20,
        }}
      >
        One Two Three
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[0]).toMatchObject({ op: "text", text: "One", x: 72, y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "Two", x: 115.36, y: 72, fontSize: 20 });
    expect(textOps[2]).toMatchObject({ op: "text", text: "Three", x: 72, y: 96, fontSize: 20 });
    expect(bytes.match(/\(One\) Tj/g)).toHaveLength(1);
    expect(bytes.match(/\(Two\) Tj/g)).toHaveLength(1);
    expect(bytes.match(/\(Three\) Tj/g)).toHaveLength(1);
  });

  test("uses Helvetica-compatible text widths when wrapping pdf words", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrapped PDF Helvetica Widths" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "86pt",
          height: 2,
          fontSize: 20,
        }}
      >
        This file wraps
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];

    expect(projectResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[0]).toMatchObject({ op: "text", text: "This", x: 72, y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "file", y: 72, fontSize: 20 });
    expect(textOps[1]?.op === "text" ? textOps[1].x : undefined).toBeCloseTo(115.34, 2);
    expect(textOps[2]).toMatchObject({ op: "text", text: "wraps", x: 72, y: 96, fontSize: 20 });
  });

  test("preserves letter spacing around pdf word-boundary spaces", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wrapped Spaced PDF Words" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "50pt",
          height: 2,
          fontSize: 20,
          letterSpacing: 5,
        }}
      >
        A B C
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[0]).toMatchObject({
      op: "text",
      text: "A",
      x: 72,
      y: 72,
      fontSize: 20,
      charSpacing: 5,
    });
    expect(textOps[1]).toMatchObject({
      op: "text",
      text: "B",
      x: 100.9,
      y: 72,
      fontSize: 20,
      charSpacing: 5,
    });
    expect(textOps[2]).toMatchObject({
      op: "text",
      text: "C",
      x: 72,
      y: 96,
      fontSize: 20,
      charSpacing: 5,
    });
    expect(bytes.match(/\(A\) Tj/g)).toHaveLength(1);
    expect(bytes.match(/\(B\) Tj/g)).toHaveLength(1);
    expect(bytes.match(/\(C\) Tj/g)).toHaveLength(1);
  });

  test("wraps long pdf words when overflow wrap allows breaking anywhere", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Anywhere Wrapped PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "33pt",
          height: 2,
          fontSize: 20,
          overflowWrap: "anywhere",
        }}
      >
        AAAAAA
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[0]).toMatchObject({ op: "text", text: "AA", x: 72, y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "AA", x: 72, y: 96, fontSize: 20 });
    expect(textOps[2]).toMatchObject({ op: "text", text: "AA", x: 72, y: 120, fontSize: 20 });
    expect(bytes.match(/\(AA\) Tj/g)).toHaveLength(3);
    expect(bytes).not.toContain("(AAAAAA) Tj");
  });

  test("wraps breakable pdf text using letter spacing in line width", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Spaced Anywhere Wrapped PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "33pt",
          height: 3,
          fontSize: 20,
          letterSpacing: 5,
          overflowWrap: "anywhere",
        }}
      >
        AAAAAA
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[0]).toMatchObject({
      op: "text",
      text: "AA",
      x: 72,
      y: 72,
      fontSize: 20,
      charSpacing: 5,
    });
    expect(textOps[1]).toMatchObject({
      op: "text",
      text: "AA",
      x: 72,
      y: 96,
      fontSize: 20,
      charSpacing: 5,
    });
    expect(textOps[2]).toMatchObject({
      op: "text",
      text: "AA",
      x: 72,
      y: 120,
      fontSize: 20,
      charSpacing: 5,
    });
    expect(bytes.match(/\(AA\) Tj/g)).toHaveLength(3);
    expect(bytes).not.toContain("(AAA) Tj");
  });

  test("wraps breakable pdf text before applying shrink fit", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Break Before Shrink PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "33pt",
          height: 2,
          fontSize: 20,
          fit: "shrink",
          overflowWrap: "anywhere",
        }}
      >
        AAAAAA
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(3);
    expect(textOps[0]).toMatchObject({ op: "text", text: "AA", x: 72, y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "AA", x: 72, y: 96, fontSize: 20 });
    expect(textOps[2]).toMatchObject({ op: "text", text: "AA", x: 72, y: 120, fontSize: 20 });
    expect(bytes.match(/\(AA\) Tj/g)).toHaveLength(3);
    expect(bytes).not.toContain("(AAAAAA) Tj");
  });

  test("keeps nowrap pdf text on one line even when it exceeds the content box width", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "No Wrap PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 0.75,
          height: 2,
          fontSize: 20,
          whiteSpace: "nowrap",
        }}
      >
        One Two
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(1);
    expect(textOps[0]).toMatchObject({
      op: "text",
      text: "One Two",
      x: 72,
      y: 72,
      fontSize: 20,
    });
    expect(bytes).toContain("(One Two) Tj");
  });

  test("shrinks nowrap pdf text to fit the content box", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Shrink Fit PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "33pt",
          height: 1,
          fontSize: 20,
          fit: "shrink",
          whiteSpace: "nowrap",
        }}
      >
        ABCDEF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({
      op: "text",
      text: "ABCDEF",
      x: 72,
      y: 72,
      fontSize: 8.136094674556213,
    });
    expect(bytes).toContain("/F1 8.1361 Tf");
    expect(bytes).toContain("(ABCDEF) Tj");
  });

  test("projects bullet lists as pdf text prefix operations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Bullet PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          fontSize: 20,
          listStyleType: "disc",
          listIndent: "18pt",
        }}
      >
        Item
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "•", x: 72, y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "Item", x: 90, y: 72, fontSize: 20 });
    expect(bytes.indexOf("(\\225) Tj")).toBeLessThan(bytes.indexOf("(Item) Tj"));
  });

  test("projects bullet list marker color filters into adjusted pdf text colors", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Bullet Color Filter PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          color: "#336699",
          filter: "brightness(120%) contrast(80%)",
          fontSize: 20,
          listStyleType: "disc",
          listIndent: "18pt",
        }}
      >
        Item
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const markerVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.text === "•",
    );
    const itemVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.text === "Item",
    );
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    for (const visual of [markerVisual, itemVisual]) {
      expect(visual).toMatchObject({ kind: "text" });
      if (visual?.kind !== "text" || !visual.style.color) {
        throw new Error("Expected filtered text color.");
      }
      expect(visual.style.color.r).toBeCloseTo(0.292);
      expect(visual.style.color.g).toBeCloseTo(0.484);
      expect(visual.style.color.b).toBeCloseTo(0.676);
    }
    for (const op of textOps) {
      if (op.op !== "text" || !op.color) {
        throw new Error("Expected filtered text operation color.");
      }
      expect(op.color.r).toBeCloseTo(0.292);
      expect(op.color.g).toBeCloseTo(0.484);
      expect(op.color.b).toBeCloseTo(0.676);
    }
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(bytes).toContain("0.292 0.484 0.676 rg");
    expect(bytes.indexOf("(\\225) Tj")).toBeLessThan(bytes.indexOf("(Item) Tj"));
  });

  test("projects numbered lists as pdf text prefix operations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Numbered PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          fontSize: 20,
          listStyleType: "upper-roman",
          listStart: 3,
          listIndent: "30pt",
        }}
      >
        Item
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(2);
    expect(textOps[0]).toMatchObject({ op: "text", text: "III.", x: 72, y: 72, fontSize: 20 });
    expect(textOps[1]).toMatchObject({ op: "text", text: "Item", x: 102, y: 72, fontSize: 20 });
    expect(bytes.indexOf("(III.) Tj")).toBeLessThan(bytes.indexOf("(Item) Tj"));
  });

  test("projects underlined text as pdf line decoration operations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Underlined PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          color: "#111111",
          fontSize: 20,
          textDecorationLine: "underline",
          textDecorationColor: "#DC2626",
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const decorationOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOp).toMatchObject({
      op: "text",
      text: "PDF",
      x: 72,
      y: 72,
      fontSize: 20,
      color: { r: 0x11 / 255, g: 0x11 / 255, b: 0x11 / 255 },
    });
    expect(decorationOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 94 },
      to: { x: 112, y: 94 },
      color: { r: 0xdc / 255, g: 0x26 / 255, b: 0x26 / 255 },
      lineWidth: 1.25,
    });
    expect(bytes.indexOf("(PDF) Tj")).toBeLessThan(bytes.indexOf("72 311 m"));
    expect(bytes).toContain("0.8627 0.149 0.149 RG");
    expect(bytes).toContain("72 311 m");
    expect(bytes).toContain("112 311 l");
  });

  test("projects dashed underline style as a pdf dashed decoration stroke", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Dashed Underline PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          color: "#111111",
          fontSize: 20,
          textDecorationLine: "underline",
          textDecorationStyle: "dashed",
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const decorationOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(decorationOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 94 },
      to: { x: 112, y: 94 },
      dash: "dash",
      lineWidth: 1.25,
    });
    expect(bytes).toContain("[3.75 3.75] 0 d");
    expect(bytes).toContain("[] 0 d");
  });

  test("projects double underline style as two pdf decoration strokes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Double Underline PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          color: "#111111",
          fontSize: 20,
          textDecorationLine: "underline",
          textDecorationStyle: "double",
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const decorationOps = projection.pages[0]?.content.filter((op) => op.op === "strokeLine") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(decorationOps).toHaveLength(2);
    expect(decorationOps[0]).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 92.75 },
      to: { x: 112, y: 92.75 },
      lineWidth: 1.25,
    });
    expect(decorationOps[1]).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 95.25 },
      to: { x: 112, y: 95.25 },
      lineWidth: 1.25,
    });
    expect(bytes).toContain("72 312.25 m");
    expect(bytes).toContain("72 309.75 m");
  });

  test("projects wavy underline style as multiple pdf decoration strokes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Wavy Underline PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          color: "#111111",
          fontSize: 20,
          textDecorationLine: "underline",
          textDecorationStyle: "wavy",
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const decorationOps = projection.pages[0]?.content.filter((op) => op.op === "strokeLine") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(decorationOps.length).toBeGreaterThan(2);
    expect(decorationOps[0]).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 94 },
      to: { x: 76, y: 92.75 },
      lineWidth: 1.25,
    });
    expect(decorationOps[1]).toMatchObject({
      op: "strokeLine",
      from: { x: 76, y: 92.75 },
      to: { x: 80, y: 95.25 },
      lineWidth: 1.25,
    });
    expect(bytes).toContain("72 311 m");
    expect(bytes).toContain("76 312.25 l");
    expect(bytes).toContain("80 309.75 l");
  });

  test("projects line-through text as pdf line decoration operations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Strike PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          color: "#111111",
          fontSize: 20,
          textDecorationLine: "line-through",
        }}
      >
        PDF
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const decorationOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(decorationOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 83 },
      to: { x: 112, y: 83 },
      color: { r: 0x11 / 255, g: 0x11 / 255, b: 0x11 / 255 },
      lineWidth: 1.25,
    });
    expect(bytes.indexOf("(PDF) Tj")).toBeLessThan(bytes.indexOf("72 322 m"));
    expect(bytes).toContain("0.0667 0.0667 0.0667 RG");
    expect(bytes).toContain("72 322 m");
    expect(bytes).toContain("112 322 l");
  });

  test("does not project hidden text into pdf content", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Hidden PDF" }, () => (
      <>
        <p>Visible</p>
        <p style={{ visibility: "hidden" }}>Hidden</p>
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(projection.pages[0]?.content).toContainEqual(
      expect.objectContaining({ op: "text", text: "Visible" }),
    );
    expect(projection.pages[0]?.content).not.toContainEqual(
      expect.objectContaining({ op: "text", text: "Hidden" }),
    );
    expect(bytes).toContain("(Visible) Tj");
    expect(bytes).not.toContain("(Hidden) Tj");
  });

  test("does not project text inside a hidden parent into pdf content", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Hidden Parent PDF" }, () => (
      <>
        <p>Visible</p>
        <div style={{ visibility: "hidden" }}>
          <p>Hidden Child</p>
        </div>
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(projection.pages[0]?.content).not.toContainEqual(
      expect.objectContaining({ op: "text", text: "Hidden Child" }),
    );
    expect(bytes).not.toContain("(Hidden Child) Tj");
  });

  test("does not warn for unsupported filters on hidden pdf nodes", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Hidden Filter PDF" }, () => (
      <>
        <p>Visible</p>
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            fill: "#DDEEFF",
            filter: "brightness(120%)",
            visibility: "hidden",
          }}
        />
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);

    const projection = expectPdfPageModel(projectResult.projection);
    const hiddenFill = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );

    expect(hiddenFill).toBeUndefined();
    expect(projection.fallbacks).toEqual([]);
  });

  test("does not warn for unsupported filters inside hidden pdf parents", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Hidden Parent Filter PDF" }, () => (
      <>
        <p>Visible</p>
        <div style={{ visibility: "hidden" }}>
          <shape
            shape="rect"
            style={{
              position: "absolute",
              left: 1,
              top: 1,
              width: 2,
              height: 1,
              fill: "#DDEEFF",
              filter: "brightness(120%)",
            }}
          />
        </div>
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);

    const projection = expectPdfPageModel(projectResult.projection);
    const hiddenFill = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );

    expect(hiddenFill).toBeUndefined();
    expect(projection.fallbacks).toEqual([]);
  });

  test("treats visual no-op CSS filters as no-op pdf semantics", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "No-op Filter PDF" }, () => (
      <>
        {(
          [
            "blur(0px)",
            "blur(0in)",
            "blur(0cm)",
            "brightness(100%)",
            "contrast(100%)",
            "saturate(100%)",
            "grayscale(0%)",
            "sepia(0)",
            "invert(0%)",
            "hue-rotate(0deg)",
            "hue-rotate(0)",
            "opacity(100%) blur(0px)",
          ] as const
        ).map((filter, index) => (
          <shape
            key={filter}
            shape="rect"
            style={{
              position: "absolute",
              left: 1 + index,
              top: 1,
              width: 0.5,
              height: 0.5,
              fill: "#DDEEFF",
              filter,
            }}
          />
        ))}
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);

    const projection = expectPdfPageModel(projectResult.projection);

    expect(projection.fallbacks).toEqual([]);
  });

  test("does not warn for the default pdf text font fallback", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "details" });
    const summary = result.summary as
      | {
          readonly slides?: readonly {
            readonly visualChecks?: readonly {
              readonly code?: unknown;
              readonly severity?: unknown;
              readonly message?: unknown;
              readonly kind?: unknown;
              readonly textPreview?: unknown;
              readonly metrics?: {
                readonly requestedFontFamily?: unknown;
                readonly projectedFontFamily?: unknown;
                readonly fontResourceId?: unknown;
              };
            }[];
          }[];
        }
      | undefined;

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(summary?.slides?.[0]?.visualChecks).toContainEqual(
      expect.objectContaining({
        severity: "info",
        code: "I_VISUAL_TEXT_FONT_SUBSTITUTED",
        kind: "text",
        textPreview: "PDF",
        message: expect.stringContaining("Aptos"),
        metrics: expect.objectContaining({
          requestedFontFamily: "Aptos",
          projectedFontFamily: "Helvetica",
          fontResourceId: expect.stringContaining("default-helvetica"),
        }),
      }),
    );
  });

  test("preserves explicit missing font fallback warnings for pdf text", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p style={{ fontFamily: "Missing Sans" }}>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PDF_FONT_FALLBACK", severity: "warning" }),
    );
    expect(
      renderResult.diagnostics.items.filter((item) => item.code === "W_PDF_FONT_FALLBACK"),
    ).toHaveLength(1);
  });

  test("warns when punctuation-only text uses an explicit missing pdf font", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p style={{ fontFamily: "Missing Sans" }}>---</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PDF_FONT_FALLBACK", severity: "warning" }),
    );
    expect(projection.fallbacks).toContainEqual(
      expect.objectContaining({ code: "W_PDF_FONT_FALLBACK" }),
    );
  });

  test("does not warn for missing fonts on hidden pdf text", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Hidden Font PDF" }, () => (
      <>
        <p>Visible</p>
        <p style={{ fontFamily: "Missing Sans", visibility: "hidden" }}>Hidden font</p>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(projection.fallbacks.map((fallback) => fallback.code)).not.toContain(
      "W_PDF_FONT_FALLBACK",
    );
  });

  test("does not warn for missing fonts inside hidden pdf parents", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Hidden Parent Font PDF" }, () => (
      <>
        <p>Visible</p>
        <div style={{ visibility: "hidden" }}>
          <p style={{ fontFamily: "Missing Sans" }}>Hidden child font</p>
        </div>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(projection.fallbacks.map((fallback) => fallback.code)).not.toContain(
      "W_PDF_FONT_FALLBACK",
    );
  });

  test("rejects text outside WinAnsiEncoding without a registered Unicode font", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Japanese PDF" }, () => <p>こんにちは</p>);

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(projectResult.projection);

    expect(projectResult.ok).toBe(false);
    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_MODEL_UNSUPPORTED_TEXT_ENCODING",
    );
    expect(projectResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PDF_UNRESOLVED_FONT_GLYPH",
        severity: "error",
      }),
    );
    expect(projection.fallbacks).toContainEqual(
      expect.objectContaining({
        code: "E_PDF_UNRESOLVED_FONT_GLYPH",
        pageId: projection.pages[0]?.id,
        message: expect.stringContaining("Register an embeddable Font Asset"),
      }),
    );
    expect(projection.pages[0]?.content).toContainEqual(
      expect.objectContaining({
        op: "text",
        text: "こんにちは",
        textEncoding: "utf16be",
      }),
    );
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        name: "FUnicode",
        encoding: "identity-h",
      }),
    );
  });

  test("rejects non-BMP text without a registered Unicode font", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Emoji PDF" }, () => <p>Smile 😀</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];

    expect(result.ok).toBe(false);
    expect(textOps).toContainEqual(
      expect.objectContaining({
        op: "text",
        text: "Smile ",
      }),
    );
    expect(
      textOps.find((op) => op.op === "text" && op.text === "Smile ")?.textEncoding,
    ).toBeUndefined();
    expect(textOps).toContainEqual(
      expect.objectContaining({
        op: "text",
        text: "😀",
        textEncoding: "utf16be",
      }),
    );
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PDF_UNRESOLVED_FONT_GLYPH",
        severity: "error",
        message: expect.stringContaining("😀"),
      }),
    );
  });

  test("projects and renders a filled stroked rectangle shape into pdf drawing operations", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Shape PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#336699",
          stroke: "2pt solid #CC3300",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(shapeVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      fill: { color: { r: 0.2, g: 0.4, b: 0.6 } },
      stroke: { color: { r: 0.8, g: 0.2, b: 0 }, width: 2 },
    });
    expect(projection.pages[0]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "setFillColor", color: { r: 0.2, g: 0.4, b: 0.6 } }),
        expect.objectContaining({ op: "fillRect" }),
        expect.objectContaining({ op: "setStrokeColor", color: { r: 0.8, g: 0.2, b: 0 } }),
        expect.objectContaining({ op: "strokeRect", lineWidth: 2 }),
      ]),
    );
    expect(pdfBytes).toContain("0.2 0.4 0.6 rg");
    expect(pdfBytes).toContain("0.8 0.2 0 RG");
    expect(pdfBytes).toContain("2 w");
    expect(pdfBytes).toContain("72 261 144 72 re");
    expect(pdfBytes).toContain("f");
    expect(pdfBytes).toContain("S");
  });

  test("projects and renders shape background image into pdf drawing operations", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Shape Background Image PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          stroke: "1pt solid #CC3300",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const backgroundImageVisual = visuals.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageIndex = content.findIndex((op) => op.op === "image");
    const strokeIndex = content.findIndex((op) => op.op === "strokeRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(backgroundImageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(strokeIndex).toBeGreaterThan(imageIndex);
    expect(pdfBytes.indexOf("/Im1 Do")).toBeLessThan(pdfBytes.indexOf("72 261 144 72 re"));
  });

  test("bakes supported css color filters into embedded png image pixels", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Color Filter PDF" }, () => (
      <img
        data={pngData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
  });

  test("bakes supported css color filters into embedded png background image pixels", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Background Image Color Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
  });

  test("bakes supported css color filters into png background image pixels and solid stroke color", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Background Image Stroke Color Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          stroke: "2pt solid #CC3300",
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(shapeVisual).toMatchObject({
      kind: "shape",
      stroke: { width: 2 },
    });
    expect(shapeVisual?.kind === "shape" ? shapeVisual.stroke?.color.r : undefined).toBeCloseTo(
      0.868,
    );
    expect(shapeVisual?.kind === "shape" ? shapeVisual.stroke?.color.g : undefined).toBeCloseTo(
      0.292,
    );
    expect(shapeVisual?.kind === "shape" ? shapeVisual.stroke?.color.b : undefined).toBeCloseTo(
      0.1,
    );
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
    expect(pdfBytes).toContain("0.868 0.292 0.1 RG");
  });

  test("bakes supported css color filters into png background image pixels and solid background colors", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Background Image Solid Color Filter PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          backgroundColor: "#336699",
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(shapeVisual).toMatchObject({
      kind: "shape",
    });
    expect(shapeVisual?.kind === "shape" ? shapeVisual.fill?.color?.r : undefined).toBeCloseTo(
      0.292,
    );
    expect(shapeVisual?.kind === "shape" ? shapeVisual.fill?.color?.g : undefined).toBeCloseTo(
      0.484,
    );
    expect(shapeVisual?.kind === "shape" ? shapeVisual.fill?.color?.b : undefined).toBeCloseTo(
      0.676,
    );
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
    expect(pdfBytes).toContain("0.292 0.484 0.676 rg");
  });

  test("bakes supported css color filters into png background image pixels and gradient stop colors", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Background Image Gradient Color Filter PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%, linear-gradient(90deg, #336699 0%, #CC3300 100%)`,
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const gradient = projection.resources.gradients?.[0];
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(gradient).toMatchObject({
      kind: "linear-gradient",
      stops: [expect.objectContaining({ position: 0 }), expect.objectContaining({ position: 1 })],
    });
    expect(gradient?.stops[0]?.color.r).toBeCloseTo(0.292);
    expect(gradient?.stops[0]?.color.g).toBeCloseTo(0.484);
    expect(gradient?.stops[0]?.color.b).toBeCloseTo(0.676);
    expect(gradient?.stops[1]?.color.r).toBeCloseTo(0.868);
    expect(gradient?.stops[1]?.color.g).toBeCloseTo(0.292);
    expect(gradient?.stops[1]?.color.b).toBeCloseTo(0.1);
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
  });

  test("rotates contained shape background images around the shape frame", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Shape Background Image PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          background: `url("${pngData}") no-repeat center / contain`,
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 144 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 144 },
    });
  });

  test("clips roundRect shape background images with a pdf round rect clip", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "RoundRect Shape Background Image PDF" }, () => (
      <shape
        shape="roundRect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(pdfBytes).toContain("/Im1 Do");
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("84 333 m");
  });

  test("projects roundRect shape gradient background layers behind images into pdf visuals", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "RoundRect Shape Layered Background PDF" }, () => (
      <shape
        shape="roundRect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%, linear-gradient(90deg, #DDEEFF 0%, #112233 100%)`,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const gradientVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.fill?.kind === "linear-gradient",
    );
    const gradientOp = projection.pages[0]?.content.find((op) =>
      (op as { op: string }).op.startsWith("fillLinearGradient"),
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(gradientVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      fill: { kind: "linear-gradient" },
    });
    expect(gradientOp).toMatchObject({
      op: "fillLinearGradientRoundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
    });
    expect(imageOp).toMatchObject({
      op: "image",
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(projection.resources.gradients).toHaveLength(1);
    expect(pdfBytes).toContain("/Pattern cs");
    expect(pdfBytes).toContain("/Im1 Do");
    expect(pdfBytes).toContain("84 333 m");
  });

  test("projects and renders shape opacity as a pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Opacity PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#336699",
          opacity: 0.4,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(fillOp).toMatchObject({ op: "fillRect", opacity: 0.4 });
    expect(pdfBytes).toContain("/ExtGState << /GS400 << /Type /ExtGState /CA 0.4 /ca 0.4 >> >>");
    expect(pdfBytes).toContain("/GS400 gs");
  });

  test("projects shape background image opacity as a pdf graphics state without fallback warning", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Shape Background Image Opacity PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          opacity: 0.4,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      opacity: 0.4,
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(imageOp).toMatchObject({ op: "image", opacity: 0.4 });
    expect(pdfBytes).toContain("/ExtGState << /GS400 << /Type /ExtGState /CA 0.4 /ca 0.4 >> >>");
    expect(pdfBytes).toContain("/GS400 gs");
  });

  test("projects shape opacity with generated outlines as pdf graphics states without fallback warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Shape Outline Opacity PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          outline: "2pt solid #00AA66",
          opacity: 0.4,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shapeVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const outlineVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "outline",
    );
    const fillOp = content.find((op) => op.op === "fillRect");
    const outlineOp = content.find((op) => op.op === "strokeRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(outlineVisual).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(fillOp).toMatchObject({ op: "fillRect", opacity: 0.4 });
    expect(outlineOp).toMatchObject({ op: "strokeRect", opacity: 0.4 });
    expect(pdfBytes).toContain("/ExtGState << /GS400 << /Type /ExtGState /CA 0.4 /ca 0.4 >> >>");
    expect(pdfBytes).toContain("/GS400 gs");
  });

  test("projects shape opacity with edge strokes as pdf graphics states without fallback warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Shape Edge Stroke Opacity PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          borderTop: "2pt solid #00AA66",
          borderRight: "2pt solid #00AA66",
          borderBottom: "2pt solid #00AA66",
          borderLeft: "2pt solid #00AA66",
          opacity: 0.4,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const borderVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const borderOps = (projection.pages[0]?.content ?? []).filter((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(borderVisuals).toHaveLength(4);
    expect(
      borderVisuals.map((visual) => (visual.kind === "line" ? visual.opacity : undefined)),
    ).toEqual([0.4, 0.4, 0.4, 0.4]);
    expect(borderOps).toHaveLength(4);
    expect(borderOps.map((op) => (op.op === "strokeLine" ? op.opacity : undefined))).toEqual([
      0.4, 0.4, 0.4, 0.4,
    ]);
    expect(pdfBytes).toContain("/ExtGState << /GS400 << /Type /ExtGState /CA 0.4 /ca 0.4 >> >>");
    expect(pdfBytes).toContain("/GS400 gs");
  });

  test("projects and renders line shape opacity as a pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Line Opacity PDF" }, () => (
      <shape
        shape="line"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          stroke: "2pt solid #336699",
          opacity: 0.4,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const lineVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "line");
    const lineOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(lineVisual).toMatchObject({ kind: "line", opacity: 0.4 });
    expect(lineOp).toMatchObject({ op: "strokeLine", opacity: 0.4 });
    expect(pdfBytes).toContain("/ExtGState << /GS400 << /Type /ExtGState /CA 0.4 /ca 0.4 >> >>");
    expect(pdfBytes).toContain("/GS400 gs");
  });

  test("projects and renders transparent shape fill as a pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Fill PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "rgba(51, 102, 153, 0.4)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      fill: { color: { r: 0.2, g: 0.4, b: 0.6 }, opacity: 0.4 },
    });
    expect(fillOp).toMatchObject({ op: "fillRect", opacity: 0.4 });
    expect(pdfBytes).toContain("/ExtGState << /GS400 << /Type /ExtGState /CA 0.4 /ca 0.4 >> >>");
    expect(pdfBytes).toContain("/GS400 gs");
  });

  test("projects and renders transparent text color as a pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Text PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 0.5,
          color: "rgba(51, 102, 153, 0.4)",
        }}
      >
        Transparent text
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "text");
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textVisual).toMatchObject({
      kind: "text",
      opacity: 0.4,
      style: { color: { r: 0.2, g: 0.4, b: 0.6 } },
    });
    expect(textOp).toMatchObject({
      op: "text",
      opacity: 0.4,
      color: { r: 0.2, g: 0.4, b: 0.6 },
    });
    expect(pdfBytes).toContain("/ExtGState << /GS400 << /Type /ExtGState /CA 0.4 /ca 0.4 >> >>");
    expect(pdfBytes).toContain("/GS400 gs");
  });

  test("combines text opacity and transparent decoration color in pdf decoration strokes", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Decoration PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 0.5,
          color: "#111111",
          opacity: 0.5,
          textDecoration: "underline",
          textDecorationColor: "rgba(51, 102, 153, 0.4)",
        }}
      >
        Underlined text
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const decorationVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "line" && visual.stroke.color.r === 0.2,
    );
    const decorationOp = projection.pages[0]?.content.find(
      (op) => op.op === "strokeLine" && op.color.r === 0.2,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(decorationVisual).toMatchObject({
      kind: "line",
      opacity: 0.2,
      stroke: { color: { r: 0.2, g: 0.4, b: 0.6 } },
    });
    expect(decorationOp).toMatchObject({
      op: "strokeLine",
      opacity: 0.2,
      color: { r: 0.2, g: 0.4, b: 0.6 },
    });
    expect(pdfBytes).toContain("/GS200 gs");
  });

  test("combines text opacity and transparent wavy decoration color in pdf decoration strokes", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Wavy Decoration PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 0.5,
          color: "#111111",
          opacity: 0.5,
          textDecorationLine: "underline",
          textDecorationStyle: "wavy",
          textDecorationColor: "rgba(51, 102, 153, 0.4)",
        }}
      >
        Wavy underlined text
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const decorationVisuals =
      projection.pages[0]?.visuals?.filter(
        (visual) => visual.kind === "line" && visual.stroke.color.r === 0.2,
      ) ?? [];
    const decorationOps =
      projection.pages[0]?.content.filter((op) => op.op === "strokeLine" && op.color.r === 0.2) ??
      [];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(decorationVisuals.length).toBeGreaterThan(2);
    expect(decorationOps.length).toBeGreaterThan(2);
    decorationVisuals.forEach((visual) => {
      expect(visual).toMatchObject({
        kind: "line",
        opacity: 0.2,
        stroke: { color: { r: 0.2, g: 0.4, b: 0.6 } },
      });
    });
    decorationOps.forEach((op) => {
      expect(op).toMatchObject({
        op: "strokeLine",
        opacity: 0.2,
        color: { r: 0.2, g: 0.4, b: 0.6 },
      });
    });
    expect(pdfBytes).toContain("/GS200 gs");
  });

  test("cascades group opacity to a non-overlapping descendant without a fallback warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Group Opacity PDF" }, () => (
      <div style={{ position: "absolute", left: 1, top: 1, width: 3, height: 2, opacity: 0.5 }}>
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 0.25,
            top: 0.25,
            width: 1,
            height: 0.5,
            fill: "#CCDDFF",
          }}
        />
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find(
      (visual) =>
        visual.kind === "shape" && visual.fill?.color !== undefined && visual.fill.color.b === 1,
    );
    const fillOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 90 && op.box.y === 90,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({ kind: "shape", opacity: 0.5 });
    expect(fillOp).toMatchObject({ op: "fillRect", opacity: 0.5 });
    expect(pdfBytes).toContain("/ExtGState << /GS500 << /Type /ExtGState /CA 0.5 /ca 0.5 >> >>");
    expect(pdfBytes).toContain("/GS500 gs");
  });

  test("records a fallback when group opacity children overlap", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Overlapping Group Opacity PDF" }, () => (
      <div style={{ position: "absolute", left: 1, top: 1, width: 3, height: 2, opacity: 0.5 }}>
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 0.25,
            top: 0.25,
            width: 1.5,
            height: 1,
            fill: "#FF0000",
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 1,
            top: 0.5,
            width: 1.5,
            height: 1,
            fill: "#0000FF",
          }}
        />
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_UNSUPPORTED_SEMANTIC",
        severity: "warning",
        message: expect.stringContaining("opacity"),
      }),
    );
    expect(renderResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );

    const projection = expectPdfPageModel(projectResult.projection);
    const groupOpacityFallback = projection.fallbacks.find(
      (fallback) =>
        fallback.code === "W_PDF_UNSUPPORTED_SEMANTIC" &&
        fallback.semantic?.feature === "opacity" &&
        fallback.semantic.property === "opacity",
    );
    const coloredShapes =
      projection.pages[0]?.visuals?.filter(
        (visual) => visual.kind === "shape" && visual.fill?.color !== undefined,
      ) ?? [];

    expect(groupOpacityFallback).toMatchObject({
      kind: "group",
      semantic: {
        fallback: {
          strategy: "cascadeOpacityToChildren",
          missing: expect.arrayContaining(["compositedSubtree"]),
        },
      },
    });
    expect(coloredShapes).toHaveLength(2);
    expect(coloredShapes).toEqual(
      coloredShapes.map(() => expect.objectContaining({ kind: "shape", opacity: 0.5 })),
    );
  });

  test("projects childless group opacity as a pdf graphics state without fallback warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Childless Group Opacity PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          opacity: 0.5,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const groupVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(groupVisual).toMatchObject({ kind: "shape", opacity: 0.5 });
    expect(fillOp).toMatchObject({ op: "fillRect", opacity: 0.5 });
    expect(pdfBytes).toContain("/ExtGState << /GS500 << /Type /ExtGState /CA 0.5 /ca 0.5 >> >>");
    expect(pdfBytes).toContain("/GS500 gs");
  });

  test("projects plain text opacity as a pdf graphics state without fallback warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Opacity PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          color: "#112233",
          opacity: 0.5,
        }}
      >
        Faded text
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.text === "Faded text",
    );
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Faded text",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textVisual).toMatchObject({ kind: "text", opacity: 0.5 });
    expect(textOp).toMatchObject({ op: "text", opacity: 0.5 });
    expect(pdfBytes).toContain("/ExtGState << /GS500 << /Type /ExtGState /CA 0.5 /ca 0.5 >> >>");
    expect(pdfBytes).toContain("/GS500 gs");
    expect(pdfBytes).toContain("(Faded text) Tj");
  });

  test("projects text color filters into adjusted pdf text colors", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Color Filter PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          color: "#336699",
          filter: "brightness(120%) contrast(80%)",
        }}
      >
        Filtered text
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.text === "Filtered text",
    );
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Filtered text",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textVisual).toMatchObject({ kind: "text" });
    if (textVisual?.kind !== "text" || !textVisual.style.color) {
      throw new Error("Expected text visual color.");
    }
    expect(textVisual.style.color.r).toBeCloseTo(0.292);
    expect(textVisual.style.color.g).toBeCloseTo(0.484);
    expect(textVisual.style.color.b).toBeCloseTo(0.676);
    expect(textOp).toMatchObject({ op: "text" });
    if (textOp?.op !== "text" || !textOp.color) {
      throw new Error("Expected PDF text color operation.");
    }
    expect(textOp.color.r).toBeCloseTo(0.292);
    expect(textOp.color.g).toBeCloseTo(0.484);
    expect(textOp.color.b).toBeCloseTo(0.676);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("0.292 0.484 0.676 rg");
    expect(pdfBytes).toContain("(Filtered text) Tj");
  });

  test("projects text color filters from the default pdf text color", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Default Text Color Filter PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          filter: "invert(100%)",
        }}
      >
        Inverted default text
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.text === "Inverted default text",
    );
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Inverted default text",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textVisual).toMatchObject({
      kind: "text",
      style: { color: { r: 1, g: 1, b: 1 } },
    });
    expect(textOp).toMatchObject({
      op: "text",
      color: { r: 1, g: 1, b: 1 },
    });
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("1 1 1 rg");
    expect(pdfBytes).toContain("(Inverted default text) Tj");
  });

  test("projects text box color filters into adjusted pdf background and text colors", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Box Color Filter PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          backgroundColor: "#336699",
          color: "#CC3300",
          filter: "brightness(120%)",
        }}
      >
        Filtered box
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const backgroundVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const textVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.text === "Filtered box",
    );
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const backgroundFillColorOp = projection.pages[0]?.content.find(
      (op) => op.op === "setFillColor",
    );
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Filtered box",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      fill: { color: { r: 0.24, g: 0.48, b: 0.72 } },
    });
    expect(textVisual).toMatchObject({
      kind: "text",
      style: { color: { r: 0.96, g: 0.24, b: 0 } },
    });
    expect(backgroundFillColorOp).toMatchObject({
      op: "setFillColor",
      color: { r: 0.24, g: 0.48, b: 0.72 },
    });
    expect(fillOp).toMatchObject({ op: "fillRect" });
    expect(textOp).toMatchObject({
      op: "text",
      color: { r: 0.96, g: 0.24, b: 0 },
    });
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("0.24 0.48 0.72 rg");
    expect(pdfBytes).toContain("0.96 0.24 0 rg");
    expect(pdfBytes).toContain("(Filtered box) Tj");
  });

  test("bakes supported css color filters into text background png image pixels", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Background Image Color Filter PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          color: "#336699",
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          filter: "brightness(120%) contrast(80%)",
        }}
      >
        Text
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const textVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.text === "Text",
    );
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(textVisual).toMatchObject({ kind: "text" });
    expect(textVisual?.kind === "text" ? textVisual.style.color?.r : undefined).toBeCloseTo(0.292);
    expect(textVisual?.kind === "text" ? textVisual.style.color?.g : undefined).toBeCloseTo(0.484);
    expect(textVisual?.kind === "text" ? textVisual.style.color?.b : undefined).toBeCloseTo(0.676);
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
  });

  test("projects text box opacity as pdf graphics states without fallback warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Box Opacity PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 0.75,
          backgroundColor: "#DDEEFF",
          color: "#112233",
          opacity: 0.5,
        }}
      >
        Faded box
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const backgroundVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const textVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Faded box",
    );
    const backgroundOp = content.find(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const textOp = content.find((op) => op.op === "text" && op.text === "Faded box");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundVisual).toMatchObject({ kind: "shape", opacity: 0.5 });
    expect(textVisual).toMatchObject({ kind: "text", opacity: 0.5 });
    expect(backgroundOp).toMatchObject({ op: "fillRect", opacity: 0.5 });
    expect(textOp).toMatchObject({ op: "text", opacity: 0.5 });
    expect(pdfBytes).toContain("/ExtGState << /GS500 << /Type /ExtGState /CA 0.5 /ca 0.5 >> >>");
    expect(pdfBytes).toContain("/GS500 gs");
  });

  test("projects rich text opacity as pdf graphics states without fallback warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rich Text Opacity PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 0.75,
          color: "#112233",
          fontSize: 18,
          opacity: 0.5,
        }}
      >
        Sales <span style={{ color: "#DC2626" }}>grew</span> YoY
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual) => visual.kind === "text" && ["Sales ", "grew", " YoY"].includes(visual.text),
    );
    const textOps = (projection.pages[0]?.content ?? []).filter(
      (op) => op.op === "text" && ["Sales ", "grew", " YoY"].includes(op.text),
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textVisuals).toHaveLength(3);
    expect(
      textVisuals.map((visual) => (visual.kind === "text" ? visual.opacity : undefined)),
    ).toEqual([0.5, 0.5, 0.5]);
    expect(textOps).toHaveLength(3);
    expect(textOps.map((op) => (op.op === "text" ? op.opacity : undefined))).toEqual([
      0.5, 0.5, 0.5,
    ]);
    expect(pdfBytes).toContain("/ExtGState << /GS500 << /Type /ExtGState /CA 0.5 /ca 0.5 >> >>");
  });

  test("projects multi-line text opacity as pdf graphics states without fallback warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Multi-line Text Opacity PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1.5,
          color: "#112233",
          fontSize: 18,
          opacity: 0.5,
        }}
      >
        {"Line one\nLine two"}
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual) => visual.kind === "text" && ["Line one", "Line two"].includes(visual.text),
    );
    const textOps = (projection.pages[0]?.content ?? []).filter(
      (op) => op.op === "text" && ["Line one", "Line two"].includes(op.text),
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textVisuals).toHaveLength(2);
    expect(
      textVisuals.map((visual) => (visual.kind === "text" ? visual.opacity : undefined)),
    ).toEqual([0.5, 0.5]);
    expect(textOps).toHaveLength(2);
    expect(textOps.map((op) => (op.op === "text" ? op.opacity : undefined))).toEqual([0.5, 0.5]);
    expect(pdfBytes).toContain("/ExtGState << /GS500 << /Type /ExtGState /CA 0.5 /ca 0.5 >> >>");
    expect(pdfBytes).toContain("/GS500 gs");
  });

  test("projects image opacity as a pdf graphics state without fallback warning", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Opacity PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          opacity: 0.5,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({ kind: "image", opacity: 0.5 });
    expect(imageOp).toMatchObject({ op: "image", opacity: 0.5 });
    expect(pdfBytes).toContain("/ExtGState << /GS500 << /Type /ExtGState /CA 0.5 /ca 0.5 >> >>");
    expect(pdfBytes).toContain("/GS500 gs");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects video poster opacity as a pdf graphics state without fallback warning", async () => {
    const posterData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Video Poster Opacity PDF" }, () => (
      <video
        data="data:video/mp4;base64,AAAA"
        posterData={posterData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          opacity: 0.5,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({ kind: "image", opacity: 0.5 });
    expect(imageOp).toMatchObject({ op: "image", opacity: 0.5 });
    expect(pdfBytes).toContain("/ExtGState << /GS500 << /Type /ExtGState /CA 0.5 /ca 0.5 >> >>");
    expect(pdfBytes).toContain("/GS500 gs");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects and renders slide solid background before authored content", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Background PDF", style: { backgroundColor: "#112233" } }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>Foreground</p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const backgroundVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "setFillColor" && op.color.r === 0x11 / 255,
    );
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "Foreground");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 0, y: 0, width: 720, height: 405 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 } },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(backgroundFillIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThan(backgroundFillIndex);
    expect(pdfBytes.indexOf("0.067 0.133 0.2 rg")).toBeLessThan(
      pdfBytes.indexOf("(Foreground) Tj"),
    );
  });

  test("projects and renders slide background image before authored content", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide(
      {
        name: "Background Image PDF",
        style: { background: `url("${pngData}") no-repeat left top / 100% 100%` },
      },
      () => (
        <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>Foreground</p>
      ),
    );

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const backgroundImageVisual = visuals.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageIndex = content.findIndex((op) => op.op === "image");
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "Foreground");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundImageVisual).toMatchObject({
      kind: "image",
      box: { x: 0, y: 0, width: 720, height: 405 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(projection.resources.images[0]).toMatchObject({
      mediaType: "image/png",
      width: 1,
      height: 1,
    });
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThan(imageIndex);
    expect(pdfBytes.indexOf("/Im1 Do")).toBeLessThan(pdfBytes.indexOf("(Foreground) Tj"));
  });

  test("projects and renders view background and border before child text", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "View Box PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          backgroundColor: "#E0F2FE",
          border: "2pt solid #0369A1",
        }}
      >
        <p style={{ position: "absolute", left: 0.25, top: 0.2, width: 2, height: 0.4 }}>In box</p>
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const groupBox = visuals.find(
      (visual) =>
        visual.kind === "shape" &&
        visual.paintOrder.generatedLayerRole === "background" &&
        visual.box.x === 72 &&
        visual.box.y === 72,
    );
    const groupStroke = content.find(
      (op) => op.op === "strokeRect" && op.box.x === 72 && op.box.y === 72,
    );
    const fillIndex = content.findIndex(
      (op) => op.op === "setFillColor" && op.color.r === 0xe0 / 255,
    );
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "In box");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(groupBox).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 216, height: 72 },
      fill: { color: { r: 0xe0 / 255, g: 0xf2 / 255, b: 0xfe / 255 } },
      stroke: { color: { r: 0x03 / 255, g: 0x69 / 255, b: 0xa1 / 255 }, width: 2 },
    });
    expect(groupStroke).toMatchObject({
      op: "strokeRect",
      box: { x: 72, y: 72, width: 216, height: 72 },
      lineWidth: 2,
    });
    expect(textIndex).toBeGreaterThan(fillIndex);
    expect(pdfBytes).toContain("0.8784 0.949 0.9961 rg");
    expect(pdfBytes).toContain("0.0118 0.4118 0.6314 RG");
    expect(pdfBytes.indexOf("72 261 216 72 re")).toBeLessThan(pdfBytes.indexOf("(In box) Tj"));
  });

  test("keeps nested sibling backgrounds behind their own child text", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Nested paint order" }, () => (
      <>
        {["First", "Second", "Third"].map((label, index) => (
          <div
            key={label}
            style={{
              position: "absolute",
              left: 0.5 + index * 3.1,
              top: 1,
              width: 2.8,
              height: 2,
              backgroundColor: "#DDEEFF",
            }}
          >
            <h2 style={{ position: "absolute", left: 0.2, top: 0.2, margin: 0 }}>{label}</h2>
          </div>
        ))}
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toEqual([]);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const visualSequences = visuals.map((visual) => visual.paintOrder.sequence);

    expect(visualSequences).toEqual(visuals.map((_, index) => index));
    for (const [index, label] of ["First", "Second", "Third"].entries()) {
      const backgroundX = (0.5 + index * 3.1) * 72;
      const backgroundIndex = content.findIndex(
        (op) => op.op === "fillRect" && Math.abs(op.box.x - backgroundX) < 0.001,
      );
      const textIndex = content.findIndex((op) => op.op === "text" && op.text === label);
      expect(backgroundIndex).toBeGreaterThanOrEqual(0);
      expect(textIndex).toBeGreaterThan(backgroundIndex);
    }
  });

  test("projects and renders rounded view outlines as pdf round rect strokes", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded View Outline PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderRadius: "12pt",
          outline: "2pt solid #00AA66",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const outlineVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "outline",
    );
    const outlineOp = projection.pages[0]?.content.find((op) => op.op === "strokeRoundRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(outlineVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      stroke: { color: { r: 0, g: 0xaa / 255, b: 0x66 / 255 }, width: 2 },
      paintOrder: { generatedLayerRole: "outline" },
    });
    expect(outlineOp).toMatchObject({
      op: "strokeRoundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      lineWidth: 2,
    });
    expect(pdfBytes).toContain("0 0.6667 0.4 RG");
    expect(pdfBytes).toContain("84 333 m");
    expect(pdfBytes).toContain("S");
  });

  test("projects and renders view background image before child text", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "View Background Image PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
        }}
      >
        <p style={{ position: "absolute", left: 0.25, top: 0.2, width: 2, height: 0.4 }}>In box</p>
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const backgroundImageVisual = visuals.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageIndex = content.findIndex((op) => op.op === "image");
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "In box");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(backgroundImageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 216, height: 72 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThan(imageIndex);
    expect(pdfBytes.indexOf("/Im1 Do")).toBeLessThan(pdfBytes.indexOf("(In box) Tj"));
  });

  test("clips rounded view background images with a pdf round rect clip", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded View Background Image PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderRadius: "12pt",
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(pdfBytes).toContain("/Im1 Do");
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("84 333 m");
  });

  test("projects and renders view linear gradient backgrounds as pdf shading patterns", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Gradient PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: "linear-gradient(90deg, #FF0000 0%, #0000FF 100%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const gradientVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const gradientOp = projection.pages[0]?.content.find(
      (op) => (op as { op: string }).op === "fillLinearGradientRect",
    ) as
      | {
          readonly op: "fillLinearGradientRect";
          readonly box: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
          };
        }
      | undefined;
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(gradientVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      fill: {
        kind: "linear-gradient",
        angle: 90,
        stops: [
          { color: { r: 1, g: 0, b: 0 }, position: 0 },
          { color: { r: 0, g: 0, b: 1 }, position: 1 },
        ],
      },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(gradientOp).toMatchObject({
      op: "fillLinearGradientRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(projection.resources.gradients).toHaveLength(1);
    expect(pdfBytes).toContain("/Pattern cs");
    expect(pdfBytes).toContain("/P1 scn");
    expect(pdfBytes).toContain("/ShadingType 2");
  });

  test("projects rounded view gradient background layers into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded View Gradient Layers PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderRadius: "12pt",
          background:
            "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0) 100%), linear-gradient(90deg, #DDEEFF 0%, #112233 100%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const backgroundVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual) => visual.kind === "shape" && visual.fill?.kind === "linear-gradient",
    );
    const gradientOps = (projection.pages[0]?.content ?? []).filter((op) =>
      (op as { op: string }).op.startsWith("fillLinearGradient"),
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundVisuals).toHaveLength(2);
    expect(backgroundVisuals).toEqual(
      backgroundVisuals.map(() =>
        expect.objectContaining({
          kind: "shape",
          shape: "roundRect",
          radius: 12,
        }),
      ),
    );
    expect(gradientOps).toHaveLength(2);
    expect(gradientOps).toEqual(
      gradientOps.map(() =>
        expect.objectContaining({
          op: "fillLinearGradientRoundRect",
          box: { x: 72, y: 72, width: 144, height: 72 },
          radius: 12,
        }),
      ),
    );
    expect(projection.resources.gradients).toHaveLength(2);
    expect(pdfBytes).toContain("/Pattern cs");
    expect(pdfBytes).toContain("84 333 m");
  });

  test("renders multi-stop linear gradient backgrounds as stitched pdf functions", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Multi Stop Gradient PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: "linear-gradient(90deg, #FF0000 0%, #00FF00 50%, #0000FF 100%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const gradientVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(gradientVisual).toMatchObject({
      kind: "shape",
      fill: {
        kind: "linear-gradient",
        stops: [
          { color: { r: 1, g: 0, b: 0 }, position: 0 },
          { color: { r: 0, g: 1, b: 0 }, position: 0.5 },
          { color: { r: 0, g: 0, b: 1 }, position: 1 },
        ],
      },
    });
    expect(pdfBytes).toContain("/FunctionType 3");
    expect(pdfBytes).toContain("/Bounds [0.5]");
    expect(pdfBytes).toContain("/Encode [0 1 0 1]");
    expect(pdfBytes).toContain("/C0 [1 0 0]");
    expect(pdfBytes).toContain("/C1 [0 1 0]");
    expect(pdfBytes).toContain("/C0 [0 1 0]");
    expect(pdfBytes).toContain("/C1 [0 0 1]");
  });

  test("renders uniform linear gradient stop opacity through pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Gradient PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: "linear-gradient(90deg, rgba(255, 0, 0, 0.4) 0%, rgba(0, 0, 255, 0.4) 100%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const gradientVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const gradientOp = projection.pages[0]?.content.find(
      (op) => (op as { op: string }).op === "fillLinearGradientRect",
    ) as { readonly opacity?: number } | undefined;
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(gradientVisual).toMatchObject({
      kind: "shape",
      fill: {
        kind: "linear-gradient",
        opacity: 0.4,
        stops: [
          { color: { r: 1, g: 0, b: 0 }, position: 0, opacity: 0.4 },
          { color: { r: 0, g: 0, b: 1 }, position: 1, opacity: 0.4 },
        ],
      },
    });
    expect(gradientOp).toMatchObject({ opacity: 0.4 });
    expect(pdfBytes).toContain("/ExtGState << /GS400 << /Type /ExtGState /CA 0.4 /ca 0.4 >> >>");
    expect(pdfBytes).toContain("/GS400 gs");
  });

  test("records a fallback when gradient stop opacity varies", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Variable Gradient Opacity PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: "linear-gradient(90deg, rgba(255, 0, 0, 0.2) 0%, rgba(0, 0, 255, 0.8) 100%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_UNSUPPORTED_SEMANTIC",
        severity: "warning",
        message: expect.stringContaining("gradientStopOpacity"),
      }),
    );
    expect(renderResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );

    const projection = expectPdfPageModel(projectResult.projection);
    const gradientFallback = projection.fallbacks.find(
      (fallback) =>
        fallback.code === "W_PDF_UNSUPPORTED_SEMANTIC" &&
        fallback.semantic?.property.endsWith("gradientStopOpacity"),
    );
    const gradientOp = projection.pages[0]?.content.find(
      (op) => (op as { op: string }).op === "fillLinearGradientRect",
    ) as { readonly opacity?: number } | undefined;

    expect(gradientFallback).toMatchObject({
      kind: "group",
      semantic: {
        feature: "opacity",
        value: "0.2,0.8",
        fallback: {
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["gradientStopOpacityMetadata"]),
          missing: ["variableGradientStopOpacity"],
        },
      },
    });
    expect(gradientOp?.opacity).toBeUndefined();
  });

  test("projects and renders circle radial gradient backgrounds as pdf shading patterns", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Radial Gradient PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          background: "radial-gradient(circle 50% at center, #FF0000 0%, #0000FF 100%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const gradientVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const gradientOp = projection.pages[0]?.content.find(
      (op) => (op as { op: string }).op === "fillRadialGradientRect",
    ) as
      | {
          readonly op: "fillRadialGradientRect";
          readonly box: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
          };
        }
      | undefined;
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(gradientVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 144 },
      fill: {
        kind: "radial-gradient",
        shape: "circle",
        center: { x: 0.5, y: 0.5 },
        radius: { x: 0.5, y: 0.5 },
        stops: [
          { color: { r: 1, g: 0, b: 0 }, position: 0 },
          { color: { r: 0, g: 0, b: 1 }, position: 1 },
        ],
      },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(gradientOp).toMatchObject({
      op: "fillRadialGradientRect",
      box: { x: 72, y: 72, width: 144, height: 144 },
    });
    expect(projection.resources.gradients).toHaveLength(1);
    expect(pdfBytes).toContain("/Pattern cs");
    expect(pdfBytes).toContain("/P1 scn");
    expect(pdfBytes).toContain("/ShadingType 3");
    expect(pdfBytes).toContain("/Matrix [72 0 0 72 144 261]");
    expect(pdfBytes).toContain("/Coords [0 0 0 0 0 1]");
  });

  test("projects repeated view background images as tiled pdf image visuals", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Repeated Background Image PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 0.5,
          background: `url("${pngData}") repeat-x left top / 36pt 36pt`,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisuals =
      projection.pages[0]?.visuals?.filter(
        (visual) =>
          visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
      ) ?? [];
    const imageOps = projection.pages[0]?.content.filter((op) => op.op === "image") ?? [];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(imageVisuals).toHaveLength(2);
    expect(imageVisuals[0]).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 36, height: 36 },
      clipBox: { x: 72, y: 72, width: 72, height: 36 },
    });
    expect(imageVisuals[1]).toMatchObject({
      kind: "image",
      box: { x: 108, y: 72, width: 36, height: 36 },
      clipBox: { x: 72, y: 72, width: 72, height: 36 },
    });
    expect(imageOps).toHaveLength(2);
    expect(pdfBytes.match(/\/Im1 Do/g)).toHaveLength(2);
  });

  test("positions repeated pdf background image tiles on the non-repeated axis", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Positioned Repeated Background Image PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          background: `url("${pngData}") repeat-y right top / 36pt 36pt`,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisuals =
      projection.pages[0]?.visuals?.filter(
        (visual) =>
          visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
      ) ?? [];
    const imageOps = projection.pages[0]?.content.filter((op) => op.op === "image") ?? [];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(imageVisuals).toHaveLength(2);
    expect(imageVisuals[0]).toMatchObject({
      kind: "image",
      box: { x: 108, y: 72, width: 36, height: 36 },
      clipBox: { x: 72, y: 72, width: 72, height: 72 },
    });
    expect(imageVisuals[1]).toMatchObject({
      kind: "image",
      box: { x: 108, y: 108, width: 36, height: 36 },
      clipBox: { x: 72, y: 72, width: 72, height: 72 },
    });
    expect(imageOps).toHaveLength(2);
    expect(pdfBytes.match(/\/Im1 Do/g)).toHaveLength(2);
  });

  test("positions no-repeat pdf background images with explicit size", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Positioned No Repeat Background Image PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          background: `url("${pngData}") no-repeat right bottom / 36pt 36pt`,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisuals =
      projection.pages[0]?.visuals?.filter(
        (visual) =>
          visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
      ) ?? [];
    const imageOps = projection.pages[0]?.content.filter((op) => op.op === "image") ?? [];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(imageVisuals).toHaveLength(1);
    expect(imageVisuals[0]).toMatchObject({
      kind: "image",
      box: { x: 108, y: 108, width: 36, height: 36 },
    });
    expect(imageOps).toHaveLength(1);
    expect(pdfBytes.match(/\/Im1 Do/g)).toHaveLength(1);
  });

  test("projects contained pdf background images into their rendered box", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Contained Background Image PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          background: `url("${pngData}") no-repeat center / contain`,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);
    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("144 0 0 72 72 225 cm");
  });

  test("rotates contained pdf background images around the group frame", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Contained Background Image PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          background: `url("${pngData}") no-repeat center / contain`,
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 144 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 144 },
    });
  });

  test("tiles contained pdf background images when repeated", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Repeated Contained Background Image PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${pngData}") repeat-x left top / contain`,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisuals =
      projection.pages[0]?.visuals?.filter(
        (visual) =>
          visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
      ) ?? [];
    const imageOps = projection.pages[0]?.content.filter((op) => op.op === "image") ?? [];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);
    expect(imageVisuals).toHaveLength(2);
    expect(imageVisuals[0]).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 72, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(imageVisuals[1]).toMatchObject({
      kind: "image",
      box: { x: 144, y: 72, width: 72, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(imageOps).toHaveLength(2);
    expect(pdfBytes.match(/\/Im1 Do/g)).toHaveLength(2);
  });

  test("clips repeated cover-sized pdf background images", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Repeated Cover Background Image PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${pngData}") repeat-x left top / cover`,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisuals =
      projection.pages[0]?.visuals?.filter(
        (visual) =>
          visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
      ) ?? [];
    const imageOps = projection.pages[0]?.content.filter((op) => op.op === "image") ?? [];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);
    expect(imageVisuals).toHaveLength(1);
    expect(imageVisuals[0]).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 144 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(imageOps).toHaveLength(1);
    expect(pdfBytes.match(/\/Im1 Do/g)).toHaveLength(1);
  });

  test("projects and renders text box background and border before text", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Box PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 0.75,
          backgroundColor: "#FEF3C7",
          border: "1pt solid #92400E",
        }}
      >
        Highlight
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const textBox = visuals.find(
      (visual) =>
        visual.kind === "shape" &&
        visual.paintOrder.generatedLayerRole === "background" &&
        visual.box.x === 72 &&
        visual.box.y === 72,
    );
    const fillIndex = content.findIndex(
      (op) => op.op === "setFillColor" && op.color.r === 0xfe / 255,
    );
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "Highlight");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textBox).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 216, height: 54 },
      fill: { color: { r: 0xfe / 255, g: 0xf3 / 255, b: 0xc7 / 255 } },
      stroke: { color: { r: 0x92 / 255, g: 0x40 / 255, b: 0x0e / 255 }, width: 1 },
    });
    expect(textIndex).toBeGreaterThan(fillIndex);
    expect(pdfBytes).toContain("0.9961 0.9529 0.7804 rg");
    expect(pdfBytes).toContain("0.5725 0.251 0.0549 RG");
    expect(pdfBytes.indexOf("72 279 216 54 re")).toBeLessThan(pdfBytes.indexOf("(Highlight) Tj"));
  });

  test("projects and renders rounded text box outlines as pdf round rect strokes", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Text Outline PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderRadius: "12pt",
          outline: "2pt solid #00AA66",
        }}
      >
        Rounded text
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const outlineVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "outline",
    );
    const outlineOp = projection.pages[0]?.content.find((op) => op.op === "strokeRoundRect");
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Rounded text",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(outlineVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      stroke: { color: { r: 0, g: 0xaa / 255, b: 0x66 / 255 }, width: 2 },
      paintOrder: { generatedLayerRole: "outline" },
    });
    expect(outlineOp).toMatchObject({
      op: "strokeRoundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      lineWidth: 2,
    });
    expect(textOp).toMatchObject({ op: "text", text: "Rounded text" });
    expect(pdfBytes).toContain("0 0.6667 0.4 RG");
    expect(pdfBytes).toContain("84 333 m");
    expect(pdfBytes).toContain("S");
  });

  test("projects rounded text box gradient background layers into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Text Gradient Layers PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderRadius: "12pt",
          background:
            "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0) 100%), linear-gradient(90deg, #DDEEFF 0%, #112233 100%)",
        }}
      >
        Rounded gradient
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const backgroundVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual) =>
        visual.kind === "shape" &&
        visual.paintOrder.generatedLayerRole === "background" &&
        visual.fill?.kind === "linear-gradient",
    );
    const gradientOps = (projection.pages[0]?.content ?? []).filter((op) =>
      (op as { op: string }).op.startsWith("fillLinearGradient"),
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundVisuals).toHaveLength(2);
    expect(backgroundVisuals).toEqual(
      backgroundVisuals.map(() =>
        expect.objectContaining({
          kind: "shape",
          shape: "roundRect",
          radius: 12,
        }),
      ),
    );
    expect(gradientOps).toHaveLength(2);
    expect(gradientOps).toEqual(
      gradientOps.map(() =>
        expect.objectContaining({
          op: "fillLinearGradientRoundRect",
          box: { x: 72, y: 72, width: 144, height: 72 },
          radius: 12,
        }),
      ),
    );
    expect(projection.resources.gradients).toHaveLength(2);
    expect(pdfBytes).toContain("/Pattern cs");
    expect(pdfBytes).toContain("(Rounded gradient) Tj");
  });

  test("projects flipped text box gradient background layers with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Flipped Text Gradient Layers PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          transform: "scaleX(-1)",
          background:
            "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0) 100%), linear-gradient(90deg, #DDEEFF 0%, #112233 100%)",
        }}
      >
        Flipped gradient
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const backgroundVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual) =>
        visual.kind === "shape" &&
        visual.paintOrder.generatedLayerRole === "background" &&
        visual.fill?.kind === "linear-gradient",
    );
    const gradientOps = (projection.pages[0]?.content ?? []).filter((op) =>
      (op as { op: string }).op.startsWith("fillLinearGradient"),
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundVisuals).toHaveLength(2);
    expect(backgroundVisuals).toEqual(
      backgroundVisuals.map(() =>
        expect.objectContaining({
          kind: "shape",
          flipH: true,
          box: { x: 72, y: 72, width: 144, height: 72 },
        }),
      ),
    );
    expect(gradientOps).toHaveLength(2);
    expect(gradientOps).toEqual(
      gradientOps.map(() =>
        expect.objectContaining({
          flipH: true,
          box: { x: 72, y: 72, width: 144, height: 72 },
        }),
      ),
    );
    expect(pdfBytes).toContain("-1 0 0 1 288 0 cm");
    expect(pdfBytes).toContain("(Flipped gradient) Tj");
  });

  test("projects and renders text box background image before text", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Box Background Image PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 0.75,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
        }}
      >
        Highlight
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const backgroundImageVisual = visuals.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageIndex = content.findIndex((op) => op.op === "image");
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "Highlight");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(backgroundImageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 216, height: 54 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThan(imageIndex);
    expect(pdfBytes.indexOf("/Im1 Do")).toBeLessThan(pdfBytes.indexOf("(Highlight) Tj"));
  });

  test("rotates contained text box background images around the text frame", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Text Background Image PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          background: `url("${pngData}") no-repeat center / contain`,
          transform: "rotate(90deg)",
        }}
      >
        A
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 144 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 144 },
    });
  });

  test("keeps generated backgrounds inside their owning sibling paint order", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Sibling Paint Order PDF" }, () => (
      <>
        <shape
          shape="rect"
          style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1, fill: "#FF0000" }}
        />
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 1,
            width: 2,
            height: 1,
            backgroundColor: "#0000FF",
          }}
        />
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(projectResult.projection);
    const fills = (projection.pages[0]?.content ?? []).filter(
      (operation) => operation.op === "fillRect",
    );

    expect(projectResult.ok).toBe(true);
    expect(fills).toHaveLength(2);
    expect(fills[0]).toMatchObject({ box: { x: 72, y: 72, width: 144, height: 72 } });
    expect(fills[1]).toMatchObject({ box: { x: 288, y: 72, width: 144, height: 72 } });
  });

  test("clips rounded text box background images with a pdf round rect clip", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Text Box Background Image PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderRadius: "12pt",
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
        }}
      >
        Rounded image
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(pdfBytes).toContain("/Im1 Do");
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("84 333 m");
  });

  test("projects and renders text hyperlinks as pdf link annotations", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Link PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 0.5,
          href: "https://example.com/docs",
          tooltip: "Open docs",
        }}
      >
        Docs
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const annotation = projection.pages[0]?.annotations?.[0];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(annotation).toMatchObject({
      kind: "link",
      url: "https://example.com/docs",
      tooltip: "Open docs",
      box: { x: 72, y: 72, width: 144, height: 36 },
    });
    expect(pdfBytes).toContain("/Annots [");
    expect(pdfBytes).toContain("/Subtype /Link");
    expect(pdfBytes).toContain("/Rect [72 297 216 333]");
    expect(pdfBytes).toContain("/URI (https://example.com/docs)");
    expect(pdfBytes).toContain("/Contents (Open docs)");
  });

  test("uses transformed bounds for rotated pdf link annotations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Rotated Link PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 2,
          top: 2,
          width: 2,
          height: 0.5,
          href: "https://example.com/rotated",
          transform: "rotate(90deg)",
        }}
      >
        Rotated
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(projectResult.projection);

    expect(projectResult.ok).toBe(true);
    const annotation = projection.pages[0]?.annotations?.[0];
    expect(annotation).toMatchObject({
      kind: "link",
      url: "https://example.com/rotated",
      box: { x: 198, y: 90, width: 36, height: 144 },
    });
  });

  test("projects and renders inline span hyperlinks as pdf link annotations", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Inline Link PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 0.5,
          fontSize: 20,
        }}
      >
        Go{" "}
        <span style={{ href: "https://example.com/docs", tooltip: "Open inline docs" }}>docs</span>{" "}
        now
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const annotation = projection.pages[0]?.annotations?.[0];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(annotation).toMatchObject({
      kind: "link",
      url: "https://example.com/docs",
      tooltip: "Open inline docs",
      box: { x: 98.68, y: 72, width: 42.239999999999995, height: 36 },
    });
    expect(pdfBytes).toContain("/Rect [98.68 297 140.92 333]");
    expect(pdfBytes).toContain("/URI (https://example.com/docs)");
    expect(pdfBytes).toContain("/Contents (Open inline docs)");
  });

  test("lowers pdf visuals in z-index paint order", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Paint Order PDF" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 1,
            fill: "#F97316",
            zIndex: 10,
          }}
        />
        <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5, zIndex: 0 }}>
          Bottom text
        </p>
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const content = projection.pages[0]?.content ?? [];
    const fillIndex = content.findIndex((op) => op.op === "fillRect");
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "Bottom text");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(fillIndex).toBeGreaterThanOrEqual(0);
    expect(fillIndex).toBeGreaterThan(textIndex);
    expect(pdfBytes.indexOf("(Bottom text) Tj")).toBeLessThan(
      pdfBytes.indexOf("0.9765 0.451 0.0863 rg"),
    );
  });

  test("projects and renders shape edge borders as pdf line operations", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Edge Border PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#FFFFFF",
          borderTop: "2pt solid #FF0000",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const lineVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "line");
    const lineOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(lineVisual).toMatchObject({
      kind: "line",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 72 },
      stroke: { color: { r: 1, g: 0, b: 0 }, width: 2 },
      paintOrder: { generatedLayerRole: "border" },
    });
    expect(lineOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 72 },
      color: { r: 1, g: 0, b: 0 },
      lineWidth: 2,
    });
    expect(pdfBytes).toContain("1 0 0 RG");
    expect(pdfBytes).toContain("2 w");
    expect(pdfBytes).toContain("72 333 m");
    expect(pdfBytes).toContain("216 333 l");
    expect(pdfBytes).toContain("S");
  });

  test("projects solid shape brightness filters into adjusted pdf fill colors", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Brightness Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#336699",
          filter: "brightness(120%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillColorOp = projection.pages[0]?.content.find((op) => op.op === "setFillColor");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      fill: { color: { r: 0.24, g: 0.48, b: 0.72 } },
    });
    expect(fillColorOp).toMatchObject({
      op: "setFillColor",
      color: { r: 0.24, g: 0.48, b: 0.72 },
    });
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("0.24 0.48 0.72 rg");
  });

  test("projects stroked solid shape color filters into adjusted pdf fill and stroke colors", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Stroked Color Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#336699",
          stroke: "2pt solid #CC3300",
          filter: "brightness(120%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillColorOp = projection.pages[0]?.content.find((op) => op.op === "setFillColor");
    const strokeColorOp = projection.pages[0]?.content.find((op) => op.op === "setStrokeColor");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      fill: { color: { r: 0.24, g: 0.48, b: 0.72 } },
      stroke: { color: { r: 0.96, g: 0.24, b: 0 }, width: 2 },
    });
    expect(fillColorOp).toMatchObject({
      op: "setFillColor",
      color: { r: 0.24, g: 0.48, b: 0.72 },
    });
    expect(strokeColorOp).toMatchObject({
      op: "setStrokeColor",
      color: { r: 0.96, g: 0.24, b: 0 },
    });
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("0.24 0.48 0.72 rg");
    expect(pdfBytes).toContain("0.96 0.24 0 RG");
  });

  test("projects solid shape contrast filters into adjusted pdf fill colors", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Contrast Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#336699",
          filter: "contrast(120%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillColorOp = projection.pages[0]?.content.find((op) => op.op === "setFillColor");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      fill: { color: { r: 0.14, g: 0.38, b: 0.62 } },
    });
    expect(fillColorOp).toMatchObject({
      op: "setFillColor",
      color: { r: 0.14, g: 0.38, b: 0.62 },
    });
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("0.14 0.38 0.62 rg");
  });

  test("projects solid shape saturate filters into adjusted pdf fill colors", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Saturate Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#336699",
          filter: "saturate(120%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillColorOp = projection.pages[0]?.content.find((op) => op.op === "setFillColor");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({ kind: "shape" });
    if (shapeVisual?.kind !== "shape" || !shapeVisual.fill || !("color" in shapeVisual.fill)) {
      throw new Error("Expected shape fill color.");
    }
    const visualFillColor = shapeVisual.fill.color;
    if (!visualFillColor) {
      throw new Error("Expected shape fill color.");
    }
    expect(visualFillColor.r).toBeCloseTo(0.16564);
    expect(visualFillColor.g).toBeCloseTo(0.40564);
    expect(visualFillColor.b).toBeCloseTo(0.64564);
    expect(fillColorOp).toMatchObject({ op: "setFillColor" });
    if (fillColorOp?.op !== "setFillColor") {
      throw new Error("Expected PDF setFillColor operation.");
    }
    expect(fillColorOp.color.r).toBeCloseTo(0.16564);
    expect(fillColorOp.color.g).toBeCloseTo(0.40564);
    expect(fillColorOp.color.b).toBeCloseTo(0.64564);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("0.1656 0.4056 0.6456 rg");
  });

  test("projects solid shape composite color filters into adjusted pdf fill colors", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Composite Color Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#336699",
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillColorOp = projection.pages[0]?.content.find((op) => op.op === "setFillColor");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({ kind: "shape" });
    if (shapeVisual?.kind !== "shape" || !shapeVisual.fill || !("color" in shapeVisual.fill)) {
      throw new Error("Expected shape fill color.");
    }
    const visualFillColor = shapeVisual.fill.color;
    if (!visualFillColor) {
      throw new Error("Expected shape fill color.");
    }
    expect(visualFillColor.r).toBeCloseTo(0.292);
    expect(visualFillColor.g).toBeCloseTo(0.484);
    expect(visualFillColor.b).toBeCloseTo(0.676);
    expect(fillColorOp).toMatchObject({ op: "setFillColor" });
    if (fillColorOp?.op !== "setFillColor") {
      throw new Error("Expected PDF setFillColor operation.");
    }
    expect(fillColorOp.color.r).toBeCloseTo(0.292);
    expect(fillColorOp.color.g).toBeCloseTo(0.484);
    expect(fillColorOp.color.b).toBeCloseTo(0.676);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("0.292 0.484 0.676 rg");
  });

  test("projects stroked solid shape composite color filters into adjusted pdf fill and stroke colors", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Stroked Composite Color Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#336699",
          stroke: "2pt solid #CC3300",
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillColorOp = projection.pages[0]?.content.find((op) => op.op === "setFillColor");
    const strokeColorOp = projection.pages[0]?.content.find((op) => op.op === "setStrokeColor");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({ kind: "shape" });
    if (shapeVisual?.kind !== "shape" || !shapeVisual.fill || !("color" in shapeVisual.fill)) {
      throw new Error("Expected shape fill color.");
    }
    const visualFillColor = shapeVisual.fill.color;
    if (!visualFillColor || !shapeVisual.stroke) {
      throw new Error("Expected shape fill and stroke colors.");
    }
    expect(visualFillColor.r).toBeCloseTo(0.292);
    expect(visualFillColor.g).toBeCloseTo(0.484);
    expect(visualFillColor.b).toBeCloseTo(0.676);
    expect(shapeVisual.stroke.color.r).toBeCloseTo(0.868);
    expect(shapeVisual.stroke.color.g).toBeCloseTo(0.292);
    expect(shapeVisual.stroke.color.b).toBeCloseTo(0.1);
    expect(fillColorOp).toMatchObject({ op: "setFillColor" });
    if (fillColorOp?.op !== "setFillColor") {
      throw new Error("Expected PDF setFillColor operation.");
    }
    expect(fillColorOp.color.r).toBeCloseTo(0.292);
    expect(fillColorOp.color.g).toBeCloseTo(0.484);
    expect(fillColorOp.color.b).toBeCloseTo(0.676);
    expect(strokeColorOp).toMatchObject({ op: "setStrokeColor" });
    if (strokeColorOp?.op !== "setStrokeColor") {
      throw new Error("Expected PDF setStrokeColor operation.");
    }
    expect(strokeColorOp.color.r).toBeCloseTo(0.868);
    expect(strokeColorOp.color.g).toBeCloseTo(0.292);
    expect(strokeColorOp.color.b).toBeCloseTo(0.1);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("0.292 0.484 0.676 rg");
    expect(pdfBytes).toContain("0.868 0.292 0.1 RG");
  });

  for (const filterCase of [
    {
      filter: "grayscale(100%)",
      name: "grayscale",
      rgb: { r: 0.3718, g: 0.3718, b: 0.3718 },
      pdfColor: "0.3718 0.3718 0.3718 rg",
    },
    {
      filter: "invert(100%)",
      name: "invert",
      rgb: { r: 0.8, g: 0.6, b: 0.4 },
      pdfColor: "0.8 0.6 0.4 rg",
    },
    {
      filter: "sepia(100%)",
      name: "sepia",
      rgb: { r: 0.4996, g: 0.445, b: 0.3466 },
      pdfColor: "0.4996 0.445 0.3466 rg",
    },
    {
      filter: "hue-rotate(90deg)",
      name: "hue-rotate",
      rgb: { r: 0.6, g: 0.2866, b: 0.5436 },
      pdfColor: "0.6 0.2866 0.5436 rg",
    },
  ] as const) {
    test(`projects solid shape ${filterCase.name} filters into adjusted pdf fill colors`, async () => {
      const deck = new Deck({
        layout: { width: 10, height: 5.625, unit: "in" },
        output: { formats: ["pdf"] },
      });
      deck.slide({ name: `${filterCase.name} Filter PDF` }, () => (
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            fill: "#336699",
            filter: filterCase.filter,
          }}
        />
      ));

      const projectResult = await deck.project({ format: "pdf", inspection: "none" });
      const renderResult = await deck.render(pdf({ inspection: "none" }));

      expect(projectResult.diagnostics.items).toEqual([]);
      expect(projectResult.ok).toBe(true);
      expect(renderResult.diagnostics.items).toEqual([]);
      expect(renderResult.ok).toBe(true);

      const projection = expectPdfPageModel(projectResult.projection);
      const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
      const fillColorOp = projection.pages[0]?.content.find((op) => op.op === "setFillColor");
      const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

      expect(shapeVisual).toMatchObject({ kind: "shape" });
      if (shapeVisual?.kind !== "shape" || !shapeVisual.fill || !("color" in shapeVisual.fill)) {
        throw new Error("Expected shape fill color.");
      }
      const visualFillColor = shapeVisual.fill.color;
      if (!visualFillColor) {
        throw new Error("Expected shape fill color.");
      }
      expect(visualFillColor.r).toBeCloseTo(filterCase.rgb.r);
      expect(visualFillColor.g).toBeCloseTo(filterCase.rgb.g);
      expect(visualFillColor.b).toBeCloseTo(filterCase.rgb.b);
      expect(fillColorOp).toMatchObject({ op: "setFillColor" });
      if (fillColorOp?.op !== "setFillColor") {
        throw new Error("Expected PDF setFillColor operation.");
      }
      expect(fillColorOp.color.r).toBeCloseTo(filterCase.rgb.r);
      expect(fillColorOp.color.g).toBeCloseTo(filterCase.rgb.g);
      expect(fillColorOp.color.b).toBeCloseTo(filterCase.rgb.b);
      expect(projection.fallbacks).not.toContainEqual(
        expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
      );
      expect(pdfBytes).toContain(filterCase.pdfColor);
    });
  }

  test("treats filters on visually empty pdf groups as no-op semantics", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Empty Filter PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          filter: "blur(2px)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toEqual([]);

    const projection = expectPdfPageModel(projectResult.projection);
    expect(projection.fallbacks).toEqual([]);
  });

  test("treats filters on zero-area pdf nodes as no-op semantics", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Zero Area Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 0,
          height: 1,
          fill: "#DDEEFF",
          filter: "brightness(120%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toEqual([]);

    const projection = expectPdfPageModel(projectResult.projection);
    expect(projection.fallbacks).toEqual([]);
  });

  test("treats filters on zero-area empty pdf groups as no-op semantics", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Zero Area Group Filter PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 0,
          height: 1,
          backgroundColor: "#DDEEFF",
          filter: "brightness(120%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toEqual([]);

    const projection = expectPdfPageModel(projectResult.projection);
    expect(projection.fallbacks).toEqual([]);
  });

  test("treats filters on fully transparent pdf nodes as no-op semantics", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          opacity: 0,
          filter: "brightness(120%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toEqual([]);

    const projection = expectPdfPageModel(projectResult.projection);
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");

    expect(fillOp).toMatchObject({ op: "fillRect", opacity: 0 });
    expect(projection.fallbacks).toEqual([]);
  });

  test("treats filters inside fully transparent pdf parents as no-op semantics", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Parent Filter PDF" }, () => (
      <div style={{ position: "absolute", left: 0, top: 0, width: 4, height: 3, opacity: 0 }}>
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            fill: "#DDEEFF",
            filter: "brightness(120%)",
          }}
        />
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toEqual([]);

    const projection = expectPdfPageModel(projectResult.projection);
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");

    expect(fillOp).toMatchObject({ op: "fillRect", opacity: 0 });
    expect(projection.fallbacks).toEqual([]);
  });

  test("treats filters inside fully transparent pdf table parents as no-op semantics", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Table Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          opacity: 0,
        }}
      >
        <tbody>
          <tr>
            <td>
              <shape
                shape="rect"
                style={{
                  width: 2,
                  height: 1,
                  fill: "#DDEEFF",
                  filter: "brightness(120%)",
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toEqual([]);

    const projection = expectPdfPageModel(projectResult.projection);
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");

    expect(fillOp).toMatchObject({ op: "fillRect", opacity: 0 });
    expect(projection.fallbacks).toEqual([]);
  });

  test("projects css opacity filters into pdf visual opacity", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Opacity Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "opacity(40%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      opacity: 0.4,
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      opacity: 0.4,
    });
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("72 261 144 72 re");
  });

  test("approximates solid shape chained no-op opacity blur filters without fallback warnings", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Chained Filter Opacity PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "hue-rotate(0) grayscale(0%) opacity(40%) blur(2px)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const blurVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const authoredVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(blurVisuals).toHaveLength(4);
    expect(authoredVisuals).toHaveLength(0);
    expect(
      blurVisuals.map((visual) => (visual.kind === "shape" ? visual.opacity : undefined)),
    ).toEqual([0.4, 0.4, 0.4, 0.4]);
    expect(
      blurVisuals.map((visual) =>
        visual.kind === "shape" && visual.fill?.opacity !== undefined
          ? Number(visual.fill.opacity.toFixed(4))
          : undefined,
      ),
    ).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("/GS160 gs");
  });

  test("parses extra whitespace between projected css filter functions", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Spaced Chained Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "blur(2px)   opacity(40%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const blurVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "filter",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(blurVisuals).toHaveLength(4);
    expect(
      blurVisuals.map((visual) => (visual.kind === "shape" ? visual.opacity : undefined)),
    ).toEqual([0.4, 0.4, 0.4, 0.4]);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({ code: "W_PDF_UNSUPPORTED_SEMANTIC" }),
    );
    expect(pdfBytes).toContain("/GS160 gs");
  });

  test("projects solid shape no-op drop-shadow filters as pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Drop Shadow Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          filter: "sepia(0) drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const authoredVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const authoredFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(authoredVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "authored" },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(authoredFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "sepia(0) drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
      }),
    );
  });

  test("projects gradient shape drop-shadow filters behind authored pdf gradients", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Gradient Drop Shadow Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "linear-gradient(90deg, #FF0000 0%, #0000FF 100%)",
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const authoredVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const gradientFillIndex = content.findIndex((op) => op.op === "fillLinearGradientRect");

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(authoredVisual).toMatchObject({
      kind: "shape",
      fill: { kind: "linear-gradient" },
      paintOrder: { generatedLayerRole: "authored" },
    });
    expect(projection.resources.gradients).toHaveLength(1);
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(gradientFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        semantic: expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }),
      }),
    );
  });

  test("projects image background shape drop-shadow filters behind authored pdf backgrounds", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Background Shape Drop Shadow Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundImageVisual = visuals.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const imageIndex = content.findIndex((op) => op.op === "image");

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(backgroundImageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(projection.resources.images).toHaveLength(1);
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(imageIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        semantic: expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }),
      }),
    );
  });

  test("projects stroked shape drop-shadow filters behind authored pdf strokes", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Stroked Drop Shadow Filter PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          stroke: "2pt solid #CC3300",
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const authoredVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const strokeIndex = content.findIndex(
      (op) => op.op === "strokeRect" && op.box.x === 72 && op.box.y === 72,
    );

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(authoredVisual).toMatchObject({
      kind: "shape",
      stroke: { color: { r: 0.8, g: 0.2, b: 0 }, width: 2 },
      paintOrder: { generatedLayerRole: "authored" },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(strokeIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        semantic: expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }),
      }),
    );
  });

  test("projects solid group drop-shadow filters as pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Group Drop Shadow Filter PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(summary?.unsupportedSemantics).not.toContainEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
      }),
    );
  });

  test("projects background group drop-shadow filters behind authored children", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Group Child Drop Shadow Filter PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      >
        <p style={{ position: "absolute", left: 0.2, top: 0.2, width: 1.4, height: 0.4 }}>Card</p>
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const textVisual = visuals.find((visual) => visual.kind === "text" && visual.text === "Card");
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "Card");

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(textVisual).toMatchObject({
      kind: "text",
      text: "Card",
      box: { x: 86.4, y: 86.4, width: 100.8, height: 28.8 },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(textIndex).toBeGreaterThan(backgroundFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        semantic: expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }),
      }),
    );
  });

  test("projects bordered group drop-shadow filters behind authored pdf borders", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Bordered Group Drop Shadow Filter PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          border: "2pt solid #CC3300",
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const strokeIndex = content.findIndex(
      (op) => op.op === "strokeRect" && op.lineWidth === 2 && op.box.x === 72 && op.box.y === 72,
    );

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      stroke: { color: { r: 0.8, g: 0.2, b: 0 }, width: 2 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(strokeIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        semantic: expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }),
      }),
    );
  });

  test("projects gradient group drop-shadow filters behind authored pdf backgrounds", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Gradient Group Drop Shadow Filter PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: "linear-gradient(90deg, #FF0000 0%, #0000FF 100%)",
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.fill?.kind === "linear-gradient",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const gradientFillIndex = content.findIndex((op) => op.op === "fillLinearGradientRect");

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      fill: { kind: "linear-gradient" },
    });
    expect(projection.resources.gradients).toHaveLength(1);
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(gradientFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        semantic: expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }),
      }),
    );
  });

  test("projects image background group drop-shadow filters behind authored pdf backgrounds", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Background Group Drop Shadow Filter PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundImageVisual = visuals.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const imageIndex = content.findIndex((op) => op.op === "image");

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(backgroundImageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(projection.resources.images).toHaveLength(1);
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(imageIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        semantic: expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }),
      }),
    );
  });

  test("treats isolated pdf elements without blend effects as rendered no-op compositing", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Isolation PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          isolation: "isolate",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("72 261 144 72 re");
  });

  test("projects css multiply blend mode into pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blend PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          mixBlendMode: "multiply",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      blendMode: "multiply",
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      blendMode: "multiply",
    });
    expect(pdfBytes).toContain("/BM /Multiply");
    expect(pdfBytes).toContain("/GSmultiply gs");
    expect(pdfBytes).toContain("72 261 144 72 re");
  });

  test("projects text multiply blend mode into pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Blend PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          color: "#112233",
          fontSize: 24,
          mixBlendMode: "multiply",
        }}
      >
        Blend
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "text");
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textVisual).toMatchObject({
      kind: "text",
      text: "Blend",
      blendMode: "multiply",
    });
    expect(textOp).toMatchObject({
      op: "text",
      text: "Blend",
      blendMode: "multiply",
    });
    expect(pdfBytes).toContain("/BM /Multiply");
    expect(pdfBytes).toContain("/GSmultiply gs");
    expect(pdfBytes).toContain("(Blend) Tj");
  });

  test("projects image multiply blend mode into pdf graphics state", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Blend PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          mixBlendMode: "multiply",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      blendMode: "multiply",
    });
    expect(imageOp).toMatchObject({
      op: "image",
      blendMode: "multiply",
    });
    expect(pdfBytes).toContain("/BM /Multiply");
    expect(pdfBytes).toContain("/GSmultiply gs");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects video poster multiply blend mode into pdf graphics state", async () => {
    const posterData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Video Blend PDF" }, () => (
      <video
        data="data:video/mp4;base64,AAAA"
        posterData={posterData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          mixBlendMode: "multiply",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      blendMode: "multiply",
    });
    expect(imageOp).toMatchObject({
      op: "image",
      blendMode: "multiply",
    });
    expect(pdfBytes).toContain("/BM /Multiply");
    expect(pdfBytes).toContain("/GSmultiply gs");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects css screen blend mode into pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Screen Blend PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          mixBlendMode: "screen",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      blendMode: "screen",
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      blendMode: "screen",
    });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
  });

  test("projects shape border blend mode into pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Border Blend PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderTop: "2pt solid #112233",
          mixBlendMode: "screen",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const borderVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const borderOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(borderVisual).toMatchObject({
      kind: "line",
      blendMode: "screen",
    });
    expect(borderOp).toMatchObject({
      op: "strokeLine",
      blendMode: "screen",
    });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
  });

  test("projects text box background blend mode into pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Background Blend PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 1,
          backgroundColor: "#FEF3C7",
          color: "#112233",
          mixBlendMode: "screen",
        }}
      >
        Highlight
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const backgroundVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const backgroundOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Highlight",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      blendMode: "screen",
      fill: { color: { r: 0xfe / 255, g: 0xf3 / 255, b: 0xc7 / 255 } },
    });
    expect(backgroundOp).toMatchObject({
      op: "fillRect",
      blendMode: "screen",
    });
    expect(textOp).toMatchObject({
      op: "text",
      text: "Highlight",
      blendMode: "screen",
    });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
  });

  test("projects shape background image blend mode into pdf graphics state", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Shape Background Blend PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          mixBlendMode: "screen",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const backgroundImageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundImageVisual).toMatchObject({
      kind: "image",
      blendMode: "screen",
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      blendMode: "screen",
    });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects flipped shape background images into pdf transform matrices", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Flipped Shape Background PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          transform: "scaleX(-1)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const backgroundImageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundImageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      flipH: true,
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      flipH: true,
    });
    expect(pdfBytes).toContain("-1 0 0 1 288 0 cm");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects childless group blend mode into pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Group Blend PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          mixBlendMode: "screen",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const groupVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(groupVisual).toMatchObject({
      kind: "shape",
      blendMode: "screen",
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      blendMode: "screen",
    });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
  });

  test("cascades group blend mode to descendant pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Group Child Blend PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 2,
          mixBlendMode: "screen",
        }}
      >
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 0.25,
            top: 0.25,
            width: 1,
            height: 0.5,
            fill: "#CCDDFF",
          }}
        />
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find(
      (visual) =>
        visual.kind === "shape" && visual.fill?.color !== undefined && visual.fill.color.b === 1,
    );
    const fillOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 90 && op.box.y === 90,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({ kind: "shape", blendMode: "screen" });
    expect(fillOp).toMatchObject({ op: "fillRect", blendMode: "screen" });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
  });

  test("projects and renders outer box shadows as pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Shadow PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const authoredVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const authoredFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(authoredVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(authoredFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(pdfBytes).toContain("/GS250 gs");
    expect(pdfBytes).toContain("0.0667 0.1333 0.2 rg");
    expect(pdfBytes).toContain("78 257 144 72 re");
  });

  test("projects shape opacity with outer box shadows as compounded pdf graphics states", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Shape Shadow Opacity PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          opacity: 0.5,
          boxShadow: "160pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const authoredVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const shadowOp = content.find(
      (op) => op.op === "fillRect" && op.box.x === 232 && op.box.y === 72,
    );
    const authoredOp = content.find(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      fill: { opacity: 0.25 },
      opacity: 0.5,
    });
    expect(authoredVisual).toMatchObject({ kind: "shape", opacity: 0.5 });
    expect(shadowOp).toMatchObject({ op: "fillRect", opacity: 0.125 });
    expect(authoredOp).toMatchObject({ op: "fillRect", opacity: 0.5 });
    expect(pdfBytes).toContain("/GS125 gs");
    expect(pdfBytes).toContain("/GS500 gs");
  });

  test("approximates blurred outer box shadows with layered pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blurred Shadow PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          boxShadow: "6pt 4pt 6pt rgba(17, 34, 51, 0.3)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisuals = visuals.filter(
      (visual): visual is Extract<(typeof visuals)[number], { kind: "shape" }> =>
        visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowFills = content.filter(
      (op) => op.op === "fillRect" && op.box.x < 78 && op.box.width > 144,
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowVisuals.map((visual) => visual.box)).toEqual([
      { x: 72, y: 70, width: 156, height: 84 },
      { x: 74, y: 72, width: 152, height: 80 },
      { x: 76, y: 74, width: 148, height: 76 },
      { x: 78, y: 76, width: 144, height: 72 },
    ]);
    expect(
      shadowVisuals.map((visual) =>
        visual.kind === "shape" && visual.fill?.opacity !== undefined
          ? Number(visual.fill.opacity.toFixed(4))
          : undefined,
      ),
    ).toEqual([0.03, 0.06, 0.09, 0.12]);
    expect(shadowFills).toHaveLength(3);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("approximates blurred inset box shadows with layered pdf inner shadow overlays", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Inset Shadow PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          boxShadow: "inset 4pt 0 2pt rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisuals = visuals.filter(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 144,
    );
    const insetShadowFillIndexes = content
      .map((op, index) => ({ op, index }))
      .filter(
        ({ op }) =>
          op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width < 144,
      )
      .map(({ index }) => index);
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(
      shadowVisuals.map((visual) => (visual.kind === "shape" ? visual.box.width : undefined)),
    ).toEqual([6, 5.333333333333333, 4.666666666666667, 4]);
    expect(
      shadowVisuals.map((visual) =>
        visual.kind === "shape" && visual.fill?.opacity !== undefined
          ? Number(visual.fill.opacity.toFixed(4))
          : undefined,
      ),
    ).toEqual([0.025, 0.05, 0.075, 0.1]);
    expect(backgroundFillIndex).toBeGreaterThanOrEqual(0);
    expect(insetShadowFillIndexes.every((index) => index > backgroundFillIndex)).toBe(true);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("approximates rounded blurred inset box shadows with roundRect pdf overlays", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Inset Shadow PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          borderRadius: "12pt",
          boxShadow: "inset 4pt 0 2pt rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual): visual is PdfShapeVisualElement =>
        visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowVisuals.map((visual) => visual.shape)).toEqual([
      "roundRect",
      "roundRect",
      "roundRect",
      "roundRect",
    ]);
    expect(shadowVisuals.map((visual) => visual.radius)).toEqual([
      14, 13.333333333333334, 12.666666666666666, 12,
    ]);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("projects and renders non-blur inset box shadows as pdf inner shadow overlays", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Inset Shadow Render PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          boxShadow: "inset 4pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 144,
    );
    const insetShadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 4,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 4, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(backgroundFillIndex).toBeGreaterThanOrEqual(0);
    expect(insetShadowFillIndex).toBeGreaterThan(backgroundFillIndex);
    expect(summary?.unsupportedSemantics).toEqual([]);
    expect(pdfBytes).toContain("/GS250 gs");
    expect(pdfBytes).toContain("72 261 4 72 re");
  });

  test("projects rounded non-blur inset box shadows as roundRect pdf overlays", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Inset Shadow Render PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          borderRadius: "12pt",
          boxShadow: "inset 4pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 72, y: 72, width: 4, height: 72 },
      radius: 12,
      paintOrder: { generatedLayerRole: "shadow", generatedLayerPlacement: "aboveBackground" },
    });
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("projects shape inset box shadows above authored pdf fills", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Shape Inset Shadow PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          boxShadow: "inset 4pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const content = projection.pages[0]?.content ?? [];
    const authoredFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 144,
    );
    const insetShadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 4,
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(insetShadowFillIndex).toBeGreaterThan(authoredFillIndex);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("clips round rect inset box shadows to the authored pdf shape", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Round Rect Inset Shadow PDF" }, () => (
      <shape
        shape="roundRect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          borderRadius: "12pt",
          boxShadow: "inset 4pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) =>
        visual.kind === "shape" &&
        visual.paintOrder.generatedLayerRole === "shadow" &&
        visual.box.width === 4,
    );
    const shadowOp = content.find(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 4,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 4, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 72, width: 4, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(summary?.unsupportedSemantics).toEqual([]);
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("n");
    expect(pdfBytes).toContain("72 261 4 72 re");
  });

  test("approximates blurred round rect inset box shadows with layered pdf overlays", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blurred Round Rect Inset Shadow PDF" }, () => (
      <shape
        shape="roundRect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          borderRadius: "12pt",
          boxShadow: "inset 4pt 0 2pt rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual): visual is PdfShapeVisualElement =>
        visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowVisuals.map((visual) => visual.box.width)).toEqual([
      6, 5.333333333333333, 4.666666666666667, 4,
    ]);
    expect(shadowVisuals.map((visual) => visual.shape)).toEqual([
      "roundRect",
      "roundRect",
      "roundRect",
      "roundRect",
    ]);
    expect(shadowVisuals.map((visual) => visual.radius)).toEqual([
      14, 13.333333333333334, 12.666666666666666, 12,
    ]);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("clips ellipse inset box shadows to the authored pdf shape", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Ellipse Inset Shadow PDF" }, () => (
      <shape
        shape="ellipse"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          boxShadow: "inset 4pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) =>
        visual.kind === "shape" &&
        visual.paintOrder.generatedLayerRole === "shadow" &&
        visual.box.width === 4,
    );
    const shadowOp = content.find(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 4,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 4, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipShape: "ellipse",
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 72, width: 4, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipShape: "ellipse",
    });
    expect(summary?.unsupportedSemantics).toEqual([]);
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("n");
    expect(pdfBytes).toContain("72 261 4 72 re");
  });

  test("approximates blurred ellipse inset box shadows with clipped pdf overlays", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blurred Ellipse Inset Shadow PDF" }, () => (
      <shape
        shape="ellipse"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          boxShadow: "inset 4pt 0 2pt rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual): visual is PdfShapeVisualElement =>
        visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowVisuals.map((visual) => visual.box.width)).toEqual([
      6, 5.333333333333333, 4.666666666666667, 4,
    ]);
    expect(
      shadowVisuals.map((visual) => ({
        shape: visual.shape,
        clipBox: visual.clipBox,
        clipShape: visual.clipShape,
      })),
    ).toEqual([
      {
        shape: "rect",
        clipBox: { x: 72, y: 72, width: 144, height: 72 },
        clipShape: "ellipse",
      },
      {
        shape: "rect",
        clipBox: { x: 72, y: 72, width: 144, height: 72 },
        clipShape: "ellipse",
      },
      {
        shape: "rect",
        clipBox: { x: 72, y: 72, width: 144, height: 72 },
        clipShape: "ellipse",
      },
      {
        shape: "rect",
        clipBox: { x: 72, y: 72, width: 144, height: 72 },
        clipShape: "ellipse",
      },
    ]);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("projects and renders flipped box shadows with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Flipped Shadow PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
          transform: "scaleX(-1)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      flipH: true,
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowOp).toMatchObject({
      op: "fillRect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      flipH: true,
    });
    expect(pdfBytes).toContain("-1 0 0 1 300 0 cm");
    expect(pdfBytes).toContain("78 257 144 72 re");
  });

  test("projects and renders box shadow spread radius into expanded pdf shadow boxes", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Spread Shadow PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          boxShadow: "6pt 4pt 0 3pt rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowFillOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 75 && op.box.y === 73,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 75, y: 73, width: 150, height: 78 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowFillOp).toMatchObject({
      op: "fillRect",
      box: { x: 75, y: 73, width: 150, height: 78 },
    });
    expect(pdfBytes).toContain("75 254 150 78 re");
  });

  test("projects and renders text shadows as pdf shadow text visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Shadow PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          color: "#DDEEFF",
          fontSize: 24,
          textShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
        }}
      >
        Shadow
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const authoredVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const shadowTextIndex = content.findIndex(
      (op) => op.op === "text" && op.text === "Shadow" && op.x === 78 && op.y === 76,
    );
    const authoredTextIndex = content.findIndex(
      (op) => op.op === "text" && op.text === "Shadow" && op.x === 72 && op.y === 72,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "text",
      text: "Shadow",
      box: { x: 78, y: 76 },
      style: { fontSize: 24, color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 } },
      opacity: 0.25,
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(authoredVisual).toMatchObject({
      kind: "text",
      text: "Shadow",
      box: { x: 72, y: 72 },
      style: { fontSize: 24, color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(shadowTextIndex).toBeGreaterThanOrEqual(0);
    expect(authoredTextIndex).toBeGreaterThan(shadowTextIndex);
    expect(pdfBytes).toContain("/GS250 gs");
    expect(pdfBytes).toContain("1 0 0 1 78 305 Tm");
    expect(pdfBytes).toContain("(Shadow) Tj");
  });

  test("projects text opacity with text shadows as compounded pdf graphics states", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Shadow Opacity PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          color: "#DDEEFF",
          fontSize: 24,
          opacity: 0.5,
          textShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
        }}
      >
        Shadow
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const authoredVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const shadowOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Shadow" && op.x === 78 && op.y === 76,
    );
    const authoredOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Shadow" && op.x === 72 && op.y === 72,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({ kind: "text", opacity: 0.125 });
    expect(authoredVisual).toMatchObject({ kind: "text", opacity: 0.5 });
    expect(shadowOp).toMatchObject({ op: "text", opacity: 0.125 });
    expect(authoredOp).toMatchObject({ op: "text", opacity: 0.5 });
    expect(pdfBytes).toContain("/GS125 gs");
    expect(pdfBytes).toContain("/GS500 gs");
  });

  test("projects text box shadows behind authored pdf backgrounds", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Box Shadow PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 0.75,
          backgroundColor: "#DDEEFF",
          color: "#112233",
          fontSize: 18,
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
        }}
      >
        Label
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "Label");

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 216, height: 54 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowTextVisual).toBeUndefined();
    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 216, height: 54 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(textIndex).toBeGreaterThan(backgroundFillIndex);
  });

  test("projects text box inset shadows above authored pdf backgrounds", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Box Inset Shadow PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 0.75,
          backgroundColor: "#DDEEFF",
          color: "#112233",
          fontSize: 18,
          boxShadow: "inset 4pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      >
        Label
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 216,
    );
    const insetShadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 4,
    );
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "Label");
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 4, height: 54 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow", generatedLayerPlacement: "aboveBackground" },
    });
    expect(backgroundFillIndex).toBeGreaterThanOrEqual(0);
    expect(insetShadowFillIndex).toBeGreaterThan(backgroundFillIndex);
    expect(textIndex).toBeGreaterThan(insetShadowFillIndex);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("projects text box drop-shadow filters behind authored pdf backgrounds", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Box Drop Shadow Filter PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 0.75,
          backgroundColor: "#DDEEFF",
          color: "#112233",
          fontSize: 18,
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      >
        Label
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const textIndex = content.findIndex((op) => op.op === "text" && op.text === "Label");

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 216, height: 54 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowTextVisual).toBeUndefined();
    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 216, height: 54 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(textIndex).toBeGreaterThan(backgroundFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        semantic: expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }),
      }),
    );
  });

  test("approximates blurred text shadows with layered pdf shadow text visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blurred Text Shadow PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          color: "#DDEEFF",
          fontSize: 24,
          textShadow: "6pt 4pt 2pt rgba(17, 34, 51, 0.25)",
        }}
      >
        Blurred
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisuals = visuals.filter(
      (visual) =>
        visual.kind === "text" &&
        visual.text === "Blurred" &&
        visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowTextOps = content.filter(
      (op) => op.op === "text" && op.text === "Blurred" && op.x !== 72,
    );
    const authoredTextIndex = content.findIndex(
      (op) => op.op === "text" && op.text === "Blurred" && op.x === 72 && op.y === 72,
    );

    expect(shadowVisuals).toHaveLength(4);
    expect(
      shadowVisuals.map((visual) => (visual.kind === "text" ? visual.opacity : undefined)),
    ).toEqual([0.025, 0.05, 0.075, 0.1]);
    expect(shadowTextOps).toHaveLength(4);
    expect(content.findIndex((op) => op === shadowTextOps[0])).toBeLessThan(authoredTextIndex);
  });

  test("projects text drop-shadow filters as pdf shadow text visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Drop Shadow Filter PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          color: "#DDEEFF",
          fontSize: 24,
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      >
        Shadow
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const authoredVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const shadowTextIndex = content.findIndex(
      (op) => op.op === "text" && op.text === "Shadow" && op.x === 78 && op.y === 76,
    );
    const authoredTextIndex = content.findIndex(
      (op) => op.op === "text" && op.text === "Shadow" && op.x === 72 && op.y === 72,
    );

    expect(shadowVisual).toMatchObject({
      kind: "text",
      text: "Shadow",
      box: { x: 78, y: 76 },
      style: { fontSize: 24, color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 } },
      opacity: 0.25,
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(authoredVisual).toMatchObject({
      kind: "text",
      text: "Shadow",
      box: { x: 72, y: 72 },
      style: { fontSize: 24, color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(shadowTextIndex).toBeGreaterThanOrEqual(0);
    expect(authoredTextIndex).toBeGreaterThan(shadowTextIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
      }),
    );
  });

  test("approximates blurred text drop-shadow filters with layered pdf shadow text visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blurred Text Drop Shadow Filter PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          color: "#DDEEFF",
          fontSize: 24,
          filter: "drop-shadow(6pt 4pt 2pt rgba(17, 34, 51, 0.25))",
        }}
      >
        Blurred
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual) =>
        visual.kind === "text" &&
        visual.text === "Blurred" &&
        visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowTextOps = (projection.pages[0]?.content ?? []).filter(
      (op) => op.op === "text" && op.text === "Blurred" && op.x !== 72,
    );

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowTextOps).toHaveLength(4);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        semantic: expect.objectContaining({
          feature: "filter",
          property: "filter",
          value: "drop-shadow(6pt 4pt 2pt rgba(17, 34, 51, 0.25))",
        }),
      }),
    );
  });

  test("keeps text shadow opacity independent from transparent text color", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Text Shadow PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          color: "rgba(221, 238, 255, 0.4)",
          fontSize: 24,
          textShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
        }}
      >
        Shadow
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const authoredVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.paintOrder.generatedLayerRole === "authored",
    );
    const shadowOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.x === 78 && op.y === 76,
    );
    const authoredOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.x === 72 && op.y === 72,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "text",
      opacity: 0.25,
      style: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 } },
    });
    expect(authoredVisual).toMatchObject({
      kind: "text",
      opacity: 0.4,
      style: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(shadowOp).toMatchObject({ op: "text", opacity: 0.25 });
    expect(authoredOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(pdfBytes).toContain("/GS250 gs");
    expect(pdfBytes).toContain("/GS400 gs");
  });

  test("projects and renders rotated text with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Text PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          color: "#112233",
          fontSize: 24,
          transform: "rotate(90deg)",
        }}
      >
        Spin
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "text");
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textVisual).toMatchObject({
      kind: "text",
      text: "Spin",
      box: { x: 72, y: 72, width: 288, height: 72 },
      rotation: 90,
    });
    expect(textOp).toMatchObject({
      op: "text",
      text: "Spin",
      x: 72,
      y: 72,
      box: { x: 72, y: 72, width: 288, height: 72 },
      rotation: 90,
    });
    expect(pdfBytes).toContain("0 -1 1 0 -81 513 cm");
    expect(pdfBytes).toContain("1 0 0 1 72 309 Tm");
    expect(pdfBytes).toContain("(Spin) Tj");
  });

  test("projects vertical-rl writing mode as rotated pdf text", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Vertical Writing PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          color: "#112233",
          fontSize: 24,
          writingMode: "vertical-rl",
        }}
      >
        Tall
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "text");
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textVisual).toMatchObject({
      kind: "text",
      text: "Tall",
      box: { x: 72, y: 72, width: 144, height: 144 },
      rotation: 270,
    });
    expect(textOp).toMatchObject({
      op: "text",
      text: "Tall",
      x: 72,
      y: 72,
      box: { x: 72, y: 72, width: 144, height: 144 },
      rotation: 270,
    });
    expect(pdfBytes).toContain("(Tall) Tj");
  });

  test("projects and renders horizontally flipped text with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Flipped Text PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          color: "#112233",
          fontSize: 24,
          transform: "scaleX(-1)",
        }}
      >
        Flip
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "text");
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textVisual).toMatchObject({
      kind: "text",
      text: "Flip",
      box: { x: 72, y: 72, width: 288, height: 72 },
      flipH: true,
    });
    expect(textOp).toMatchObject({
      op: "text",
      text: "Flip",
      x: 72,
      y: 72,
      box: { x: 72, y: 72, width: 288, height: 72 },
      flipH: true,
    });
    expect(pdfBytes).toContain("-1 0 0 1 432 0 cm");
    expect(pdfBytes).toContain("1 0 0 1 72 309 Tm");
    expect(pdfBytes).toContain("(Flip) Tj");
  });

  test("projects and renders group box shadows behind pdf background visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Group Shadow PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const backgroundVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(pdfBytes).toContain("/GS250 gs");
    expect(pdfBytes).toContain("78 257 144 72 re");
  });

  test("projects rounded group box shadows as roundRect pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Group Shadow PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          borderRadius: "12pt",
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      radius: 12,
      paintOrder: { generatedLayerRole: "shadow" },
    });
  });

  test("projects rotated group box shadows around the group frame", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Group Shadow PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      box: { x: 78, y: 76, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowOp).toMatchObject({
      op: "fillRect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
  });

  test("approximates blurred group box shadows with layered pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blurred Group Shadow PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          boxShadow: "6pt 4pt 6pt rgba(17, 34, 51, 0.3)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const shadowVisuals = visuals.filter(
      (visual): visual is PdfShapeVisualElement =>
        visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowVisuals.map((visual) => visual.box)).toEqual([
      { x: 72, y: 70, width: 156, height: 84 },
      { x: 74, y: 72, width: 152, height: 80 },
      { x: 76, y: 74, width: 148, height: 76 },
      { x: 78, y: 76, width: 144, height: 72 },
    ]);
    expect(shadowVisuals.map((visual) => visual.fill?.opacity)).toEqual([0.03, 0.06, 0.09, 0.12]);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("expands rounded blurred group box shadow radii across pdf shadow layers", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Blurred Group Shadow PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          borderRadius: "12pt",
          boxShadow: "6pt 4pt 6pt rgba(17, 34, 51, 0.3)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual): visual is PdfShapeVisualElement =>
        visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowVisuals.map((visual) => visual.shape)).toEqual([
      "roundRect",
      "roundRect",
      "roundRect",
      "roundRect",
    ]);
    expect(shadowVisuals.map((visual) => visual.radius)).toEqual([18, 16, 14, 12]);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("projects and renders rotated group backgrounds with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Group PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          backgroundColor: "#DDEEFF",
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const backgroundVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
    });
    expect(pdfBytes).toContain("0 -1 1 0 -153 441 cm");
    expect(pdfBytes).toContain("72 261 144 72 re");
  });

  test("projects and renders rotated group children with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Group Child PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          transform: "rotate(90deg)",
        }}
      >
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 0.25,
            top: 0.25,
            width: 1,
            height: 0.5,
            fill: "#CCDDFF",
          }}
        />
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const childVisual = projection.pages[0]?.visuals?.find(
      (visual) =>
        visual.kind === "shape" && visual.fill?.color !== undefined && visual.fill.color.b === 1,
    );
    const fillOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 90 && op.box.y === 90,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(childVisual).toMatchObject({
      kind: "shape",
      box: { x: 90, y: 90, width: 72, height: 36 },
      rotation: 90,
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      box: { x: 90, y: 90, width: 72, height: 36 },
      rotation: 90,
    });
    expect(pdfBytes).toContain("0 -1 1 0 -153 441 cm");
    expect(pdfBytes).toContain("90 279 72 36 re");
  });

  test("projects and renders rotated group borders with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Group Border PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderTop: "2pt solid #112233",
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const borderVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const lineOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(borderVisual).toMatchObject({
      kind: "line",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "border" },
    });
    expect(lineOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("0 -1 1 0 -153 441 cm");
    expect(pdfBytes).toContain("72 333 m");
    expect(pdfBytes).toContain("216 333 l");
  });

  test("projects and renders flipped group borders with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Flipped Group Border PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderTop: "2pt solid #112233",
          transform: "scaleX(-1)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const borderVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const lineOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(borderVisual).toMatchObject({
      kind: "line",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 72 },
      flipH: true,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "border" },
    });
    expect(lineOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 72 },
      flipH: true,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("-1 0 0 1 288 0 cm");
    expect(pdfBytes).toContain("72 333 m");
    expect(pdfBytes).toContain("216 333 l");
  });

  test("projects and renders line shapes as pdf line operations", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Line Shape PDF" }, () => (
      <shape
        shape="line"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderColor: "#336699",
          borderWidth: 3,
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const lineVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "line");
    const lineOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(lineVisual).toMatchObject({
      kind: "line",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 144 },
      stroke: { color: { r: 0.2, g: 0.4, b: 0.6 }, width: 3 },
    });
    expect(lineOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 144 },
      color: { r: 0.2, g: 0.4, b: 0.6 },
      lineWidth: 3,
    });
    expect(pdfBytes).toContain("0.2 0.4 0.6 RG");
    expect(pdfBytes).toContain("3 w");
    expect(pdfBytes).toContain("72 333 m");
    expect(pdfBytes).toContain("216 261 l");
    expect(pdfBytes).toContain("S");
  });

  test("projects and renders rotated line shapes with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Line Shape PDF" }, () => (
      <shape
        shape="line"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderColor: "#336699",
          borderWidth: 3,
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const lineVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "line");
    const lineOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(lineVisual).toMatchObject({
      kind: "line",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 144 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(lineOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 144 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("0 -1 1 0 -153 441 cm");
    expect(pdfBytes).toContain("72 333 m");
    expect(pdfBytes).toContain("216 261 l");
  });

  test("projects and renders horizontally flipped line shapes with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Flipped Line Shape PDF" }, () => (
      <shape
        shape="line"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          borderColor: "#336699",
          borderWidth: 3,
          transform: "scaleX(-1)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const lineVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "line");
    const lineOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(lineVisual).toMatchObject({
      kind: "line",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 144 },
      flipH: true,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(lineOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 144 },
      flipH: true,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("-1 0 0 1 288 0 cm");
    expect(pdfBytes).toContain("72 333 m");
    expect(pdfBytes).toContain("216 261 l");
  });

  test("projects and renders dashed line shapes as pdf dashed stroke operations", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Dashed Line Shape PDF" }, () => (
      <shape
        shape="line"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          stroke: "2pt dashed #336699",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const lineVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "line");
    const lineOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(lineVisual).toMatchObject({
      kind: "line",
      stroke: { color: { r: 0.2, g: 0.4, b: 0.6 }, width: 2, dash: "dash" },
    });
    expect(lineOp).toMatchObject({
      op: "strokeLine",
      color: { r: 0.2, g: 0.4, b: 0.6 },
      lineWidth: 2,
      dash: "dash",
    });
    expect(pdfBytes).toContain("[6 6] 0 d");
    expect(pdfBytes).toContain("[] 0 d");
    expect(pdfBytes).toContain("S");
  });

  test("projects and renders stroke line cap and join into pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Stroke Cap Join PDF" }, () => (
      <>
        <shape
          shape="line"
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            stroke: "3pt solid #336699",
            strokeLinecap: "square",
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 4,
            top: 1,
            width: 1,
            height: 1,
            fill: "#FFFFFF",
            stroke: "2pt solid #CC3300",
            strokeLinejoin: "bevel",
          }}
        />
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const lineVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "line");
    const rectVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.stroke?.color.r === 0.8,
    );
    const lineOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const rectOp = projection.pages[0]?.content.find(
      (op) => op.op === "strokeRect" && op.box.x === 288,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(lineVisual).toMatchObject({
      kind: "line",
      stroke: { width: 3, lineCap: "square" },
    });
    expect(rectVisual).toMatchObject({
      kind: "shape",
      stroke: { width: 2, lineJoin: "bevel" },
    });
    expect(lineOp).toMatchObject({ op: "strokeLine", lineWidth: 3, lineCap: "square" });
    expect(rectOp).toMatchObject({ op: "strokeRect", lineWidth: 2, lineJoin: "bevel" });
    expect(pdfBytes).toContain("2 J");
    expect(pdfBytes).toContain("0 J");
    expect(pdfBytes).toContain("2 j");
    expect(pdfBytes).toContain("0 j");
  });

  test("projects and renders roundRect shapes as pdf rounded rectangle paths", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "RoundRect PDF" }, () => (
      <shape
        shape="roundRect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          border: "2pt solid #112233",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRoundRect");
    const strokeOp = projection.pages[0]?.content.find((op) => op.op === "strokeRoundRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
      stroke: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, width: 2 },
    });
    expect(fillOp).toMatchObject({
      op: "fillRoundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
    });
    expect(strokeOp).toMatchObject({
      op: "strokeRoundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      lineWidth: 2,
    });
    expect(pdfBytes).toContain("0.8667 0.9333 1 rg");
    expect(pdfBytes).toContain("0.0667 0.1333 0.2 RG");
    expect(pdfBytes).toContain("84 333 m");
    expect(pdfBytes).toContain("c");
  });

  test("projects and renders roundRect linear gradient fills as pdf patterns", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "RoundRect Gradient PDF" }, () => (
      <shape
        shape="roundRect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "linear-gradient(90deg, #FF0000 0%, #0000FF 100%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const gradientOp = projection.pages[0]?.content.find(
      (op) => (op as { op: string }).op === "fillLinearGradientRoundRect",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      fill: {
        kind: "linear-gradient",
        stops: [
          { color: { r: 1, g: 0, b: 0 }, position: 0 },
          { color: { r: 0, g: 0, b: 1 }, position: 1 },
        ],
      },
    });
    expect(gradientOp).toMatchObject({
      op: "fillLinearGradientRoundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
    });
    expect(projection.resources.gradients).toHaveLength(1);
    expect(pdfBytes).toContain("/Pattern cs");
    expect(pdfBytes).toContain("/P1 scn");
    expect(pdfBytes).toContain("84 333 m");
    expect(pdfBytes).toContain(" c");
    expect(pdfBytes).toContain("f");
  });

  test("projects and renders roundRect radial gradient fills as pdf patterns", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "RoundRect Radial Gradient PDF" }, () => (
      <shape
        shape="roundRect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "radial-gradient(circle 50% at center, #FF0000 0%, #0000FF 100%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const gradientOp = projection.pages[0]?.content.find(
      (op) => (op as { op: string }).op === "fillRadialGradientRoundRect",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      fill: {
        kind: "radial-gradient",
        shape: "circle",
        center: { x: 0.5, y: 0.5 },
        radius: { x: 0.25, y: 0.5 },
      },
    });
    expect(gradientOp).toMatchObject({
      op: "fillRadialGradientRoundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
    });
    expect(projection.resources.gradients).toHaveLength(1);
    expect(pdfBytes).toContain("/Pattern cs");
    expect(pdfBytes).toContain("/P1 scn");
    expect(pdfBytes).toContain("/ShadingType 3");
    expect(pdfBytes).toContain("84 333 m");
    expect(pdfBytes).toContain(" c");
    expect(pdfBytes).toContain("f");
  });

  test("projects and renders rotated rect shapes with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Rect PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
    });
    expect(pdfBytes).toContain("q");
    expect(pdfBytes).toContain("0 -1 1 0 -153 441 cm");
    expect(pdfBytes).toContain("72 261 144 72 re");
    expect(pdfBytes).toContain("Q");
  });

  test("projects and renders horizontally flipped rect shapes with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Flipped Rect PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#DDEEFF",
          transform: "scaleX(-1)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      flipH: true,
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      flipH: true,
    });
    expect(pdfBytes).toContain("-1 0 0 1 288 0 cm");
    expect(pdfBytes).toContain("72 261 144 72 re");
  });

  test("projects and renders ellipse shapes as pdf bezier path operations", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Ellipse PDF" }, () => (
      <shape
        shape="ellipse"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#CCFFDD",
          border: "2pt solid #225544",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillEllipse");
    const strokeOp = projection.pages[0]?.content.find((op) => op.op === "strokeEllipse");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      shape: "ellipse",
      box: { x: 72, y: 72, width: 144, height: 72 },
      fill: { color: { r: 0xcc / 255, g: 1, b: 0xdd / 255 } },
      stroke: { color: { r: 0x22 / 255, g: 0x55 / 255, b: 0x44 / 255 }, width: 2 },
    });
    expect(fillOp).toMatchObject({
      op: "fillEllipse",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(strokeOp).toMatchObject({
      op: "strokeEllipse",
      box: { x: 72, y: 72, width: 144, height: 72 },
      lineWidth: 2,
    });
    expect(pdfBytes).toContain("0.8 1 0.8667 rg");
    expect(pdfBytes).toContain("0.1333 0.3333 0.2667 RG");
    expect(pdfBytes).toContain("216 297 m");
    expect(pdfBytes).toContain(" c");
    expect(pdfBytes).toContain("f");
    expect(pdfBytes).toContain("S");
  });

  test("projects and renders ellipse linear gradient fills as pdf patterns", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Ellipse Gradient PDF" }, () => (
      <shape
        shape="ellipse"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "linear-gradient(90deg, #FF0000 0%, #0000FF 100%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const gradientOp = projection.pages[0]?.content.find(
      (op) => (op as { op: string }).op === "fillLinearGradientEllipse",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      shape: "ellipse",
      box: { x: 72, y: 72, width: 144, height: 72 },
      fill: {
        kind: "linear-gradient",
        stops: [
          { color: { r: 1, g: 0, b: 0 }, position: 0 },
          { color: { r: 0, g: 0, b: 1 }, position: 1 },
        ],
      },
    });
    expect(gradientOp).toMatchObject({
      op: "fillLinearGradientEllipse",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(projection.resources.gradients).toHaveLength(1);
    expect(pdfBytes).toContain("/Pattern cs");
    expect(pdfBytes).toContain("/P1 scn");
    expect(pdfBytes).toContain("216 297 m");
    expect(pdfBytes).toContain(" c");
    expect(pdfBytes).toContain("f");
  });

  test("projects and renders ellipse radial gradient fills as pdf patterns", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Ellipse Radial Gradient PDF" }, () => (
      <shape
        shape="ellipse"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "radial-gradient(circle 50% at center, #FF0000 0%, #0000FF 100%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shapeVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "shape");
    const gradientOp = projection.pages[0]?.content.find(
      (op) => (op as { op: string }).op === "fillRadialGradientEllipse",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shapeVisual).toMatchObject({
      kind: "shape",
      shape: "ellipse",
      box: { x: 72, y: 72, width: 144, height: 72 },
      fill: {
        kind: "radial-gradient",
        shape: "circle",
        center: { x: 0.5, y: 0.5 },
        radius: { x: 0.25, y: 0.5 },
      },
    });
    expect(gradientOp).toMatchObject({
      op: "fillRadialGradientEllipse",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(projection.resources.gradients).toHaveLength(1);
    expect(pdfBytes).toContain("/Pattern cs");
    expect(pdfBytes).toContain("/P1 scn");
    expect(pdfBytes).toContain("/ShadingType 3");
    expect(pdfBytes).toContain("216 297 m");
    expect(pdfBytes).toContain(" c");
    expect(pdfBytes).toContain("f");
  });

  test("projects and renders shape outline as a generated pdf outline visual", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Outline PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#FFFFFF",
          outline: "2pt solid #00AA66",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const outlineVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "outline",
    );
    const outlineOp = projection.pages[0]?.content.find(
      (op) =>
        op.op === "strokeRect" &&
        op.lineWidth === 2 &&
        op.box.x === 72 &&
        op.box.y === 72 &&
        op.box.width === 144 &&
        op.box.height === 72,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(outlineVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      stroke: { color: { r: 0, g: 0xaa / 255, b: 0x66 / 255 }, width: 2 },
      paintOrder: { generatedLayerRole: "outline" },
    });
    expect(outlineOp).toMatchObject({ op: "strokeRect", lineWidth: 2 });
    expect(pdfBytes).toContain("0 0.6667 0.4 RG");
    expect(pdfBytes).toContain("72 261 144 72 re");
    expect(pdfBytes).toContain("S");
  });

  test("projects and renders flipped shape outlines with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Flipped Outline PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#FFFFFF",
          outline: "2pt solid #00AA66",
          transform: "scaleX(-1)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const outlineVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "outline",
    );
    const outlineOp = projection.pages[0]?.content.find(
      (op) => op.op === "strokeRect" && op.lineWidth === 2,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(outlineVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      flipH: true,
      paintOrder: { generatedLayerRole: "outline" },
    });
    expect(outlineOp).toMatchObject({
      op: "strokeRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      flipH: true,
    });
    expect(pdfBytes).toContain("-1 0 0 1 288 0 cm");
    expect(pdfBytes).toContain("72 261 144 72 re");
  });

  test("projects shape outline blend mode into pdf graphics state", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Outline Blend PDF" }, () => (
      <shape
        shape="rect"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          outline: "2pt solid #00AA66",
          mixBlendMode: "screen",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const outlineVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "outline",
    );
    const outlineOp = projection.pages[0]?.content.find(
      (op) => op.op === "strokeRect" && op.lineWidth === 2,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(outlineVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      blendMode: "screen",
      paintOrder: { generatedLayerRole: "outline" },
    });
    expect(outlineOp).toMatchObject({
      op: "strokeRect",
      blendMode: "screen",
    });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
  });

  test("projects and renders ellipse shape outline as a generated pdf outline visual", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Ellipse Outline PDF" }, () => (
      <shape
        shape="ellipse"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          fill: "#FFFFFF",
          outline: "2pt solid #00AA66",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const outlineVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "outline",
    );
    const outlineOp = projection.pages[0]?.content.find(
      (op) =>
        op.op === "strokeEllipse" &&
        op.lineWidth === 2 &&
        op.box.x === 72 &&
        op.box.y === 72 &&
        op.box.width === 144 &&
        op.box.height === 72,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(outlineVisual).toMatchObject({
      kind: "shape",
      shape: "ellipse",
      box: { x: 72, y: 72, width: 144, height: 72 },
      stroke: { color: { r: 0, g: 0xaa / 255, b: 0x66 / 255 }, width: 2 },
      paintOrder: { generatedLayerRole: "outline" },
    });
    expect(outlineOp).toMatchObject({ op: "strokeEllipse", lineWidth: 2 });
    expect(pdfBytes).toContain("0 0.6667 0.4 RG");
    expect(pdfBytes).toContain("216 297 m");
    expect(pdfBytes).toContain("S");
  });

  test("projects and renders simple table cells as pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF", borderTop: "1pt solid #111111" }}>A</td>
            <td>B</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) =>
        visual.kind === "shape" &&
        visual.paintOrder.generatedLayerRole === "background" &&
        visual.box.x === 72 &&
        visual.box.y === 72 &&
        visual.box.width === 144,
    );
    const cellBorder = visuals.find(
      (visual) =>
        visual.kind === "line" &&
        visual.paintOrder.generatedLayerRole === "border" &&
        visual.from.x === 72 &&
        visual.from.y === 72 &&
        visual.to.x === 216 &&
        visual.to.y === 72,
    );
    const firstCellText = content.find((op) => op.op === "text" && op.text === "A");
    const secondCellText = content.find((op) => op.op === "text" && op.text === "B");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(cellBackground).toMatchObject({
      kind: "shape",
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(cellBorder).toMatchObject({
      kind: "line",
      stroke: { color: { r: 0x11 / 255, g: 0x11 / 255, b: 0x11 / 255 }, width: 1 },
    });
    expect(firstCellText).toMatchObject({ op: "text", text: "A" });
    expect(secondCellText).toMatchObject({ op: "text", text: "B" });
    expect(pdfBytes).toContain("(A) Tj");
    expect(pdfBytes).toContain("(B) Tj");
    expect(pdfBytes).toContain("0.8667 0.9333 1 rg");
    expect(pdfBytes).toContain("0.0667 0.0667 0.0667 RG");
  });

  test("coalesces inline table cell text fragments before pdf text layout", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Inline Text PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td>${240}k</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = (projection.pages[0]?.content ?? []).filter((op) => op.op === "text");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textOps.map((op) => op.text)).toContain("$240k");
    expect(textOps.map((op) => op.text)).not.toEqual(expect.arrayContaining(["$", "240", "k"]));
    expect(pdfBytes).toContain("($240k) Tj");
  });

  test("projects deck table default cell borders into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Default Table Borders PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            <th>Head</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Body</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const borderVisuals = (projection.pages[0]?.visuals ?? []).filter(
      (visual): visual is PdfLineVisualElement =>
        visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const headerTopBorder = borderVisuals.find(
      (visual) => visual.from.x === 72 && visual.from.y === 72 && visual.to.x === 360,
    );
    const bodyBottomBorder = borderVisuals.find(
      (visual) => visual.from.x === 72 && visual.from.y === 144 && visual.to.x === 360,
    );

    expect(headerTopBorder).toMatchObject({
      stroke: { color: { r: 0x25 / 255, g: 0x63 / 255, b: 0xeb / 255 }, width: 0.75 },
    });
    expect(bodyBottomBorder).toMatchObject({
      stroke: { color: { r: 0x11 / 255, g: 0x11 / 255, b: 0x11 / 255 }, width: 0.75 },
    });
  });

  test("projects deck table default cell text size and padding into pdf text", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Default Table Text PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td>Default</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Default",
    );

    expect(textOp).toMatchObject({
      op: "text",
      text: "Default",
      x: 79.2,
      y: 72,
      fontSize: 18,
      box: { x: 79.2, width: 273.6 },
    });
  });

  test("projects table cell vertical alignment into pdf cell text positions", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Cell Middle PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td style={{ fontSize: 20, padding: 0, verticalAlign: "middle" }}>Middle</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Middle",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textOp).toMatchObject({
      op: "text",
      text: "Middle",
      x: 72,
      y: 98,
      fontSize: 20,
    });
    expect(pdfBytes).toContain("1 0 0 1 72 287 Tm");
  });

  test("projects table cell padding into pdf cell text positions", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Cell Padding PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td style={{ fontSize: 20, padding: ["10pt", "8pt", "6pt", "12pt"] }}>Padded</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Padded",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(textOp).toMatchObject({
      op: "text",
      text: "Padded",
      x: 84,
      y: 82,
      fontSize: 20,
    });
    expect(pdfBytes).toContain("1 0 0 1 84 303 Tm");
  });

  test("cascades table opacity to pdf cell text", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Table PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          opacity: 0.4,
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Faded</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Faded",
    );
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Faded");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellTextVisual).toMatchObject({ kind: "text", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Faded) Tj");
  });

  test("projects table background into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Background PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          backgroundColor: "#DDEEFF",
        }}
      >
        <tbody>
          <tr>
            <td>Table Background</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const tableBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(tableBackground).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 144, height: 72 },
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("0.8667 0.9333 1 rg");
    expect(pdfBytes).toContain("(Table Background) Tj");
  });

  test("bakes supported css color filters into table png background image pixels and solid table paint", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Background Image Color Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          backgroundColor: "#336699",
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          border: "2pt solid #CC3300",
          filter: "brightness(120%) contrast(80%)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ border: "none" }} />
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const tableBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const tableBorder = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(
      tableBackground?.kind === "shape" ? tableBackground.fill?.color?.r : undefined,
    ).toBeCloseTo(0.292);
    expect(
      tableBackground?.kind === "shape" ? tableBackground.fill?.color?.g : undefined,
    ).toBeCloseTo(0.484);
    expect(
      tableBackground?.kind === "shape" ? tableBackground.fill?.color?.b : undefined,
    ).toBeCloseTo(0.676);
    expect(tableBorder?.kind === "line" ? tableBorder.stroke.color.r : undefined).toBeCloseTo(
      0.868,
    );
    expect(tableBorder?.kind === "line" ? tableBorder.stroke.color.g : undefined).toBeCloseTo(
      0.292,
    );
    expect(tableBorder?.kind === "line" ? tableBorder.stroke.color.b : undefined).toBeCloseTo(0.1);
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
    expect(pdfBytes).toContain("0.292 0.484 0.676 rg");
    expect(pdfBytes).toContain("0.868 0.292 0.1 RG");
  });

  test("bakes supported css color filters into rounded table border colors", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Table Border Color Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          border: "2pt solid #CC3300",
          borderRadius: "12pt",
          filter: "brightness(120%) contrast(80%)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ border: "none" }} />
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const tableBorder = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "border",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(tableBorder).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      stroke: { width: 2 },
    });
    expect(tableBorder?.kind === "shape" ? tableBorder.stroke?.color.r : undefined).toBeCloseTo(
      0.868,
    );
    expect(tableBorder?.kind === "shape" ? tableBorder.stroke?.color.g : undefined).toBeCloseTo(
      0.292,
    );
    expect(tableBorder?.kind === "shape" ? tableBorder.stroke?.color.b : undefined).toBeCloseTo(
      0.1,
    );
    expect(pdfBytes).toContain("0.868 0.292 0.1 RG");
  });

  test("projects rounded table background into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Table Background PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          backgroundColor: "#DDEEFF",
          borderRadius: "12pt",
        }}
      >
        <tbody>
          <tr>
            <td>Rounded Table</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const tableBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRoundRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(tableBackground).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(fillOp).toMatchObject({
      op: "fillRoundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
    });
    expect(pdfBytes).toContain("0.8667 0.9333 1 rg");
    expect(pdfBytes).toContain("(Rounded Table) Tj");
  });

  test("projects rounded table gradient background into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Table Gradient PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          background:
            "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0) 100%), linear-gradient(90deg, #DDEEFF 0%, #112233 100%)",
          borderRadius: "12pt",
        }}
      >
        <tbody>
          <tr>
            <td>Gradient</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const tableBackgrounds = (projection.pages[0]?.visuals ?? []).filter(
      (visual) =>
        visual.kind === "shape" &&
        visual.paintOrder.generatedLayerRole === "background" &&
        visual.fill?.kind === "linear-gradient",
    );
    const gradientOps = (projection.pages[0]?.content ?? []).filter((op) =>
      (op as { op: string }).op.startsWith("fillLinearGradient"),
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(tableBackgrounds).toHaveLength(2);
    expect(tableBackgrounds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "shape",
          shape: "roundRect",
          box: { x: 72, y: 72, width: 144, height: 72 },
          radius: 12,
          fill: expect.objectContaining({
            kind: "linear-gradient",
            stops: [
              { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 }, position: 0 },
              { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, position: 1 },
            ],
          }),
        }),
      ]),
    );
    expect(tableBackgrounds).toEqual(
      tableBackgrounds.map(() =>
        expect.objectContaining({
          kind: "shape",
          shape: "roundRect",
          radius: 12,
        }),
      ),
    );
    expect(gradientOps).toHaveLength(2);
    expect(gradientOps).toEqual(
      gradientOps.map(() =>
        expect.objectContaining({
          op: "fillLinearGradientRoundRect",
          box: { x: 72, y: 72, width: 144, height: 72 },
          radius: 12,
        }),
      ),
    );
    expect(projection.resources.gradients).toHaveLength(2);
    expect(pdfBytes).toContain("/Pattern cs");
    expect(pdfBytes).toContain("(Gradient) Tj");
  });

  test("clips rounded table background images with a pdf round rect clip", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Table Image Background PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          borderRadius: "12pt",
        }}
      >
        <tbody>
          <tr>
            <td>Image</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(pdfBytes).toContain("/Im1 Do");
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("84 333 m");
  });

  test("projects table border into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Border PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          borderTop: "2pt solid #112233",
        }}
      >
        <tbody>
          <tr>
            <td>Table Border</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const borderVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const borderOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(borderVisual).toMatchObject({
      kind: "line",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 72 },
      stroke: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, width: 2 },
    });
    expect(borderOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 72 },
      color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 },
      lineWidth: 2,
    });
    expect(pdfBytes).toContain("0.0667 0.1333 0.2 RG");
    expect(pdfBytes).toContain("72 333 m");
    expect(pdfBytes).toContain("216 333 l");
    expect(pdfBytes).toContain("(Table Border) Tj");
  });

  test("projects rounded table border into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Table Border PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          border: "2pt solid #112233",
          borderRadius: "12pt",
        }}
      >
        <tbody>
          <tr>
            <td>Rounded Border</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const borderVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "border",
    );
    const borderOp = projection.pages[0]?.content.find((op) => op.op === "strokeRoundRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(borderVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      stroke: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, width: 2 },
      paintOrder: { generatedLayerRole: "border" },
    });
    expect(borderOp).toMatchObject({
      op: "strokeRoundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      lineWidth: 2,
    });
    expect(pdfBytes).toContain("0.0667 0.1333 0.2 RG");
    expect(pdfBytes).toContain("(Rounded Border) Tj");
  });

  test("projects table outline into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Outline PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          borderRadius: "12pt",
          outline: "2pt solid #00AA66",
        }}
      >
        <tbody>
          <tr>
            <td>Table Outline</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const outlineVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "outline",
    );
    const outlineOp = projection.pages[0]?.content.find((op) => op.op === "strokeRoundRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(outlineVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      stroke: { color: { r: 0, g: 0xaa / 255, b: 0x66 / 255 }, width: 2 },
      paintOrder: { generatedLayerRole: "outline" },
    });
    expect(outlineOp).toMatchObject({
      op: "strokeRoundRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      radius: 12,
      lineWidth: 2,
    });
    expect(pdfBytes).toContain("0 0.6667 0.4 RG");
    expect(pdfBytes).toContain("(Table Outline) Tj");
  });

  test("projects table row background into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Row Background PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr style={{ backgroundColor: "#DDEEFF" }}>
            <td>Row Background</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const rowBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(rowBackground).toMatchObject({
      kind: "shape",
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(fillOp).toMatchObject({ op: "fillRect" });
    expect(pdfBytes).toContain("0.8667 0.9333 1 rg");
    expect(pdfBytes).toContain("(Row Background) Tj");
  });

  test("bakes supported css color filters into table row png background image pixels and solid row paint", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Row Background Image Color Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr
            style={{
              backgroundColor: "#336699",
              background: `url("${pngData}") no-repeat left top / 100% 100%`,
              filter: "brightness(120%) contrast(80%)",
            }}
          >
            <td style={{ border: "none" }} />
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const rowBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(rowBackground?.kind === "shape" ? rowBackground.fill?.color?.r : undefined).toBeCloseTo(
      0.292,
    );
    expect(rowBackground?.kind === "shape" ? rowBackground.fill?.color?.g : undefined).toBeCloseTo(
      0.484,
    );
    expect(rowBackground?.kind === "shape" ? rowBackground.fill?.color?.b : undefined).toBeCloseTo(
      0.676,
    );
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
    expect(pdfBytes).toContain("0.292 0.484 0.676 rg");
  });

  test("projects table section background into pdf visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Section Background PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            <th>Head</th>
          </tr>
        </thead>
        <tbody style={{ backgroundColor: "#DDEEFF" }}>
          <tr>
            <td>Section Background</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const sectionBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const fillOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(sectionBackground).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 144, width: 144, height: 72 },
      fill: { color: { r: 0xdd / 255, g: 0xee / 255, b: 1 } },
    });
    expect(fillOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 144, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("0.8667 0.9333 1 rg");
    expect(pdfBytes).toContain("(Section Background) Tj");
  });

  test("bakes supported css color filters into table section png background image pixels and solid section paint", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Section Background Image Color Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody
          style={{
            backgroundColor: "#336699",
            background: `url("${pngData}") no-repeat left top / 100% 100%`,
            filter: "brightness(120%) contrast(80%)",
          }}
        >
          <tr>
            <td style={{ border: "none" }} />
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const sectionBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(
      sectionBackground?.kind === "shape" ? sectionBackground.fill?.color?.r : undefined,
    ).toBeCloseTo(0.292);
    expect(
      sectionBackground?.kind === "shape" ? sectionBackground.fill?.color?.g : undefined,
    ).toBeCloseTo(0.484);
    expect(
      sectionBackground?.kind === "shape" ? sectionBackground.fill?.color?.b : undefined,
    ).toBeCloseTo(0.676);
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
    expect(pdfBytes).toContain("0.292 0.484 0.676 rg");
  });

  test("cascades table cell opacity to pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Table Cell PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                backgroundColor: "#DDEEFF",
                borderTop: "1pt solid #111111",
                opacity: 0.4,
              }}
            >
              Cell Fade
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = visuals.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Cell Fade",
    );
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Cell Fade");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellBorder).toMatchObject({ kind: "line", opacity: 0.4 });
    expect(cellTextVisual).toMatchObject({ kind: "text", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Cell Fade) Tj");
  });

  test("cascades table section opacity to pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Table Section PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody style={{ opacity: 0.4 }}>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF", borderTop: "1pt solid #111111" }}>
              Section Fade
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = visuals.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Section Fade",
    );
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Section Fade");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellBorder).toMatchObject({ kind: "line", opacity: 0.4 });
    expect(cellTextVisual).toMatchObject({ kind: "text", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Section Fade) Tj");
  });

  test("projects table section css opacity filters into pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Filtered Table Section PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody style={{ filter: "opacity(40%)" }}>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF", borderTop: "1pt solid #111111" }}>
              Section Filter
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = visuals.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Section Filter",
    );
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Section Filter");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellBorder).toMatchObject({ kind: "line", opacity: 0.4 });
    expect(cellTextVisual).toMatchObject({ kind: "text", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Section Filter) Tj");
  });

  test("projects table section drop-shadow filters as pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Section Drop Shadow Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody style={{ filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))" }}>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Section Shadow</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(cellBackground).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
      }),
    );
  });

  test("preserves table section unsupported filter warnings while projecting opacity filters", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Chained Table Section Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody style={{ filter: "opacity(40%) blur(2px)" }}>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Section Chain</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_UNSUPPORTED_SEMANTIC",
        severity: "warning",
        message: expect.stringContaining("filter"),
      }),
    );
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const cellBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellTextOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Section Chain",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(projection.fallbacks).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_UNSUPPORTED_SEMANTIC",
        message: expect.stringContaining("filter"),
      }),
    );
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Section Chain) Tj");
  });

  test("keeps unsupported filter fallback keys distinct across repeated table body sections", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Repeated Table Section Fallback PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1.2,
          tableLayout: "fixed",
        }}
      >
        <tbody style={{ filter: "opacity(40%) blur(2px)" }}>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>First Body</td>
          </tr>
        </tbody>
        <tbody style={{ filter: "opacity(40%) blur(2px)" }}>
          <tr>
            <td style={{ backgroundColor: "#E8F8DD" }}>Second Body</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(projectResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const sectionFilterFallbacks = projection.fallbacks.filter(
      (fallback) =>
        fallback.code === "W_PDF_UNSUPPORTED_SEMANTIC" &&
        fallback.semantic?.feature === "filter" &&
        fallback.semantic.property === "filter" &&
        fallback.semantic.value === "opacity(40%) blur(2px)",
    );

    expect(sectionFilterFallbacks).toHaveLength(2);
    expect(projectResult.diagnostics.items).toHaveLength(2);
  });

  test("projects table section blend mode into pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blended Table Section PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody style={{ mixBlendMode: "screen" }}>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF", borderTop: "1pt solid #111111" }}>
              Section Blend
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = visuals.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Section Blend",
    );
    const backgroundOp = content.find((op) => op.op === "fillRect");
    const borderOp = content.find((op) => op.op === "strokeLine");
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Section Blend");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", blendMode: "screen" });
    expect(cellBorder).toMatchObject({ kind: "line", blendMode: "screen" });
    expect(cellTextVisual).toMatchObject({ kind: "text", blendMode: "screen" });
    expect(backgroundOp).toMatchObject({ op: "fillRect", blendMode: "screen" });
    expect(borderOp).toMatchObject({ op: "strokeLine", blendMode: "screen" });
    expect(cellTextOp).toMatchObject({ op: "text", blendMode: "screen" });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
    expect(pdfBytes).toContain("(Section Blend) Tj");
  });

  test("cascades table row opacity to pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Transparent Table Row PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr style={{ opacity: 0.4 }}>
            <td style={{ backgroundColor: "#DDEEFF", borderTop: "1pt solid #111111" }}>Row Fade</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = visuals.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Row Fade",
    );
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Row Fade");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellBorder).toMatchObject({ kind: "line", opacity: 0.4 });
    expect(cellTextVisual).toMatchObject({ kind: "text", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Row Fade) Tj");
  });

  test("projects table row css opacity filters into pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Filtered Table Row PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr style={{ filter: "opacity(40%)" }}>
            <td style={{ backgroundColor: "#DDEEFF", borderTop: "1pt solid #111111" }}>
              Row Filter
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = visuals.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Row Filter",
    );
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Row Filter");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellBorder).toMatchObject({ kind: "line", opacity: 0.4 });
    expect(cellTextVisual).toMatchObject({ kind: "text", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Row Filter) Tj");
  });

  test("projects table row drop-shadow filters as pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Row Drop Shadow Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr style={{ filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))" }}>
            <td style={{ backgroundColor: "#DDEEFF" }}>Row Shadow</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(cellBackground).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
      }),
    );
  });

  test("preserves table row unsupported filter warnings while projecting opacity filters", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Chained Table Row Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr style={{ filter: "opacity(40%) blur(2px)" }}>
            <td style={{ backgroundColor: "#DDEEFF" }}>Row Chain</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_UNSUPPORTED_SEMANTIC",
        severity: "warning",
        message: expect.stringContaining("filter"),
      }),
    );
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const cellBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellTextOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Row Chain",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(projection.fallbacks).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_UNSUPPORTED_SEMANTIC",
        message: expect.stringContaining("filter"),
      }),
    );
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Row Chain) Tj");
  });

  test("projects table row blend mode into pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blended Table Row PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr style={{ mixBlendMode: "screen" }}>
            <td style={{ backgroundColor: "#DDEEFF", borderTop: "1pt solid #111111" }}>
              Row Blend
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = visuals.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Row Blend",
    );
    const backgroundOp = content.find((op) => op.op === "fillRect");
    const borderOp = content.find((op) => op.op === "strokeLine");
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Row Blend");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", blendMode: "screen" });
    expect(cellBorder).toMatchObject({ kind: "line", blendMode: "screen" });
    expect(cellTextVisual).toMatchObject({ kind: "text", blendMode: "screen" });
    expect(backgroundOp).toMatchObject({ op: "fillRect", blendMode: "screen" });
    expect(borderOp).toMatchObject({ op: "strokeLine", blendMode: "screen" });
    expect(cellTextOp).toMatchObject({ op: "text", blendMode: "screen" });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
    expect(pdfBytes).toContain("(Row Blend) Tj");
  });

  test("projects table css opacity filters into pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Filtered Table PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          filter: "opacity(40%)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Faded</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Faded",
    );
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Faded");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellTextVisual).toMatchObject({ kind: "text", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Faded) Tj");
  });

  test("projects table cell css opacity filters into pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Filtered Table Cell PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                backgroundColor: "#DDEEFF",
                borderTop: "1pt solid #111111",
                filter: "opacity(40%)",
              }}
            >
              Cell Filter
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = visuals.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Cell Filter",
    );
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Cell Filter");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellBorder).toMatchObject({ kind: "line", opacity: 0.4 });
    expect(cellTextVisual).toMatchObject({ kind: "text", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Cell Filter) Tj");
  });

  test("projects table cell drop-shadow filters as pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Cell Drop Shadow Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                backgroundColor: "#DDEEFF",
                filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
              }}
            >
              Cell Shadow
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(cellBackground).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
      }),
    );
  });

  test("preserves table cell unsupported filter warnings while projecting opacity filters", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Chained Table Cell Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                backgroundColor: "#DDEEFF",
                filter: "opacity(40%) blur(2px)",
              }}
            >
              Cell Chain
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.ok).toBe(true);
    expect(projectResult.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_UNSUPPORTED_SEMANTIC",
        severity: "warning",
        message: expect.stringContaining("filter"),
      }),
    );
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const cellBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellTextOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Cell Chain",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", opacity: 0.4 });
    expect(cellTextOp).toMatchObject({ op: "text", opacity: 0.4 });
    expect(projection.fallbacks).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_UNSUPPORTED_SEMANTIC",
        message: expect.stringContaining("filter"),
      }),
    );
    expect(pdfBytes).toContain("/GS400 gs");
    expect(pdfBytes).toContain("(Cell Chain) Tj");
  });

  test("projects table blend mode into pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blended Table PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          mixBlendMode: "screen",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Blended</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Blended",
    );
    const backgroundOp = content.find((op) => op.op === "fillRect");
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Blended");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", blendMode: "screen" });
    expect(cellTextVisual).toMatchObject({ kind: "text", blendMode: "screen" });
    expect(backgroundOp).toMatchObject({ op: "fillRect", blendMode: "screen" });
    expect(cellTextOp).toMatchObject({ op: "text", blendMode: "screen" });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
    expect(pdfBytes).toContain("(Blended) Tj");
  });

  test("projects table cell blend mode into pdf cell visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blended Table Cell PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                backgroundColor: "#DDEEFF",
                borderTop: "1pt solid #111111",
                mixBlendMode: "screen",
              }}
            >
              Cell Blend
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = visuals.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Cell Blend",
    );
    const backgroundOp = content.find((op) => op.op === "fillRect");
    const borderOp = content.find((op) => op.op === "strokeLine");
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Cell Blend");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({ kind: "shape", blendMode: "screen" });
    expect(cellBorder).toMatchObject({ kind: "line", blendMode: "screen" });
    expect(cellTextVisual).toMatchObject({ kind: "text", blendMode: "screen" });
    expect(backgroundOp).toMatchObject({ op: "fillRect", blendMode: "screen" });
    expect(borderOp).toMatchObject({ op: "strokeLine", blendMode: "screen" });
    expect(cellTextOp).toMatchObject({ op: "text", blendMode: "screen" });
    expect(pdfBytes).toContain("/BM /Screen");
    expect(pdfBytes).toContain("/GSscreen gs");
    expect(pdfBytes).toContain("(Cell Blend) Tj");
  });

  test("projects and renders table cell hyperlinks as pdf link annotations", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Cell Link PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                backgroundColor: "#DDEEFF",
                href: "https://example.com/cell",
                tooltip: "Open cell",
              }}
            >
              Linked
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const annotation = projection.pages[0]?.annotations?.[0];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(annotation).toMatchObject({
      kind: "link",
      url: "https://example.com/cell",
      tooltip: "Open cell",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("/Annots [");
    expect(pdfBytes).toContain("/Subtype /Link");
    expect(pdfBytes).toContain("/Rect [72 261 216 333]");
    expect(pdfBytes).toContain("/URI (https://example.com/cell)");
    expect(pdfBytes).toContain("/Contents (Open cell)");
  });

  test("projects and renders table box shadows as pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Shadow PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Shadowed</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(cellBackground).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(pdfBytes).toContain("/GS250 gs");
    expect(pdfBytes).toContain("78 257 144 72 re");
    expect(pdfBytes).toContain("(Shadowed) Tj");
  });

  test("projects table drop-shadow filters as pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Drop Shadow Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Filtered Shadow</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(cellBackground).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
      }),
    );
  });

  test("approximates blurred table box shadows with layered pdf shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blurred Table Shadow PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          boxShadow: "6pt 4pt 6pt rgba(17, 34, 51, 0.3)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Blurred Shadow</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisuals = visuals.filter(
      (visual): visual is PdfShapeVisualElement =>
        visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const lastShadowFillIndex = content.findLastIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowVisuals.map((visual) => visual.box)).toEqual([
      { x: 72, y: 70, width: 156, height: 84 },
      { x: 74, y: 72, width: 152, height: 80 },
      { x: 76, y: 74, width: 148, height: 76 },
      { x: 78, y: 76, width: 144, height: 72 },
    ]);
    expect(shadowVisuals.map((visual) => visual.fill?.opacity)).toEqual([0.03, 0.06, 0.09, 0.12]);
    expect(cellBackground).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(lastShadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundFillIndex).toBeGreaterThan(lastShadowFillIndex);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("projects table inset box shadows above pdf table cell backgrounds", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Inset Shadow PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          boxShadow: "inset 4pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Inset</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const content = projection.pages[0]?.content ?? [];
    const cellBackgroundIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 144,
    );
    const insetShadowIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 4,
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(insetShadowIndex).toBeGreaterThan(cellBackgroundIndex);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("approximates blurred table inset box shadows with layered pdf overlays", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blurred Table Inset Shadow PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          boxShadow: "inset 4pt 0 2pt rgba(17, 34, 51, 0.25)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Blurred Inset</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisuals = visuals.filter(
      (visual): visual is PdfShapeVisualElement =>
        visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const cellBackgroundIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 144,
    );
    const insetShadowIndexes = content
      .map((op, index) => ({ op, index }))
      .filter(
        ({ op }) =>
          op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width < 144,
      )
      .map(({ index }) => index);
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowVisuals.map((visual) => visual.box.width)).toEqual([
      6, 5.333333333333333, 4.666666666666667, 4,
    ]);
    expect(cellBackgroundIndex).toBeGreaterThanOrEqual(0);
    expect(insetShadowIndexes.every((index) => index > cellBackgroundIndex)).toBe(true);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("projects rounded table box shadows as pdf round rect shadow visuals", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Table Shadow PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          borderRadius: "12pt",
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Rounded Shadow</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowFillOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRoundRect" && op.box.x === 78 && op.box.y === 76,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "roundRect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      radius: 12,
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowFillOp).toMatchObject({
      op: "fillRoundRect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      radius: 12,
    });
    expect(pdfBytes).toContain("/GS250 gs");
    expect(pdfBytes).toContain("(Rounded Shadow) Tj");
  });

  test("projects table box shadow spread radius without pdf fallback warnings", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Spread Shadow PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          boxShadow: "6pt 4pt 0 3pt rgba(17, 34, 51, 0.25)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Spread</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowFillOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 75 && op.box.y === 73,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 75, y: 73, width: 150, height: 78 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowFillOp).toMatchObject({
      op: "fillRect",
      box: { x: 75, y: 73, width: 150, height: 78 },
    });
    expect(pdfBytes).toContain("75 254 150 78 re");
    expect(pdfBytes).toContain("(Spread) Tj");
  });

  test("projects and renders rotated table shadows with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Table Shadow PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
          transform: "rotate(90deg)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF" }}>Rotated Shadow</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowFillOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowFillOp).toMatchObject({
      op: "fillRect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("0 -1 1 0 -153 441 cm");
    expect(pdfBytes).toContain("(Rotated Shadow) Tj");
  });

  test("projects and renders rotated tables with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Table PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          transform: "rotate(90deg)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: "#DDEEFF", borderTop: "2pt solid #112233" }}>Rotated</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const cellBackground = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = visuals.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const cellTextVisual = visuals.find(
      (visual) => visual.kind === "text" && visual.text === "Rotated",
    );
    const backgroundOp = content.find((op) => op.op === "fillRect");
    const borderOp = content.find((op) => op.op === "strokeLine");
    const cellTextOp = content.find((op) => op.op === "text" && op.text === "Rotated");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(cellBackground).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
    });
    expect(cellBorder).toMatchObject({
      kind: "line",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(cellTextVisual).toMatchObject({ kind: "text", text: "Rotated", rotation: 90 });
    expect(backgroundOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
    });
    expect(borderOp).toMatchObject({
      op: "strokeLine",
      from: { x: 72, y: 72 },
      to: { x: 216, y: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(cellTextOp).toMatchObject({ op: "text", text: "Rotated", rotation: 90 });
    expect(pdfBytes).toContain("0 -1 1 0 -153 441 cm");
    expect(pdfBytes).toContain("(Rotated) Tj");
  });

  test("projects and renders rotated table backgrounds with pdf transform matrices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Table Background PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          backgroundColor: "#DDEEFF",
          transform: "rotate(90deg)",
        }}
      >
        <tbody>
          <tr>
            <td>Rotated Table Background</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const tableBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const backgroundOp = projection.pages[0]?.content.find((op) => op.op === "fillRect");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(tableBackground).toMatchObject({
      kind: "shape",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(backgroundOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("0 -1 1 0 -153 441 cm");
    expect(pdfBytes).toContain("(Rotated Table Background) Tj");
  });

  test("projects and renders rotated table background images with pdf transform matrices", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Table Background Image PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
          background: `url("${pngData}") no-repeat left top / 100% 100%`,
          transform: "rotate(90deg)",
        }}
      >
        <tbody>
          <tr>
            <td>Rotated Table Image</td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("0 -1 1 0 -153 441 cm");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects and renders table cell background images as pdf image visuals", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Cell Background Image PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                backgroundColor: "#DDEEFF",
                background: `url("${pngData}") no-repeat left top / 100% 100%`,
              }}
            >
              A
            </td>
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const backgroundFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72,
    );
    const backgroundImageVisual = visuals.find(
      (visual) => visual.kind === "image" && visual.paintOrder.generatedLayerRole === "background",
    );
    const imageOpIndex = content.findIndex((op) => op.op === "image");
    const textOpIndex = content.findIndex((op) => op.op === "text" && op.text === "A");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(backgroundImageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "background" },
    });
    expect(projection.resources.images).toHaveLength(1);
    expect(backgroundFillIndex).toBeGreaterThanOrEqual(0);
    expect(imageOpIndex).toBeGreaterThan(backgroundFillIndex);
    expect(textOpIndex).toBeGreaterThan(imageOpIndex);
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("bakes supported css color filters into table cell png background image pixels", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Cell Background Image Color Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                background: `url("${pngData}") no-repeat left top / 100% 100%`,
                border: "none",
                filter: "brightness(120%) contrast(80%)",
              }}
            />
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
  });

  test("bakes supported css color filters into table cell png background image pixels and solid cell paint", async () => {
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Table Cell Background Image Solid Paint Color Filter PDF" }, () => (
      <table
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          tableLayout: "fixed",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                backgroundColor: "#336699",
                background: `url("${pngData}") no-repeat left top / 100% 100%`,
                border: "2pt solid #CC3300",
                filter: "brightness(120%) contrast(80%)",
              }}
            />
          </tr>
        </tbody>
      </table>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const cellBackground = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "background",
    );
    const cellBorder = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "line" && visual.paintOrder.generatedLayerRole === "border",
    );
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(
      cellBackground?.kind === "shape" ? cellBackground.fill?.color?.r : undefined,
    ).toBeCloseTo(0.292);
    expect(
      cellBackground?.kind === "shape" ? cellBackground.fill?.color?.g : undefined,
    ).toBeCloseTo(0.484);
    expect(
      cellBackground?.kind === "shape" ? cellBackground.fill?.color?.b : undefined,
    ).toBeCloseTo(0.676);
    expect(cellBorder?.kind === "line" ? cellBorder.stroke.color.r : undefined).toBeCloseTo(0.868);
    expect(cellBorder?.kind === "line" ? cellBorder.stroke.color.g : undefined).toBeCloseTo(0.292);
    expect(cellBorder?.kind === "line" ? cellBorder.stroke.color.b : undefined).toBeCloseTo(0.1);
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
    expect(pdfBytes).toContain("0.292 0.484 0.676 rg");
    expect(pdfBytes).toContain("0.868 0.292 0.1 RG");
  });

  test("projects and renders inline JPEG images as pdf image XObjects", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const jpegBytes = Uint8Array.from(globalThis.atob(jpegData.split(",")[1]!), (character) =>
      character.charCodeAt(0),
    );
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image PDF" }, () => (
      <img
        data={jpegData}
        style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1, objectFit: "fill" }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const imageResource = projection.resources.images[0];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(projection.pages[0]?.resources.images).toContain(imageOp?.imageId);
    expect(imageResource).toMatchObject({
      name: "Im1",
      mediaType: "image/jpeg",
      width: 1,
      height: 1,
    });
    expect(imageResource?.data).toEqual(jpegBytes);
    expect(pdfBytes).toContain("/XObject << /Im1");
    expect(pdfBytes).toContain("/Filter /DCTDecode");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects and renders image box shadows as pdf shadow visuals", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Shadow PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const imageVisual = visuals.find((visual) => visual.kind === "image");
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const imageIndex = content.findIndex((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(imageIndex).toBeGreaterThan(shadowFillIndex);
    expect(pdfBytes).toContain("/GS250 gs");
    expect(pdfBytes).toContain("78 257 144 72 re");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects image drop-shadow filters as pdf shadow visuals", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Drop Shadow Filter PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const imageVisual = visuals.find((visual) => visual.kind === "image");
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const imageIndex = content.findIndex((op) => op.op === "image");

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(imageIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
      }),
    );
  });

  test("approximates blurred image box shadows with layered pdf shadow visuals", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blurred Image Shadow PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          boxShadow: "6pt 4pt 6pt rgba(17, 34, 51, 0.3)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisuals = visuals.filter(
      (visual): visual is PdfShapeVisualElement =>
        visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const imageIndex = content.findIndex((op) => op.op === "image");
    const lastShadowFillIndex = content.findLastIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowVisuals.map((visual) => visual.box)).toEqual([
      { x: 72, y: 70, width: 156, height: 84 },
      { x: 74, y: 72, width: 152, height: 80 },
      { x: 76, y: 74, width: 148, height: 76 },
      { x: 78, y: 76, width: 144, height: 72 },
    ]);
    expect(shadowVisuals.map((visual) => visual.fill?.opacity)).toEqual([0.03, 0.06, 0.09, 0.12]);
    expect(lastShadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(imageIndex).toBeGreaterThan(lastShadowFillIndex);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("projects rotated image box shadows around the image frame", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Image Shadow PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          boxShadow: "6pt 4pt 0 rgba(17, 34, 51, 0.25)",
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const shadowOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      box: { x: 78, y: 76, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(shadowOp).toMatchObject({
      op: "fillRect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
  });

  test("projects image inset box shadows above pdf image draws", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Inset Shadow PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          boxShadow: "inset 4pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const content = projection.pages[0]?.content ?? [];
    const imageIndex = content.findIndex((op) => op.op === "image");
    const insetShadowIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 4,
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(insetShadowIndex).toBeGreaterThan(imageIndex);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("approximates blurred image inset box shadows with layered pdf overlays", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Blurred Image Inset Shadow PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          boxShadow: "inset 4pt 0 2pt rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisuals = visuals.filter(
      (visual): visual is PdfShapeVisualElement =>
        visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const imageIndex = content.findIndex((op) => op.op === "image");
    const insetShadowIndexes = content
      .map((op, index) => ({ op, index }))
      .filter(
        ({ op }) =>
          op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width < 144,
      )
      .map(({ index }) => index);
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisuals).toHaveLength(4);
    expect(shadowVisuals.map((visual) => visual.box.width)).toEqual([
      6, 5.333333333333333, 4.666666666666667, 4,
    ]);
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(insetShadowIndexes.every((index) => index > imageIndex)).toBe(true);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("clips rounded images with a pdf round rect clip", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Image PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          borderRadius: "1px",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("n");
  });

  test("clips rounded image inset box shadows with a pdf round rect clip", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rounded Image Inset Shadow PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          borderRadius: "1px",
          boxShadow: "inset 4pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const shadowVisual = projection.pages[0]?.visuals?.find(
      (visual) =>
        visual.kind === "shape" &&
        visual.paintOrder.generatedLayerRole === "shadow" &&
        visual.box.width === 4,
    );
    const shadowOp = projection.pages[0]?.content.find(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 4,
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 72, y: 72, width: 4, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
      paintOrder: { generatedLayerRole: "shadow", generatedLayerPlacement: "aboveAuthored" },
    });
    expect(shadowOp).toMatchObject({
      op: "fillRect",
      box: { x: 72, y: 72, width: 4, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
      clipRadius: 12,
    });
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("projects and renders rotated images with pdf transform matrices", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Image PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      rotation: 90,
    });
    expect(pdfBytes).toContain("0 -1 1 0 -153 441 cm");
    expect(pdfBytes).toContain("144 0 0 72 72 261 cm");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects and renders horizontally flipped images with pdf transform matrices", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Flipped Image PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          transform: "scaleX(-1)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      flipH: true,
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      flipH: true,
    });
    expect(pdfBytes).toContain("-1 0 0 1 288 0 cm");
    expect(pdfBytes).toContain("144 0 0 72 72 261 cm");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects and renders vertically flipped images with pdf transform matrices", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Vertically Flipped Image PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          transform: "scaleY(-1)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      flipV: true,
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      flipV: true,
    });
    expect(pdfBytes).toContain("1 0 0 -1 0 594 cm");
    expect(pdfBytes).toContain("144 0 0 72 72 261 cm");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects and renders inline RGB PNG images as pdf image XObjects", async () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
      0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8,
      0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92, 0xef, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const pngData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PNG PDF" }, () => (
      <img
        data={pngData}
        style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1, objectFit: "fill" }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageResource = projection.resources.images[0];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(imageResource).toMatchObject({
      name: "Im1",
      mediaType: "image/png",
      width: 1,
      height: 1,
    });
    expect(imageResource?.data).toEqual(pngBytes);
    expect(pdfBytes).toContain("/Filter /FlateDecode");
    expect(pdfBytes).toContain("/DecodeParms << /Predictor 15");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("projects object-fit contain images into their rendered pdf box", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AIi2L3//Z";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Contain PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          objectFit: "contain",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("144 0 0 72 72 225 cm");
  });

  test("rotates object-fit contain images around the media frame", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AIi2L3//Z";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Contain Image PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 2,
          objectFit: "contain",
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 144 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 108, width: 144, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 144 },
    });
  });

  test("projects object-fit cover images with a pdf clip box", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AIi2L3//Z";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Cover PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          objectFit: "cover",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 36, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 72, height: 72 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 36, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 72, height: 72 },
    });
    expect(pdfBytes).toContain("72 261 72 72 re");
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("144 0 0 72 36 261 cm");
  });

  test("projects overflow-clipped images without rescaling the source frame", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Overflow Clip PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <img
          data={jpegData}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 2,
            height: 1,
            objectFit: "fill",
          }}
        />
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 72, height: 72 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 72, height: 72 },
    });
    expect(pdfBytes).toContain("72 261 72 72 re");
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("144 0 0 72 72 261 cm");
  });

  test("clips text inherited from an overflow-hidden PDF parent without moving its source frame", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Overflow Clip PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <p
          style={{
            position: "absolute",
            left: -0.5,
            top: 0,
            width: 2,
            height: 1,
            fontSize: 20,
            whiteSpace: "nowrap",
          }}
        >
          Overflow text
        </p>
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.text === "Overflow text",
    );
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Overflow text",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textVisual).toMatchObject({
      kind: "text",
      box: { x: 36, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 72, height: 72 },
    });
    expect(textOp).toMatchObject({
      op: "text",
      x: 36,
      y: 72,
      box: { x: 36, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 72, height: 72 },
    });
    expect(pdfBytes).toContain("72 261 72 72 re");
    expect(pdfBytes).toContain("W");
  });

  test("clips PDF text to its own overflow-hidden frame", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Self Overflow Clip PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 0.2,
          overflow: "hidden",
          fontSize: 20,
          whiteSpace: "nowrap",
        }}
      >
        Overflow text
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textVisual = projection.pages[0]?.visuals?.find(
      (visual) => visual.kind === "text" && visual.text === "Overflow text",
    );
    const textOp = projection.pages[0]?.content.find(
      (op) => op.op === "text" && op.text === "Overflow text",
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textVisual).toMatchObject({
      kind: "text",
      box: { x: 72, y: 72, width: 72, height: 14.4 },
      clipBox: { x: 72, y: 72, width: 72, height: 14.4 },
    });
    expect(textOp).toMatchObject({
      op: "text",
      x: 72,
      y: 72,
      clipBox: { x: 72, y: 72, width: 72, height: 14.4 },
    });
    expect(pdfBytes).toContain("72 318.6 72 14.4 re");
    expect(pdfBytes).toContain("W");
  });

  test("clips PDF text decorations to an overflow-hidden text frame", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Decoration Overflow Clip PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 0.5,
          height: 0.2,
          overflow: "hidden",
          fontSize: 20,
          whiteSpace: "nowrap",
          textDecorationLine: "underline",
          color: "#111111",
        }}
      >
        Overflow text
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const decorationVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "line");
    const decorationOp = projection.pages[0]?.content.find((op) => op.op === "strokeLine");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(decorationVisual).toMatchObject({
      kind: "line",
      clipBox: { x: 72, y: 72, width: 36, height: 14.4 },
    });
    expect(decorationOp).toMatchObject({
      op: "strokeLine",
      clipBox: { x: 72, y: 72, width: 36, height: 14.4 },
    });
    expect(pdfBytes).toContain("72 318.6 36 14.4 re");
    expect(pdfBytes).toContain("W");
  });

  test("applies overflow-hidden PDF text clipping before a text transform", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Text Overflow Clip PDF" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          overflow: "hidden",
          fontSize: 20,
          transform: "rotate(90deg)",
          whiteSpace: "nowrap",
        }}
      >
        Overflow text
      </p>
    ));

    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);
    const clipIndex = pdfBytes.indexOf("72 261 72 72 re");
    const transformIndex = pdfBytes.indexOf(" cm");

    expect(renderResult.ok).toBe(true);
    expect(clipIndex).toBeGreaterThanOrEqual(0);
    expect(transformIndex).toBeGreaterThanOrEqual(0);
    expect(clipIndex).toBeLessThan(transformIndex);
  });

  test("clips PDF text hyperlink annotations to an overflow-hidden text frame", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Text Link Overflow Clip PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 0.5,
          height: 0.5,
          overflow: "hidden",
        }}
      >
        <p
          style={{
            position: "absolute",
            left: -0.5,
            top: 0,
            width: 2,
            height: 0.5,
            fontSize: 20,
            whiteSpace: "nowrap",
          }}
        >
          Go <span style={{ href: "https://example.com/overflow" }}>Overflow text</span>
        </p>
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(projectResult.projection);

    expect(projectResult.ok).toBe(true);
    expect(projection.pages[0]?.annotations).toEqual([
      expect.objectContaining({
        kind: "link",
        url: "https://example.com/overflow",
        box: { x: 72, y: 72, width: 36, height: 36 },
      }),
    ]);
  });

  test("projects rotated overflow-clipped images with pdf clip and transform", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Image Overflow Clip PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <img
          data={jpegData}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 2,
            height: 1,
            objectFit: "fill",
            transform: "rotate(90deg)",
          }}
        />
      </div>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 72, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 72, height: 72 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
      clipBox: { x: 72, y: 72, width: 72, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 72, height: 72 },
    });
    expect(pdfBytes).toContain("0 -1 1 0 -189 405 cm");
    expect(pdfBytes).toContain("72 261 72 72 re");
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("144 0 0 72 72 261 cm");
  });

  test("projects explicit image crop as a clipped pdf image draw", async () => {
    const jpegData =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAICf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADnUQA9//9k=";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Image Crop PDF" }, () => (
      <img
        data={jpegData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          crop: { left: "25%", right: "25%" },
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 0, y: 72, width: 288, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 0, y: 72, width: 288, height: 72 },
      clipBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(pdfBytes).toContain("72 261 144 72 re");
    expect(pdfBytes).toContain("W");
    expect(pdfBytes).toContain("288 0 0 72 0 261 cm");
  });

  test("loads path image assets before rendering pdf image XObjects", async () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
      0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8,
      0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92, 0xef, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    let probeCount = 0;
    let loadCount = 0;
    const loader: AssetLoader = {
      resolverIdentity: "test:pdf-path-image-assets",
      async probe({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        probeCount += 1;
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
          },
        };
      },
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        loadCount += 1;
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    };
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Path PNG PDF" }, () => (
      <img
        src="/public/path-image.png"
        style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1 }}
      />
    ));

    const renderResult = await deck.render(
      withRenderExecutionContext(pdf({ inspection: "none" }), {
        integration: {
          id: integrationContextId("test:pdf-path-image-assets"),
          assetLoaders: [loader],
        },
      }),
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);
    expect(probeCount).toBe(1);
    expect(loadCount).toBe(1);
    expect(pdfBytes).toContain("/Filter /FlateDecode");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("bakes supported css color filters into loaded path png image pixels", async () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
      0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x30,
      0x4e, 0x9b, 0x09, 0x00, 0x02, 0x02, 0x01, 0x33, 0x56, 0x87, 0xe2, 0x54, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const loader: AssetLoader = {
      resolverIdentity: "test:pdf-path-image-color-filter-assets",
      async probe({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
          },
        };
      },
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    };
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Path PNG Color Filter PDF" }, () => (
      <img
        src="/public/path-image-filter.png"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          objectFit: "fill",
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const context = {
      integration: {
        id: integrationContextId("test:pdf-path-image-color-filter-assets"),
        assetLoaders: [loader],
      },
    };
    const renderResult = await deck.render(
      withRenderExecutionContext(pdf({ inspection: "none" }), context),
    );

    expect(renderResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(renderResult.ok).toBe(true);
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
  });

  test("loads path background images before rendering pdf image XObjects", async () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
      0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8,
      0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0xc9, 0xfe, 0x92, 0xef, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    let loadCount = 0;
    const loader: AssetLoader = {
      resolverIdentity: "test:pdf-path-background-assets",
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        loadCount += 1;
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    };
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Path Background PNG PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          background: 'url("/public/background.png") no-repeat left top / 100% 100%',
        }}
      />
    ));

    const renderResult = await deck.render(
      withRenderExecutionContext(pdf({ inspection: "none" }), {
        integration: {
          id: integrationContextId("test:pdf-path-background-assets"),
          assetLoaders: [loader],
        },
      }),
    );
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);
    expect(loadCount).toBe(1);
    expect(pdfBytes).toContain("/Filter /FlateDecode");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("bakes supported css color filters into loaded path png background image pixels", async () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
      0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x30,
      0x4e, 0x9b, 0x09, 0x00, 0x02, 0x02, 0x01, 0x33, 0x56, 0x87, 0xe2, 0x54, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const loader: AssetLoader = {
      resolverIdentity: "test:pdf-path-background-color-filter-assets",
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    };
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Path Background PNG Color Filter PDF" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          background: 'url("/public/background-filter.png") no-repeat left top / 100% 100%',
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const renderResult = await deck.render(
      withRenderExecutionContext(pdf({ inspection: "none" }), {
        integration: {
          id: integrationContextId("test:pdf-path-background-color-filter-assets"),
          assetLoaders: [loader],
        },
      }),
    );

    expect(renderResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(renderResult.ok).toBe(true);
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
  });

  test("projects and renders video poster images as static pdf fallback", async () => {
    const posterData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Video Poster PDF" }, () => (
      <video
        data="data:video/mp4;base64,AAAA"
        posterData={posterData}
        style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1, objectFit: "fill" }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageResource = projection.resources.images[0];
    const pdfBytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(imageResource).toMatchObject({
      name: "Im1",
      mediaType: "image/png",
      width: 1,
      height: 1,
      sourceField: "posterData",
    });
    expect(pdfBytes).toContain("/Filter /FlateDecode");
    expect(pdfBytes).toContain("/Im1 Do");
  });

  test("bakes supported css color filters into embedded png video poster pixels", async () => {
    const posterData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwTpsJAAICATNWh+JUAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Video Poster Color Filter PDF" }, () => (
      <video
        data="data:video/mp4;base64,AAAA"
        posterData={posterData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          objectFit: "fill",
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const image = projection.resources.images[0];
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));

    expect(projectResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(image).toMatchObject({
      mediaType: "image/png",
      sourceField: "posterData",
      pdfColorFilter: "brightness(120%) contrast(80%)",
    });
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
  });

  test("bakes supported css color filters into loaded path png video poster pixels", async () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
      0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x30,
      0x4e, 0x9b, 0x09, 0x00, 0x02, 0x02, 0x01, 0x33, 0x56, 0x87, 0xe2, 0x54, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const loader: AssetLoader = {
      resolverIdentity: "test:pdf-path-video-poster-color-filter-assets",
      async probe({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
          },
        };
      },
      async load({ source }) {
        if (source.kind !== "path") {
          return undefined;
        }
        return {
          ok: true,
          value: {
            mediaType: "image/png",
            extension: "png",
            width: 1,
            height: 1,
            byteLength: pngBytes.byteLength,
            bytes: pngBytes,
          },
        };
      },
    };
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Path Video Poster Color Filter PDF" }, () => (
      <video
        data="data:video/mp4;base64,AAAA"
        poster="/public/poster-filter.png"
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 1,
          height: 1,
          objectFit: "fill",
          filter: "brightness(120%) contrast(80%)",
        }}
      />
    ));

    const renderResult = await deck.render(
      withRenderExecutionContext(pdf({ inspection: "none" }), {
        integration: {
          id: integrationContextId("test:pdf-path-video-poster-color-filter-assets"),
          assetLoaders: [loader],
        },
      }),
    );

    expect(renderResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_UNSUPPORTED_AUTHOR_CONTENT",
    );
    expect(renderResult.ok).toBe(true);
    const imageRows = unzlibSync(firstPdfImageStreamData(renderResult.artifact?.bytes));
    expect(Array.from(imageRows)).toEqual([0, 74, 123, 172]);
  });

  test("projects video poster drop-shadow filters as pdf shadow visuals", async () => {
    const posterData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Video Poster Drop Shadow Filter PDF" }, () => (
      <video
        data="data:video/mp4;base64,AAAA"
        posterData={posterData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          filter: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const visuals = projection.pages[0]?.visuals ?? [];
    const content = projection.pages[0]?.content ?? [];
    const shadowVisual = visuals.find(
      (visual) => visual.kind === "shape" && visual.paintOrder.generatedLayerRole === "shadow",
    );
    const imageVisual = visuals.find((visual) => visual.kind === "image");
    const shadowFillIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 78 && op.box.y === 76,
    );
    const imageIndex = content.findIndex((op) => op.op === "image");

    expect(shadowVisual).toMatchObject({
      kind: "shape",
      shape: "rect",
      box: { x: 78, y: 76, width: 144, height: 72 },
      fill: { color: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255 }, opacity: 0.25 },
      paintOrder: { generatedLayerRole: "shadow" },
    });
    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(shadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(imageIndex).toBeGreaterThan(shadowFillIndex);
    expect(projection.fallbacks).not.toContainEqual(
      expect.objectContaining({
        feature: "filter",
        property: "filter",
        value: "drop-shadow(6pt 4pt 0 rgba(17, 34, 51, 0.25))",
      }),
    );
  });

  test("rotates object-fit contain video posters around the media frame", async () => {
    const posterData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Rotated Video Poster PDF" }, () => (
      <video
        data="data:video/mp4;base64,AAAA"
        posterData={posterData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "contain",
          transform: "rotate(90deg)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const imageVisual = projection.pages[0]?.visuals?.find((visual) => visual.kind === "image");
    const imageOp = projection.pages[0]?.content.find((op) => op.op === "image");

    expect(imageVisual).toMatchObject({
      kind: "image",
      box: { x: 108, y: 72, width: 72, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
    expect(imageOp).toMatchObject({
      op: "image",
      box: { x: 108, y: 72, width: 72, height: 72 },
      rotation: 90,
      rotationBox: { x: 72, y: 72, width: 144, height: 72 },
    });
  });

  test("projects video poster inset box shadows above pdf poster image draws", async () => {
    const posterData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "Video Poster Inset Shadow PDF" }, () => (
      <video
        data="data:video/mp4;base64,AAAA"
        posterData={posterData}
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          objectFit: "fill",
          boxShadow: "inset 4pt 0 0 rgba(17, 34, 51, 0.25)",
        }}
      />
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "summary" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));

    expect(projectResult.diagnostics.items).toEqual([]);
    expect(projectResult.ok).toBe(true);
    expect(renderResult.diagnostics.items).toEqual([]);
    expect(renderResult.ok).toBe(true);

    const projection = expectPdfPageModel(projectResult.projection);
    const content = projection.pages[0]?.content ?? [];
    const imageIndex = content.findIndex((op) => op.op === "image");
    const insetShadowIndex = content.findIndex(
      (op) => op.op === "fillRect" && op.box.x === 72 && op.box.y === 72 && op.box.width === 4,
    );
    const summary = projectResult.summary as
      | { readonly unsupportedSemantics?: readonly unknown[] }
      | undefined;

    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(insetShadowIndex).toBeGreaterThan(imageIndex);
    expect(summary?.unsupportedSemantics).toEqual([]);
  });

  test("projects pdf for deck output preference", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ inspection: "none" });

    expectPdfProjectionAvailable(result);
  });

  test("uses the first configured output format for implicit project with a warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf", "pptx"] },
    });
    deck.slide({ name: "PDF first" }, () => <p>PDF first</p>);

    const result = await deck.project({ inspection: "none" });

    expectPdfProjectionAvailable(result);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_OUTPUT_FORMATS_IMPLICIT_FIRST",
        severity: "warning",
      }),
    );
  });

  test("uses the first configured output format for implicit render with a warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf", "pptx"] },
    });
    deck.slide({ name: "PDF first" }, () => <p>PDF first</p>);

    const result = await deck.render({ inspection: "none" });

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({ format: "pdf", mediaType: "application/pdf" });
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_OUTPUT_FORMATS_IMPLICIT_FIRST",
        severity: "warning",
      }),
    );
  });

  test("renders explicit pptx and pdf adapters without membership warnings when both formats are configured", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pptx", "pdf"] },
    });
    deck.slide({ name: "Both formats" }, () => <p>Both formats</p>);

    const pptxResult = await deck.render(pptx({ inspection: "none" }));
    const pdfResult = await deck.render(pdf({ inspection: "none" }));

    expect(pptxResult.ok).toBe(true);
    expect(pdfResult.ok).toBe(true);
    expect(pptxResult.artifact?.format).toBe("pptx");
    expect(pdfResult.artifact?.format).toBe("pdf");
    expect(pptxResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "W_RENDER_ADAPTER_FORMAT_NOT_CONFIGURED",
    );
    expect(pdfResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "W_RENDER_ADAPTER_FORMAT_NOT_CONFIGURED",
    );
  });

  test("reports the explicit adapter format when render fails before projection", async () => {
    const deck = new Deck({
      layout: { width: -1, height: 5.625, unit: "in" },
    } as never);
    deck.slide({ name: "Invalid PDF" }, () => <p>Invalid PDF</p>);

    const result = await deck.render(pdf({ inspection: "none" }));

    expect(result.ok).toBe(false);
    expect(result.format).toBe("pdf");
    expect(result.artifact).toBeUndefined();
    expect(result.stages.project.artifact).toBe("missing");
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DECK_INVALID_LAYOUT" }),
    );
  });

  test("does not reuse a cached pptx projection for a later pdf project request", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const pptxResult = await deck.project({ inspection: "none" });
    const pdfResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(pptxResult.ok).toBe(true);
    expect(pptxResult.format).toBe("pptx");
    expect(pptxResult.projection?.format).toBe("pptx");
    expectPdfProjectionAvailable(pdfResult);
  });

  test("rejects a defined pptx projection for an explicit pdf project request", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Defined PPTX" }, () => <p>Defined PPTX</p>);
    const pptxResult = await deck.project({ inspection: "none" });

    deck.defineProjection(pptxResult.projection!);

    const pdfResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(pdfResult.ok).toBe(false);
    expect(pdfResult.format).toBe("pdf");
    expect(pdfResult.projection).toBeUndefined();
    expect(pdfResult.stages.project.artifact).toBe("missing");
    expect(pdfResult.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_FORMAT" }),
    );
  });

  test("rejects a defined pptx projection for an explicit pdf render request", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Defined PPTX" }, () => <p>Defined PPTX</p>);
    const pptxResult = await deck.project({ inspection: "none" });

    deck.defineProjection(pptxResult.projection!);

    const pdfResult = await deck.render(pdf({ inspection: "none" }));

    expect(pdfResult.ok).toBe(false);
    expect(pdfResult.format).toBe("pdf");
    expect(pdfResult.artifact).toBeUndefined();
    expect(pdfResult.stages.project.artifact).toBe("missing");
    expect(pdfResult.stages.render.artifact).toBe("missing");
    expect(pdfResult.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_FORMAT" }),
    );
  });

  test("creates a pdf render artifact through a minimal adapter", async () => {
    const model = {
      format: "pdf",
      version: "1.7",
      documentId: "pdf:document:demo",
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: "pdf:page:demo:0",
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [], images: [] },
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as const;
    const result = await pdf({ inspection: "none" }).render(model);

    expect(result.artifact).toMatchObject({
      format: "pdf",
      mediaType: "application/pdf",
      extension: "pdf",
    });
    const bytes = new TextDecoder().decode(result.artifact?.bytes);
    expect(bytes.startsWith("%PDF-1.7\n")).toBe(true);
    expect(bytes).toContain("/Type /Catalog");
    expect(bytes).toContain("/Type /Pages");
    expect(bytes).toContain("/Count 1");
    expect(bytes).toContain("xref");
    expect(bytes).toContain("trailer");
    expect(bytes).toContain("startxref");
    expect(bytes).toContain("%%EOF");
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render package and inspection output", () => {
  test("project and render expose structured default text style support payload", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Default text style" }, () => <></>);

    const project = await deck.project();
    const presentationPart = H.expectPptxPart(project.projection?.parts ?? [], "presentation");
    const render = await deck.render();
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const presentationXml = new TextDecoder().decode(zip["ppt/presentation.xml"]);

    expect(project.ok).toBe(true);
    expect(presentationPart.payload).toMatchObject({
      kind: "presentation",
      defaultTextStyle: expect.objectContaining({
        source: "themeProjection",
        levels: expect.arrayContaining([
          expect.objectContaining({
            level: 1,
            colorThemeReference: "tx1",
            latinTypeface: "+mn-lt",
          }),
        ]),
      }),
    });
    expect(
      presentationPart.payload.kind === "presentation"
        ? presentationPart.payload.defaultTextStyle.levels.length
        : undefined,
    ).toBe(9);
    expect(render.ok).toBe(true);
    expect(presentationXml).toContain("<p:defaultTextStyle>");
    expect(presentationXml).toContain('<a:schemeClr val="tx1"/>');
    expect(presentationXml).toContain('<a:latin typeface="+mn-lt"/>');
  });

  test("project assigns deterministic package part order keys", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Order" }, () => <></>);

    const project = await deck.project();
    const parts = project.projection?.parts ?? [];
    const orderedPaths = [...parts]
      .sort((a, b) => (a.orderKey?.value ?? "").localeCompare(b.orderKey?.value ?? ""))
      .map((part) => part.path);

    expect(project.ok).toBe(true);
    expect(parts.every((part) => typeof part.orderKey?.value === "string")).toBe(true);
    expect(parts.find((part) => part.path === "[Content_Types].xml")?.orderKey).toMatchObject({
      group: "contentTypes",
      groupOrder: 0,
      sequence: 0,
      path: "[Content_Types].xml",
    });
    expect(parts.find((part) => part.path === "ppt/slides/slide1.xml")?.orderKey).toMatchObject({
      group: "slide",
      groupOrder: 80,
      path: "ppt/slides/slide1.xml",
    });
    expect(parts.every((part) => part.requirement?.status)).toBe(true);
    expect(parts.every((part) => typeof part.requirement?.required === "boolean")).toBe(true);
    expect(parts.every((part) => typeof part.fingerprint === "string")).toBe(true);
    expect(parts.find((part) => part.path === "[Content_Types].xml")?.requirement).toMatchObject({
      status: "required",
      required: true,
      condition: "minimalPackage",
    });
    expect(
      parts.find((part) => part.path === "ppt/slides/_rels/slide1.xml.rels")?.requirement,
    ).toMatchObject({ status: "conditional", required: true, condition: "hasRelationships" });
    expect(
      parts.find((part) => part.path === "ppt/slides/slide1.xml")?.dependencyFingerprints,
    ).toContainEqual(
      expect.objectContaining({
        packagePartId: parts.find((part) => part.path === "ppt/slideLayouts/slideLayout1.xml")?.id,
      }),
    );
    expect(
      parts.find((part) => part.path === "ppt/presentation.xml")?.dependencyFingerprints,
    ).toContainEqual(
      expect.objectContaining({
        packagePartId: parts.find((part) => part.path === "ppt/_rels/presentation.xml.rels")?.id,
      }),
    );
    expect(
      parts.find((part) => part.path === "ppt/slideMasters/slideMaster1.xml")
        ?.dependencyFingerprints,
    ).toContainEqual(
      expect.objectContaining({
        packagePartId: parts.find(
          (part) => part.path === "ppt/slideMasters/_rels/slideMaster1.xml.rels",
        )?.id,
      }),
    );
    expect(orderedPaths).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "docProps/core.xml",
      "docProps/app.xml",
      "ppt/presentation.xml",
      "ppt/_rels/presentation.xml.rels",
      "ppt/theme/theme1.xml",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      "ppt/viewProps.xml",
      "ppt/presProps.xml",
      "ppt/tableStyles.xml",
      "ppt/slides/slide1.xml",
      "ppt/slides/_rels/slide1.xml.rels",
    ]);
  });

  test("project inspection summarizes generated stroke layers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Generated stroke inspection" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            background: `url("${H.SAMPLE_SVG_DATA_URI}")`,
            outline: "2pt solid #FF0000",
          }}
        />
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 2,
            height: 0.5,
            borderTop: "1pt solid #111111",
            borderRight: "2pt dashed #222222",
          }}
        >
          Borders
        </p>
      </>
    ));

    const project = await deck.project({ inspection: "details" });
    const [view, text] = project.projection?.slides[0]?.payload.drawing.children ?? [];
    const [viewSummary, textSummary] = project.summary?.slides[0]?.elements ?? [];
    const generatedEntries =
      project.summary?.details?.composedPaintOrder[0]?.entries.filter(
        (entry) => entry.source === "generatedStroke",
      ) ?? [];
    const elementBackgroundEntries =
      project.summary?.details?.composedPaintOrder[0]?.entries.filter(
        (entry) => entry.source === "backgroundLayer" && entry.elementId === view?.id,
      ) ?? [];

    expect(project.ok).toBe(true);
    expect(view?.kind).toBe("group");
    expect(text?.kind).toBe("text");
    if (!view || view.kind !== "group" || !text || text.kind !== "text") {
      throw new Error("Expected projected group and text nodes.");
    }

    expect(viewSummary).toMatchObject({
      id: view.id,
      backgroundLayers: expect.any(Array),
      outline: view.outline,
      generatedStrokes: view.generatedStrokes,
      resolvedValues: expect.objectContaining({
        backgroundLayers: expect.any(Array),
        outline: view.outline,
        generatedStrokes: view.generatedStrokes,
      }),
    });
    expect(view.backgroundLayers?.[0]?.kind).toBe("background-image");
    expect(
      view.backgroundLayers?.[0]?.kind === "background-image"
        ? view.backgroundLayers[0].objectPosition
        : undefined,
    ).toEqual({ x: 0.5, y: 0.5 });
    expect(viewSummary?.backgroundLayers?.[0]?.kind).toBe("background-image");
    expect(
      viewSummary?.backgroundLayers?.[0]?.kind === "background-image"
        ? viewSummary.backgroundLayers[0].objectPosition
        : undefined,
    ).toEqual({ x: 0.5, y: 0.5 });
    expect(elementBackgroundEntries).toEqual([
      expect.objectContaining({
        elementId: view.id,
        kind: "group",
        backgroundLayerIndex: 0,
        backgroundLayer: viewSummary?.backgroundLayers?.[0],
        frame: viewSummary?.backgroundLayers?.[0]?.frame,
        paintOrder: expect.objectContaining({ generatedLayerRole: "background" }),
      }),
    ]);
    expect(viewSummary?.generatedStrokes?.map((layer) => layer.role)).toEqual(["outline"]);
    expect(viewSummary?.generatedStrokes?.[0]?.paintOrder.generatedLayerRole).toBe("outline");

    expect(textSummary).toMatchObject({
      id: text.id,
      edgeStrokes: text.edgeStrokes,
      generatedStrokes: text.generatedStrokes,
      resolvedValues: expect.objectContaining({
        edgeStrokes: text.edgeStrokes,
        generatedStrokes: text.generatedStrokes,
      }),
    });
    expect(textSummary?.generatedStrokes?.map((layer) => layer.edge)).toEqual(["top", "right"]);
    expect(
      textSummary?.generatedStrokes?.map((layer) => layer.paintOrder.generatedLayerRole),
    ).toEqual(["border", "border"]);
    expect(generatedEntries.map((entry) => entry.generatedStroke?.role)).toEqual([
      "outline",
      "border",
      "border",
    ]);
    expect(generatedEntries.map((entry) => entry.generatedLayerIndex)).toEqual([0, 0, 1]);
    expect(generatedEntries.map((entry) => entry.paintOrder?.generatedLayerRole)).toEqual([
      "outline",
      "border",
      "border",
    ]);
    expect(generatedEntries[0]).toEqual(
      expect.objectContaining({
        elementId: view.id,
        frame: view.generatedStrokes?.[0]?.frame,
        generatedStroke: view.generatedStrokes?.[0],
      }),
    );
  });

  test("project can skip inspection summary while preserving projection result shape", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "No project summary" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>Projected</p>
    ));

    const project = await deck.project({ inspection: "none" });

    expect(project.ok).toBe(true);
    expect(project.projection?.format).toBe("pptx");
    expect(project.summary).toBeUndefined();
    expect(project.stages.project.artifact).toBe("available");
  });

  test("project inspection summarizes output-facing visual review hints", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Visual review" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 0.8,
            top: 0.8,
            width: 1.2,
            height: 0.22,
            fontSize: 8,
            lineHeight: 1.1,
            fit: "shrink",
          }}
        >
          This deliberately long sentence should be reviewed before relying on the PPTX output.
        </p>
        <img
          data={H.SAMPLE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 3,
            top: 0.8,
            width: 0.45,
            height: 0.35,
            objectFit: "cover",
          }}
        />
      </>
    ));

    const project = await deck.project({ inspection: "summary" });
    const slideSummary = project.summary?.slides[0];
    const [textSummary, imageSummary] = slideSummary?.elements ?? [];

    expect(project.ok).toBe(true);
    expect(textSummary).toMatchObject({
      kind: "text",
      textMetrics: expect.objectContaining({
        characterCount: 85,
        fontSizePt: 8,
        estimatedLineCount: expect.any(Number),
        estimatedLineCapacity: 1,
        fit: "shrink",
        wrap: true,
      }),
    });
    expect(textSummary?.textMetrics?.estimatedLineCount ?? 0).toBeGreaterThan(1);
    expect(imageSummary).toMatchObject({
      kind: "image",
      mediaMetrics: expect.objectContaining({
        sourceKind: "data",
        fit: "cover",
        objectPosition: { x: 0.5, y: 0.5 },
        cropped: true,
      }),
    });
    expect(slideSummary?.visualChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "W_VISUAL_TEXT_SMALL",
          severity: "warning",
          elementId: textSummary?.id,
        }),
        expect.objectContaining({
          code: "W_VISUAL_TEXT_MAY_SHRINK",
          severity: "warning",
          elementId: textSummary?.id,
        }),
        expect.objectContaining({
          code: "W_VISUAL_MEDIA_SMALL",
          severity: "warning",
          elementId: imageSummary?.id,
        }),
      ]),
    );
  });

  test("project inspection preserves text direction metrics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Text direction inspection" }, () => (
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

    const project = await deck.project({ inspection: "summary" });
    const textSummary = project.summary?.slides[0]?.elements[0];

    expect(project.ok).toBe(true);
    expect(textSummary).toMatchObject({
      kind: "text",
      textMetrics: expect.objectContaining({
        textDirection: "vert270",
      }),
    });
  });

  test("project inspection handles visual review edge cases", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Visual edge cases" }, () => (
      <>
        <img
          data={H.SAMPLE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 0.5,
            top: 0.5,
            width: 1,
            height: 1,
            objectFit: "contain",
            crop: { left: "10%", right: "10%" },
          }}
        />
        <p
          style={{
            position: "absolute",
            left: 2,
            top: 0.5,
            width: 0.6,
            height: 0.4,
            whiteSpace: "nowrap",
          }}
        >
          Unbroken nowrap label that should exceed its box
        </p>
        <p style={{ position: "absolute", left: 3, top: 0.5, width: 3, height: 0.5, fontSize: 18 }}>
          Large label with <span style={{ fontSize: 6 }}>tiny run</span>
        </p>
        <table
          style={{
            position: "absolute",
            left: 0.5,
            top: 2,
            width: 2,
            height: 0.45,
            tableLayout: "fixed",
          }}
        >
          <tbody>
            <tr>
              <td style={{ fontSize: 6 }}>Small table text</td>
            </tr>
          </tbody>
        </table>
        <p
          style={{
            position: "absolute",
            left: 3,
            top: 2,
            width: 0.8,
            height: 0.25,
            fit: "resize",
          }}
        >
          Resize autofit text should be called out separately
        </p>
        <div
          style={{
            position: "absolute",
            left: 5,
            top: 2,
            width: 1,
            height: 0.5,
            visibility: "hidden",
          }}
        >
          <p
            style={{ position: "absolute", left: 0, top: 0, width: 0.5, height: 0.2, fontSize: 4 }}
          >
            Hidden tiny text should not warn
          </p>
        </div>
      </>
    ));

    const project = await deck.project({ inspection: "summary" });
    const checks = project.summary?.slides[0]?.visualChecks ?? [];
    const codes = checks.map((check) => check.code);
    const cropCheck = checks.find(
      (check) => check.code === "I_VISUAL_MEDIA_CROPPED" && "crop" in (check.metrics ?? {}),
    );
    const nowrapCheck = checks.find((check) =>
      check.textPreview?.startsWith("Unbroken nowrap label"),
    );
    const richRunCheck = checks.find((check) => check.textPreview?.includes("tiny run"));
    const tableCheck = checks.find((check) => check.textPreview === "Small table text");
    const resizeCheck = checks.find((check) => check.code === "W_VISUAL_TEXT_MAY_RESIZE");

    expect(project.ok).toBe(true);
    expect(cropCheck).toMatchObject({
      code: "I_VISUAL_MEDIA_CROPPED",
      metrics: expect.objectContaining({ cropped: true }),
    });
    expect(nowrapCheck).toMatchObject({
      code: "W_VISUAL_TEXT_MAY_OVERFLOW",
      metrics: expect.objectContaining({ wrap: false }),
    });
    expect(richRunCheck).toMatchObject({
      code: "W_VISUAL_TEXT_SMALL",
      metrics: expect.objectContaining({ fontSizePt: 6 }),
    });
    expect(tableCheck).toMatchObject({
      code: "W_VISUAL_TEXT_SMALL",
      kind: "table",
      metrics: expect.objectContaining({ fontSizePt: 6 }),
    });
    expect(resizeCheck).toMatchObject({
      code: "W_VISUAL_TEXT_MAY_RESIZE",
      metrics: expect.objectContaining({ fit: "resize" }),
    });
    expect(checks.some((check) => check.textPreview?.includes("Hidden tiny text"))).toBe(false);
    expect(codes).toContain("I_VISUAL_MEDIA_CROPPED");
  });

  test("project derives detailed composed paint order only when requested", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Detailed inspection" }, () => (
      <div style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2, zIndex: 2 }}>
        <p
          style={{
            position: "absolute",
            left: 0.25,
            top: 0.25,
            width: 2,
            height: 0.5,
            fontSize: 18,
            zIndex: 3,
          }}
        >
          Nested detail
        </p>
      </div>
    ));

    const summaryProject = await deck.project();
    const detailedProject = await deck.project({ inspection: "details" });
    const entries = detailedProject.summary?.details?.composedPaintOrder[0]?.entries ?? [];
    const styleEntries =
      detailedProject.summary?.details?.effectiveProjectedStyles[0]?.entries ?? [];
    const groupEntry = entries.find((entry) => entry.kind === "group");
    const textEntry = entries.find((entry) => entry.kind === "text");
    const textStyleEntry = styleEntries.find((entry) => entry.kind === "text");

    expect(summaryProject.ok).toBe(true);
    expect(summaryProject.summary?.details).toBeUndefined();
    expect(detailedProject.ok).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(groupEntry).toEqual(
      expect.objectContaining({
        source: "drawingNode",
        depth: 0,
        siblingPath: [0],
        paintOrder: expect.objectContaining({ zIndex: 2 }),
      }),
    );
    expect(textEntry).toEqual(
      expect.objectContaining({
        source: "drawingNode",
        parentElementId: groupEntry?.elementId,
        depth: 1,
        siblingPath: [0, 0],
        paintOrder: expect.objectContaining({ zIndex: 3 }),
      }),
    );
    expect(styleEntries.length).toBeGreaterThanOrEqual(2);
    expect(textStyleEntry).toEqual(
      expect.objectContaining({
        parentElementId: groupEntry?.elementId,
        depth: 1,
        siblingPath: [0, 0],
        paintOrder: expect.objectContaining({ zIndex: 3 }),
        values: expect.objectContaining({
          frame: expect.objectContaining({ widthEmu: expect.any(Number) }),
          textStyle: expect.objectContaining({ fontSizePt: 18 }),
          zIndex: 3,
        }),
      }),
    );
  });

  test("render can skip inspection summary while preserving artifact result shape", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "No render summary" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>Rendered</p>
    ));

    const render = await deck.render({ inspection: "none" });

    expect(render.ok).toBe(true);
    expect(render.artifact?.format).toBe("pptx");
    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
    expect(render.summary).toBeUndefined();
    expect(render.stages.render.artifact).toBe("available");
  });

  test("render details do not eagerly expose project-derived inspection views", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Render detail boundary" }, () => (
      <div style={{ position: "absolute", left: 1, top: 1, width: 3, height: 2, zIndex: 5 }}>
        <p
          style={{
            position: "absolute",
            left: 0.25,
            top: 0.25,
            width: 2,
            height: 0.5,
            fontSize: 18,
          }}
        >
          Rendered detail
        </p>
      </div>
    ));

    const render = await deck.render({ inspection: "details" });
    const summary = render.summary as H.RenderInspectionSummary | undefined;

    expect(render.ok).toBe(true);
    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
    expect(summary?.assembly).toBeDefined();
    expect(Object.hasOwn(summary ?? {}, "details")).toBe(false);
  });
});

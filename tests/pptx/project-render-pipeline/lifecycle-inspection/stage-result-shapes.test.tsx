import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render stage result shapes", () => {
  test("compile, project, and render return result-first stage shapes", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { format: "pptx" },
    });

    deck.slide({ name: "Pipeline" }, () => (
      <>
        <div style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2 }}>
          <p style={{ width: "100%", height: 0.5, fontSize: 24 }}>Hello pipeline</p>
        </div>
      </>
    ));

    const compile = deck.compile();
    expect(compile.ok).toBe(true);
    expect(compile.graph).toBeDefined();
    expect(compile.stages.compile.artifact).toBe("available");

    const project = await deck.project();
    expect(project.ok).toBe(true);
    expect(project.format).toBe("pptx");
    expect(project.projection?.format).toBe("pptx");
    expect(project.summary?.pptx.packageParts.length).toBeGreaterThan(0);
    expect(project.stages.compile.artifact).toBe("available");
    expect(project.stages.project.artifact).toBe("available");

    const parts = project.projection?.parts ?? [];
    const presentationPartSummary = project.summary?.parts.find(
      (part) => part.path === "ppt/presentation.xml",
    );
    expect(parts.some((part) => part.path === "[Content_Types].xml")).toBe(true);
    expect(parts.some((part) => part.path === "ppt/presentation.xml")).toBe(true);
    expect(parts.some((part) => part.path === "ppt/slides/slide1.xml")).toBe(true);
    expect(new Set(parts.map((part) => part.category))).toEqual(
      new Set(["authored-content", "manifest", "support"]),
    );
    expect(presentationPartSummary).toMatchObject({
      hasStructuredPayload: true,
      payloadKind: "presentation",
      requirement: expect.objectContaining({ status: "required", required: true }),
      orderKey: expect.objectContaining({ group: "presentation", path: "ppt/presentation.xml" }),
    });

    const firstElement = project.projection?.slides[0]?.payload.drawing.children[0];
    const nestedElement = firstElement?.kind === "group" ? firstElement.children[0] : undefined;
    const firstSlide = project.projection?.slides[0];
    const firstSummaryElement = project.summary?.slides[0]?.elements[0];
    expect(firstSlide?.id).not.toBe(firstSlide?.path);
    expect(firstElement?.id).not.toContain("ppt/slides/slide1");
    expect(firstElement?.serialized.shapeObjectId).toBe("1");
    expect(nestedElement?.serialized.shapeObjectId).toBe("1001");
    expect(firstElement?.measurement?.frame).toEqual(firstElement?.frame);
    expect(firstElement?.emissionTarget).toBe("slide");
    expect(firstElement?.paintOrderIndex).toBe(0);
    expect(firstElement?.paintOrder).toMatchObject({
      siblingOrder: 0,
      generatedLayerRole: "authored",
    });
    expect(firstSummaryElement).toMatchObject({
      id: firstElement?.id,
      emissionTarget: "slide",
      paintOrderIndex: 0,
      paintOrder: expect.objectContaining({ siblingOrder: 0, generatedLayerRole: "authored" }),
      measurement: firstElement?.measurement,
      resolvedValues: expect.objectContaining({ measurement: firstElement?.measurement }),
    });

    const render = await deck.render();
    expect(render.ok).toBe(true);
    expect(render.artifact?.format).toBe("pptx");
    expect(render.artifact?.mediaType).toContain("presentationml.presentation");
    expect(render.artifact?.extension).toBe("pptx");
    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
    expect(render.stages.render.artifact).toBe("available");
    expect(render.summary?.assembly?.entryCount).toBeGreaterThan(0);
    expect(render.summary?.assembly?.missingCount).toBe(0);
  });

  test("render blocks artifacts when project has error diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid" }, () => (
      <>
        <div style={{ position: "absolute", left: "1qu" as never, top: 1, width: 2, height: 1 }} />
      </>
    ));

    const project = await deck.project();
    expect(project.ok).toBe(false);
    expect(project.projection).toBeUndefined();
    expect(project.stages.project.artifact).toBe("missing");
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_COMPILE_INVALID_STYLE_VALUE",
        severity: "error",
        message: expect.stringContaining("left value is not part of the public authoring API"),
      }),
    );

    const render = await deck.render();
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.stages.render.artifact).toBe("missing");
  });
});

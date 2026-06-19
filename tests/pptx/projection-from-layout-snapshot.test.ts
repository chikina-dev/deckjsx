import { describe, expect, test } from "vite-plus/test";
import type { GraphNodeId } from "../../src/graph";
import type { ProjectedLayoutSlide } from "../../src/layout/projected.ts";
import { packageIdentity } from "../../src/projection/pptx/identity.ts";
import type { PptxPackagePart } from "../../src/projection/pptx/model.ts";
import { pptxSlidePartFor } from "../../src/projection/pptx/slide.ts";

describe("pptx projection from layout snapshot", () => {
  test("projects a slide part from a standalone ProjectedLayoutSlide", () => {
    const slideNodeId = "graph:slide:snapshot" as GraphNodeId;
    const textNodeId = "graph:text:title" as GraphNodeId;
    const slideLayoutPart: PptxPackagePart = {
      id: packageIdentity("support", "blank-layout"),
      category: "support",
      kind: "slide-layout",
      path: "ppt/slideLayouts/slideLayout1.xml",
      payload: {
        kind: "slide-layout",
        name: "Blank",
      },
    };
    const layoutSlide: ProjectedLayoutSlide = {
      id: "layout-slide:1",
      name: "Snapshot",
      origin: { graphNodeIds: [slideNodeId] },
      background: { kind: "solid", color: "#FFFFFF" },
      nodes: [
        {
          id: "layout-node:1",
          kind: "text",
          origin: {
            graphNodeIds: [textNodeId],
            componentProvenance: {
              stack: [
                {
                  name: "MetricCard",
                  moduleId: "/project/src/components/MetricCard.tsx",
                },
              ],
            },
          },
          frame: { xEmu: 100, yEmu: 200, widthEmu: 300, heightEmu: 400 },
          siblingOrder: 0,
          content: {
            text: "Hello layout",
            runs: [{ text: "Hello ", style: { fontSizePt: 24 } }, { text: "layout" }],
          },
          style: { color: "#111827", fontSizePt: 24 },
        },
      ],
    };

    const part = pptxSlidePartFor({
      layoutSlide,
      slideIndex: 0,
      slideFrame: { xEmu: 0, yEmu: 0, widthEmu: 1000, heightEmu: 600 },
      slideLayoutPart,
      slidePartId: packageIdentity("slide", "snapshot"),
    });

    expect(part.origin?.graphNodeIds).toEqual([slideNodeId]);
    expect(part.payload.name).toBe("Snapshot");
    expect(part.payload.background).toEqual({ kind: "solid", color: "#FFFFFF" });
    expect(part.payload.drawing.children).toHaveLength(1);
    expect(part.payload.drawing.children[0]).toMatchObject({
      kind: "text",
      origin: {
        graphNodeIds: [textNodeId],
        componentProvenance: {
          stack: [
            {
              name: "MetricCard",
              moduleId: "/project/src/components/MetricCard.tsx",
            },
          ],
        },
      },
      content: { text: "Hello layout" },
    });
    expect(part.relationships?.[0]).toMatchObject({
      type: "slideLayout",
      targetPartId: slideLayoutPart.id,
    });
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("absolute layout visibility and clipping", () => {
  test("render preserves visibility hidden in layout and sorts by zIndex", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Visibility and zIndex" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5, fontSize: 18, zIndex: 10 }}>Front</p>
        <div
          style={{
            x: 1,
            y: 2,
            width: 2,
            height: 0.75,
            backgroundColor: "#D1D5DB",
            visibility: "hidden",
            zIndex: -1,
          }}
        />
        <p style={{ x: 1, y: 3, width: 2, height: 0.5, fontSize: 18, zIndex: 1 }}>Middle</p>
      </>
    ));

    const ir = (await deck.project()).projection!;

    expect(
      ir.slides[0].payload.drawing.children.map((node) => ({
        kind: node.kind,
        zIndex: node.zIndex,
        visibility: node.visibility,
        frame: node.frame,
        text: node.kind === "text" ? node.content.text : undefined,
      })),
    ).toEqual([
      {
        kind: "group",
        zIndex: -1,
        visibility: "hidden",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 2 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 0.75 * H.EMU_PER_INCH,
        },
        text: undefined,
      },
      {
        kind: "text",
        zIndex: 1,
        visibility: undefined,
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 3 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 0.5 * H.EMU_PER_INCH,
        },
        text: "Middle",
      },
      {
        kind: "text",
        zIndex: 10,
        visibility: undefined,
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 0.5 * H.EMU_PER_INCH,
        },
        text: "Front",
      },
    ]);
  });

  test("render clips children when a view uses overflow hidden", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Overflow hidden" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <p style={{ x: 0.5, y: 0.5, width: 4, height: 0.75, fontSize: 18 }}>Clip me</p>
          <p style={{ x: 3.5, y: 0.5, width: 1, height: 0.5, fontSize: 18 }}>Drop me</p>
        </div>
        <div style={{ x: 5, y: 1, width: 3, height: 2, backgroundColor: "#E5E7EB" }}>
          <p style={{ x: 0.5, y: 0.5, width: 4, height: 0.75, fontSize: 18 }}>Visible</p>
        </div>
      </>
    ));

    const ir = (await deck.project()).projection!;
    const [hiddenGroup, visibleGroup] = ir.slides[0].payload.drawing.children;

    expect(H.summarizeNodes([hiddenGroup])).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 3 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 2.5 * H.EMU_PER_INCH,
              heightEmu: 0.75 * H.EMU_PER_INCH,
            },
            text: "Clip me",
            fontSizePt: 18,
          },
        ],
      },
    ]);

    expect(H.summarizeNodes([visibleGroup])).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 5 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 3 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 5.5 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 4 * H.EMU_PER_INCH,
              heightEmu: 0.75 * H.EMU_PER_INCH,
            },
            text: "Visible",
            fontSizePt: 18,
          },
        ],
      },
    ]);

    expect(hiddenGroup?.kind).toBe("group");
    if (hiddenGroup?.kind !== "group") {
      throw new Error("Expected overflow-hidden group node.");
    }
    const [clipped] = hiddenGroup.children;
    expect(clipped?.clip).toEqual({
      strategy: "intersectParentOverflow",
      originalFrame: {
        xEmu: 1.5 * H.EMU_PER_INCH,
        yEmu: 1.5 * H.EMU_PER_INCH,
        widthEmu: 4 * H.EMU_PER_INCH,
        heightEmu: 0.75 * H.EMU_PER_INCH,
      },
      clipFrame: {
        xEmu: 1 * H.EMU_PER_INCH,
        yEmu: 1 * H.EMU_PER_INCH,
        widthEmu: 3 * H.EMU_PER_INCH,
        heightEmu: 2 * H.EMU_PER_INCH,
      },
      visibleFrame: {
        xEmu: 1.5 * H.EMU_PER_INCH,
        yEmu: 1.5 * H.EMU_PER_INCH,
        widthEmu: 2.5 * H.EMU_PER_INCH,
        heightEmu: 0.75 * H.EMU_PER_INCH,
      },
    });
  });

  test("render preserves unclipped image sourceFrame under overflow hidden", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Overflow hidden image" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <img
            data={H.WIDE_SVG_DATA_URI}
            style={{ x: -0.5, y: 0.5, width: 3, height: 1, fit: "stretch" }}
          />
        </div>
      </>
    ));

    const ir = (await deck.project()).projection!;
    const [group] = ir.slides[0].payload.drawing.children;

    expect(group?.kind).toBe("group");
    if (group?.kind !== "group") {
      throw new Error("Expected group node.");
    }

    const [imageNode] = group.children;
    expect(imageNode?.kind).toBe("image");
    if (imageNode?.kind !== "image") {
      throw new Error("Expected image node.");
    }

    expect(imageNode.frame).toEqual({
      xEmu: 1 * H.EMU_PER_INCH,
      yEmu: 1.5 * H.EMU_PER_INCH,
      widthEmu: 2 * H.EMU_PER_INCH,
      heightEmu: 1 * H.EMU_PER_INCH,
    });
    expect(imageNode.sourceFrame).toEqual({
      xEmu: 0.5 * H.EMU_PER_INCH,
      yEmu: 1.5 * H.EMU_PER_INCH,
      widthEmu: 3 * H.EMU_PER_INCH,
      heightEmu: 1 * H.EMU_PER_INCH,
    });
    expect(imageNode.clip).toEqual({
      strategy: "intersectParentOverflow",
      originalFrame: {
        xEmu: 0.5 * H.EMU_PER_INCH,
        yEmu: 1.5 * H.EMU_PER_INCH,
        widthEmu: 3 * H.EMU_PER_INCH,
        heightEmu: 1 * H.EMU_PER_INCH,
      },
      clipFrame: {
        xEmu: 1 * H.EMU_PER_INCH,
        yEmu: 1 * H.EMU_PER_INCH,
        widthEmu: 2 * H.EMU_PER_INCH,
        heightEmu: 2 * H.EMU_PER_INCH,
      },
      visibleFrame: {
        xEmu: 1 * H.EMU_PER_INCH,
        yEmu: 1.5 * H.EMU_PER_INCH,
        widthEmu: 2 * H.EMU_PER_INCH,
        heightEmu: 1 * H.EMU_PER_INCH,
      },
    });
  });
});

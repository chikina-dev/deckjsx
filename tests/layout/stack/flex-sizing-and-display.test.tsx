import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("stack layout flex sizing and display", () => {
  test("render supports flexBasis, flexGrow, and flexShrink", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Flex sizing" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 6.5,
            height: 1.5,
            display: "flex",
            flexDirection: "row",
            columnGap: 0.5,
            padding: 0.5,
          }}
        >
          <p style={{ width: 0.5, flexBasis: 1, flexGrow: 1, height: 0.5, fontSize: 18 }}>Grow A</p>
          <p style={{ width: 0.5, flexBasis: 1, flexGrow: 2, height: 0.5, fontSize: 18 }}>Grow B</p>
        </div>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 3,
            width: 4.5,
            height: 1.5,
            display: "flex",
            flexDirection: "row",
            columnGap: 0.5,
            padding: 0.5,
          }}
        >
          <p style={{ flexBasis: 2, flexShrink: 1, height: 0.5, fontSize: 18 }}>Shrink A</p>
          <p style={{ flexBasis: 2, flexShrink: 1, height: 0.5, fontSize: 18 }}>Shrink B</p>
        </div>
      </>
    ));

    expect(
      H.summarizeNodes(
        H.expectPptxProjection(await deck.project()).slides[0].payload.drawing.children,
      ),
    ).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 6.5 * H.EMU_PER_INCH,
          heightEmu: 1.5 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "Grow A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 4 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "Grow B",
            fontSizePt: 18,
          },
        ],
      },
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 3 * H.EMU_PER_INCH,
          widthEmu: 4.5 * H.EMU_PER_INCH,
          heightEmu: 1.5 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 3.5 * H.EMU_PER_INCH,
              widthEmu: 1.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "Shrink A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 3.5 * H.EMU_PER_INCH,
              yEmu: 3.5 * H.EMU_PER_INCH,
              widthEmu: 1.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "Shrink B",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render omits display none nodes from layout flow", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Display none" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 3,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
          }}
        >
          <p style={{ width: 2, height: 0.5, fontSize: 18 }}>A</p>
          <p
            style={{ position: "absolute", display: "none", width: 2, height: 0.75, fontSize: 18 }}
          >
            Hidden
          </p>
          <p style={{ width: 2, height: 0.5, fontSize: 18 }}>B</p>
        </div>
      </>
    ));

    expect(
      H.summarizeNodes(
        H.expectPptxProjection(await deck.project()).slides[0].payload.drawing.children,
      ),
    ).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 4 * H.EMU_PER_INCH,
          heightEmu: 3 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 2 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });
});

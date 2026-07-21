import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("stack layout positioning and wrap", () => {
  test("render offsets relative positioned flex children without changing sibling flow", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Relative flex flow" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 5,
          height: 2,
          display: "flex",
          flexDirection: "row",
          columnGap: 0.25,
          padding: 0.5,
        }}
      >
        <p
          style={{ position: "relative", left: 0.25, top: 0.1, width: 1, fontSize: 18, margin: 0 }}
        >
          Offset
        </p>
        <p style={{ width: 1, fontSize: 18, margin: 0 }}>Next</p>
      </div>
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
          widthEmu: 5 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.75 * H.EMU_PER_INCH,
              yEmu: 1.6 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            text: "Offset",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 2.75 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            text: "Next",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports order and absolute positioning inside stack layout", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Order and absolute" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 6,
            height: 3,
            display: "flex",
            flexDirection: "column",
            gap: 0.25,
            padding: 0.5,
          }}
        >
          <p style={{ width: 2, height: 0.5, fontSize: 18, order: 2, margin: 0 }}>Third</p>
          <p style={{ width: 2, height: 0.5, fontSize: 18, order: -1, margin: 0 }}>First</p>
          <p
            style={{
              position: "absolute",
              left: 1,
              top: 0.25,
              width: 1.5,
              height: 0.5,
              fontSize: 16,
            }}
          >
            Overlay
          </p>
          <p style={{ width: 2, height: 0.5, fontSize: 18, margin: 0 }}>Second</p>
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
          widthEmu: 6 * H.EMU_PER_INCH,
          heightEmu: 3 * H.EMU_PER_INCH,
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
            text: "First",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 2.25 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "Second",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 3 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "Third",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 2.5 * H.EMU_PER_INCH,
              yEmu: 1.75 * H.EMU_PER_INCH,
              widthEmu: 1.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "Overlay",
            fontSizePt: 16,
          },
        ],
      },
    ]);
  });

  test("render supports flexWrap and alignContent for multi-line stack layout", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Wrap" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 6,
            height: 4,
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            alignContent: "center",
            rowGap: 0.5,
            columnGap: 0.5,
            padding: 0.5,
          }}
        >
          <p style={{ width: 2, height: 0.5, fontSize: 18, margin: 0 }}>One</p>
          <p style={{ width: 2, height: 0.5, fontSize: 18, margin: 0 }}>Two</p>
          <p style={{ width: 2, height: 0.5, fontSize: 18, margin: 0 }}>Three</p>
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
          widthEmu: 6 * H.EMU_PER_INCH,
          heightEmu: 4 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.75 * H.EMU_PER_INCH,
              yEmu: 2.25 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "One",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 4.25 * H.EMU_PER_INCH,
              yEmu: 2.25 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "Two",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 3 * H.EMU_PER_INCH,
              yEmu: 3.25 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "Three",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });
});

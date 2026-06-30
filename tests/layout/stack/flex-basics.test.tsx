import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("stack layout flex basics", () => {
  test("render defaults display flex to row direction and stretched cross axis", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Flex defaults" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 2,
            display: "flex",
            columnGap: 0.25,
            padding: 0.5,
          }}
        >
          <p style={{ width: 1, fontSize: 18 }}>A</p>
          <p style={{ width: 1, fontSize: 18 }}>B</p>
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
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            text: "A",
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
            text: "B",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render stretches column flex children without explicit width", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Column flex stretch" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 2,
            display: "flex",
            flexDirection: "column",
            rowGap: 0.25,
            padding: 0.5,
          }}
        >
          <p style={{ height: 0.5, fontSize: 18 }}>A</p>
          <p style={{ height: 0.5, fontSize: 18 }}>B</p>
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
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 0.375 * H.EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 2.125 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 0.375 * H.EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render resolves percentage padding margins and gaps in flex layout", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Flex percentage spacing" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 6,
          height: 2,
          display: "flex",
          padding: "10%",
          columnGap: "10%",
        }}
      >
        <p style={{ width: 1, fontSize: 18 }}>A</p>
        <p style={{ width: 1, fontSize: 18 }}>B</p>
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
          widthEmu: 6 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.6 * H.EMU_PER_INCH,
              yEmu: 1.6 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.8 * H.EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 3.08 * H.EMU_PER_INCH,
              yEmu: 1.6 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.8 * H.EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render resolves stack layout to absolute frames in the IR", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Stack" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 5,
            height: 3,
            display: "flex",
            flexDirection: "column",
            gap: 0.25,
            padding: 0.5,
          }}
        >
          <p style={{ width: 4, height: 0.5, fontSize: 20 }}>First</p>
          <p style={{ width: 4, height: 0.75, fontSize: 20 }}>Second</p>
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
          widthEmu: 5 * H.EMU_PER_INCH,
          heightEmu: 3 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 4 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "First",
            fontSizePt: 20,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 2.25 * H.EMU_PER_INCH,
              widthEmu: 4 * H.EMU_PER_INCH,
              heightEmu: 0.75 * H.EMU_PER_INCH,
            },
            text: "Second",
            fontSizePt: 20,
          },
        ],
      },
    ]);
  });
});

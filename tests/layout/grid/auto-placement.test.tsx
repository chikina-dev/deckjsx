import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("grid auto placement", () => {
  test("render supports dense auto-placement in row flow", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid dense row" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gridTemplateRows: "repeat(2, 1fr)",
            gridAutoFlow: "row dense",
          }}
        >
          <div style={{ gridColumn: "span 2", backgroundColor: "#D1D5DB" }} />
          <div style={{ gridRow: 2, gridColumn: 2, backgroundColor: "#CBD5E1" }} />
          <div style={{ backgroundColor: "#BFDBFE" }} />
          <div style={{ backgroundColor: "#FDE68A" }} />
        </div>
      </>
    ));

    expect(
      H.summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
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
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 4 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 3 * H.EMU_PER_INCH,
              yEmu: 3 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 3 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render keeps sparse auto-placement in default row flow", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid sparse row" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 6,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gridTemplateRows: "repeat(3, 1fr)",
          }}
        >
          <div style={{ gridColumn: "span 2", backgroundColor: "#D1D5DB" }} />
          <div style={{ gridRow: 2, gridColumn: 2, backgroundColor: "#CBD5E1" }} />
          <div style={{ backgroundColor: "#BFDBFE" }} />
          <div style={{ backgroundColor: "#FDE68A" }} />
        </div>
      </>
    ));

    expect(
      H.summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
    ).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 6 * H.EMU_PER_INCH,
          heightEmu: 6 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 4 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 3 * H.EMU_PER_INCH,
              yEmu: 3 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * H.EMU_PER_INCH,
              yEmu: 3 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 5 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });
});

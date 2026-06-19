import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("grid named and line placement", () => {
  test("render supports gridTemplateAreas and gridArea named placement", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid template areas" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            display: "grid",
            gridTemplateColumns: "2in 1in 3in",
            gridTemplateRows: "1in 3in",
            gridTemplateAreas: ['"hero hero aside"', '"footer footer aside"'],
          }}
        >
          <div style={{ gridArea: "hero", backgroundColor: "#D1D5DB" }} />
          <div style={{ gridArea: "aside", backgroundColor: "#CBD5E1" }} />
          <div style={{ gridArea: "footer", backgroundColor: "#BFDBFE" }} />
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
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 4 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 4 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 2 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 3 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports line-based gridArea shorthand placement", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid area shorthand" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            display: "grid",
            gridTemplateColumns: "1in 2in 3in",
            gridTemplateRows: "1in 1in 2in",
          }}
        >
          <div style={{ gridArea: "1 / 2 / 3 / 4", backgroundColor: "#D1D5DB" }} />
          <div style={{ gridArea: "3 / 1 / 4 / 2", backgroundColor: "#CBD5E1" }} />
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
              xEmu: 2 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 5 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 3 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports grid row and column start/end longhands", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid line longhands" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            display: "grid",
            gridTemplateColumns: "1in 2in 3in",
            gridTemplateRows: "1in 1in 2in",
          }}
        >
          <div
            style={{
              gridColumnStart: 2,
              gridColumnEnd: 4,
              gridRowStart: 1,
              gridRowEnd: 3,
              backgroundColor: "#D1D5DB",
            }}
          />
          <div
            style={{
              gridColumnStart: 1,
              gridColumnEnd: 2,
              gridRowStart: 3,
              gridRowEnd: 4,
              backgroundColor: "#CBD5E1",
            }}
          />
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
              xEmu: 2 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 5 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 3 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports span longhands in grid line placement", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid line spans" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            display: "grid",
            gridTemplateColumns: "1in 2in 3in",
            gridTemplateRows: "1in 1in 2in",
          }}
        >
          <div
            style={{
              gridColumnStart: 2,
              gridColumnEnd: "span 2",
              gridRowStart: 2,
              gridRowEnd: "span 2",
              backgroundColor: "#D1D5DB",
            }}
          />
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
              xEmu: 2 * H.EMU_PER_INCH,
              yEmu: 2 * H.EMU_PER_INCH,
              widthEmu: 5 * H.EMU_PER_INCH,
              heightEmu: 3 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });
});

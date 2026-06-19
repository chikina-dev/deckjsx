import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("grid track sizing and repeat", () => {
  test("render supports grid minmax tracks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid minmax" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 2,
            display: "grid",
            gridTemplateColumns: "minmax(1in, 2in) minmax(0.5in, 1fr) 1fr",
            gridTemplateRows: "1fr",
          }}
        >
          <p style={{ width: 0.5, height: 0.5 }}>A</p>
          <p style={{ width: 0.5, height: 0.5 }}>B</p>
          <p style={{ width: 0.5, height: 0.5 }}>C</p>
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
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 3 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 5.25 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "C",
            fontSizePt: undefined,
          },
        ],
      },
    ]);
  });

  test("render supports minmax for implicit auto grid tracks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid auto minmax" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 2,
            display: "grid",
            gridTemplateColumns: "1in",
            gridTemplateRows: "1fr",
            gridAutoColumns: "minmax(0.5in, 1fr)",
            gridAutoFlow: "column",
          }}
        >
          <p style={{ width: 0.5, height: 0.5 }}>A</p>
          <p style={{ width: 0.5, height: 0.5 }}>B</p>
          <p style={{ width: 0.5, height: 0.5 }}>C</p>
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
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 2 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 4.5 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "C",
            fontSizePt: undefined,
          },
        ],
      },
    ]);
  });

  test("render supports repeat(auto-fill, ...) for grid tracks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid auto fill" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 5,
            height: 2,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, 1.5in)",
            gridTemplateRows: "1fr",
          }}
        >
          <p style={{ width: 0.5, height: 0.5 }}>A</p>
          <p style={{ width: 0.5, height: 0.5 }}>B</p>
          <p style={{ width: 0.5, height: 0.5 }}>C</p>
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
          widthEmu: 5 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 2.5 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 4 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "C",
            fontSizePt: undefined,
          },
        ],
      },
    ]);
  });

  test("render supports repeat(auto-fit, ...) by collapsing trailing empty tracks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid auto fit" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 8,
            height: 2,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(2in, 1fr))",
            gridTemplateRows: "1fr",
          }}
        >
          <p style={{ width: 0.5, height: 0.5 }}>A</p>
          <p style={{ width: 0.5, height: 0.5 }}>B</p>
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
          widthEmu: 8 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 5 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: undefined,
          },
        ],
      },
    ]);
  });

  test("render supports placeContent stretch for grid tracks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid placeContent stretch" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 8,
            height: 4,
            display: "grid",
            gridTemplateColumns: "1in 1in",
            gridTemplateRows: "1in 1in",
            placeContent: "stretch",
          }}
        >
          <div style={{ backgroundColor: "#D1D5DB" }} />
          <div style={{ backgroundColor: "#CBD5E1" }} />
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
          widthEmu: 8 * H.EMU_PER_INCH,
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
              xEmu: 5 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 4 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 3 * H.EMU_PER_INCH,
              widthEmu: 4 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * H.EMU_PER_INCH,
              yEmu: 3 * H.EMU_PER_INCH,
              widthEmu: 4 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });
});

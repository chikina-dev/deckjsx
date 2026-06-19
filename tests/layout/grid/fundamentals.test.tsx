import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("grid layout fundamentals", () => {
  test("render supports minimal css grid layout", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gridTemplateRows: "1fr 1fr",
            columnGap: 0.5,
            rowGap: 0.25,
            padding: 0.5,
          }}
        >
          <p style={{ gridColumn: 1, gridRow: 1, fontSize: 18 }}>One</p>
          <div
            style={{
              gridColumn: "2 / 3",
              gridRow: 1,
              width: 1,
              height: 0.5,
              backgroundColor: "#D1D5DB",
            }}
          />
          <p style={{ fontSize: 18 }}>Auto</p>
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
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 1.5 * H.EMU_PER_INCH,
              heightEmu: 1.375 * H.EMU_PER_INCH,
            },
            text: "One",
            fontSizePt: 18,
          },
          {
            kind: "group",
            frame: {
              xEmu: 3.5 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 3.125 * H.EMU_PER_INCH,
              widthEmu: 1.5 * H.EMU_PER_INCH,
              heightEmu: 1.375 * H.EMU_PER_INCH,
            },
            text: "Auto",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports grid span and self placement", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid span" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 8,
            height: 5,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            columnGap: 0.5,
            rowGap: 0.5,
            padding: 0.5,
          }}
        >
          <div
            style={{
              gridColumn: "span 2",
              width: 1,
              height: 0.5,
              justifySelf: "center",
              alignSelf: "end",
              backgroundColor: "#D1D5DB",
            }}
          />
          <div
            style={{ width: 1, height: 0.5, placeSelf: "start center", backgroundColor: "#CBD5E1" }}
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
          widthEmu: 8 * H.EMU_PER_INCH,
          heightEmu: 5 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 3.25 * H.EMU_PER_INCH,
              yEmu: 2.75 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 7 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render treats css-wide grid item sizes as stretch defaults", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid css-wide size defaults" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 4,
          height: 2,
          display: "grid",
          gridTemplateColumns: "1fr",
          gridTemplateRows: "1fr",
        }}
      >
        <div style={{ width: "initial", height: "initial", backgroundColor: "#D1D5DB" } as never} />
      </div>
    ));

    expect(
      H.summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
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
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 4 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render resolves percentage padding and gaps in grid layout", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid percentage spacing" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 8,
          height: 4,
          display: "grid",
          padding: "10%",
          columnGap: "10%",
          rowGap: "10%",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
        }}
      >
        <p style={{ gridColumn: 1, gridRow: 1, fontSize: 18 }}>One</p>
        <p style={{ gridColumn: 2, gridRow: 2, fontSize: 18 }}>Two</p>
      </div>
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
            kind: "text",
            frame: {
              xEmu: 1.8 * H.EMU_PER_INCH,
              yEmu: 1.8 * H.EMU_PER_INCH,
              widthEmu: 2.88 * H.EMU_PER_INCH,
              heightEmu: (27 * H.EMU_PER_INCH) / 25,
            },
            text: "One",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 5.32 * H.EMU_PER_INCH,
              yEmu: 3.12 * H.EMU_PER_INCH,
              widthEmu: 2.88 * H.EMU_PER_INCH,
              heightEmu: (27 * H.EMU_PER_INCH) / 25,
            },
            text: "Two",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports grid repeat templates and placeContent", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid repeat" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 8,
            height: 5,
            display: "grid",
            gridTemplateColumns: "repeat(2, 1in)",
            gridTemplateRows: "repeat(2, 1in)",
            columnGap: 0.5,
            rowGap: 0.5,
            padding: 0.5,
            placeContent: "center end",
          }}
        >
          <div style={{ backgroundColor: "#D1D5DB" }} />
          <div style={{ backgroundColor: "#CBD5E1" }} />
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
          heightEmu: 5 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 6 * H.EMU_PER_INCH,
              yEmu: 2.25 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 7.5 * H.EMU_PER_INCH,
              yEmu: 2.25 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports gridAutoFlow column", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid auto flow column" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 7,
            height: 5,
            display: "grid",
            gridTemplateColumns: "1in",
            gridTemplateRows: "repeat(2, 1fr)",
            gridAutoColumns: 1,
            gridAutoFlow: "column",
            columnGap: 0.5,
            rowGap: 0.5,
            padding: 0.5,
          }}
        >
          <div style={{ width: 0.5, height: 0.5, backgroundColor: "#D1D5DB" }} />
          <div style={{ width: 0.5, height: 0.5, backgroundColor: "#CBD5E1" }} />
          <div style={{ width: 0.5, height: 0.5, backgroundColor: "#BFDBFE" }} />
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
          widthEmu: 7 * H.EMU_PER_INCH,
          heightEmu: 5 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 3.75 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 3 * H.EMU_PER_INCH,
              yEmu: 1.5 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });
});

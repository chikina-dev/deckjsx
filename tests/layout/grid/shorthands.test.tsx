import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("grid shorthands", () => {
  test("render supports gridTemplate shorthand", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid template shorthand" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            display: "grid",
            gridTemplate: '"hero hero aside" 1in "footer footer aside" 3in / 2in 1in 3in',
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

  test("render supports grid shorthand with implied display grid", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid shorthand template" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            grid: '"hero hero aside" 1in "footer footer aside" 3in / 2in 1in 3in',
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

  test("render supports grid shorthand auto-flow rows", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid shorthand auto-flow rows" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 6, height: 3, grid: "auto-flow 1in / 2in 1in" }}>
          <div style={{ backgroundColor: "#D1D5DB" }} />
          <div style={{ backgroundColor: "#CBD5E1" }} />
          <div style={{ backgroundColor: "#BFDBFE" }} />
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
          heightEmu: 3 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 3 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 2 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports grid shorthand auto-flow dense columns", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid shorthand auto-flow dense columns" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 6, height: 6, grid: "1fr 1fr 1fr / auto-flow dense 2in" }}>
          <div style={{ gridRow: "span 2", backgroundColor: "#D1D5DB" }} />
          <div style={{ gridRow: 2, backgroundColor: "#CBD5E1" }} />
          <div style={{ backgroundColor: "#BFDBFE" }} />
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
              heightEmu: 4 * H.EMU_PER_INCH,
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
              widthEmu: 4 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render lets explicit grid longhands override grid shorthands", async () => {
    const gridOverride = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    gridOverride.slide({ name: "Grid shorthand columns override" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 2,
            grid: '"main side" 2in / 1in 5in',
            gridTemplateColumns: "4in 2in",
          }}
        >
          <div style={{ gridArea: "main", backgroundColor: "#D1D5DB" }} />
          <div style={{ gridArea: "side", backgroundColor: "#CBD5E1" }} />
        </div>
      </>
    ));

    expect(
      H.summarizeNodes(
        (await gridOverride.project()).projection!.slides[0].payload.drawing.children,
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
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);

    const autoFlowOverride = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    autoFlowOverride.slide({ name: "Grid shorthand auto-flow override" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            grid: "auto-flow 1in / 2in 1in",
            gridAutoFlow: "row dense",
            gridAutoRows: 2,
          }}
        >
          <div style={{ gridColumn: "span 2", backgroundColor: "#D1D5DB" }} />
          <div style={{ gridColumn: 2, gridRow: 2, backgroundColor: "#CBD5E1" }} />
          <div style={{ backgroundColor: "#BFDBFE" }} />
          <div style={{ backgroundColor: "#FDE68A" }} />
        </div>
      </>
    ));

    expect(
      H.summarizeNodes(
        (await autoFlowOverride.project()).projection!.slides[0].payload.drawing.children,
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
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 2 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 3 * H.EMU_PER_INCH,
              yEmu: 3 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
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

    const templateOverride = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    templateOverride.slide({ name: "Grid template override" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 2,
            display: "grid",
            gridTemplate: '"main side" 2in / 1in 5in',
            gridTemplateColumns: "4in 2in",
          }}
        >
          <div style={{ gridArea: "main", backgroundColor: "#D1D5DB" }} />
          <div style={{ gridArea: "side", backgroundColor: "#CBD5E1" }} />
        </div>
      </>
    ));

    expect(
      H.summarizeNodes(
        (await templateOverride.project()).projection!.slides[0].payload.drawing.children,
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

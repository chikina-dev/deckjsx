import { describe, expect, test } from "vite-plus/test";
import { EMU_PER_INCH } from "../src/index.ts";
import { frameFromProps } from "../src/layout/absolute.ts";
import {
  advanceGridAutoPlacementCursor,
  markGridItem,
  resolveAutoGridPlacement,
  resolveGridTemplateTracks,
  resolveGridTrackContentMinimums,
  resolveGridTracksWithContentMinimums,
} from "../src/layout/grid.ts";
import {
  buildStackLines,
  resolveFlexMainAllocations,
  type StackEntry,
  type StackMetrics,
} from "../src/layout/stack.ts";

type StackTestChild = {
  id: string;
  main: number;
  cross: number;
  margin?: [number, number, number, number];
  grow?: number;
  shrink?: number;
};

const stackMetrics: StackMetrics<StackTestChild> = {
  estimateMainSize: (child) => child.main,
  estimateCrossSize: (child) => child.cross,
  getMargin: (child) => child.margin ?? [0, 0, 0, 0],
  getFlexGrow: (child) => child.grow ?? 0,
  getFlexShrink: (child) => child.shrink ?? 1,
};

describe("layout boundary primitives", () => {
  test("absolute frame resolution handles inset, aspect ratio, and content-box sizing", () => {
    expect(
      frameFromProps(
        {
          left: 1,
          top: 0.5,
          height: 1,
          aspectRatio: "16 / 9",
          boxSizing: "content-box",
          padding: 0.25,
        },
        {
          xEmu: 2 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 8 * EMU_PER_INCH,
          heightEmu: 4 * EMU_PER_INCH,
        },
      ),
    ).toEqual({
      xEmu: 3 * EMU_PER_INCH,
      yEmu: 1.5 * EMU_PER_INCH,
      widthEmu: (16 / 9 + 0.5) * EMU_PER_INCH,
      heightEmu: 1.5 * EMU_PER_INCH,
    });
  });

  test("stack line building and flex allocation are pure child-metric operations", () => {
    const parentFrame = {
      xEmu: 0,
      yEmu: 0,
      widthEmu: 500,
      heightEmu: 200,
    };
    const entries: Array<StackEntry<StackTestChild>> = [
      {
        child: { id: "a", main: 120, cross: 30, margin: [0, 10, 0, 10], grow: 1 },
        sourceIndex: 0,
        order: 0,
        position: undefined,
      },
      {
        child: { id: "b", main: 100, cross: 40, grow: 3 },
        sourceIndex: 1,
        order: 0,
        position: undefined,
      },
      { child: { id: "c", main: 180, cross: 20 }, sourceIndex: 2, order: 0, position: undefined },
    ];

    const lines = buildStackLines(
      entries,
      "horizontal",
      parentFrame,
      260,
      20,
      "wrap",
      stackMetrics,
    );

    expect(lines.map((line) => line.entries.map((entry) => entry.child.id))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
    expect(lines[0]).toMatchObject({
      usedMainEmu: 240,
      crossSizeEmu: 40,
    });

    expect(
      resolveFlexMainAllocations(lines[0], "horizontal", parentFrame, 500, 20, stackMetrics),
    ).toEqual([
      { contentMainEmu: 165, outerMainEmu: 185 },
      { contentMainEmu: 295, outerMainEmu: 295 },
    ]);
  });

  test("grid tracks and auto placement resolve without compiler or writer state", () => {
    const parentFrame = {
      xEmu: 0,
      yEmu: 0,
      widthEmu: 600,
      heightEmu: 300,
    };
    const occupied: boolean[][] = [];
    const first = resolveAutoGridPlacement(occupied, undefined, undefined, 2, 1, undefined, {
      row: 1,
      column: 1,
    });
    markGridItem(occupied, first.row, first.column, first.rowSpan, first.columnSpan);
    const secondCursor = advanceGridAutoPlacementCursor(first, 2, 1, undefined);
    const second = resolveAutoGridPlacement(
      occupied,
      undefined,
      undefined,
      2,
      1,
      undefined,
      secondCursor,
    );
    const template = resolveGridTemplateTracks(
      "repeat(auto-fit, minmax(1in, 1fr))",
      2.2 * EMU_PER_INCH,
      0.2 * EMU_PER_INCH,
    );
    const minimums = resolveGridTrackContentMinimums(
      [{ child: "wide", row: 1, column: 1, rowSpan: 1, columnSpan: 1 }],
      ["minmax(auto, 1fr)", "1fr"],
      "column",
      parentFrame,
      20,
      {
        getMargin: () => [0, 10, 0, 10],
        estimateContentSize: () => 240,
      },
    );

    expect([first, second]).toEqual([
      { row: 1, column: 1, rowSpan: 1, columnSpan: 1 },
      { row: 1, column: 2, rowSpan: 1, columnSpan: 1 },
    ]);
    expect(template).toEqual({
      tracks: ["minmax(1in, 1fr)", "minmax(1in, 1fr)"],
      collapseTrailingAutoFitTracks: true,
    });
    expect(minimums).toEqual([260, 0]);
    expect(
      resolveGridTracksWithContentMinimums(["minmax(auto, 1fr)", "1fr"], 600, 20, minimums),
    ).toEqual([420, 160]);
  });
});

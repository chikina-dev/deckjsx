import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH, Shape, Slide, Text, View } from "../src/index.ts";
import { summarizeNodes } from "./helpers.ts";

describe("View containing blocks", () => {
  test("render resolves local percent, inset, flex, grid, and absolute frames inside View", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Relative layout">
        <View style={{ x: 1, y: 1, width: 6, height: 3 }}>
          <Text style={{ x: "10%", y: "20%", width: "50%", height: "25%", fontSize: 12 }}>
            percent child
          </Text>
          <Text
            style={{
              left: "55%",
              top: "10%",
              right: "10%",
              bottom: "60%",
              fontSize: 12,
            }}
          >
            inset child
          </Text>
        </View>
        <View
          style={{
            x: 1,
            y: 4.25,
            width: 6,
            height: 0.8,
            display: "flex",
            flexDirection: "row",
            gap: 0.1,
            padding: 0.1,
          }}
        >
          <Text style={{ width: "30%", height: 0.32, fontSize: 12 }}>30%</Text>
          <Text style={{ flexGrow: 1, height: 0.32, fontSize: 12 }}>grow</Text>
          <Text style={{ width: 1.1, height: 0.32, fontSize: 12 }}>fixed</Text>
        </View>
      </Slide>
    ));

    deck.add(() => (
      <Slide name="Grid layout">
        <View
          style={{
            x: 1,
            y: 1,
            width: 7,
            height: 3,
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gridTemplateRows: "1fr 1fr",
            padding: 0.2,
          }}
        >
          <Shape shape="rect" />
          <Shape shape="rect" />
          <Text style={{ gridColumn: "span 2", fontSize: 12 }}>span 2 columns</Text>
        </View>
        <View
          style={{
            x: 1,
            y: 4.25,
            width: 7,
            height: 0.85,
            display: "flex",
            flexDirection: "row",
            padding: 0.1,
          }}
        >
          <Text
            style={{
              position: "absolute",
              left: "50%",
              top: "25%",
              width: "40%",
              height: 0.26,
              fontSize: 12,
            }}
          >
            absolute inside flex content frame
          </Text>
        </View>
      </Slide>
    ));

    const ir = deck.render();

    expect(summarizeNodes(ir.slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 3 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.6 * EMU_PER_INCH,
              yEmu: 1.6 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 0.75 * EMU_PER_INCH,
            },
            text: "percent child",
            fontSizePt: 12,
          },
          {
            kind: "text",
            frame: {
              xEmu: 4.3 * EMU_PER_INCH,
              yEmu: 1.3 * EMU_PER_INCH,
              widthEmu: 2.1 * EMU_PER_INCH,
              heightEmu: 0.9 * EMU_PER_INCH,
            },
            text: "inset child",
            fontSizePt: 12,
          },
        ],
      },
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 4.25 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 0.8 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1005840,
              yEmu: 3977640,
              widthEmu: 1.8 * EMU_PER_INCH,
              heightEmu: 0.32 * EMU_PER_INCH,
            },
            text: "30%",
            fontSizePt: 12,
          },
          {
            kind: "text",
            frame: {
              xEmu: 3 * EMU_PER_INCH,
              yEmu: 3977640,
              widthEmu: 2.7 * EMU_PER_INCH,
              heightEmu: 0.32 * EMU_PER_INCH,
            },
            text: "grow",
            fontSizePt: 12,
          },
          {
            kind: "text",
            frame: {
              xEmu: 5.8 * EMU_PER_INCH,
              yEmu: 3977640,
              widthEmu: 1.1 * EMU_PER_INCH,
              heightEmu: 0.32 * EMU_PER_INCH,
            },
            text: "fixed",
            fontSizePt: 12,
          },
        ],
      },
    ]);

    expect(summarizeNodes(ir.slides[1].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 7 * EMU_PER_INCH,
          heightEmu: 3 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "shape",
            frame: {
              xEmu: 1.2 * EMU_PER_INCH,
              yEmu: 1.2 * EMU_PER_INCH,
              widthEmu: 2011680,
              heightEmu: 1.3 * EMU_PER_INCH,
            },
          },
          {
            kind: "shape",
            frame: {
              xEmu: 3.4 * EMU_PER_INCH,
              yEmu: 1.2 * EMU_PER_INCH,
              widthEmu: 4023360,
              heightEmu: 1.3 * EMU_PER_INCH,
            },
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.2 * EMU_PER_INCH,
              yEmu: 2.5 * EMU_PER_INCH,
              widthEmu: 6.6 * EMU_PER_INCH,
              heightEmu: 1.3 * EMU_PER_INCH,
            },
            text: "span 2 columns",
            fontSizePt: 12,
          },
        ],
      },
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 4.25 * EMU_PER_INCH,
          widthEmu: 7 * EMU_PER_INCH,
          heightEmu: 0.85 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 4.5 * EMU_PER_INCH,
              yEmu: 4.5125 * EMU_PER_INCH,
              widthEmu: 2.72 * EMU_PER_INCH,
              heightEmu: 0.26 * EMU_PER_INCH,
            },
            text: "absolute inside flex content frame",
            fontSizePt: 12,
          },
        ],
      },
    ]);
  });
});

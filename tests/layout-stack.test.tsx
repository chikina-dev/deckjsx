import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH, Shape, Text, View } from "../src/index.ts";
import { summarizeNodes } from "./helpers.ts";

describe("stack layout", () => {
  test("render resolves stack layout to absolute frames in the IR", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Stack" }, () => (
      <>
        <View
          style={{
            x: 1,
            y: 1,
            width: 5,
            height: 3,
            layout: "stack",
            direction: "vertical",
            gap: 0.25,
            padding: 0.5,
          }}
        >
          <Text style={{ width: 4, height: 0.5, fontSize: 20 }}>First</Text>
          <Text style={{ width: 4, height: 0.75, fontSize: 20 }}>Second</Text>
        </View>
      </>
    ));

    expect(summarizeNodes(deck.project().projection!.slides[0].payload.elements)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 5 * EMU_PER_INCH,
          heightEmu: 3 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "First",
            fontSizePt: 20,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 2.25 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 0.75 * EMU_PER_INCH,
            },
            text: "Second",
            fontSizePt: 20,
          },
        ],
      },
    ]);
  });

  test("render supports order and absolute positioning inside stack layout", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Order and absolute" }, () => (
      <>
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 3,
            display: "flex",
            flexDirection: "column",
            gap: 0.25,
            padding: 0.5,
          }}
        >
          <Text style={{ width: 2, height: 0.5, fontSize: 18, order: 2 }}>Third</Text>
          <Text style={{ width: 2, height: 0.5, fontSize: 18, order: -1 }}>First</Text>
          <Text
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
          </Text>
          <Text style={{ width: 2, height: 0.5, fontSize: 18 }}>Second</Text>
        </View>
      </>
    ));

    expect(summarizeNodes(deck.project().projection!.slides[0].payload.elements)).toEqual([
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
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "First",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 2.25 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Second",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Third",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 2.5 * EMU_PER_INCH,
              yEmu: 1.75 * EMU_PER_INCH,
              widthEmu: 1.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Overlay",
            fontSizePt: 16,
          },
        ],
      },
    ]);
  });

  test("render supports flexWrap and alignContent for multi-line stack layout", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Wrap" }, () => (
      <>
        <View
          style={{
            x: 1,
            y: 1,
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
          <Text style={{ width: 2, height: 0.5, fontSize: 18 }}>One</Text>
          <Text style={{ width: 2, height: 0.5, fontSize: 18 }}>Two</Text>
          <Text style={{ width: 2, height: 0.5, fontSize: 18 }}>Three</Text>
        </View>
      </>
    ));

    expect(summarizeNodes(deck.project().projection!.slides[0].payload.elements)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 4 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.75 * EMU_PER_INCH,
              yEmu: 2.25 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "One",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 4.25 * EMU_PER_INCH,
              yEmu: 2.25 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Two",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 3 * EMU_PER_INCH,
              yEmu: 3.25 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Three",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports flexBasis, flexGrow, and flexShrink", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Flex sizing" }, () => (
      <>
        <View
          style={{
            x: 1,
            y: 1,
            width: 6.5,
            height: 1.5,
            display: "flex",
            flexDirection: "row",
            columnGap: 0.5,
            padding: 0.5,
          }}
        >
          <Text
            style={{
              width: 0.5,
              flexBasis: 1,
              flexGrow: 1,
              height: 0.5,
              fontSize: 18,
            }}
          >
            Grow A
          </Text>
          <Text
            style={{
              width: 0.5,
              flexBasis: 1,
              flexGrow: 2,
              height: 0.5,
              fontSize: 18,
            }}
          >
            Grow B
          </Text>
        </View>
        <View
          style={{
            x: 1,
            y: 3,
            width: 4.5,
            height: 1.5,
            display: "flex",
            flexDirection: "row",
            columnGap: 0.5,
            padding: 0.5,
          }}
        >
          <Text style={{ flexBasis: 2, flexShrink: 1, height: 0.5, fontSize: 18 }}>Shrink A</Text>
          <Text style={{ flexBasis: 2, flexShrink: 1, height: 0.5, fontSize: 18 }}>Shrink B</Text>
        </View>
      </>
    ));

    expect(summarizeNodes(deck.project().projection!.slides[0].payload.elements)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 6.5 * EMU_PER_INCH,
          heightEmu: 1.5 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Grow A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 4 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Grow B",
            fontSizePt: 18,
          },
        ],
      },
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 3 * EMU_PER_INCH,
          widthEmu: 4.5 * EMU_PER_INCH,
          heightEmu: 1.5 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 3.5 * EMU_PER_INCH,
              widthEmu: 1.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Shrink A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 3.5 * EMU_PER_INCH,
              yEmu: 3.5 * EMU_PER_INCH,
              widthEmu: 1.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Shrink B",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render omits display none nodes from layout flow", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Display none" }, () => (
      <>
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 3,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
          }}
        >
          <Text style={{ width: 2, height: 0.5, fontSize: 18 }}>A</Text>
          <Text style={{ display: "none", width: 2, height: 0.75, fontSize: 18 }}>Hidden</Text>
          <Text style={{ width: 2, height: 0.5, fontSize: 18 }}>B</Text>
        </View>
      </>
    ));

    expect(summarizeNodes(deck.project().projection!.slides[0].payload.elements)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 3 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 2 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports css flex alignment keywords and alignSelf", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Flex alignment" }, () => (
      <>
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 3,
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "stretch",
            padding: [0.25, 0.5, 0.25, 0.5],
          }}
        >
          <Text style={{ width: 1, height: 0.5, fontSize: 18, alignSelf: "flex-end" }}>A</Text>
          <View style={{ width: 1, backgroundColor: "#EEEEEE" }} />
          <Shape shape="rect" style={{ width: 1, height: 1, fill: "#2563EB" }} />
        </View>
      </>
    ));

    const ir = deck.project().projection!;

    expect(summarizeNodes(ir.slides[0].payload.elements)).toEqual([
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
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 3.25 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: 18,
          },
          {
            kind: "group",
            frame: {
              xEmu: 3.5 * EMU_PER_INCH,
              yEmu: 1.25 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 2.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "shape",
            frame: {
              xEmu: 5.5 * EMU_PER_INCH,
              yEmu: 1.25 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
          },
        ],
      },
    ]);
  });
});

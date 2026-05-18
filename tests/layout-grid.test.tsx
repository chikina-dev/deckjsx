import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH, Slide, Text, View } from "../src/index.ts";
import { summarizeNodes } from "./helpers.ts";

describe("grid layout", () => {
  test("render supports minimal css grid layout", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid">
        <View
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
          <Text style={{ gridColumn: 1, gridRow: 1, fontSize: 18 }}>One</Text>
          <View
            style={{
              gridColumn: "2 / 3",
              gridRow: 1,
              width: 1,
              height: 0.5,
              backgroundColor: "#D1D5DB",
            }}
          />
          <Text style={{ fontSize: 18 }}>Auto</Text>
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
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
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 1.5 * EMU_PER_INCH,
              heightEmu: 1.375 * EMU_PER_INCH,
            },
            text: "One",
            fontSizePt: 18,
          },
          {
            kind: "group",
            frame: {
              xEmu: 3.5 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 3.125 * EMU_PER_INCH,
              widthEmu: 1.5 * EMU_PER_INCH,
              heightEmu: 1.375 * EMU_PER_INCH,
            },
            text: "Auto",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports grid span and self placement", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid span">
        <View
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
          <View
            style={{
              gridColumn: "span 2",
              width: 1,
              height: 0.5,
              justifySelf: "center",
              alignSelf: "end",
              backgroundColor: "#D1D5DB",
            }}
          />
          <View
            style={{
              width: 1,
              height: 0.5,
              placeSelf: "start center",
              backgroundColor: "#CBD5E1",
            }}
          />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 8 * EMU_PER_INCH,
          heightEmu: 5 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 3.25 * EMU_PER_INCH,
              yEmu: 2.75 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 7 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports grid repeat templates and placeContent", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid repeat">
        <View
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
          <View style={{ backgroundColor: "#D1D5DB" }} />
          <View style={{ backgroundColor: "#CBD5E1" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 8 * EMU_PER_INCH,
          heightEmu: 5 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 6 * EMU_PER_INCH,
              yEmu: 2.25 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 7.5 * EMU_PER_INCH,
              yEmu: 2.25 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports gridAutoFlow column", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid auto flow column">
        <View
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
          <View style={{ width: 0.5, height: 0.5, backgroundColor: "#D1D5DB" }} />
          <View style={{ width: 0.5, height: 0.5, backgroundColor: "#CBD5E1" }} />
          <View style={{ width: 0.5, height: 0.5, backgroundColor: "#BFDBFE" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 7 * EMU_PER_INCH,
          heightEmu: 5 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 3.75 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 3 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports grid minmax tracks", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid minmax">
        <View
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
          <Text style={{ width: 0.5, height: 0.5 }}>A</Text>
          <Text style={{ width: 0.5, height: 0.5 }}>B</Text>
          <Text style={{ width: 0.5, height: 0.5 }}>C</Text>
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 3 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 5.25 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "C",
            fontSizePt: undefined,
          },
        ],
      },
    ]);
  });

  test("render supports minmax for implicit auto grid tracks", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid auto minmax">
        <View
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
          <Text style={{ width: 0.5, height: 0.5 }}>A</Text>
          <Text style={{ width: 0.5, height: 0.5 }}>B</Text>
          <Text style={{ width: 0.5, height: 0.5 }}>C</Text>
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 2 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 4.5 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "C",
            fontSizePt: undefined,
          },
        ],
      },
    ]);
  });

  test("render supports repeat(auto-fill, ...) for grid tracks", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid auto fill">
        <View
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
          <Text style={{ width: 0.5, height: 0.5 }}>A</Text>
          <Text style={{ width: 0.5, height: 0.5 }}>B</Text>
          <Text style={{ width: 0.5, height: 0.5 }}>C</Text>
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 5 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 2.5 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 4 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "C",
            fontSizePt: undefined,
          },
        ],
      },
    ]);
  });

  test("render supports repeat(auto-fit, ...) by collapsing trailing empty tracks", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid auto fit">
        <View
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
          <Text style={{ width: 0.5, height: 0.5 }}>A</Text>
          <Text style={{ width: 0.5, height: 0.5 }}>B</Text>
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 8 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: undefined,
          },
          {
            kind: "text",
            frame: {
              xEmu: 5 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: undefined,
          },
        ],
      },
    ]);
  });

  test("render supports placeContent stretch for grid tracks", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid placeContent stretch">
        <View
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
          <View style={{ backgroundColor: "#D1D5DB" }} />
          <View style={{ backgroundColor: "#CBD5E1" }} />
          <View style={{ backgroundColor: "#BFDBFE" }} />
          <View style={{ backgroundColor: "#FDE68A" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 8 * EMU_PER_INCH,
          heightEmu: 4 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports dense auto-placement in row flow", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid dense row">
        <View
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
          <View style={{ gridColumn: "span 2", backgroundColor: "#D1D5DB" }} />
          <View style={{ gridRow: 2, gridColumn: 2, backgroundColor: "#CBD5E1" }} />
          <View style={{ backgroundColor: "#BFDBFE" }} />
          <View style={{ backgroundColor: "#FDE68A" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
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
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 3 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render keeps sparse auto-placement in default row flow", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid sparse row">
        <View
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
          <View style={{ gridColumn: "span 2", backgroundColor: "#D1D5DB" }} />
          <View style={{ gridRow: 2, gridColumn: 2, backgroundColor: "#CBD5E1" }} />
          <View style={{ backgroundColor: "#BFDBFE" }} />
          <View style={{ backgroundColor: "#FDE68A" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 6 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 3 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 5 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports gridTemplateAreas and gridArea named placement", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid template areas">
        <View
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
          <View style={{ gridArea: "hero", backgroundColor: "#D1D5DB" }} />
          <View style={{ gridArea: "aside", backgroundColor: "#CBD5E1" }} />
          <View style={{ gridArea: "footer", backgroundColor: "#BFDBFE" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
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
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 4 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 4 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 2 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 3 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports line-based gridArea shorthand placement", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid area shorthand">
        <View
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
          <View style={{ gridArea: "1 / 2 / 3 / 4", backgroundColor: "#D1D5DB" }} />
          <View style={{ gridArea: "3 / 1 / 4 / 2", backgroundColor: "#CBD5E1" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
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
            kind: "group",
            frame: {
              xEmu: 2 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 5 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports grid row and column start/end longhands", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid line longhands">
        <View
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
          <View
            style={{
              gridColumnStart: 2,
              gridColumnEnd: 4,
              gridRowStart: 1,
              gridRowEnd: 3,
              backgroundColor: "#D1D5DB",
            }}
          />
          <View
            style={{
              gridColumnStart: 1,
              gridColumnEnd: 2,
              gridRowStart: 3,
              gridRowEnd: 4,
              backgroundColor: "#CBD5E1",
            }}
          />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
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
            kind: "group",
            frame: {
              xEmu: 2 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 5 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports span longhands in grid line placement", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid line spans">
        <View
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
          <View
            style={{
              gridColumnStart: 2,
              gridColumnEnd: "span 2",
              gridRowStart: 2,
              gridRowEnd: "span 2",
              backgroundColor: "#D1D5DB",
            }}
          />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
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
            kind: "group",
            frame: {
              xEmu: 2 * EMU_PER_INCH,
              yEmu: 2 * EMU_PER_INCH,
              widthEmu: 5 * EMU_PER_INCH,
              heightEmu: 3 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports gridTemplate shorthand", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid template shorthand">
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            display: "grid",
            gridTemplate: '"hero hero aside" 1in "footer footer aside" 3in / 2in 1in 3in',
          }}
        >
          <View style={{ gridArea: "hero", backgroundColor: "#D1D5DB" }} />
          <View style={{ gridArea: "aside", backgroundColor: "#CBD5E1" }} />
          <View style={{ gridArea: "footer", backgroundColor: "#BFDBFE" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
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
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 4 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 4 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 2 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 3 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports grid shorthand with implied display grid", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid shorthand template">
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 4,
            grid: '"hero hero aside" 1in "footer footer aside" 3in / 2in 1in 3in',
          }}
        >
          <View style={{ gridArea: "hero", backgroundColor: "#D1D5DB" }} />
          <View style={{ gridArea: "aside", backgroundColor: "#CBD5E1" }} />
          <View style={{ gridArea: "footer", backgroundColor: "#BFDBFE" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
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
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 4 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 4 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 2 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 3 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports grid shorthand auto-flow rows", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid shorthand auto-flow rows">
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 3,
            grid: "auto-flow 1in / 2in 1in",
          }}
        >
          <View style={{ backgroundColor: "#D1D5DB" }} />
          <View style={{ backgroundColor: "#CBD5E1" }} />
          <View style={{ backgroundColor: "#BFDBFE" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
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
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 3 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 2 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports grid shorthand auto-flow dense columns", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid shorthand auto-flow dense columns">
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 6,
            grid: "1fr 1fr 1fr / auto-flow dense 2in",
          }}
        >
          <View style={{ gridRow: "span 2", backgroundColor: "#D1D5DB" }} />
          <View style={{ gridRow: 2, backgroundColor: "#CBD5E1" }} />
          <View style={{ backgroundColor: "#BFDBFE" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(deck.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 6 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 4 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 5 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render lets explicit grid longhands override grid shorthands", () => {
    const gridOverride = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    gridOverride.add(() => (
      <Slide name="Grid shorthand columns override">
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 2,
            grid: '"main side" 2in / 1in 5in',
            gridTemplateColumns: "4in 2in",
          }}
        >
          <View style={{ gridArea: "main", backgroundColor: "#D1D5DB" }} />
          <View style={{ gridArea: "side", backgroundColor: "#CBD5E1" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(gridOverride.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);

    const autoFlowOverride = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    autoFlowOverride.add(() => (
      <Slide name="Grid shorthand auto-flow override">
        <View
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
          <View style={{ gridColumn: "span 2", backgroundColor: "#D1D5DB" }} />
          <View style={{ gridColumn: 2, gridRow: 2, backgroundColor: "#CBD5E1" }} />
          <View style={{ backgroundColor: "#BFDBFE" }} />
          <View style={{ backgroundColor: "#FDE68A" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(autoFlowOverride.render().slides[0].nodes)).toEqual([
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
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 3 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 3 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 5 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);

    const templateOverride = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });
    templateOverride.add(() => (
      <Slide name="Grid template override">
        <View
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
          <View style={{ gridArea: "main", backgroundColor: "#D1D5DB" }} />
          <View style={{ gridArea: "side", backgroundColor: "#CBD5E1" }} />
        </View>
      </Slide>
    ));

    expect(summarizeNodes(templateOverride.render().slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 2 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render supports grid auto tracks and container item placement defaults", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid auto tracks">
        <View
          style={{
            x: 1,
            y: 1,
            width: 8,
            height: 5,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr",
            gridAutoColumns: 1,
            gridAutoRows: "0.5fr",
            columnGap: 0.5,
            rowGap: 0.5,
            padding: 0.5,
            placeItems: "end center",
          }}
        >
          <View style={{ width: 1, height: 0.5, backgroundColor: "#D1D5DB" }} />
          <View
            style={{
              gridColumn: 3,
              width: 0.5,
              height: 0.5,
              justifySelf: "start",
              backgroundColor: "#CBD5E1",
            }}
          />
          <View style={{ width: 1, height: 0.5, backgroundColor: "#BFDBFE" }} />
          <View style={{ width: 1, height: 0.5, backgroundColor: "#93C5FD" }} />
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
          widthEmu: 8 * EMU_PER_INCH,
          heightEmu: 5 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 2.25 * EMU_PER_INCH,
              yEmu: 3.3333333333333335 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 7.5 * EMU_PER_INCH,
              yEmu: 3.3333333333333335 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 2.25 * EMU_PER_INCH,
              yEmu: 5 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5.25 * EMU_PER_INCH,
              yEmu: 5 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render uses content-based minimums for minmax(auto, 1fr) tracks", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid auto min content">
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 2,
            display: "grid",
            gridTemplateColumns: "minmax(auto, 1fr) 1fr",
            gridTemplateRows: "1fr",
          }}
        >
          <View style={{ width: 3, height: 0.5, backgroundColor: "#D1D5DB" }} />
          <View style={{ width: 0.5, height: 0.5, backgroundColor: "#CBD5E1" }} />
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
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5.5 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render uses content-based minimums for implicit minmax(auto, 1fr) tracks", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid implicit auto min content">
        <View
          style={{
            x: 1,
            y: 1,
            width: 7,
            height: 2,
            display: "grid",
            gridTemplateColumns: "1in",
            gridTemplateRows: "1fr",
            gridAutoColumns: "minmax(auto, 1fr)",
            gridAutoFlow: "column",
          }}
        >
          <View style={{ width: 1, height: 0.5, backgroundColor: "#D1D5DB" }} />
          <View style={{ width: 3, height: 0.5, backgroundColor: "#CBD5E1" }} />
          <View style={{ width: 0.5, height: 0.5, backgroundColor: "#BFDBFE" }} />
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
          widthEmu: 7 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 2 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 6.25 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render uses content-based minimums for multi-span auto tracks", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Grid multi-span auto min content">
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 2,
            display: "grid",
            gridTemplateColumns: "minmax(auto, 1fr) minmax(auto, 1fr) 1fr",
            gridTemplateRows: "1fr",
          }}
        >
          <View
            style={{ gridColumn: "span 2", width: 5, height: 0.5, backgroundColor: "#D1D5DB" }}
          />
          <View style={{ width: 0.5, height: 0.5, backgroundColor: "#CBD5E1" }} />
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
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 6.666666666666667 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });
});

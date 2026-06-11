import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH } from "../../src/index.ts";
import { summarizeNodes } from "../helpers.ts";

describe("stack layout", () => {
  test("render defaults display flex to row direction and stretched cross axis", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Flex defaults" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
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
      summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
    ).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 2.75 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render stretches column flex children without explicit width", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Column flex stretch" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
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
      summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
    ).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 4 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 0.375 * EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 2.125 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 0.375 * EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render resolves percentage padding margins and gaps in flex layout", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Flex percentage spacing" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
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
      summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
    ).toEqual([
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
              xEmu: 1.6 * EMU_PER_INCH,
              yEmu: 1.6 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.8 * EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 3.08 * EMU_PER_INCH,
              yEmu: 1.6 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.8 * EMU_PER_INCH,
            },
            text: "B",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render resolves stack layout to absolute frames in the IR", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Stack" }, () => (
      <>
        <div
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
          <p style={{ width: 4, height: 0.5, fontSize: 20 }}>First</p>
          <p style={{ width: 4, height: 0.75, fontSize: 20 }}>Second</p>
        </div>
      </>
    ));

    expect(
      summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
    ).toEqual([
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

  test("render offsets relative positioned flex children without changing sibling flow", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Relative flex flow" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 5,
          height: 2,
          display: "flex",
          flexDirection: "row",
          columnGap: 0.25,
          padding: 0.5,
        }}
      >
        <p style={{ position: "relative", left: 0.25, top: 0.1, width: 1, fontSize: 18 }}>Offset</p>
        <p style={{ width: 1, fontSize: 18 }}>Next</p>
      </div>
    ));

    expect(
      summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
    ).toEqual([
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
              xEmu: 1.75 * EMU_PER_INCH,
              yEmu: 1.6 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            text: "Offset",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 2.75 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            text: "Next",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports order and absolute positioning inside stack layout", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Order and absolute" }, () => (
      <>
        <div
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
          <p style={{ width: 2, height: 0.5, fontSize: 18, order: 2 }}>Third</p>
          <p style={{ width: 2, height: 0.5, fontSize: 18, order: -1 }}>First</p>
          <p
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
          </p>
          <p style={{ width: 2, height: 0.5, fontSize: 18 }}>Second</p>
        </div>
      </>
    ));

    expect(
      summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
    ).toEqual([
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

  test("render supports flexWrap and alignContent for multi-line stack layout", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Wrap" }, () => (
      <>
        <div
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
          <p style={{ width: 2, height: 0.5, fontSize: 18 }}>One</p>
          <p style={{ width: 2, height: 0.5, fontSize: 18 }}>Two</p>
          <p style={{ width: 2, height: 0.5, fontSize: 18 }}>Three</p>
        </div>
      </>
    ));

    expect(
      summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
    ).toEqual([
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

  test("render supports flexBasis, flexGrow, and flexShrink", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Flex sizing" }, () => (
      <>
        <div
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
          <p style={{ width: 0.5, flexBasis: 1, flexGrow: 1, height: 0.5, fontSize: 18 }}>Grow A</p>
          <p style={{ width: 0.5, flexBasis: 1, flexGrow: 2, height: 0.5, fontSize: 18 }}>Grow B</p>
        </div>
        <div
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
          <p style={{ flexBasis: 2, flexShrink: 1, height: 0.5, fontSize: 18 }}>Shrink A</p>
          <p style={{ flexBasis: 2, flexShrink: 1, height: 0.5, fontSize: 18 }}>Shrink B</p>
        </div>
      </>
    ));

    expect(
      summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
    ).toEqual([
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

  test("render omits display none nodes from layout flow", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Display none" }, () => (
      <>
        <div
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
          <p style={{ width: 2, height: 0.5, fontSize: 18 }}>A</p>
          <p style={{ display: "none", width: 2, height: 0.75, fontSize: 18 }}>Hidden</p>
          <p style={{ width: 2, height: 0.5, fontSize: 18 }}>B</p>
        </div>
      </>
    ));

    expect(
      summarizeNodes((await deck.project()).projection!.slides[0].payload.drawing.children),
    ).toEqual([
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

  test("render supports css flex alignment keywords and alignSelf", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Flex alignment" }, () => (
      <>
        <div
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
          <p style={{ width: 1, height: 0.5, fontSize: 18, alignSelf: "flex-end" }}>A</p>
          <div style={{ width: 1, backgroundColor: "#EEEEEE" }} />
          <shape shape="rect" style={{ width: 1, height: 1, fill: "#2563EB" }} />
        </div>
      </>
    ));

    const ir = (await deck.project()).projection!;

    expect(summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
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

  test("render records unsupported flex and alignment css keywords", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Unsupported flex CSS keywords" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 4,
          height: 2,
          display: "flex",
          flexDirection: "row-reverse" as never,
          flexWrap: "wrap-reverse" as never,
          justifyContent: "safe center" as never,
          alignItems: "first baseline" as never,
        }}
      >
        <p style={{ width: 1, fontSize: 18 }}>A</p>
      </div>
    ));

    const project = await deck.project();
    const [group] = project.projection!.slides[0].payload.drawing.children;

    expect(project.ok).toBe(true);
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "flexDirection",
        value: "row-reverse",
      }),
    );
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "flexWrap",
        value: "wrap-reverse",
      }),
    );
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "justifyContent",
        value: "safe center",
      }),
    );
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "alignItems",
        value: "first baseline",
      }),
    );
  });

  test("render records auto margin fallback instead of failing spacing parsing", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Auto margin fallback" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 4,
          height: 2,
          display: "flex",
          flexDirection: "row",
        }}
      >
        <p style={{ width: 1, height: 0.5, margin: "0 auto" as never, fontSize: 18 }}>Auto</p>
      </div>
    ));

    const project = await deck.project();
    const [group] = project.projection!.slides[0].payload.drawing.children;
    const [text] = group?.kind === "group" ? group.children : [];

    expect(project.ok).toBe(true);
    expect(text?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "margin",
        value: JSON.stringify(["0", "auto", "0", "auto"]),
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          missing: expect.arrayContaining(["cssAutoMarginResolution"]),
        }),
      }),
    );
  });
});

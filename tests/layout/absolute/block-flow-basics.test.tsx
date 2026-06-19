import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("absolute layout block flow basics", () => {
  test("render gives unsized text a readable default frame", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Unsized text" }, () => <p>Hello</p>);

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(H.summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "text",
        frame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 0.3 * H.EMU_PER_INCH,
        },
        text: "Hello",
        fontSizePt: undefined,
      },
    ]);
  });

  test("render records wrapped text measurement fallback for long auto-height text", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Wrapped text fallback" }, () => (
      <p style={{ x: 1, y: 1, width: 2, fontSize: 18 }}>
        This is a deliberately long paragraph that needs wrapped text measurement before it can have
        a browser-like content height.
      </p>
    ));

    const [text] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(text?.kind).toBe("text");
    expect(text?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "height",
        value: "auto",
        fallback: expect.objectContaining({
          preserves: ["availableInlineSize", "lineHeightAutoHeight"],
          missing: ["wrappedTextMeasurement"],
        }),
      }),
    );
  });

  test("render flows unpositioned block text inside absolute containers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Block text flow" }, () => (
      <div style={{ x: 1, y: 1, width: 2, height: 2, padding: 0.1 }}>
        <p style={{ fontSize: 18 }}>KPI</p>
        <p style={{ fontSize: 30 }}>92%</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(H.summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH + 0.1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH + 0.1 * H.EMU_PER_INCH,
              widthEmu: 1.8 * H.EMU_PER_INCH,
              heightEmu: 0.3 * H.EMU_PER_INCH,
            },
            text: "KPI",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH + 0.1 * H.EMU_PER_INCH,
              yEmu: 1.4 * H.EMU_PER_INCH,
              widthEmu: 1.8 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "92%",
            fontSizePt: 30,
          },
        ],
      },
    ]);
  });

  test("render offsets relative positioned block children without changing flow", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Relative block flow" }, () => (
      <div style={{ x: 1, y: 1, width: 3, height: 2, padding: 0.25, gap: 0.25 }}>
        <p style={{ position: "relative", top: 0.2, left: 0.3, fontSize: 18 }}>Offset</p>
        <p style={{ fontSize: 18 }}>Next</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(H.summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 3 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.55 * H.EMU_PER_INCH,
              yEmu: 1.45 * H.EMU_PER_INCH,
              widthEmu: 2.5 * H.EMU_PER_INCH,
              heightEmu: 0.3 * H.EMU_PER_INCH,
            },
            text: "Offset",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.25 * H.EMU_PER_INCH,
              yEmu: 1.8 * H.EMU_PER_INCH,
              widthEmu: 2.5 * H.EMU_PER_INCH,
              heightEmu: 0.3 * H.EMU_PER_INCH,
            },
            text: "Next",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render resolves percentage padding margin and block gaps against real layout bases", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Percentage block spacing" }, () => (
      <div style={{ x: 1, y: 1, width: 4, height: 3, padding: "10%", gap: "10%" }}>
        <p style={{ margin: "5%", fontSize: 18 }}>First</p>
        <p style={{ margin: "5%", fontSize: 18 }}>Second</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(H.summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 4 * H.EMU_PER_INCH,
          heightEmu: 3 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.56 * H.EMU_PER_INCH,
              yEmu: 1.56 * H.EMU_PER_INCH,
              widthEmu: 2.88 * H.EMU_PER_INCH,
              heightEmu: 0.3 * H.EMU_PER_INCH,
            },
            text: "First",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.56 * H.EMU_PER_INCH,
              yEmu: 2.4 * H.EMU_PER_INCH,
              widthEmu: 2.88 * H.EMU_PER_INCH,
              heightEmu: 0.3 * H.EMU_PER_INCH,
            },
            text: "Second",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render treats css-wide block-flow width as not authored when applying margins", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "CSS-wide width flow" }, () => (
      <div style={{ x: 1, y: 1, width: 4, height: 2 }}>
        <p style={{ width: "initial", margin: "0 0.25in", fontSize: 18 } as never}>Initial</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(H.summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
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
            kind: "text",
            frame: {
              xEmu: 1.25 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 3.5 * H.EMU_PER_INCH,
              heightEmu: 0.3 * H.EMU_PER_INCH,
            },
            text: "Initial",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });
});

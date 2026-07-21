import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("absolute layout block flow basics", () => {
  test("render gives unsized text a readable default frame", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Unsized text" }, () => <p>Hello</p>);

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(
      H.summarizeNodes(H.expectPptxProjection(project).slides[0].payload.drawing.children),
    ).toEqual([
      {
        kind: "text",
        frame: {
          xEmu: 0,
          yEmu: 0.25 * H.EMU_PER_INCH,
          widthEmu: 10 * H.EMU_PER_INCH,
          heightEmu: 0.3 * H.EMU_PER_INCH,
        },
        text: "Hello",
        fontSizePt: 18,
      },
    ]);
  });

  test("render applies browser-inspired heading and paragraph defaults with collapsed margins", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "User-agent block flow" }, () => (
      <div style={{ position: "absolute", left: 1, top: 1, width: 4, height: 4 }}>
        <h1>Heading</h1>
        <p>First</p>
        <p>Second</p>
      </div>
    ));

    const [group] = H.expectPptxProjection(await deck.project()).slides[0].payload.drawing.children;
    expect(group?.kind).toBe("group");
    if (group?.kind !== "group") {
      return;
    }

    const [heading, first, second] = group.children;
    expect(heading?.kind).toBe("text");
    if (heading?.kind !== "text") {
      return;
    }
    expect(heading?.style.fontSizePt).toBe(36);
    expect(heading?.style.fontWeight).toBe("bold");
    expect(heading?.frame.yEmu).toBeCloseTo(1.335 * H.EMU_PER_INCH, 5);
    expect(first?.frame.yEmu).toBeCloseTo(2.27 * H.EMU_PER_INCH, 5);
    expect(second?.frame.yEmu).toBeCloseTo(2.82 * H.EMU_PER_INCH, 5);
  });

  test("measures long auto-height text using its wrapped line count", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Wrapped text fallback" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 2, fontSize: 18 }}>
        This is a deliberately long paragraph that needs wrapped text measurement before it can have
        a browser-like content height.
      </p>
    ));

    const [text] = H.expectPptxProjection(await deck.project()).slides[0].payload.drawing.children;

    expect(text?.kind).toBe("text");
    expect(text?.unsupportedSemantics ?? []).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "height",
        value: "auto",
        fallback: expect.objectContaining({
          strategy: "synthesizeFallbackFrame",
          preserves: [
            "availableInlineSize",
            "wrappedLineCount",
            "lineHeightAutoHeight",
            "characterSpacing",
            "paragraphSpacing",
          ],
          missing: ["fontSpecificGlyphMetrics", "exactTextShaping"],
        }),
      }),
    );
    expect(text?.frame.heightEmu).toBeGreaterThan(0.3 * H.EMU_PER_INCH);
  });

  test("uses the standard Helvetica width table for unregistered auto-height text", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Standard fallback widths" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "240pt",
          fontSize: 100,
          overflowWrap: "anywhere",
        }}
      >
        {"W".repeat(81)}
      </p>
    ));

    const [text] = H.expectPptxProjection(await deck.project()).slides[0].payload.drawing.children;

    expect(text?.kind).toBe("text");
    expect(text?.frame.heightEmu).toBeCloseTo(41 * 120 * 12700, 5);
  });

  test("reserves wrap safety for unregistered presentation fonts", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Fallback font safety" }, () => (
      <h2 style={{ position: "absolute", left: 1, top: 1, width: 3.57, margin: 0 }}>
        Semantic defaults
      </h2>
    ));

    const [heading] = H.expectPptxProjection(await deck.project()).slides[0].payload.drawing
      .children;

    expect(heading?.kind).toBe("text");
    expect(heading?.frame.heightEmu).toBeCloseTo(0.9 * H.EMU_PER_INCH, 5);
  });

  test("includes character spacing when wrapping auto-height text", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Character spacing" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: "120pt",
            fontSize: 20,
            overflowWrap: "anywhere",
          }}
        >
          WWWWWW
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: "120pt",
            fontSize: 20,
            letterSpacing: "2pt",
            overflowWrap: "anywhere",
          }}
        >
          WWWWWW
        </p>
      </>
    ));

    const [plain, spaced] = H.expectPptxProjection(await deck.project()).slides[0].payload.drawing
      .children;

    expect(plain?.frame.heightEmu).toBeCloseTo(24 * 12700, 5);
    expect(spaced?.frame.heightEmu).toBeCloseTo(48 * 12700, 5);
  });

  test("includes paragraph spacing before and after in auto-height text", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Paragraph spacing" }, () => (
      <p
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: "200pt",
          fontSize: 20,
          paragraphSpacingBefore: "10pt",
          paragraphSpacingAfter: "14pt",
        }}
      >
        Paragraph
      </p>
    ));

    const [text] = H.expectPptxProjection(await deck.project()).slides[0].payload.drawing.children;

    expect(text?.frame.heightEmu).toBeCloseTo(48 * 12700, 5);
  });

  test("render flows unpositioned block text inside absolute containers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Block text flow" }, () => (
      <div style={{ position: "absolute", left: 1, top: 1, width: 2, height: 2, padding: 0.1 }}>
        <p style={{ fontSize: 18 }}>KPI</p>
        <p style={{ fontSize: 30 }}>92%</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(
      H.summarizeNodes(H.expectPptxProjection(project).slides[0].payload.drawing.children),
    ).toEqual([
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
              yEmu: 1.35 * H.EMU_PER_INCH,
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
              yEmu: 1_889_760,
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
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 3,
          height: 2,
          padding: 0.25,
          gap: 0.25,
        }}
      >
        <p style={{ position: "relative", top: 0.2, left: 0.3, fontSize: 18 }}>Offset</p>
        <p style={{ fontSize: 18 }}>Next</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(
      H.summarizeNodes(H.expectPptxProjection(project).slides[0].payload.drawing.children),
    ).toEqual([
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
              yEmu: 1.7 * H.EMU_PER_INCH,
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
              yEmu: 2.3 * H.EMU_PER_INCH,
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

  test("project reports static left and top before block flow layout", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Static positioning props" }, () => (
      <div style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2, gap: 0.1 }}>
        <p style={{ left: 0.75, top: 0.5, width: 1.5, fontSize: 18 } as never}>Static</p>
        <p style={{ fontSize: 18 }}>Next</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "E_COMPILE_POSITIONING_REQUIRES_POSITION",
        "E_COMPILE_POSITIONING_REQUIRES_POSITION",
      ]),
    );
  });

  test("render resolves percentage padding margin and block gaps against real layout bases", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Percentage block spacing" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 4,
          height: 3,
          padding: "10%",
          gap: "10%",
        }}
      >
        <p style={{ margin: "5%", fontSize: 18 }}>First</p>
        <p style={{ margin: "5%", fontSize: 18 }}>Second</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(
      H.summarizeNodes(H.expectPptxProjection(project).slides[0].payload.drawing.children),
    ).toEqual([
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
              yEmu: 2_048_256,
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

  test("render rejects css-wide block-flow width authoring", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "CSS-wide width flow" }, () => (
      <div style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2 }}>
        <p style={{ width: "initial", margin: "0 0.25in", fontSize: 18 } as never}>Initial</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_COMPILE_INVALID_STYLE_VALUE",
        message: expect.stringContaining("width value is not part of the public authoring API"),
      }),
    );
  });
});

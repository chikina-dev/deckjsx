import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("absolute layout CSS lengths and fallbacks", () => {
  test("render keeps aspect-ratio-only block children in normal flow", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Aspect ratio flow" }, () => (
      <div style={{ position: "absolute", left: 1, top: 1, width: 3, height: 2 }}>
        <p style={{ aspectRatio: "16 / 9", fontSize: 18 }}>Ratio</p>
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
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 0.3 * H.EMU_PER_INCH,
            },
            text: "Ratio",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1.3 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 0.3 * H.EMU_PER_INCH,
            },
            text: "Next",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports css spacing shorthand strings", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Spacing shorthand" }, () => (
      <div
        style={{ position: "absolute", left: 1, top: 1, width: 4, height: 2, padding: "10% 5%" }}
      >
        <p style={{ margin: ["5%", "10%", 0, "10%"], fontSize: 18 }}>Shorthand</p>
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
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.56 * H.EMU_PER_INCH,
              yEmu: 1.58 * H.EMU_PER_INCH,
              widthEmu: 2.88 * H.EMU_PER_INCH,
              heightEmu: 0.3 * H.EMU_PER_INCH,
            },
            text: "Shorthand",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports additional css absolute and viewport length units", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "CSS length units" }, () => (
      <div
        style={{
          position: "absolute",
          left: "2.54cm",
          top: "25.4mm",
          width: "6pc",
          height: "10vmin",
        }}
      />
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
          widthEmu: 1 * H.EMU_PER_INCH,
          heightEmu: 0.5625 * H.EMU_PER_INCH,
        },
        children: [],
      },
    ]);
  });

  test("render rejects unsupported css layout keywords", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Unsupported CSS layout keywords" }, () => (
      <div
        style={{
          left: 1,
          top: 1,
          width: 2,
          height: 1,
          display: "inline-block" as never,
          overflow: "auto" as never,
          position: "fixed" as never,
        }}
      />
    ));

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.projection).toBeUndefined();
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining("display value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining(
            "overflow value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining(
            "position value is not part of the public authoring API",
          ),
        }),
      ]),
    );
  });

  test("render rejects auto inset at the public authoring boundary", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Auto inset rejection" }, () => (
      <div style={{ position: "absolute", left: 1, top: 1, width: 3, height: 2 }}>
        <p
          style={{
            position: "absolute",
            inset: "auto 0" as never,
            height: 0.3,
            fontSize: 18,
          }}
        >
          Auto inset
        </p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_COMPILE_INVALID_STYLE_VALUE",
        severity: "error",
        message: expect.stringContaining("inset value is not part of the public authoring API"),
      }),
    );
  });

  test("render rejects css-wide sizing and padding authoring", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "CSS-wide length defaults" }, () => (
      <p
        style={
          {
            position: "absolute",
            left: 1,
            top: 1,
            width: "initial",
            height: "initial",
            padding: "initial",
            fontSize: "initial",
            lineHeight: "initial",
            letterSpacing: "initial",
          } as never
        }
      >
        Defaults
      </p>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining("width value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining("height value is not part of the public authoring API"),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining("padding value is not part of the public authoring API"),
        }),
      ]),
    );
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("absolute layout CSS lengths and fallbacks", () => {
  test("render keeps aspect-ratio-only block children in normal flow", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Aspect ratio flow" }, () => (
      <div style={{ x: 1, y: 1, width: 3, height: 2 }}>
        <p style={{ aspectRatio: "16 / 9", fontSize: 18 }}>Ratio</p>
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
      <div style={{ x: 1, y: 1, width: 4, height: 2, padding: "10% 5%" }}>
        <p style={{ margin: "5% 10% 0", fontSize: 18 }}>Shorthand</p>
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
          x: "2.54cm",
          y: "25.4mm",
          width: "6pc",
          height: "10vmin",
        }}
      />
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(H.summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
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

  test("render records unsupported css layout keywords instead of silently dropping them", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Unsupported CSS layout keywords" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 2,
          height: 1,
          display: "inline-block" as never,
          overflow: "auto" as never,
          position: "fixed" as never,
        }}
      />
    ));

    const project = await deck.project();
    const [group] = project.projection!.slides[0].payload.drawing.children;

    expect(project.ok).toBe(true);
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "display",
        value: "inline-block",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          missing: expect.arrayContaining(["cssDisplayBehavior"]),
        }),
      }),
    );
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "overflow",
        value: "auto",
      }),
    );
    expect(group?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "position",
        value: "fixed",
      }),
    );
    expect(project.summary?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "layout", property: "display" }),
        expect.objectContaining({ feature: "layout", property: "overflow" }),
        expect.objectContaining({ feature: "layout", property: "position" }),
      ]),
    );
  });

  test("render records auto inset fallback instead of failing length parsing", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Auto inset fallback" }, () => (
      <div style={{ x: 1, y: 1, width: 3, height: 2 }}>
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
    const [group] = project.projection!.slides[0].payload.drawing.children;
    const [text] = group?.kind === "group" ? group.children : [];

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
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 0.3 * H.EMU_PER_INCH,
            },
            text: "Auto inset",
            fontSizePt: 18,
          },
        ],
      },
    ]);
    expect(text?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "inset",
        value: "auto 0",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          missing: expect.arrayContaining(["cssAutoInsetResolution"]),
        }),
      }),
    );
  });

  test("render treats css-wide length keywords as defaults instead of zero-sized boxes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "CSS-wide length defaults" }, () => (
      <p
        style={{
          x: 1,
          y: 1,
          width: "initial",
          height: "initial",
          padding: "initial",
          fontSize: "initial",
          lineHeight: "initial",
          letterSpacing: "initial",
        }}
      >
        Defaults
      </p>
    ));

    const project = await deck.project();
    const [text] = project.projection!.slides[0].payload.drawing.children;

    expect(project.ok).toBe(true);
    expect(H.summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "text",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 9 * H.EMU_PER_INCH,
          heightEmu: 0.3 * H.EMU_PER_INCH,
        },
        text: "Defaults",
        fontSizePt: undefined,
      },
    ]);
    expect(text?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "layout",
          property: "width",
          value: "initial",
          fallback: expect.objectContaining({
            strategy: "preserveAuthoredValueOnly",
            missing: expect.arrayContaining(["cssWideKeywordCascade"]),
          }),
        }),
        expect.objectContaining({
          feature: "layout",
          property: "height",
          value: "initial",
        }),
        expect.objectContaining({
          feature: "layout",
          property: "letterSpacing",
          value: "initial",
        }),
      ]),
    );
  });
});

import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH } from "../../src/index.ts";
import { projectSource } from "../../src/pipeline-runner.ts";
import type { AssetLoader } from "../../src/assets.ts";
import { WIDE_SVG_DATA_URI, summarizeNodes } from "../helpers.ts";

describe("absolute layout", () => {
  test("render gives unsized text a readable default frame", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Unsized text" }, () => <p>Hello</p>);

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "text",
        frame: {
          xEmu: 0,
          yEmu: 0,
          widthEmu: 10 * EMU_PER_INCH,
          heightEmu: 0.3 * EMU_PER_INCH,
        },
        text: "Hello",
        fontSizePt: undefined,
      },
    ]);
  });

  test("render records wrapped text measurement fallback for long auto-height text", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Block text flow" }, () => (
      <div style={{ x: 1, y: 1, width: 2, height: 2, padding: 0.1 }}>
        <p style={{ fontSize: 18 }}>KPI</p>
        <p style={{ fontSize: 30 }}>92%</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH + 0.1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH + 0.1 * EMU_PER_INCH,
              widthEmu: 1.8 * EMU_PER_INCH,
              heightEmu: 0.3 * EMU_PER_INCH,
            },
            text: "KPI",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH + 0.1 * EMU_PER_INCH,
              yEmu: 1.4 * EMU_PER_INCH,
              widthEmu: 1.8 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "92%",
            fontSizePt: 30,
          },
        ],
      },
    ]);
  });

  test("render offsets relative positioned block children without changing flow", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Relative block flow" }, () => (
      <div style={{ x: 1, y: 1, width: 3, height: 2, padding: 0.25, gap: 0.25 }}>
        <p style={{ position: "relative", top: 0.2, left: 0.3, fontSize: 18 }}>Offset</p>
        <p style={{ fontSize: 18 }}>Next</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 3 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.55 * EMU_PER_INCH,
              yEmu: 1.45 * EMU_PER_INCH,
              widthEmu: 2.5 * EMU_PER_INCH,
              heightEmu: 0.3 * EMU_PER_INCH,
            },
            text: "Offset",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.25 * EMU_PER_INCH,
              yEmu: 1.8 * EMU_PER_INCH,
              widthEmu: 2.5 * EMU_PER_INCH,
              heightEmu: 0.3 * EMU_PER_INCH,
            },
            text: "Next",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render resolves percentage padding margin and block gaps against real layout bases", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Percentage block spacing" }, () => (
      <div style={{ x: 1, y: 1, width: 4, height: 3, padding: "10%", gap: "10%" }}>
        <p style={{ margin: "5%", fontSize: 18 }}>First</p>
        <p style={{ margin: "5%", fontSize: 18 }}>Second</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
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
              xEmu: 1.56 * EMU_PER_INCH,
              yEmu: 1.56 * EMU_PER_INCH,
              widthEmu: 2.88 * EMU_PER_INCH,
              heightEmu: 0.3 * EMU_PER_INCH,
            },
            text: "First",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1.56 * EMU_PER_INCH,
              yEmu: 2.4 * EMU_PER_INCH,
              widthEmu: 2.88 * EMU_PER_INCH,
              heightEmu: 0.3 * EMU_PER_INCH,
            },
            text: "Second",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render treats css-wide block-flow width as not authored when applying margins", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "CSS-wide width flow" }, () => (
      <div style={{ x: 1, y: 1, width: 4, height: 2 }}>
        <p style={{ width: "initial", margin: "0 0.25in", fontSize: 18 } as never}>Initial</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
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
              xEmu: 1.25 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3.5 * EMU_PER_INCH,
              heightEmu: 0.3 * EMU_PER_INCH,
            },
            text: "Initial",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render keeps aspect-ratio-only block children in normal flow", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Aspect ratio flow" }, () => (
      <div style={{ x: 1, y: 1, width: 3, height: 2 }}>
        <p style={{ aspectRatio: "16 / 9", fontSize: 18 }}>Ratio</p>
        <p style={{ fontSize: 18 }}>Next</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 3 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 0.3 * EMU_PER_INCH,
            },
            text: "Ratio",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1.3 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 0.3 * EMU_PER_INCH,
            },
            text: "Next",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports css spacing shorthand strings", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Spacing shorthand" }, () => (
      <div style={{ x: 1, y: 1, width: 4, height: 2, padding: "10% 5%" }}>
        <p style={{ margin: "5% 10% 0", fontSize: 18 }}>Shorthand</p>
      </div>
    ));

    const project = await deck.project();

    expect(project.ok).toBe(true);
    expect(summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
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
              xEmu: 1.56 * EMU_PER_INCH,
              yEmu: 1.58 * EMU_PER_INCH,
              widthEmu: 2.88 * EMU_PER_INCH,
              heightEmu: 0.3 * EMU_PER_INCH,
            },
            text: "Shorthand",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });

  test("render supports additional css absolute and viewport length units", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    expect(summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 1 * EMU_PER_INCH,
          heightEmu: 0.5625 * EMU_PER_INCH,
        },
        children: [],
      },
    ]);
  });

  test("render records unsupported css layout keywords instead of silently dropping them", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    expect(summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 3 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 0.3 * EMU_PER_INCH,
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
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

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
    expect(summarizeNodes(project.projection!.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "text",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 9 * EMU_PER_INCH,
          heightEmu: 0.3 * EMU_PER_INCH,
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

  test("render supports aspectRatio in absolute and stack layout", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Aspect ratio" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 2, aspectRatio: "16 / 9", backgroundColor: "#EEEEEE" }} />
        <div
          style={{
            x: 1,
            y: 3,
            width: 6,
            height: 2,
            display: "flex",
            flexDirection: "row",
            columnGap: 0.5,
            padding: 0.5,
          }}
        >
          <div style={{ width: 2, aspectRatio: 2, backgroundColor: "#D1D5DB" }} />
          <div style={{ height: 1, aspectRatio: 0.5, backgroundColor: "#CBD5E1" }} />
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
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1.125 * EMU_PER_INCH,
        },
        children: [],
      },
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 3 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 3.5 * EMU_PER_INCH,
              widthEmu: 2 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 4 * EMU_PER_INCH,
              yEmu: 3.5 * EMU_PER_INCH,
              widthEmu: 0.5 * EMU_PER_INCH,
              heightEmu: 1 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render treats aspectRatio auto as no authored ratio", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Auto aspect ratio" }, () => (
      <div style={{ x: 1, y: 1, width: 2, aspectRatio: "auto", backgroundColor: "#EEEEEE" }} />
    ));

    const [node] = (await deck.project()).projection!.slides[0].payload.drawing.children;

    expect(node?.kind).toBe("group");
    expect(node?.frame).toEqual({
      xEmu: 1 * EMU_PER_INCH,
      yEmu: 1 * EMU_PER_INCH,
      widthEmu: 2 * EMU_PER_INCH,
      heightEmu: 0,
    });
  });

  test("render derives image aspect ratio from asset probe metadata", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const loader = {
      resolverIdentity: "wide-image-test",
      async probe({ source }) {
        return source.kind === "path" && source.path === "/wide.png"
          ? {
              ok: true,
              value: { mediaType: "image/png", extension: "png", width: 100, height: 50 },
            }
          : undefined;
      },
    } satisfies AssetLoader;

    deck.slide({ name: "Natural image aspect ratio" }, () => (
      <>
        <img src="/wide.png" style={{ x: 1, y: 1, width: 3 }} />
        <img src="/wide.png" style={{ x: 5, y: 1, height: 1 }} />
        <img src="/wide.png" style={{ x: 1, y: 3, width: 2, aspectRatio: 1 }} />
      </>
    ));

    const ir = (
      await projectSource({
        source: deck,
        options: deck.options,
        assetLoaders: [loader],
      })
    ).projection!;

    expect(summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "image",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 3 * EMU_PER_INCH,
          heightEmu: 1.5 * EMU_PER_INCH,
        },
      },
      {
        kind: "image",
        frame: {
          xEmu: 5 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
      },
      {
        kind: "image",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 3 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
      },
    ]);
  });

  test("render supports boxSizing content-box", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Box sizing" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            boxSizing: "content-box",
            padding: [0.25, 0.5, 0.25, 0.5],
            backgroundColor: "#EEEEEE",
          }}
        >
          <p style={{ width: 1, height: 0.5, fontSize: 18 }}>Inner</p>
        </div>
        <div
          style={{
            x: 1,
            y: 3,
            width: 6,
            height: 2,
            display: "flex",
            flexDirection: "row",
            columnGap: 0.5,
            padding: 0.5,
          }}
        >
          <div
            style={{
              width: 2,
              height: 0.5,
              boxSizing: "content-box",
              paddingLeft: 0.5,
              paddingRight: 0.5,
              backgroundColor: "#D1D5DB",
            }}
          />
          <div style={{ width: 1, height: 0.5, backgroundColor: "#CBD5E1" }} />
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
          widthEmu: 3 * EMU_PER_INCH,
          heightEmu: 1.5 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1 * EMU_PER_INCH,
              yEmu: 1 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Inner",
            fontSizePt: 18,
          },
        ],
      },
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 3 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 3.5 * EMU_PER_INCH,
              widthEmu: 3 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * EMU_PER_INCH,
              yEmu: 3.5 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render preserves visibility hidden in layout and sorts by zIndex", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Visibility and zIndex" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5, fontSize: 18, zIndex: 10 }}>Front</p>
        <div
          style={{
            x: 1,
            y: 2,
            width: 2,
            height: 0.75,
            backgroundColor: "#D1D5DB",
            visibility: "hidden",
            zIndex: -1,
          }}
        />
        <p style={{ x: 1, y: 3, width: 2, height: 0.5, fontSize: 18, zIndex: 1 }}>Middle</p>
      </>
    ));

    const ir = (await deck.project()).projection!;

    expect(
      ir.slides[0].payload.drawing.children.map((node) => ({
        kind: node.kind,
        zIndex: node.zIndex,
        visibility: node.visibility,
        frame: node.frame,
        text: node.kind === "text" ? node.content.text : undefined,
      })),
    ).toEqual([
      {
        kind: "group",
        zIndex: -1,
        visibility: "hidden",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 2 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 0.75 * EMU_PER_INCH,
        },
        text: undefined,
      },
      {
        kind: "text",
        zIndex: 1,
        visibility: undefined,
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 3 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 0.5 * EMU_PER_INCH,
        },
        text: "Middle",
      },
      {
        kind: "text",
        zIndex: 10,
        visibility: undefined,
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 0.5 * EMU_PER_INCH,
        },
        text: "Front",
      },
    ]);
  });

  test("render clips children when a view uses overflow hidden", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Overflow hidden" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <p style={{ x: 0.5, y: 0.5, width: 4, height: 0.75, fontSize: 18 }}>Clip me</p>
          <p style={{ x: 3.5, y: 0.5, width: 1, height: 0.5, fontSize: 18 }}>Drop me</p>
        </div>
        <div style={{ x: 5, y: 1, width: 3, height: 2, backgroundColor: "#E5E7EB" }}>
          <p style={{ x: 0.5, y: 0.5, width: 4, height: 0.75, fontSize: 18 }}>Visible</p>
        </div>
      </>
    ));

    const ir = (await deck.project()).projection!;
    const [hiddenGroup, visibleGroup] = ir.slides[0].payload.drawing.children;

    expect(summarizeNodes([hiddenGroup])).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 3 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 2.5 * EMU_PER_INCH,
              heightEmu: 0.75 * EMU_PER_INCH,
            },
            text: "Clip me",
            fontSizePt: 18,
          },
        ],
      },
    ]);

    expect(summarizeNodes([visibleGroup])).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 5 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 3 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 5.5 * EMU_PER_INCH,
              yEmu: 1.5 * EMU_PER_INCH,
              widthEmu: 4 * EMU_PER_INCH,
              heightEmu: 0.75 * EMU_PER_INCH,
            },
            text: "Visible",
            fontSizePt: 18,
          },
        ],
      },
    ]);

    expect(hiddenGroup?.kind).toBe("group");
    if (hiddenGroup?.kind !== "group") {
      throw new Error("Expected overflow-hidden group node.");
    }
    const [clipped] = hiddenGroup.children;
    expect(clipped?.clip).toEqual({
      strategy: "intersectParentOverflow",
      originalFrame: {
        xEmu: 1.5 * EMU_PER_INCH,
        yEmu: 1.5 * EMU_PER_INCH,
        widthEmu: 4 * EMU_PER_INCH,
        heightEmu: 0.75 * EMU_PER_INCH,
      },
      clipFrame: {
        xEmu: 1 * EMU_PER_INCH,
        yEmu: 1 * EMU_PER_INCH,
        widthEmu: 3 * EMU_PER_INCH,
        heightEmu: 2 * EMU_PER_INCH,
      },
      visibleFrame: {
        xEmu: 1.5 * EMU_PER_INCH,
        yEmu: 1.5 * EMU_PER_INCH,
        widthEmu: 2.5 * EMU_PER_INCH,
        heightEmu: 0.75 * EMU_PER_INCH,
      },
    });
  });

  test("render preserves unclipped image sourceFrame under overflow hidden", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Overflow hidden image" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <img
            data={WIDE_SVG_DATA_URI}
            style={{ x: -0.5, y: 0.5, width: 3, height: 1, fit: "stretch" }}
          />
        </div>
      </>
    ));

    const ir = (await deck.project()).projection!;
    const [group] = ir.slides[0].payload.drawing.children;

    expect(group?.kind).toBe("group");
    if (group?.kind !== "group") {
      throw new Error("Expected group node.");
    }

    const [imageNode] = group.children;
    expect(imageNode?.kind).toBe("image");
    if (imageNode?.kind !== "image") {
      throw new Error("Expected image node.");
    }

    expect(imageNode.frame).toEqual({
      xEmu: 1 * EMU_PER_INCH,
      yEmu: 1.5 * EMU_PER_INCH,
      widthEmu: 2 * EMU_PER_INCH,
      heightEmu: 1 * EMU_PER_INCH,
    });
    expect(imageNode.sourceFrame).toEqual({
      xEmu: 0.5 * EMU_PER_INCH,
      yEmu: 1.5 * EMU_PER_INCH,
      widthEmu: 3 * EMU_PER_INCH,
      heightEmu: 1 * EMU_PER_INCH,
    });
    expect(imageNode.clip).toEqual({
      strategy: "intersectParentOverflow",
      originalFrame: {
        xEmu: 0.5 * EMU_PER_INCH,
        yEmu: 1.5 * EMU_PER_INCH,
        widthEmu: 3 * EMU_PER_INCH,
        heightEmu: 1 * EMU_PER_INCH,
      },
      clipFrame: {
        xEmu: 1 * EMU_PER_INCH,
        yEmu: 1 * EMU_PER_INCH,
        widthEmu: 2 * EMU_PER_INCH,
        heightEmu: 2 * EMU_PER_INCH,
      },
      visibleFrame: {
        xEmu: 1 * EMU_PER_INCH,
        yEmu: 1.5 * EMU_PER_INCH,
        widthEmu: 2 * EMU_PER_INCH,
        heightEmu: 1 * EMU_PER_INCH,
      },
    });
  });

  test("render supports inset and min/max size constraints", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Inset and constraints" }, () => (
      <>
        <div style={{ inset: [1, 2, "144px", "96px"], backgroundColor: "#EEEEEE" }} />
        <p
          style={{
            left: "48px",
            top: "48px",
            width: "96px",
            minWidth: "192px",
            height: "48px",
            maxHeight: "24px",
            fontSize: 18,
          }}
        >
          Clamp
        </p>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 3,
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            padding: [0.25, 0.5, 0.25, 0.5],
            columnGap: 1,
          }}
        >
          <div style={{ width: 1, maxHeight: 1.5, backgroundColor: "#D1D5DB" }} />
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
          widthEmu: 7 * EMU_PER_INCH,
          heightEmu: 3.125 * EMU_PER_INCH,
        },
        children: [],
      },
      {
        kind: "text",
        frame: {
          xEmu: 0.5 * EMU_PER_INCH,
          yEmu: 0.5 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 0.25 * EMU_PER_INCH,
        },
        text: "Clamp",
        fontSizePt: 18,
      },
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
              xEmu: 1.5 * EMU_PER_INCH,
              yEmu: 1.25 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 1.5 * EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });
});

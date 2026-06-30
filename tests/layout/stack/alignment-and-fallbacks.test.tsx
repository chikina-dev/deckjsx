import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("stack layout alignment and fallbacks", () => {
  test("render supports css flex alignment keywords and alignSelf", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Flex alignment" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
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

    const ir = H.expectPptxProjection(await deck.project());

    expect(H.summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 6 * H.EMU_PER_INCH,
          heightEmu: 3 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 3.25 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "A",
            fontSizePt: 18,
          },
          {
            kind: "group",
            frame: {
              xEmu: 3.5 * H.EMU_PER_INCH,
              yEmu: 1.25 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 2.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "shape",
            frame: {
              xEmu: 5.5 * H.EMU_PER_INCH,
              yEmu: 1.25 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
          },
        ],
      },
    ]);
  });

  test("render rejects unsupported flex and alignment css keywords", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Unsupported flex CSS keywords" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
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

    expect(project.ok).toBe(false);
    expect(project.projection).toBeUndefined();
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining(
            "flexDirection value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining(
            "flexWrap value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining(
            "justifyContent value is not part of the public authoring API",
          ),
        }),
        expect.objectContaining({
          code: "E_COMPILE_INVALID_STYLE_VALUE",
          message: expect.stringContaining(
            "alignItems value is not part of the public authoring API",
          ),
        }),
      ]),
    );
  });

  test("render rejects auto margin at the public authoring boundary", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Auto margin rejection" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
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

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_COMPILE_INVALID_STYLE_VALUE",
        severity: "error",
        message: expect.stringContaining("margin value is not part of the public authoring API"),
      }),
    );
  });
});

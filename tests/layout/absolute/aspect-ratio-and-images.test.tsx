import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("absolute layout aspect ratio and images", () => {
  test("render supports aspectRatio in absolute and stack layout", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Aspect ratio" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            aspectRatio: "16 / 9",
            backgroundColor: "#EEEEEE",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 3,
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

    const ir = H.expectPptxProjection(await deck.project());

    expect(H.summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1.125 * H.EMU_PER_INCH,
        },
        children: [],
      },
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 3 * H.EMU_PER_INCH,
          widthEmu: 6 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 3.5 * H.EMU_PER_INCH,
              widthEmu: 2 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 4 * H.EMU_PER_INCH,
              yEmu: 3.5 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 1 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render treats aspectRatio auto as no authored ratio", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Auto aspect ratio" }, () => (
      <div
        style={{
          position: "absolute",
          left: 1,
          top: 1,
          width: 2,
          aspectRatio: "auto",
          backgroundColor: "#EEEEEE",
        }}
      />
    ));

    const [node] = H.expectPptxProjection(await deck.project()).slides[0].payload.drawing.children;

    expect(node?.kind).toBe("group");
    expect(node?.frame).toEqual({
      xEmu: 1 * H.EMU_PER_INCH,
      yEmu: 1 * H.EMU_PER_INCH,
      widthEmu: 2 * H.EMU_PER_INCH,
      heightEmu: 0,
    });
  });

  test("render derives image aspect ratio from asset probe metadata", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
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
    } satisfies H.AssetLoader;

    deck.slide({ name: "Natural image aspect ratio" }, () => (
      <>
        <img src="/wide.png" style={{ position: "absolute", left: 1, top: 1, width: 3 }} />
        <img src="/wide.png" style={{ position: "absolute", left: 5, top: 1, height: 1 }} />
        <img
          src="/wide.png"
          style={{ position: "absolute", left: 1, top: 3, width: 2, aspectRatio: 1 }}
        />
      </>
    ));

    const ir = H.expectPptxProjection(
      await H.projectSource({
        source: deck,
        options: deck.options,
        assetLoaders: [loader],
      }),
    );

    expect(H.summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "image",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 3 * H.EMU_PER_INCH,
          heightEmu: 1.5 * H.EMU_PER_INCH,
        },
      },
      {
        kind: "image",
        frame: {
          xEmu: 5 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 1 * H.EMU_PER_INCH,
        },
      },
      {
        kind: "image",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 3 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
      },
    ]);
  });

  test("render supports boxSizing content-box", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Box sizing" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
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
            position: "absolute",
            left: 1,
            top: 3,
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

    const ir = H.expectPptxProjection(await deck.project());

    expect(H.summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 3 * H.EMU_PER_INCH,
          heightEmu: 1.5 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 1.25 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            text: "Inner",
            fontSizePt: 18,
          },
        ],
      },
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 3 * H.EMU_PER_INCH,
          widthEmu: 6 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 3.5 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5 * H.EMU_PER_INCH,
              yEmu: 3.5 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });
});

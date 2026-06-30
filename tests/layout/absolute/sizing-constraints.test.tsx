import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("absolute layout sizing constraints", () => {
  test("render supports inset and min/max size constraints", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Inset and constraints" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            inset: [1, 2, "144px", "96px"],
            backgroundColor: "#EEEEEE",
          }}
        />
        <p
          style={{
            position: "absolute",
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
            position: "absolute",
            left: 1,
            top: 1,
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

    const ir = H.expectPptxProjection(await deck.project());

    expect(H.summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 7 * H.EMU_PER_INCH,
          heightEmu: 3.125 * H.EMU_PER_INCH,
        },
        children: [],
      },
      {
        kind: "text",
        frame: {
          xEmu: 0.5 * H.EMU_PER_INCH,
          yEmu: 0.5 * H.EMU_PER_INCH,
          widthEmu: 2 * H.EMU_PER_INCH,
          heightEmu: 0.25 * H.EMU_PER_INCH,
        },
        text: "Clamp",
        fontSizePt: 18,
      },
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
            kind: "group",
            frame: {
              xEmu: 1.5 * H.EMU_PER_INCH,
              yEmu: 1.25 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 1.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });
});

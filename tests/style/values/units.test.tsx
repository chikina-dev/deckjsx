import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("style value units", () => {
  test("render supports em rem vh vw and ch units", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5, unit: "in" } });

    deck.slide({ name: "Relative units" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: "1rem",
            top: "2rem",
            width: "10vw",
            height: "20vh",
            backgroundColor: "#E5E7EB",
          }}
        />
        <p
          style={{
            position: "absolute",
            left: "5vw",
            top: "10vh",
            width: "10em",
            height: "4ch",
            fontSize: "2rem",
            padding: "1em",
            lineHeight: "1.5em",
            textIndent: "2ch",
            listStyleType: "circle",
            listIndent: "3ch",
            tabStops: [{ position: "4ch", alignment: "center" }],
          }}
        >
          Units
        </p>
      </>
    ));

    const nodes = (await deck.project()).projection!.slides[0].payload.drawing.children;
    const box = nodes[0];
    const text = nodes[1];

    expect(box?.kind).toBe("group");
    if (!box || box.kind !== "group") {
      throw new Error("Expected group node.");
    }

    expect(box.frame).toEqual({
      xEmu: H.EMU_PER_INCH / 6,
      yEmu: H.EMU_PER_INCH / 3,
      widthEmu: H.EMU_PER_INCH,
      heightEmu: H.EMU_PER_INCH,
    });

    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text node.");
    }

    expect(text.frame).toEqual({
      xEmu: 0.5 * H.EMU_PER_INCH,
      yEmu: 0.5 * H.EMU_PER_INCH,
      widthEmu: (10 / 3) * H.EMU_PER_INCH,
      heightEmu: (2 / 3) * H.EMU_PER_INCH,
    });
    expect(text.style.fontSizePt).toBe(24);
    expect(text.style.paddingPt).toEqual([24, 24, 24, 24]);
    expect(text.style.lineSpacing).toBe(36);
    expect(text.style.textIndentPt).toBe(24);
    expect(text.style.list).toEqual({ type: "bullet", characterCode: "25E6", indentPt: 36 });
    expect(text.style.tabStops).toEqual([{ positionIn: 2 / 3, alignment: "ctr" }]);
  });

  test("render resolves viewport units inside nested stack layout sizing", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5, unit: "in" } });

    deck.slide({ name: "Stack viewport units" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100vw",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            padding: ["10vh", "10vw", 0, "10vw"],
            gap: "5vh",
          }}
        >
          <p
            style={{
              width: "20vw",
              height: "10vh",
              marginTop: 0,
              marginBottom: "5vh",
              fontSize: 12,
            }}
          >
            Stack viewport
          </p>
        </div>
      </>
    ));

    const group = (await deck.project()).projection!.slides[0].payload.drawing.children[0];

    expect(group?.kind).toBe("group");
    if (!group || group.kind !== "group") {
      throw new Error("Expected group node.");
    }

    expect(group.frame).toEqual({
      xEmu: 0,
      yEmu: 0,
      widthEmu: 10 * H.EMU_PER_INCH,
      heightEmu: 5 * H.EMU_PER_INCH,
    });
    expect(group.children[0]?.frame).toEqual({
      xEmu: 1 * H.EMU_PER_INCH,
      yEmu: 0.5 * H.EMU_PER_INCH,
      widthEmu: 2 * H.EMU_PER_INCH,
      heightEmu: 0.5 * H.EMU_PER_INCH,
    });
  });

  test("render resolves viewport units inside nested grid layout sizing", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5, unit: "in" } });

    deck.slide({ name: "Grid viewport units" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100vw",
            height: "100vh",
            display: "grid",
            padding: ["10vh", "10vw", 0, "10vw"],
            columnGap: "5vw",
            rowGap: "5vh",
            gridTemplateColumns: ["20vw", "1fr"],
            gridTemplateRows: ["10vh", "1fr"],
          }}
        >
          <p
            style={{
              gridColumn: 1,
              gridRow: 1,
              width: "15vw",
              height: "8vh",
              fontSize: 12,
              margin: 0,
            }}
          >
            Grid viewport
          </p>
        </div>
      </>
    ));

    const group = (await deck.project()).projection!.slides[0].payload.drawing.children[0];

    expect(group?.kind).toBe("group");
    if (!group || group.kind !== "group") {
      throw new Error("Expected group node.");
    }

    expect(group.frame).toEqual({
      xEmu: 0,
      yEmu: 0,
      widthEmu: 10 * H.EMU_PER_INCH,
      heightEmu: 5 * H.EMU_PER_INCH,
    });
    expect(group.children[0]?.frame).toEqual({
      xEmu: 1 * H.EMU_PER_INCH,
      yEmu: 0.5 * H.EMU_PER_INCH,
      widthEmu: 1.5 * H.EMU_PER_INCH,
      heightEmu: 0.4 * H.EMU_PER_INCH,
    });
  });
});

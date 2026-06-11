import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH } from "../../src/index.ts";
import { summarizeNodes } from "../helpers.ts";

const toEmu = (inches: number) => inches * EMU_PER_INCH;
const toRoundedEmu = (inches: number) => Math.round(toEmu(inches));

describe(" containing blocks", () => {
  test("render resolves local percent, inset, flex, grid, and absolute frames inside ", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Relative layout" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 6, height: 3 }}>
          <p style={{ x: "10%", y: "20%", width: "50%", height: "25%", fontSize: 12 }}>
            percent child
          </p>
          <p style={{ left: "55%", top: "10%", right: "10%", bottom: "60%", fontSize: 12 }}>
            inset child
          </p>
        </div>
        <div
          style={{
            x: 1,
            y: 4.25,
            width: 6,
            height: 0.8,
            display: "flex",
            flexDirection: "row",
            gap: 0.1,
            padding: 0.1,
          }}
        >
          <p style={{ width: "30%", height: 0.32, fontSize: 12 }}>30%</p>
          <p style={{ flexGrow: 1, height: 0.32, fontSize: 12 }}>grow</p>
          <p style={{ width: 1.1, height: 0.32, fontSize: 12 }}>fixed</p>
        </div>
      </>
    ));

    deck.slide({ name: "Grid layout" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 7,
            height: 3,
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gridTemplateRows: "1fr 1fr",
            padding: 0.2,
          }}
        >
          <shape shape="rect" />
          <shape shape="rect" />
          <p style={{ gridColumn: "span 2", fontSize: 12 }}>span 2 columns</p>
        </div>
        <div
          style={{
            x: 1,
            y: 4.25,
            width: 7,
            height: 0.85,
            display: "flex",
            flexDirection: "row",
            padding: 0.1,
          }}
        >
          <p
            style={{
              position: "absolute",
              left: "50%",
              top: "25%",
              width: "40%",
              height: 0.26,
              fontSize: 12,
            }}
          >
            absolute inside flex content frame
          </p>
        </div>
      </>
    ));

    const ir = (await deck.project()).projection!;

    expect(summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: { xEmu: toEmu(1), yEmu: toEmu(1), widthEmu: toEmu(6), heightEmu: toEmu(3) },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: toEmu(1.6),
              yEmu: toEmu(1.6),
              widthEmu: toEmu(3),
              heightEmu: toEmu(0.75),
            },
            text: "percent child",
            fontSizePt: 12,
          },
          {
            kind: "text",
            frame: {
              xEmu: toEmu(4.3),
              yEmu: toEmu(1.3),
              widthEmu: toEmu(2.1),
              heightEmu: toEmu(0.9),
            },
            text: "inset child",
            fontSizePt: 12,
          },
        ],
      },
      {
        kind: "group",
        frame: { xEmu: toEmu(1), yEmu: toEmu(4.25), widthEmu: toEmu(6), heightEmu: toEmu(0.8) },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: toRoundedEmu(1.1),
              yEmu: toRoundedEmu(4.35),
              widthEmu: toEmu(1.74),
              heightEmu: toEmu(0.32),
            },
            text: "30%",
            fontSizePt: 12,
          },
          {
            kind: "text",
            frame: {
              xEmu: toEmu(2.94),
              yEmu: toRoundedEmu(4.35),
              widthEmu: toEmu(2.76),
              heightEmu: toEmu(0.32),
            },
            text: "grow",
            fontSizePt: 12,
          },
          {
            kind: "text",
            frame: {
              xEmu: toEmu(5.8),
              yEmu: toRoundedEmu(4.35),
              widthEmu: toEmu(1.1),
              heightEmu: toEmu(0.32),
            },
            text: "fixed",
            fontSizePt: 12,
          },
        ],
      },
    ]);

    expect(summarizeNodes(ir.slides[1].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: { xEmu: toEmu(1), yEmu: toEmu(1), widthEmu: toEmu(7), heightEmu: toEmu(3) },
        children: [
          {
            kind: "shape",
            frame: {
              xEmu: toEmu(1.2),
              yEmu: toEmu(1.2),
              widthEmu: toRoundedEmu(2.2),
              heightEmu: toEmu(1.3),
            },
          },
          {
            kind: "shape",
            frame: {
              xEmu: toEmu(3.4),
              yEmu: toEmu(1.2),
              widthEmu: toRoundedEmu(4.4),
              heightEmu: toEmu(1.3),
            },
          },
          {
            kind: "text",
            frame: {
              xEmu: toEmu(1.2),
              yEmu: toEmu(2.5),
              widthEmu: toEmu(6.6),
              heightEmu: toEmu(1.3),
            },
            text: "span 2 columns",
            fontSizePt: 12,
          },
        ],
      },
      {
        kind: "group",
        frame: { xEmu: toEmu(1), yEmu: toEmu(4.25), widthEmu: toEmu(7), heightEmu: toEmu(0.85) },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: toEmu(4.5),
              yEmu: toEmu(4.5125),
              widthEmu: toEmu(2.72),
              heightEmu: toEmu(0.26),
            },
            text: "absolute inside flex content frame",
            fontSizePt: 12,
          },
        ],
      },
    ]);
  });
});

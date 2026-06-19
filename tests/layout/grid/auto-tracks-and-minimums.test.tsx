import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("grid auto tracks and content minimums", () => {
  test("render supports grid auto tracks and container item placement defaults", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid auto tracks" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 8,
            height: 5,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr",
            gridAutoColumns: 1,
            gridAutoRows: "0.5fr",
            columnGap: 0.5,
            rowGap: 0.5,
            padding: 0.5,
            placeItems: "end center",
          }}
        >
          <div style={{ width: 1, height: 0.5, backgroundColor: "#D1D5DB" }} />
          <div
            style={{
              gridColumn: 3,
              width: 0.5,
              height: 0.5,
              justifySelf: "start",
              backgroundColor: "#CBD5E1",
            }}
          />
          <div style={{ width: 1, height: 0.5, backgroundColor: "#BFDBFE" }} />
          <div style={{ width: 1, height: 0.5, backgroundColor: "#93C5FD" }} />
        </div>
      </>
    ));

    const ir = (await deck.project()).projection!;

    expect(H.summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 8 * H.EMU_PER_INCH,
          heightEmu: 5 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 2.25 * H.EMU_PER_INCH,
              yEmu: 3.3333333333333335 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 7.5 * H.EMU_PER_INCH,
              yEmu: 3.3333333333333335 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 2.25 * H.EMU_PER_INCH,
              yEmu: 5 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5.25 * H.EMU_PER_INCH,
              yEmu: 5 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render uses content-based minimums for minmax(auto, 1fr) tracks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid auto min content" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 2,
            display: "grid",
            gridTemplateColumns: "minmax(auto, 1fr) 1fr",
            gridTemplateRows: "1fr",
          }}
        >
          <div style={{ width: 3, height: 0.5, backgroundColor: "#D1D5DB" }} />
          <div style={{ width: 0.5, height: 0.5, backgroundColor: "#CBD5E1" }} />
        </div>
      </>
    ));

    const ir = (await deck.project()).projection!;

    expect(H.summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 6 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 5.5 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render uses content-based minimums for implicit minmax(auto, 1fr) tracks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid implicit auto min content" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 7,
            height: 2,
            display: "grid",
            gridTemplateColumns: "1in",
            gridTemplateRows: "1fr",
            gridAutoColumns: "minmax(auto, 1fr)",
            gridAutoFlow: "column",
          }}
        >
          <div style={{ width: 1, height: 0.5, backgroundColor: "#D1D5DB" }} />
          <div style={{ width: 3, height: 0.5, backgroundColor: "#CBD5E1" }} />
          <div style={{ width: 0.5, height: 0.5, backgroundColor: "#BFDBFE" }} />
        </div>
      </>
    ));

    const ir = (await deck.project()).projection!;

    expect(H.summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 7 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 1 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 2 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 3 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 6.25 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render uses content-based minimums for multi-span auto tracks", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Grid multi-span auto min content" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 2,
            display: "grid",
            gridTemplateColumns: "minmax(auto, 1fr) minmax(auto, 1fr) 1fr",
            gridTemplateRows: "1fr",
          }}
        >
          <div
            style={{ gridColumn: "span 2", width: 5, height: 0.5, backgroundColor: "#D1D5DB" }}
          />
          <div style={{ width: 0.5, height: 0.5, backgroundColor: "#CBD5E1" }} />
        </div>
      </>
    ));

    const ir = (await deck.project()).projection!;

    expect(H.summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 1 * H.EMU_PER_INCH,
          yEmu: 1 * H.EMU_PER_INCH,
          widthEmu: 6 * H.EMU_PER_INCH,
          heightEmu: 2 * H.EMU_PER_INCH,
        },
        children: [
          {
            kind: "group",
            frame: {
              xEmu: 1 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
          {
            kind: "group",
            frame: {
              xEmu: 6.666666666666667 * H.EMU_PER_INCH,
              yEmu: 1 * H.EMU_PER_INCH,
              widthEmu: 0.5 * H.EMU_PER_INCH,
              heightEmu: 0.5 * H.EMU_PER_INCH,
            },
            children: [],
          },
        ],
      },
    ]);
  });

  test("render records unsupported css grid line placement values", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Unsupported grid line placement" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 4,
          height: 2,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
        }}
      >
        <p
          style={{
            gridColumn: "content-start / content-end" as never,
            gridRowStart: -1 as never,
            fontSize: 18,
          }}
        >
          Named line
        </p>
      </div>
    ));

    const project = await deck.project();
    const [group] = project.projection!.slides[0].payload.drawing.children;
    const [text] = group?.kind === "group" ? group.children : [];

    expect(project.ok).toBe(true);
    expect(text?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "gridRowStart",
        value: "-1",
      }),
    );
    expect(text?.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "gridColumn",
        value: "content-start / content-end",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          missing: expect.arrayContaining(["cssGridNamedOrNegativeLineResolution"]),
        }),
      }),
    );
    expect(project.summary?.unsupportedSemantics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "layout", property: "gridRowStart" }),
        expect.objectContaining({ feature: "layout", property: "gridColumn" }),
      ]),
    );
  });
});

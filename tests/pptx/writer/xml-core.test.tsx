import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("direct pptx writer XML helpers", () => {
  test("XML chunk writer preserves deterministic escaping while reusing static chunks", () => {
    const xml = new TextDecoder().decode(
      new H.XmlChunkWriter()
        .declaration()
        .open("p:root")
        .open("a:rPr")
        .empty("a:latin")
        .close("a:rPr")
        .open("a:rPr")
        .empty("a:latin")
        .close("a:rPr")
        .element("a:t", { value: "A&B<\"'" }, " & <\"'>")
        .close("p:root")
        .bytes(),
    );

    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        "<p:root>" +
        "<a:rPr><a:latin/></a:rPr>" +
        "<a:rPr><a:latin/></a:rPr>" +
        '<a:t value="A&amp;B&lt;&quot;&apos;"> &amp; &lt;&quot;&apos;&gt;</a:t>' +
        "</p:root>",
    );
  });

  test("drawing XML helpers reject missing projected frame and color values", () => {
    expect(() =>
      H.writeTransform(new H.XmlChunkWriter(), {
        xEmu: undefined,
        yEmu: 0,
        widthEmu: 100,
        heightEmu: 100,
      } as never),
    ).toThrow("PPTX drawing XML requires finite frame.xEmu.");

    expect(() =>
      H.writeTransform(new H.XmlChunkWriter(), {
        xEmu: 0,
        yEmu: 0,
        widthEmu: Number.NaN,
        heightEmu: 100,
      }),
    ).toThrow("PPTX drawing XML requires finite frame.widthEmu.");

    expect(() =>
      H.writeShapeProperties(new H.XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: -1, heightEmu: 100 },
        geometry: "rect",
      }),
    ).toThrow("PPTX drawing XML requires non-negative shape frame size.");

    expect(() =>
      H.writeShapeProperties(new H.XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 0, heightEmu: 0 },
        geometry: "line",
      }),
    ).toThrow("PPTX drawing XML requires line frame size on at least one axis.");

    expect(() => H.writeColor(new H.XmlChunkWriter(), undefined)).toThrow(
      "PPTX drawing XML requires a projected color value.",
    );

    expect(() => H.writeColor(new H.XmlChunkWriter(), "#FFFFFF")).toThrow(
      "PPTX drawing XML requires a projected six-digit RGB color value.",
    );

    expect(() => H.writeColor(new H.XmlChunkWriter(), "tomato")).toThrow(
      "PPTX drawing XML requires a projected six-digit RGB color value.",
    );

    expect(() => H.writeColor(new H.XmlChunkWriter(), "FFFFFF", Number.NaN)).toThrow(
      "PPTX drawing XML requires finite transparency.",
    );

    expect(() => H.writeColor(new H.XmlChunkWriter(), "FFFFFF", -1)).toThrow(
      "PPTX drawing XML requires transparency between 0 and 100.",
    );

    expect(() => H.writeColor(new H.XmlChunkWriter(), "FFFFFF", undefined, 1.5)).toThrow(
      "PPTX drawing XML requires opacity between 0 and 1.",
    );

    expect(() =>
      H.writeTransform(
        new H.XmlChunkWriter(),
        { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        Number.NaN,
      ),
    ).toThrow("PPTX drawing XML requires finite rotation.");

    expect(() =>
      H.writeFill(new H.XmlChunkWriter(), {
        kind: "linear-gradient",
        angle: 0,
        stops: [{ color: "FFFFFF", position: Number.NaN }],
      }),
    ).toThrow("PPTX drawing XML requires finite fill.stops.0.position.");

    expect(() =>
      H.writeFill(new H.XmlChunkWriter(), { kind: "linear-gradient", angle: 0, stops: [] }),
    ).toThrow("PPTX drawing XML requires fill.stops.");

    expect(() =>
      H.writeFill(new H.XmlChunkWriter(), {
        kind: "linear-gradient",
        angle: 0,
        stops: [{ color: "FFFFFF", position: 1.5 }],
      }),
    ).toThrow("PPTX drawing XML requires fill.stops.0.position between 0 and 1.");

    expect(() =>
      H.writeFill(new H.XmlChunkWriter(), {
        kind: "radial-gradient",
        shape: "circle",
        center: { x: 0.5, y: 0.5 },
        radius: { x: 0, y: 0.5 },
        stops: [{ color: "FFFFFF", position: 0 }],
      }),
    ).toThrow("PPTX drawing XML requires positive fill.radius.x.");

    expect(() =>
      H.writeFill(new H.XmlChunkWriter(), {
        kind: "radial-gradient",
        shape: "square" as never,
        center: { x: 0.5, y: 0.5 },
        radius: { x: 0.5, y: 0.5 },
        stops: [{ color: "FFFFFF", position: 0 }],
      }),
    ).toThrow("PPTX drawing XML requires supported radial fill.shape.");

    expect(() =>
      H.writeShapeProperties(new H.XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        stroke: { color: "FFFFFF", widthPt: Number.NaN },
      }),
    ).toThrow("PPTX drawing XML requires finite stroke.widthPt.");

    expect(() =>
      H.writeShapeProperties(new H.XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        stroke: { color: "FFFFFF" } as never,
      }),
    ).toThrow("PPTX drawing XML requires finite stroke.widthPt.");

    expect(() =>
      H.writeShapeProperties(new H.XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        stroke: { color: "FFFFFF", widthPt: -1 },
      }),
    ).toThrow("PPTX drawing XML requires non-negative stroke.widthPt.");

    expect(() =>
      H.writeShapeProperties(new H.XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        stroke: { color: "FFFFFF", widthPt: 1, lineJoin: "flat" as never },
      }),
    ).toThrow("PPTX drawing XML requires supported stroke.lineJoin.");

    expect(() =>
      H.writeShapeProperties(new H.XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        stroke: { color: "FFFFFF", widthPt: 1, style: "dash" },
      }),
    ).toThrow("PPTX drawing XML requires projected stroke.dashType for dashed strokes.");

    expect(() =>
      H.writeShapeProperties(new H.XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        radiusEmu: -1,
      }),
    ).toThrow("PPTX drawing XML requires non-negative radiusEmu.");

    expect(() =>
      H.writeShadow(new H.XmlChunkWriter(), {
        type: "outer",
        color: "000000",
        opacity: 1,
        blurPt: 0,
        offsetPt: 0,
        angle: Number.NaN,
      }),
    ).toThrow("PPTX drawing XML requires finite shadow.angle.");

    expect(() =>
      H.writeShadow(new H.XmlChunkWriter(), { type: "outer", color: "000000" } as never),
    ).toThrow("PPTX drawing XML requires shadow.opacity between 0 and 1.");

    expect(() =>
      H.writeShadow(new H.XmlChunkWriter(), {
        type: "outer",
        color: "000000",
        opacity: 1,
        offsetPt: 0,
        angle: 0,
      } as never),
    ).toThrow("PPTX drawing XML requires finite shadow.blurPt.");

    expect(() =>
      H.writeShadow(new H.XmlChunkWriter(), {
        type: "outer",
        color: "000000",
        opacity: 1,
        blurPt: 0,
        angle: 0,
      } as never),
    ).toThrow("PPTX drawing XML requires finite shadow.offsetPt.");

    expect(() =>
      H.writeShadow(new H.XmlChunkWriter(), {
        type: "outer",
        color: "000000",
        opacity: 1,
        blurPt: 0,
        offsetPt: 0,
      } as never),
    ).toThrow("PPTX drawing XML requires finite shadow.angle.");

    expect(() =>
      H.writeShadow(new H.XmlChunkWriter(), {
        type: "outer",
        color: "000000",
        opacity: 2,
        blurPt: 0,
        offsetPt: 0,
        angle: 0,
      }),
    ).toThrow("PPTX drawing XML requires shadow.opacity between 0 and 1.");

    expect(() => H.writeNonVisual(new H.XmlChunkWriter(), "sp", undefined, " 1")).toThrow(
      " 1 must carry a projected positive shape object id.",
    );

    expect(() => H.writeNonVisual(new H.XmlChunkWriter(), "pic", "0", "Picture 1")).toThrow(
      "Picture 1 must carry a projected positive shape object id.",
    );

    expect(() => H.writeNonVisual(new H.XmlChunkWriter(), "sp", "1abc", " 1")).toThrow(
      " 1 must carry a projected positive shape object id.",
    );

    expect(() => H.writeNonVisual(new H.XmlChunkWriter(), "sp", "9007199254740991", " 1")).toThrow(
      " 1 must carry a projected positive shape object id.",
    );
  });

  test("text XML helper rejects malformed projected text style values", () => {
    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        fontSizePt: Number.NaN,
      }),
    ).toThrow("PPTX text XML requires finite text style.fontSizePt.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        paddingPt: [0, Number.NaN, 0, 0],
      }),
    ).toThrow("PPTX text XML requires finite text style.paddingPt.1.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        fontWeight: 0,
      }),
    ).toThrow("PPTX text XML requires text style.fontWeight between 1 and 1000.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        lineSpacing: -1,
      }),
    ).toThrow("PPTX text XML requires non-negative text style.lineSpacing.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        lineSpacingMultiple: 0,
      }),
    ).toThrow("PPTX text XML requires positive text style.lineSpacingMultiple.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        paragraphSpacingAfter: -1,
      }),
    ).toThrow("PPTX text XML requires non-negative text style.paragraphSpacingAfter.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        list: { type: "bullet", characterCode: "not-hex" },
      }),
    ).toThrow("PPTX text XML requires valid text style.list.characterCode.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        list: { type: "bullet", characterCode: "D800" },
      }),
    ).toThrow("PPTX text XML requires valid text style.list.characterCode.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        list: { type: "bullet" },
      } as never),
    ).toThrow("PPTX text XML requires valid text style.list.characterCode.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        textDirection: "sideways" as never,
      }),
    ).toThrow("PPTX text XML requires supported text style.textDirection.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        tabStops: [{ positionIn: 1, alignment: "middle" as never }],
      }),
    ).toThrow("PPTX text XML requires supported text style.tabStops.0.alignment.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", [{ text: 123 as never }], {
        ...H.MINIMAL_TEXT_BODY_STYLE,
      }),
    ).toThrow("PPTX text XML requires string text content.run.text.");

    expect(() => H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {} as never)).toThrow(
      "PPTX text XML requires projected text style.wrap.",
    );

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        fit: undefined,
      } as never),
    ).toThrow("PPTX text XML requires projected text style.fit.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        textDirection: undefined,
      } as never),
    ).toThrow("PPTX text XML requires projected text style.textDirection.");

    expect(() =>
      H.writeTextBody(new H.XmlChunkWriter(), "Broken", undefined, {
        ...H.MINIMAL_TEXT_BODY_STYLE,
        verticalAlign: undefined,
      } as never),
    ).toThrow("PPTX text XML requires projected text style.verticalAlign.");
  });
});

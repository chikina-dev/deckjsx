import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH, Image, Shape, Text } from "../src/index.ts";
import { SAMPLE_SVG_DATA_URI, summarizeNodes } from "./helpers.ts";

describe("typography-values", () => {
  test("render supports rtl text, hyperlinks, and baseline text variants", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Text semantics" }, () => (
      <>
        <Text
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.75,
            direction: "rtl",
            href: "https://example.com/docs",
            tooltip: "Open docs",
          }}
        >
          RTL link
        </Text>
        <Text style={{ x: 1, y: 2, width: 3, height: 0.75, superscript: true }}>Super</Text>
        <Text style={{ x: 1, y: 3, width: 3, height: 0.75, subscript: true }}>Sub</Text>
        <Image
          data={SAMPLE_SVG_DATA_URI}
          style={{
            x: 5,
            y: 1,
            width: 1.5,
            height: 1.5,
            href: "https://example.com/image",
            tooltip: "Open image link",
          }}
        />
        <Shape
          shape="rect"
          style={{
            x: 5,
            y: 3,
            width: 2,
            height: 1,
            fill: "#2563EB",
            href: "https://example.com/shape",
          }}
        />
      </>
    ));

    const ir = deck.project().projection!;
    const [rtl, superscript, subscript, image, shape] = ir.slides[0].payload.elements;

    expect(rtl?.kind).toBe("text");
    if (!rtl || rtl.kind !== "text") {
      throw new Error("Expected rtl text element.");
    }
    expect(rtl.content.text).toBe("RTL link");
    expect(rtl.hyperlink).toEqual({ url: "https://example.com/docs", tooltip: "Open docs" });
    expect(rtl.style.rtlMode).toBe(true);

    expect(superscript?.kind).toBe("text");
    if (!superscript || superscript.kind !== "text") {
      throw new Error("Expected superscript text element.");
    }
    expect(superscript.style.superscript).toBe(true);

    expect(subscript?.kind).toBe("text");
    if (!subscript || subscript.kind !== "text") {
      throw new Error("Expected subscript text element.");
    }
    expect(subscript.style.subscript).toBe(true);

    expect(image?.kind).toBe("image");
    if (!image || image.kind !== "image") {
      throw new Error("Expected image element.");
    }
    expect(image.hyperlink).toEqual({
      url: "https://example.com/image",
      tooltip: "Open image link",
    });

    expect(shape?.kind).toBe("shape");
    if (!shape || shape.kind !== "shape") {
      throw new Error("Expected shape element.");
    }
    expect(shape.hyperlink).toEqual({ url: "https://example.com/shape" });
    expect(shape.fill).toEqual({ kind: "solid", color: "2563EB", transparency: undefined });
  });

  test("render supports listStyleType authoring for bullets and numbering", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Lists" }, () => (
      <>
        <Text
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.75,
            listStyleType: "circle",
            listIndent: "18pt",
          }}
        >
          Bullet item
        </Text>
        <Text
          style={{
            x: 1,
            y: 2,
            width: 3,
            height: 0.75,
            listStyleType: "upper-roman",
            listStart: 3,
          }}
        >
          Number item
        </Text>
      </>
    ));

    const ir = deck.project().projection!;
    const [bullet, number] = ir.slides[0].payload.elements;

    expect(bullet?.kind).toBe("text");
    expect(number?.kind).toBe("text");
    if (!bullet || bullet.kind !== "text" || !number || number.kind !== "text") {
      throw new Error("Expected text elements.");
    }
    expect(bullet.style.list).toEqual({
      type: "bullet",
      characterCode: "25E6",
      indentPt: 18,
    });
    expect(number.style.list).toEqual({
      type: "number",
      style: "romanUcPeriod",
      startAt: 3,
    });
  });

  test("render supports writingMode and text decoration style/color", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Typography aliases" }, () => (
      <>
        <Text
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            writingMode: "vertical-rl",
            textDecorationLine: "underline",
            textDecorationStyle: "wavy",
            textDecorationColor: "tomato",
          }}
        >
          Decorated
        </Text>
      </>
    ));

    const ir = deck.project().projection!;
    const text = ir.slides[0].payload.elements[0];

    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text element.");
    }
    expect(text.style.textDirection).toBe("vert270");
    expect(text.style.underline).toBe(true);
    expect(text.style.underlineStyle).toBe("wavy");
    expect(text.style.underlineColor).toBe("FF6347");
  });

  test("render supports tabStops authoring for text paragraphs", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Tab stops" }, () => (
      <>
        <Text
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 1,
            tabStops: [
              { position: "36pt", alignment: "left" },
              { position: "1.5in", alignment: "center" },
              { position: "144px", alignment: "decimal" },
            ],
          }}
        >
          Alpha\tBeta\tGamma
        </Text>
      </>
    ));

    const ir = deck.project().projection!;
    const textNode = ir.slides[0].payload.elements[0];

    expect(textNode.kind).toBe("text");
    if (textNode.kind !== "text") {
      throw new Error("Expected text node.");
    }

    expect(textNode.style.tabStops).toEqual([
      { positionIn: 0.5, alignment: "l" },
      { positionIn: 1.5, alignment: "ctr" },
      { positionIn: 1.5, alignment: "dec" },
    ]);
  });

  test("render supports textIndent authoring for text paragraphs", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Text indent" }, () => (
      <>
        <Text
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 1,
            textIndent: "24px",
          }}
        >
          Indented
        </Text>
      </>
    ));

    const ir = deck.project().projection!;
    const textNode = ir.slides[0].payload.elements[0];

    expect(textNode.kind).toBe("text");
    if (textNode.kind !== "text") {
      throw new Error("Expected text node.");
    }

    expect(textNode.style.textIndentPt).toBe(18);
  });

  test("render supports textTransform and textDecorationLine", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Text transform" }, () => (
      <>
        <Text
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.5,
            fontSize: 18,
            textTransform: "uppercase",
            textDecorationLine: "underline line-through",
          }}
        >
          Hello deckjsx
        </Text>
        <Text
          style={{
            x: 1,
            y: 2,
            width: 3,
            height: 0.5,
            fontSize: 18,
            textTransform: "capitalize",
            textDecoration: "line-through",
          }}
        >
          hello DECKJSX world
        </Text>
      </>
    ));

    const ir = deck.project().projection!;

    expect(summarizeNodes(ir.slides[0].payload.elements)).toEqual([
      {
        kind: "text",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 3 * EMU_PER_INCH,
          heightEmu: 0.5 * EMU_PER_INCH,
        },
        text: "HELLO DECKJSX",
        fontSizePt: 18,
      },
      {
        kind: "text",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 2 * EMU_PER_INCH,
          widthEmu: 3 * EMU_PER_INCH,
          heightEmu: 0.5 * EMU_PER_INCH,
        },
        text: "Hello Deckjsx World",
        fontSizePt: 18,
      },
    ]);

    const [first, second] = ir.slides[0].payload.elements.filter((node) => node.kind === "text");

    expect(first.style.underline).toBe(true);
    expect(first.style.strike).toBe(true);
    expect(second.style.underline).toBeUndefined();
    expect(second.style.strike).toBe(true);
  });

  test("render treats numeric lineHeight as lineSpacingMultiple and supports decoration reset", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Line height semantics" }, () => (
      <>
        <Text
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.5,
            fontSize: 18,
            lineHeight: 1.6,
            textDecoration: "none",
            underline: true,
          }}
        >
          Numeric line height
        </Text>
        <Text
          style={{
            x: 1,
            y: 2,
            width: 3,
            height: 0.5,
            fontSize: 18,
            lineHeight: "28px",
            strike: true,
            textDecorationLine: "none",
          }}
        >
          Reset decoration
        </Text>
      </>
    ));

    const ir = deck.project().projection!;
    const [first, second] = ir.slides[0].payload.elements.filter((node) => node.kind === "text");

    expect(first.style.lineSpacing).toBeUndefined();
    expect(first.style.lineSpacingMultiple).toBe(1.6);
    expect(first.style.underline).toBe(true);
    expect(first.style.strike).toBe(false);

    expect(second.style.lineSpacing).toBe(21);
    expect(second.style.lineSpacingMultiple).toBeUndefined();
    expect(second.style.underline).toBe(false);
    expect(second.style.strike).toBe(true);
  });

  test("render supports whiteSpace as a wrap alias", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "White space" }, () => (
      <>
        <Text
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.5,
            fontSize: 18,
            whiteSpace: "nowrap",
          }}
        >
          No wrap
        </Text>
        <Text
          style={{
            x: 1,
            y: 2,
            width: 3,
            height: 0.5,
            fontSize: 18,
            whiteSpace: "normal",
          }}
        >
          Wrap
        </Text>
        <Text
          style={{
            x: 1,
            y: 3,
            width: 3,
            height: 0.5,
            fontSize: 18,
            whiteSpace: "normal",
            wrap: false,
          }}
        >
          Override
        </Text>
      </>
    ));

    const texts = deck
      .project()
      .projection!.slides[0].payload.elements.filter((node) => node.kind === "text");

    expect(texts[0].style.wrap).toBe(false);
    expect(texts[1].style.wrap).toBe(true);
    expect(texts[2].style.wrap).toBe(false);
  });

  test("render supports wordBreak and overflowWrap as simplified wrap aliases", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.slide({ name: "Word break" }, () => (
      <>
        <Text
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.5,
            fontSize: 18,
            wordBreak: "break-all",
          }}
        >
          Break all
        </Text>
        <Text
          style={{
            x: 1,
            y: 2,
            width: 3,
            height: 0.5,
            fontSize: 18,
            overflowWrap: "anywhere",
          }}
        >
          Anywhere
        </Text>
        <Text
          style={{
            x: 1,
            y: 3,
            width: 3,
            height: 0.5,
            fontSize: 18,
            wordBreak: "break-all",
            wrap: false,
          }}
        >
          Override
        </Text>
      </>
    ));

    const texts = deck
      .project()
      .projection!.slides[0].payload.elements.filter((node) => node.kind === "text");

    expect(texts[0].style.wrap).toBe(true);
    expect(texts[1].style.wrap).toBe(true);
    expect(texts[2].style.wrap).toBe(false);
  });
});

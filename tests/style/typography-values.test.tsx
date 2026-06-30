import { describe, expect, test } from "vite-plus/test";
import { EMU_PER_INCH } from "@/src/index.ts";
import { Deck } from "../helpers.ts";
import { SAMPLE_SVG_DATA_URI, summarizeNodes } from "../helpers.ts";

describe("typography-values", () => {
  test("render supports rtl text, hyperlinks, and baseline text variants", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " semantics" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 0.75,
            direction: "rtl",
            href: "https://example.com/docs",
            tooltip: "Open docs",
          }}
        >
          RTL link
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 3,
            height: 0.75,
            superscript: true,
          }}
        >
          Super
        </p>
        <p
          style={{ position: "absolute", left: 1, top: 3, width: 3, height: 0.75, subscript: true }}
        >
          Sub
        </p>
        <img
          data={SAMPLE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 5,
            top: 1,
            width: 1.5,
            height: 1.5,
            href: "https://example.com/image",
            tooltip: "Open image link",
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 5,
            top: 3,
            width: 2,
            height: 1,
            fill: "#2563EB",
            href: "https://example.com/shape",
          }}
        />
      </>
    ));

    const ir = (await deck.project()).projection!;
    const [rtl, superscript, subscript, image, shape] = ir.slides[0].payload.drawing.children;

    expect(rtl?.kind).toBe("text");
    if (!rtl || rtl.kind !== "text") {
      throw new Error("Expected rtl text element.");
    }
    expect(rtl.content.text).toBe("RTL link");
    expect(rtl.hyperlink).toEqual({ url: "https://example.com/docs", tooltip: "Open docs" });
    expect(rtl.style.rtlMode).toBe(true);
    expect(rtl.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "direction",
        value: "rtl",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["textBodyDirection"]),
          missing: expect.arrayContaining(["logicalLayoutAxes", "cssLogicalStartEndMapping"]),
        }),
      }),
    );

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

  test("render supports listStyleType authoring for bullets and numbering", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Lists" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 0.25,
            width: 3,
            height: 0.5,
            listStyleType: "disc",
          }}
        >
          Disc item
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 0.75,
            listStyleType: "circle",
            listIndent: "18pt",
          }}
        >
          Bullet item
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 3,
            height: 0.75,
            listStyleType: "upper-roman",
            listStart: 3,
          }}
        >
          Number item
        </p>
      </>
    ));

    const ir = (await deck.project()).projection!;
    const [disc, bullet, number] = ir.slides[0].payload.drawing.children;

    expect(disc?.kind).toBe("text");
    expect(bullet?.kind).toBe("text");
    expect(number?.kind).toBe("text");
    if (
      !disc ||
      disc.kind !== "text" ||
      !bullet ||
      bullet.kind !== "text" ||
      !number ||
      number.kind !== "text"
    ) {
      throw new Error("Expected text elements.");
    }
    expect(disc.style.list).toEqual({ type: "bullet", characterCode: "2022" });
    expect(bullet.style.list).toEqual({ type: "bullet", characterCode: "25E6", indentPt: 18 });
    expect(number.style.list).toEqual({ type: "number", style: "romanUcPeriod", startAt: 3 });
  });

  test("render supports writingMode and text decoration style/color", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Typography aliases" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 2,
            writingMode: "vertical-rl",
            textDecorationLine: "underline",
            textDecorationStyle: "wavy",
            textDecorationColor: "tomato",
          }}
        >
          Decorated
        </p>
      </>
    ));

    const ir = (await deck.project()).projection!;
    const text = ir.slides[0].payload.drawing.children[0];

    expect(text?.kind).toBe("text");
    if (!text || text.kind !== "text") {
      throw new Error("Expected text element.");
    }
    expect(text.style.textDirection).toBe("vert270");
    expect(text.style.underline).toBe(true);
    expect(text.style.underlineStyle).toBe("wavy");
    expect(text.style.underlineColor).toBe("FF6347");
    expect(text.unsupportedSemantics).toContainEqual(
      expect.objectContaining({
        feature: "layout",
        property: "writingMode",
        value: "vertical-rl",
        fallback: expect.objectContaining({
          strategy: "preserveAuthoredValueOnly",
          preserves: expect.arrayContaining(["textBodyDirection"]),
          missing: expect.arrayContaining(["logicalLayoutAxes", "cssLogicalStartEndMapping"]),
        }),
      }),
    );
  });

  test("render supports tabStops authoring for text paragraphs", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Tab stops" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
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
        </p>
      </>
    ));

    const ir = (await deck.project()).projection!;
    const textNode = ir.slides[0].payload.drawing.children[0];

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

  test("render supports textIndent authoring for text paragraphs", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " indent" }, () => (
      <>
        <p
          style={{ position: "absolute", left: 1, top: 1, width: 4, height: 1, textIndent: "24px" }}
        >
          Indented
        </p>
      </>
    ));

    const ir = (await deck.project()).projection!;
    const textNode = ir.slides[0].payload.drawing.children[0];

    expect(textNode.kind).toBe("text");
    if (textNode.kind !== "text") {
      throw new Error("Expected text node.");
    }

    expect(textNode.style.textIndentPt).toBe(18);
  });

  test("render supports textTransform and textDecorationLine", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " transform" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 0.5,
            fontSize: 18,
            textTransform: "uppercase",
            textDecorationLine: "underline line-through",
          }}
        >
          Hello deckjsx
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 3,
            height: 0.5,
            fontSize: 18,
            textTransform: "capitalize",
            textDecoration: "line-through",
          }}
        >
          hello DECKJSX world
        </p>
      </>
    ));

    const ir = (await deck.project()).projection!;

    expect(summarizeNodes(ir.slides[0].payload.drawing.children)).toEqual([
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

    const [first, second] = ir.slides[0].payload.drawing.children.filter(
      (node) => node.kind === "text",
    );

    expect(first.style.underline).toBe(true);
    expect(first.style.strike).toBe(true);
    expect(second.style.underline).toBeUndefined();
    expect(second.style.strike).toBe(true);
  });

  test("render treats numeric lineHeight as lineSpacingMultiple and resolves textDecoration none", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Line height semantics" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 0.5,
            fontSize: 18,
            lineHeight: 1.6,
            textDecorationLine: "underline",
          }}
        >
          Numeric line height
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 3,
            height: 0.5,
            fontSize: 18,
            lineHeight: "28px",
            textDecorationLine: "none",
          }}
        >
          Reset decoration
        </p>
      </>
    ));

    const ir = (await deck.project()).projection!;
    const [first, second] = ir.slides[0].payload.drawing.children.filter(
      (node) => node.kind === "text",
    );

    expect(first.style.lineSpacing).toBeUndefined();
    expect(first.style.lineSpacingMultiple).toBe(1.6);
    expect(first.style.underline).toBe(true);
    expect(first.style.underlineStyle).toBe("sng");
    expect(first.style.strike).toBeUndefined();

    expect(second.style.lineSpacing).toBe(21);
    expect(second.style.lineSpacingMultiple).toBeUndefined();
    expect(second.style.underline).toBe(false);
    expect(second.style.strike).toBe(false);
  });

  test("render resolves whiteSpace to the projected wrap flag", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "White space" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 0.5,
            fontSize: 18,
            whiteSpace: "nowrap",
          }}
        >
          No wrap
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 3,
            height: 0.5,
            fontSize: 18,
            whiteSpace: "normal",
          }}
        >
          Wrap
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 3,
            width: 3,
            height: 0.5,
            fontSize: 18,
            whiteSpace: "pre",
          }}
        >
          Preformatted
        </p>
      </>
    ));

    const texts = (await deck.project()).projection!.slides[0].payload.drawing.children.filter(
      (node) => node.kind === "text",
    );

    expect(texts[0].style.wrap).toBe(false);
    expect(texts[1].style.wrap).toBe(true);
    expect(texts[2].style.wrap).toBe(false);
  });

  test("render resolves wordBreak and overflowWrap to the projected wrap flag", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Word break" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 0.5,
            fontSize: 18,
            wordBreak: "break-all",
          }}
        >
          Break all
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 3,
            height: 0.5,
            fontSize: 18,
            overflowWrap: "anywhere",
          }}
        >
          Anywhere
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 3,
            width: 3,
            height: 0.5,
            fontSize: 18,
            whiteSpace: "nowrap",
          }}
        >
          No wrap
        </p>
      </>
    ));

    const texts = (await deck.project()).projection!.slides[0].payload.drawing.children.filter(
      (node) => node.kind === "text",
    );

    expect(texts[0].style.wrap).toBe(true);
    expect(texts[1].style.wrap).toBe(true);
    expect(texts[2].style.wrap).toBe(false);
  });
});

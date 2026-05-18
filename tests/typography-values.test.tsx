import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH, Image, Shape, Slide, Text } from "../src/index.ts";
import { SAMPLE_SVG_DATA_URI, summarizeNodes } from "./helpers.ts";

describe("typography-values", () => {
  test("render supports rtl text, hyperlinks, and baseline text variants", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Text semantics">
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
      </Slide>
    ));

    const ir = deck.render();

    expect(ir.slides[0].nodes).toMatchInlineSnapshot(`
    	[
    	  {
    	    "content": {
    	      "text": "RTL link",
    	    },
    	    "fill": undefined,
    	    "flipH": undefined,
    	    "flipV": undefined,
    	    "frame": {
    	      "heightEmu": 685800,
    	      "widthEmu": 2743200,
    	      "xEmu": 914400,
    	      "yEmu": 914400,
    	    },
    	    "hyperlink": {
    	      "tooltip": "Open docs",
    	      "url": "https://example.com/docs",
    	    },
    	    "id": "node-1",
    	    "kind": "text",
    	    "opacity": undefined,
    	    "radiusEmu": 0,
    	    "rotation": undefined,
    	    "stroke": undefined,
    	    "style": {
    	      "charSpacing": undefined,
    	      "color": undefined,
    	      "fit": undefined,
    	      "fontFamily": undefined,
    	      "fontSizePt": undefined,
    	      "fontWeight": undefined,
    	      "italic": undefined,
    	      "lineSpacing": undefined,
    	      "lineSpacingMultiple": undefined,
    	      "paddingPt": undefined,
    	      "paragraphSpacingAfter": undefined,
    	      "paragraphSpacingBefore": undefined,
    	      "rtlMode": true,
    	      "strike": undefined,
    	      "textAlign": undefined,
    	      "underline": undefined,
    	      "verticalAlign": undefined,
    	      "wrap": undefined,
    	    },
    	    "zIndex": undefined,
    	  },
    	  {
    	    "content": {
    	      "text": "Super",
    	    },
    	    "fill": undefined,
    	    "flipH": undefined,
    	    "flipV": undefined,
    	    "frame": {
    	      "heightEmu": 685800,
    	      "widthEmu": 2743200,
    	      "xEmu": 914400,
    	      "yEmu": 1828800,
    	    },
    	    "id": "node-2",
    	    "kind": "text",
    	    "opacity": undefined,
    	    "radiusEmu": 0,
    	    "rotation": undefined,
    	    "stroke": undefined,
    	    "style": {
    	      "charSpacing": undefined,
    	      "color": undefined,
    	      "fit": undefined,
    	      "fontFamily": undefined,
    	      "fontSizePt": undefined,
    	      "fontWeight": undefined,
    	      "italic": undefined,
    	      "lineSpacing": undefined,
    	      "lineSpacingMultiple": undefined,
    	      "paddingPt": undefined,
    	      "paragraphSpacingAfter": undefined,
    	      "paragraphSpacingBefore": undefined,
    	      "strike": undefined,
    	      "superscript": true,
    	      "textAlign": undefined,
    	      "underline": undefined,
    	      "verticalAlign": undefined,
    	      "wrap": undefined,
    	    },
    	    "zIndex": undefined,
    	  },
    	  {
    	    "content": {
    	      "text": "Sub",
    	    },
    	    "fill": undefined,
    	    "flipH": undefined,
    	    "flipV": undefined,
    	    "frame": {
    	      "heightEmu": 685800,
    	      "widthEmu": 2743200,
    	      "xEmu": 914400,
    	      "yEmu": 2743200,
    	    },
    	    "id": "node-3",
    	    "kind": "text",
    	    "opacity": undefined,
    	    "radiusEmu": 0,
    	    "rotation": undefined,
    	    "stroke": undefined,
    	    "style": {
    	      "charSpacing": undefined,
    	      "color": undefined,
    	      "fit": undefined,
    	      "fontFamily": undefined,
    	      "fontSizePt": undefined,
    	      "fontWeight": undefined,
    	      "italic": undefined,
    	      "lineSpacing": undefined,
    	      "lineSpacingMultiple": undefined,
    	      "paddingPt": undefined,
    	      "paragraphSpacingAfter": undefined,
    	      "paragraphSpacingBefore": undefined,
    	      "strike": undefined,
    	      "subscript": true,
    	      "textAlign": undefined,
    	      "underline": undefined,
    	      "verticalAlign": undefined,
    	      "wrap": undefined,
    	    },
    	    "zIndex": undefined,
    	  },
    	  {
    	    "fit": "contain",
    	    "flipH": undefined,
    	    "flipV": undefined,
    	    "frame": {
    	      "heightEmu": 1371600,
    	      "widthEmu": 1371600,
    	      "xEmu": 4572000,
    	      "yEmu": 914400,
    	    },
    	    "hyperlink": {
    	      "tooltip": "Open image link",
    	      "url": "https://example.com/image",
    	    },
    	    "id": "node-4",
    	    "kind": "image",
    	    "opacity": undefined,
    	    "rotation": undefined,
    	    "rounding": undefined,
    	    "source": {
    	      "data": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZjk3MzE2Ii8+PC9zdmc+",
    	      "kind": "data",
    	    },
    	    "sourceFrame": {
    	      "heightEmu": 1371600,
    	      "widthEmu": 1371600,
    	      "xEmu": 4572000,
    	      "yEmu": 914400,
    	    },
    	    "transparency": undefined,
    	    "zIndex": undefined,
    	  },
    	  {
    	    "fill": {
    	      "color": "2563EB",
    	      "kind": "solid",
    	      "transparency": undefined,
    	    },
    	    "flipH": undefined,
    	    "flipV": undefined,
    	    "frame": {
    	      "heightEmu": 914400,
    	      "widthEmu": 1828800,
    	      "xEmu": 4572000,
    	      "yEmu": 2743200,
    	    },
    	    "hyperlink": {
    	      "url": "https://example.com/shape",
    	    },
    	    "id": "node-5",
    	    "kind": "shape",
    	    "opacity": undefined,
    	    "radiusEmu": 0,
    	    "rotation": undefined,
    	    "shape": "rect",
    	    "stroke": undefined,
    	    "zIndex": undefined,
    	  },
    	]
    `);
  });

  test("render supports listStyleType authoring for bullets and numbering", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Lists">
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
      </Slide>
    ));

    const ir = deck.render();

    expect(ir.slides[0].nodes).toMatchInlineSnapshot(`
      [
        {
          "content": {
            "text": "Bullet item",
          },
          "fill": undefined,
          "flipH": undefined,
          "flipV": undefined,
          "frame": {
            "heightEmu": 685800,
            "widthEmu": 2743200,
            "xEmu": 914400,
            "yEmu": 914400,
          },
          "id": "node-1",
          "kind": "text",
          "opacity": undefined,
          "radiusEmu": 0,
          "rotation": undefined,
          "stroke": undefined,
          "style": {
            "charSpacing": undefined,
            "color": undefined,
            "fit": undefined,
            "fontFamily": undefined,
            "fontSizePt": undefined,
            "fontWeight": undefined,
            "italic": undefined,
            "lineSpacing": undefined,
            "lineSpacingMultiple": undefined,
            "list": {
              "characterCode": "25E6",
              "indentPt": 18,
              "type": "bullet",
            },
            "paddingPt": undefined,
            "paragraphSpacingAfter": undefined,
            "paragraphSpacingBefore": undefined,
            "strike": undefined,
            "textAlign": undefined,
            "underline": undefined,
            "verticalAlign": undefined,
            "wrap": undefined,
          },
          "zIndex": undefined,
        },
        {
          "content": {
            "text": "Number item",
          },
          "fill": undefined,
          "flipH": undefined,
          "flipV": undefined,
          "frame": {
            "heightEmu": 685800,
            "widthEmu": 2743200,
            "xEmu": 914400,
            "yEmu": 1828800,
          },
          "id": "node-2",
          "kind": "text",
          "opacity": undefined,
          "radiusEmu": 0,
          "rotation": undefined,
          "stroke": undefined,
          "style": {
            "charSpacing": undefined,
            "color": undefined,
            "fit": undefined,
            "fontFamily": undefined,
            "fontSizePt": undefined,
            "fontWeight": undefined,
            "italic": undefined,
            "lineSpacing": undefined,
            "lineSpacingMultiple": undefined,
            "list": {
              "startAt": 3,
              "style": "romanUcPeriod",
              "type": "number",
            },
            "paddingPt": undefined,
            "paragraphSpacingAfter": undefined,
            "paragraphSpacingBefore": undefined,
            "strike": undefined,
            "textAlign": undefined,
            "underline": undefined,
            "verticalAlign": undefined,
            "wrap": undefined,
          },
          "zIndex": undefined,
        },
      ]
    `);
  });

  test("render supports writingMode and text decoration style/color", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Typography aliases">
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
      </Slide>
    ));

    const ir = deck.render();

    expect(ir.slides[0].nodes).toMatchInlineSnapshot(`
      [
        {
          "content": {
            "text": "Decorated",
          },
          "fill": undefined,
          "flipH": undefined,
          "flipV": undefined,
          "frame": {
            "heightEmu": 1828800,
            "widthEmu": 1828800,
            "xEmu": 914400,
            "yEmu": 914400,
          },
          "id": "node-1",
          "kind": "text",
          "opacity": undefined,
          "radiusEmu": 0,
          "rotation": undefined,
          "stroke": undefined,
          "style": {
            "charSpacing": undefined,
            "color": undefined,
            "fit": undefined,
            "fontFamily": undefined,
            "fontSizePt": undefined,
            "fontWeight": undefined,
            "italic": undefined,
            "lineSpacing": undefined,
            "lineSpacingMultiple": undefined,
            "paddingPt": undefined,
            "paragraphSpacingAfter": undefined,
            "paragraphSpacingBefore": undefined,
            "strike": undefined,
            "textAlign": undefined,
            "textDirection": "vert270",
            "underline": true,
            "underlineColor": "FF6347",
            "underlineStyle": "wavy",
            "verticalAlign": undefined,
            "wrap": undefined,
          },
          "zIndex": undefined,
        },
      ]
    `);
  });

  test("render supports tabStops authoring for text paragraphs", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Tab stops">
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
      </Slide>
    ));

    const ir = deck.render();
    const textNode = ir.slides[0].nodes[0];

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

    deck.add(() => (
      <Slide name="Text indent">
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
      </Slide>
    ));

    const ir = deck.render();
    const textNode = ir.slides[0].nodes[0];

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

    deck.add(() => (
      <Slide name="Text transform">
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
      </Slide>
    ));

    const ir = deck.render();

    expect(summarizeNodes(ir.slides[0].nodes)).toEqual([
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

    const [first, second] = ir.slides[0].nodes.filter((node) => node.kind === "text");

    expect(first.style.underline).toBe(true);
    expect(first.style.strike).toBe(true);
    expect(second.style.underline).toBeUndefined();
    expect(second.style.strike).toBe(true);
  });

  test("render treats numeric lineHeight as lineSpacingMultiple and supports decoration reset", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Line height semantics">
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
      </Slide>
    ));

    const ir = deck.render();
    const [first, second] = ir.slides[0].nodes.filter((node) => node.kind === "text");

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

    deck.add(() => (
      <Slide name="White space">
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
      </Slide>
    ));

    const texts = deck.render().slides[0].nodes.filter((node) => node.kind === "text");

    expect(texts[0].style.wrap).toBe(false);
    expect(texts[1].style.wrap).toBe(true);
    expect(texts[2].style.wrap).toBe(false);
  });

  test("render supports wordBreak and overflowWrap as simplified wrap aliases", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Word break">
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
      </Slide>
    ));

    const texts = deck.render().slides[0].nodes.filter((node) => node.kind === "text");

    expect(texts[0].style.wrap).toBe(true);
    expect(texts[1].style.wrap).toBe(true);
    expect(texts[2].style.wrap).toBe(false);
  });
});

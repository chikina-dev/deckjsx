import { describe, expect, test } from "vite-plus/test";
import { Deck, EMU_PER_INCH, Image, Slide, Text, View } from "../src/index.ts";
import { summarizeNodes } from "./helpers.ts";

describe("style-aliases", () => {
  test("render supports css aliases and px units", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Aliases">
        <View
          style={{
            left: "96px",
            top: "96px",
            width: "480px",
            height: "240px",
            display: "flex",
            flexDirection: "column",
            rowGap: "24px",
            padding: "48px",
          }}
        >
          <Text
            style={{
              width: "384px",
              height: "48px",
              fontSize: "32px",
              fontStyle: "italic",
              letterSpacing: 1.5,
              textDecoration: "underline line-through",
              lineHeight: "28px",
            }}
          >
            Alias text
          </Text>
          <Image
            src="/tmp/alias.png"
            style={{
              width: "96px",
              height: "96px",
              objectFit: "cover",
            }}
          />
        </View>
      </Slide>
    ));

    const ir = deck.render();
    const group = ir.slides[0].nodes[0];

    expect(group).toMatchInlineSnapshot(`
    	{
    	  "children": [
    	    {
    	      "content": {
    	        "text": "Alias text",
    	      },
    	      "fill": undefined,
    	      "flipH": undefined,
    	      "flipV": undefined,
    	      "frame": {
    	        "heightEmu": 381000,
    	        "widthEmu": 3657600,
    	        "xEmu": 1371600,
    	        "yEmu": 1371600,
    	      },
    	      "id": "node-2",
    	      "kind": "text",
    	      "opacity": undefined,
    	      "radiusEmu": 0,
    	      "rotation": undefined,
    	      "stroke": undefined,
    	      "style": {
    	        "charSpacing": 1.5,
    	        "color": undefined,
    	        "fit": undefined,
    	        "fontFamily": undefined,
    	        "fontSizePt": 24,
    	        "fontWeight": undefined,
    	        "italic": true,
    	        "lineSpacing": 21,
    	        "lineSpacingMultiple": undefined,
    	        "paddingPt": undefined,
    	        "paragraphSpacingAfter": undefined,
    	        "paragraphSpacingBefore": undefined,
    	        "strike": true,
    	        "textAlign": undefined,
    	        "underline": true,
    	        "verticalAlign": undefined,
    	        "wrap": undefined,
    	      },
    	      "zIndex": undefined,
    	    },
    	    {
    	      "fit": "cover",
    	      "flipH": undefined,
    	      "flipV": undefined,
    	      "frame": {
    	        "heightEmu": 762000,
    	        "widthEmu": 914400,
    	        "xEmu": 1371600,
    	        "yEmu": 1981200,
    	      },
    	      "id": "node-3",
    	      "kind": "image",
    	      "opacity": undefined,
    	      "rotation": undefined,
    	      "rounding": undefined,
    	      "source": {
    	        "kind": "path",
    	        "path": "/tmp/alias.png",
    	      },
    	      "sourceFrame": {
    	        "heightEmu": 762000,
    	        "widthEmu": 914400,
    	        "xEmu": 1371600,
    	        "yEmu": 1981200,
    	      },
    	      "transparency": undefined,
    	      "zIndex": undefined,
    	    },
    	  ],
    	  "fill": undefined,
    	  "flipH": undefined,
    	  "flipV": undefined,
    	  "frame": {
    	    "heightEmu": 2286000,
    	    "widthEmu": 4572000,
    	    "xEmu": 914400,
    	    "yEmu": 914400,
    	  },
    	  "id": "node-1",
    	  "kind": "group",
    	  "opacity": undefined,
    	  "radiusEmu": 0,
    	  "rotation": undefined,
    	  "stroke": undefined,
    	  "zIndex": undefined,
    	}
    `);
  });

  test("render keeps key css aliases equivalent to deck-native props", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Alias parity">
        <View
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 1.5,
            layout: "stack",
            direction: "horizontal",
            gap: 0.25,
            padding: 0.25,
          }}
        >
          <Text style={{ width: 1, height: 0.5, fontSize: 18 }}>A</Text>
          <Text style={{ width: 1, height: 0.5, fontSize: 18 }}>B</Text>
        </View>
        <View
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 1.5,
            display: "flex",
            flexDirection: "row",
            gap: 0.25,
            padding: 0.25,
          }}
        >
          <Text style={{ width: 1, height: 0.5, fontSize: 18 }}>A</Text>
          <Text style={{ width: 1, height: 0.5, fontSize: 18 }}>B</Text>
        </View>
        <View
          style={{
            x: 5,
            y: 1,
            width: 3,
            height: 2,
            layout: "absolute",
          }}
        >
          <Text style={{ x: 0.25, y: 0.5, width: 1, height: 0.5, fontSize: 18 }}>Box</Text>
        </View>
        <View
          style={{
            x: 5,
            y: 1,
            width: 3,
            height: 2,
            display: "block",
          }}
        >
          <Text style={{ x: 0.25, y: 0.5, width: 1, height: 0.5, fontSize: 18 }}>Box</Text>
        </View>
        <Text
          style={{
            x: 1,
            y: 3.25,
            width: 2.5,
            height: 0.75,
            italic: true,
            charSpacing: 1.5,
            lineSpacingMultiple: 1.4,
            fontSize: 18,
          }}
        >
          Native
        </Text>
        <Text
          style={{
            left: 1,
            top: 3.25,
            width: 2.5,
            height: 0.75,
            fontStyle: "italic",
            letterSpacing: 1.5,
            lineHeight: 1.4,
            fontSize: 18,
          }}
        >
          Alias
        </Text>
        <Image
          src="/tmp/native-fit.png"
          style={{
            x: 4,
            y: 3.25,
            width: 1,
            height: 1,
            fit: "cover",
          }}
        />
        <Image
          src="/tmp/alias-fit.png"
          style={{
            x: 4,
            y: 3.25,
            width: 1,
            height: 1,
            objectFit: "cover",
          }}
        />
      </Slide>
    ));

    const nodes = deck.render().slides[0].nodes;
    const [nativeStack, aliasStack, nativeAbsolute, aliasAbsolute] = nodes.slice(0, 4);

    expect(summarizeNodes([nativeStack])).toEqual(summarizeNodes([aliasStack]));
    expect(summarizeNodes([nativeAbsolute])).toEqual(summarizeNodes([aliasAbsolute]));

    const [nativeText, aliasText] = nodes.filter(
      (node): node is Extract<(typeof nodes)[number], { kind: "text" }> => node.kind === "text",
    );
    expect(nativeText.frame).toEqual(aliasText.frame);
    expect(nativeText.style.italic).toBe(aliasText.style.italic);
    expect(nativeText.style.charSpacing).toBe(aliasText.style.charSpacing);
    expect(nativeText.style.lineSpacingMultiple).toBe(aliasText.style.lineSpacingMultiple);

    const [nativeImage, aliasImage] = nodes.filter(
      (node): node is Extract<(typeof nodes)[number], { kind: "image" }> => node.kind === "image",
    );
    expect(nativeImage.frame).toEqual(aliasImage.frame);
    expect(nativeImage.fit).toBe(aliasImage.fit);
  });

  test("render supports right bottom and side-based spacing aliases", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Spacing aliases">
        <View
          style={{
            right: "96px",
            bottom: "48px",
            width: "192px",
            height: "96px",
            backgroundColor: "#EEEEEE",
          }}
        />
        <View
          style={{
            x: 1,
            y: 1,
            width: 6,
            height: 2,
            display: "flex",
            flexDirection: "row",
            paddingTop: "24px",
            paddingRight: "48px",
            paddingBottom: "24px",
            paddingLeft: "48px",
            columnGap: "24px",
          }}
        >
          <Text
            style={{
              width: 1,
              height: 0.5,
              marginTop: "12px",
              marginRight: "48px",
              marginLeft: "24px",
              fontSize: 18,
            }}
          >
            One
          </Text>
          <Text style={{ width: 1, height: 0.5, fontSize: 18 }}>Two</Text>
        </View>
      </Slide>
    ));

    const ir = deck.render();

    expect(summarizeNodes(ir.slides[0].nodes)).toEqual([
      {
        kind: "group",
        frame: {
          xEmu: 7 * EMU_PER_INCH,
          yEmu: 4.125 * EMU_PER_INCH,
          widthEmu: 2 * EMU_PER_INCH,
          heightEmu: 1 * EMU_PER_INCH,
        },
        children: [],
      },
      {
        kind: "group",
        frame: {
          xEmu: 1 * EMU_PER_INCH,
          yEmu: 1 * EMU_PER_INCH,
          widthEmu: 6 * EMU_PER_INCH,
          heightEmu: 2 * EMU_PER_INCH,
        },
        children: [
          {
            kind: "text",
            frame: {
              xEmu: 1.75 * EMU_PER_INCH,
              yEmu: 1.375 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "One",
            fontSizePt: 18,
          },
          {
            kind: "text",
            frame: {
              xEmu: 3.5 * EMU_PER_INCH,
              yEmu: 1.25 * EMU_PER_INCH,
              widthEmu: 1 * EMU_PER_INCH,
              heightEmu: 0.5 * EMU_PER_INCH,
            },
            text: "Two",
            fontSizePt: 18,
          },
        ],
      },
    ]);
  });
});

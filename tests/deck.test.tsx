import { describe, expect, test } from "vite-plus/test";
import { Deck, Image, Shape, Slide, Text, View } from "../src/index.ts";

describe("Deck", () => {
  test("render compiles multiple slides and passes slide context to factories", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      meta: { title: "Spec test", author: "deckjsx" },
    });

    deck.add(({ slideIndex, totalSlides }) => (
      <Slide name={`Slide ${slideIndex + 1}`}>
        <Text style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>
          {slideIndex + 1} / {totalSlides}
        </Text>
      </Slide>
    ));

    deck.add(({ slideIndex, totalSlides }) => (
      <Slide name={`Slide ${slideIndex + 1}`}>
        <Text style={{ x: 2, y: 1.5, width: 3, height: 0.5, fontSize: 18 }}>
          {slideIndex + 1} / {totalSlides}
        </Text>
      </Slide>
    ));

    const ir = deck.render();

    expect({
      version: ir.version,
      meta: ir.meta,
      slideNames: ir.slides.map((slide) => slide.name),
      textValues: ir.slides.map((slide) =>
        slide.nodes.filter((node) => node.kind === "text").map((node) => node.content.text),
      ),
    }).toMatchInlineSnapshot(`
      {
        "meta": {
          "author": "deckjsx",
          "title": "Spec test",
        },
        "slideNames": [
          "Slide 1",
          "Slide 2",
        ],
        "textValues": [
          [
            "1 / 2",
          ],
          [
            "2 / 2",
          ],
        ],
        "version": "0.1",
      }
    `);
  });

  test("render preserves rich design props in the IR", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Design" style={{ backgroundColor: "#112233", backgroundTransparency: 12 }}>
        <View
          style={{
            x: 1,
            y: 1,
            width: 5,
            height: 3,
            backgroundColor: "#F8E16C",
            backgroundTransparency: 15,
            borderColor: "#1F2937",
            borderWidth: "2pt",
            borderStyle: "dash",
            borderTransparency: 20,
            borderRadius: 0.2,
            rotation: 5,
            flipH: true,
          }}
        >
          <Text
            style={{
              x: 0.5,
              y: 0.5,
              width: 4,
              height: 0.9,
              fontFamily: "Aptos",
              fontSize: 22,
              fontWeight: 700,
              italic: true,
              underline: true,
              strike: true,
              color: "#0F172A",
              textAlign: "center",
              verticalAlign: "middle",
              backgroundColor: "#FFFFFF",
              backgroundTransparency: 25,
              borderColor: "#DC2626",
              borderWidth: "1pt",
              borderStyle: "solid",
              borderTransparency: 10,
              borderRadius: 0.1,
              padding: ["4pt", "8pt", "4pt", "8pt"],
              lineSpacing: 24,
              lineSpacingMultiple: 1.2,
              paragraphSpacingBefore: 2,
              paragraphSpacingAfter: 3,
              charSpacing: 1,
              fit: "shrink",
              wrap: false,
            }}
          >
            Styled
          </Text>
          <Shape
            shape="rect"
            style={{
              x: 0.5,
              y: 1.8,
              width: 1.5,
              height: 0.75,
              fill: "#2563EB",
              fillTransparency: 30,
              borderColor: "#1D4ED8",
              borderWidth: 2,
              borderStyle: "dash",
              borderTransparency: 5,
              radius: 0.15,
            }}
          />
          <Image
            src="/tmp/demo.png"
            style={{
              x: 2.5,
              y: 1.8,
              width: 1,
              height: 1,
              transparency: 35,
              rounding: true,
              flipV: true,
            }}
          />
        </View>
      </Slide>
    ));

    const ir = deck.render();

    expect(ir).toMatchInlineSnapshot(`
    	{
    	  "meta": undefined,
    	  "size": {
    	    "heightEmu": 5143500,
    	    "widthEmu": 9144000,
    	  },
    	  "slides": [
    	    {
    	      "background": {
    	        "color": "112233",
    	        "kind": "solid",
    	        "transparency": 12,
    	      },
    	      "id": "slide-1",
    	      "name": "Design",
    	      "nodes": [
    	        {
    	          "children": [
    	            {
    	              "content": {
    	                "text": "Styled",
    	              },
    	              "fill": {
    	                "color": "FFFFFF",
    	                "kind": "solid",
    	                "transparency": 25,
    	              },
    	              "flipH": undefined,
    	              "flipV": undefined,
    	              "frame": {
    	                "heightEmu": 822960,
    	                "widthEmu": 3657600,
    	                "xEmu": 1371600,
    	                "yEmu": 1371600,
    	              },
    	              "id": "node-2",
    	              "kind": "text",
    	              "opacity": undefined,
    	              "radiusEmu": 91440,
    	              "rotation": undefined,
    	              "stroke": {
    	                "color": "DC2626",
    	                "style": "solid",
    	                "transparency": 10,
    	                "widthPt": 1,
    	              },
    	              "style": {
    	                "charSpacing": 1,
    	                "color": "0F172A",
    	                "fit": "shrink",
    	                "fontFamily": "Aptos",
    	                "fontSizePt": 22,
    	                "fontWeight": 700,
    	                "italic": true,
    	                "lineSpacing": 24,
    	                "lineSpacingMultiple": 1.2,
    	                "paddingPt": [
    	                  4,
    	                  8,
    	                  4,
    	                  8,
    	                ],
    	                "paragraphSpacingAfter": 3,
    	                "paragraphSpacingBefore": 2,
    	                "strike": true,
    	                "textAlign": "center",
    	                "underline": true,
    	                "verticalAlign": "middle",
    	                "wrap": false,
    	              },
    	              "zIndex": undefined,
    	            },
    	            {
    	              "fill": {
    	                "color": "2563EB",
    	                "kind": "solid",
    	                "transparency": 30,
    	              },
    	              "flipH": undefined,
    	              "flipV": undefined,
    	              "frame": {
    	                "heightEmu": 685800,
    	                "widthEmu": 1371600,
    	                "xEmu": 1371600,
    	                "yEmu": 2560320,
    	              },
    	              "id": "node-3",
    	              "kind": "shape",
    	              "opacity": undefined,
    	              "radiusEmu": 137160,
    	              "rotation": undefined,
    	              "shape": "rect",
    	              "stroke": {
    	                "color": "1D4ED8",
    	                "style": "dash",
    	                "transparency": 5,
    	                "widthPt": 2,
    	              },
    	              "zIndex": undefined,
    	            },
    	            {
    	              "fit": "contain",
    	              "flipH": undefined,
    	              "flipV": true,
    	              "frame": {
    	                "heightEmu": 914400,
    	                "widthEmu": 914400,
    	                "xEmu": 3200400,
    	                "yEmu": 2560320,
    	              },
    	              "id": "node-4",
    	              "kind": "image",
    	              "opacity": undefined,
    	              "rotation": undefined,
    	              "rounding": true,
    	              "source": {
    	                "kind": "path",
    	                "path": "/tmp/demo.png",
    	              },
    	              "sourceFrame": {
    	                "heightEmu": 914400,
    	                "widthEmu": 914400,
    	                "xEmu": 3200400,
    	                "yEmu": 2560320,
    	              },
    	              "transparency": 35,
    	              "zIndex": undefined,
    	            },
    	          ],
    	          "fill": {
    	            "color": "F8E16C",
    	            "kind": "solid",
    	            "transparency": 15,
    	          },
    	          "flipH": true,
    	          "flipV": undefined,
    	          "frame": {
    	            "heightEmu": 2743200,
    	            "widthEmu": 4572000,
    	            "xEmu": 914400,
    	            "yEmu": 914400,
    	          },
    	          "id": "node-1",
    	          "kind": "group",
    	          "opacity": undefined,
    	          "radiusEmu": 182880,
    	          "rotation": 5,
    	          "stroke": {
    	            "color": "1F2937",
    	            "style": "dash",
    	            "transparency": 20,
    	            "widthPt": 2,
    	          },
    	          "zIndex": undefined,
    	        },
    	      ],
    	    },
    	  ],
    	  "version": "0.1",
    	}
    `);
  });
});

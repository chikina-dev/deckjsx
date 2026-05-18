import { describe, expect, test } from "vite-plus/test";
import { Deck, Shape, Slide, Text, View, createElement } from "../src/index.ts";

void createElement;

describe("stroke-values", () => {
  test("render supports border shorthand and css color functions", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Border and color" style={{ backgroundColor: "#11223380" }}>
        <View
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            backgroundColor: "rgba(255, 0, 0, 0.25)",
            border: "thick dashed hsl(210, 100%, 50%)",
          }}
        >
          <Text
            style={{
              x: 0.5,
              y: 0.5,
              width: 2,
              height: 0.5,
              fontSize: 18,
              color: "rgb(15 23 42)",
              border: "solid #00FF0080 2pt",
            }}
          >
            Color
          </Text>
          <Shape
            shape="rect"
            style={{
              x: 2.75,
              y: 0.5,
              width: 0.75,
              height: 0.75,
              fill: "hsla(120, 100%, 25%, 0.4)",
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
    	        "transparency": 50,
    	      },
    	      "id": "slide-1",
    	      "name": "Border and color",
    	      "nodes": [
    	        {
    	          "children": [
    	            {
    	              "content": {
    	                "text": "Color",
    	              },
    	              "fill": undefined,
    	              "flipH": undefined,
    	              "flipV": undefined,
    	              "frame": {
    	                "heightEmu": 457200,
    	                "widthEmu": 1828800,
    	                "xEmu": 1371600,
    	                "yEmu": 1371600,
    	              },
    	              "id": "node-2",
    	              "kind": "text",
    	              "opacity": undefined,
    	              "radiusEmu": 0,
    	              "rotation": undefined,
    	              "stroke": {
    	                "color": "00FF00",
    	                "style": "solid",
    	                "transparency": 50,
    	                "widthPt": 2,
    	              },
    	              "style": {
    	                "charSpacing": undefined,
    	                "color": "0F172A",
    	                "fit": undefined,
    	                "fontFamily": undefined,
    	                "fontSizePt": 18,
    	                "fontWeight": undefined,
    	                "italic": undefined,
    	                "lineSpacing": undefined,
    	                "lineSpacingMultiple": undefined,
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
    	              "fill": {
    	                "color": "008000",
    	                "kind": "solid",
    	                "transparency": 60,
    	              },
    	              "flipH": undefined,
    	              "flipV": undefined,
    	              "frame": {
    	                "heightEmu": 685800,
    	                "widthEmu": 685800,
    	                "xEmu": 3429000,
    	                "yEmu": 1371600,
    	              },
    	              "id": "node-3",
    	              "kind": "shape",
    	              "opacity": undefined,
    	              "radiusEmu": 0,
    	              "rotation": undefined,
    	              "shape": "rect",
    	              "stroke": undefined,
    	              "zIndex": undefined,
    	            },
    	          ],
    	          "fill": {
    	            "color": "FF0000",
    	            "kind": "solid",
    	            "transparency": 75,
    	          },
    	          "flipH": undefined,
    	          "flipV": undefined,
    	          "frame": {
    	            "heightEmu": 1828800,
    	            "widthEmu": 3657600,
    	            "xEmu": 914400,
    	            "yEmu": 914400,
    	          },
    	          "id": "node-1",
    	          "kind": "group",
    	          "opacity": undefined,
    	          "radiusEmu": 0,
    	          "rotation": undefined,
    	          "stroke": {
    	            "color": "0080FF",
    	            "style": "dash",
    	            "transparency": undefined,
    	            "widthPt": 5,
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

  test("render supports shape strokeDasharray", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Shape stroke dasharray">
        <Shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "dodgerblue",
            strokeWidth: "3pt",
            strokeDasharray: "1 4",
          }}
        />
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
    	      "background": undefined,
    	      "id": "slide-1",
    	      "name": "Shape stroke dasharray",
    	      "nodes": [
    	        {
    	          "fill": {
    	            "color": "F97316",
    	            "kind": "solid",
    	            "transparency": undefined,
    	          },
    	          "flipH": undefined,
    	          "flipV": undefined,
    	          "frame": {
    	            "heightEmu": 685800,
    	            "widthEmu": 1371600,
    	            "xEmu": 914400,
    	            "yEmu": 914400,
    	          },
    	          "id": "node-1",
    	          "kind": "shape",
    	          "opacity": undefined,
    	          "radiusEmu": 0,
    	          "rotation": undefined,
    	          "shape": "rect",
    	          "stroke": {
    	            "color": "1E90FF",
    	            "dashType": "sysDot",
    	            "style": undefined,
    	            "transparency": undefined,
    	            "widthPt": 3,
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

  test("render supports strokeLinecap and strokeLinejoin", () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    deck.add(() => (
      <Slide name="Stroke cap and join">
        <Shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "dodgerblue",
            strokeWidth: "3pt",
            strokeLinecap: "square",
            strokeLinejoin: "bevel",
          }}
        />
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
    	      "background": undefined,
    	      "id": "slide-1",
    	      "name": "Stroke cap and join",
    	      "nodes": [
    	        {
    	          "fill": {
    	            "color": "F97316",
    	            "kind": "solid",
    	            "transparency": undefined,
    	          },
    	          "flipH": undefined,
    	          "flipV": undefined,
    	          "frame": {
    	            "heightEmu": 685800,
    	            "widthEmu": 1371600,
    	            "xEmu": 914400,
    	            "yEmu": 914400,
    	          },
    	          "id": "node-1",
    	          "kind": "shape",
    	          "opacity": undefined,
    	          "radiusEmu": 0,
    	          "rotation": undefined,
    	          "shape": "rect",
    	          "stroke": {
    	            "color": "1E90FF",
    	            "lineCap": "square",
    	            "lineJoin": "bevel",
    	            "style": undefined,
    	            "transparency": undefined,
    	            "widthPt": 3,
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

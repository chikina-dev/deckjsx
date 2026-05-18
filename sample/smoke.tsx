import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { Deck, Shape, Slide, Text, View, type SlideContext } from "deckjsx";

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  meta: { title: "deckjsx npm TSX smoke test", author: "deckjsx" },
});

deck.add(({ slideIndex, totalSlides }: SlideContext) => (
  <Slide name="npm tsx smoke" style={{ backgroundColor: "#F8FAFC" }}>
    <Text
      style={{
        x: 0.7,
        y: 0.55,
        width: 8.5,
        height: 0.5,
        fontSize: 26,
        fontWeight: 700,
        color: "#0F172A",
      }}
    >
      deckjsx npm TSX smoke test
    </Text>
    <View
      style={{
        x: 0.7,
        y: 1.45,
        width: 8.6,
        height: 2.3,
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr",
        columnGap: 0.3,
        padding: 0.28,
        backgroundColor: "#E2E8F0",
        borderRadius: 0.12,
      }}
    >
      <Text style={{ fontSize: 16, color: "#334155", fit: "shrink" }}>
        Published package generated slide {slideIndex + 1} / {totalSlides}.
      </Text>
      <Shape
        shape="rect"
        style={{
          fill: "#16A34A",
          borderRadius: 0.14,
          boxShadow: "2px 2px 5px rgba(15, 23, 42, 0.2)",
        }}
      />
    </View>
  </Slide>
));

const ir = deck.render();
assert.equal(ir.slides.length, 1);
assert.equal(ir.slides[0]?.name, "npm tsx smoke");

await deck.output({
  backend: "pptxgenjs",
  output: "output-tsx.pptx",
});

const output = await stat("output-tsx.pptx");
assert(output.size > 0);

console.log(`Generated output-tsx.pptx (${output.size} bytes)`);

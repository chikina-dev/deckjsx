import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { Deck, Shape } from "deckjsx";

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  meta: { title: "deckjsx 0.2 html-like TSX smoke test", author: "deckjsx" },
});

deck.slide(
  { name: "npm tsx html-like smoke", style: { backgroundColor: "#F8FAFC" } },
  ({ composition }) => (
    <>
      <header
        style={{
          x: 0.7,
          y: 0.55,
          width: 8.5,
          height: 0.5,
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#0F172A" }}>
          deckjsx 0.2 html-like TSX smoke test
        </h1>
      </header>
      <main
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
        <p style={{ fontSize: 16, color: "#334155", fit: "shrink" }}>
          Published package generated slide {composition.slideIndex + 1} / {composition.totalSlides}
          .
        </p>
        <Shape
          shape="rect"
          style={{
            fill: "#16A34A",
            borderRadius: 0.14,
            boxShadow: "2px 2px 5px rgba(15, 23, 42, 0.2)",
          }}
        />
      </main>
      <footer style={{ x: 0.7, y: 4.25, width: 8.6, height: 0.35 }}>
        <p style={{ fontSize: 12, color: "#64748B" }}>HTML-like authoring API</p>
      </footer>
    </>
  ),
);

const projection = deck.project().projection!;
assert.equal(projection.slides.length, 1);
assert.equal(projection.slides[0]?.payload.name, "npm tsx html-like smoke");

const [header, main, footer] = projection.slides[0]?.payload.elements ?? [];
assert.equal(header?.kind, "group");
assert.equal(main?.kind, "group");
assert.equal(footer?.kind, "group");
assert.equal(footer.children[0]?.kind, "text");

await deck.render({ output: "output-tsx.pptx" });

const output = await stat("output-tsx.pptx");
assert(output.size > 0);

console.log(`Generated output-tsx.pptx (${output.size} bytes)`);

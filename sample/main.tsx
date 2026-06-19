import { write } from "@deckjsx/node";
import { Deck } from "deckjsx";
import { pptx } from "deckjsx/adapter";

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  meta: { title: "deckjsx Node dev sample", author: "deckjsx" },
});

deck.slide({ name: "Hello" }, () => (
  <p style={{ x: 1, y: 1, width: 5, height: 0.6, fontSize: 55 }}>Hello deckjsx</p>
));

const output = await write(await deck.render(pptx()), "output-tsx.pptx");

console.log(`Wrote ${output.path} (${output.status})`);

import { Deck, Slide } from "deckjsx";

export async function writeMinimalDeck(output = "sample.pptx"): Promise<void> {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    meta: { title: "Minimal deck", author: "deckjsx" },
  });

  deck.add(() => (
    <Slide name="File output">
      <p style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Hello PPTX</p>
    </Slide>
  ));

  await deck.output({
    backend: "pptxgenjs",
    output,
  });
}

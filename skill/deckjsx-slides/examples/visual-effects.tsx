import { Deck, Shape, Slide } from "deckjsx";

const sampleSvgDataUri =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#2563EB"/><circle cx="120" cy="45" r="28" fill="#F8FAFC"/></svg>',
  ).toString("base64");

export async function writeVisualEffects(output = "visual-effects.pptx"): Promise<void> {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    meta: { title: "Visual effects", author: "deckjsx" },
  });

  deck.add(() => (
    <Slide
      name="Effects"
      style={{
        background:
          `url("${sampleSvgDataUri}") no-repeat right bottom / contain, ` +
          "linear-gradient(180deg, #0F172A 0%, #334155 100%)",
      }}
    >
      <h1
        style={{
          x: 0.7,
          y: 0.55,
          width: 5,
          height: 0.5,
          fontSize: 24,
          fontWeight: 700,
          color: "#FFFFFF",
          textShadow: "3px 3px 8px rgba(0, 0, 0, 0.35)",
        }}
      >
        Visual effects
      </h1>
      <div
        style={{
          x: 0.7,
          y: 1.4,
          width: 3.2,
          height: 2.2,
          backgroundImage:
            "radial-gradient(circle 40% at 20% 30%, rgba(37, 99, 235, 0.35) 0%, #F97316 100%)",
          border: "1pt solid rgba(255, 255, 255, 0.6)",
          borderRadius: 0.16,
          boxShadow: "6px 6px 10px rgba(15, 23, 42, 0.35)",
        }}
      />
      <img
        data={sampleSvgDataUri}
        style={{
          x: 4.5,
          y: 1.4,
          width: 2.2,
          height: 2.2,
          objectFit: "cover",
          objectPosition: "right 25% bottom 10%",
          rounding: true,
          boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.3)",
        }}
      />
      <Shape
        shape="rect"
        style={{
          x: 7.2,
          y: 1.4,
          width: 1.8,
          height: 1,
          fill: "#F97316",
          stroke: "dodgerblue",
          strokeWidth: "3pt",
          strokeDasharray: "1 4",
          borderRadius: 0.12,
        }}
      />
    </Slide>
  ));

  await deck.output({ backend: "pptxgenjs", output });
}

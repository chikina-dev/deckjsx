import { Deck, Shape, Slide } from "deckjsx";

type Metric = {
  label: string;
  value: string;
  note: string;
  color: string;
};

const metrics: Metric[] = [
  { label: "Revenue", value: "$12.4M", note: "+18% YoY", color: "#2563EB" },
  { label: "Retention", value: "94%", note: "+3 pts", color: "#16A34A" },
  { label: "Pipeline", value: "$31M", note: "2.5x coverage", color: "#F59E0B" },
];

export async function writeMultiSlideReport(output = "multi-slide-report.pptx"): Promise<void> {
  const deck = new Deck({
    layout: { width: 13.333, height: 7.5, unit: "in" },
    meta: { title: "Quarterly Review", author: "deckjsx" },
  });

  deck.add(({ composition }) => (
    <Slide name="Title" style={{ backgroundColor: "#F8FAFC" }}>
      <h1
        style={{
          x: 0.8,
          y: 0.8,
          width: 10,
          height: 0.8,
          fontFamily: "Aptos Display",
          fontSize: 34,
          fontWeight: 700,
          color: "#0F172A",
        }}
      >
        Quarterly Review
      </h1>
      <p style={{ x: 0.85, y: 1.75, width: 8, height: 0.5, fontSize: 18, color: "#475569" }}>
        A concise executive narrative generated with deckjsx.
      </p>
      <footer style={{ x: 11.2, y: 7, width: 1.4, height: 0.25 }}>
        <p style={{ fontSize: 9, color: "#64748B", textAlign: "right" }}>
          {composition.slideIndex + 1} / {composition.totalSlides}
        </p>
      </footer>
    </Slide>
  ));

  deck.add(({ composition }) => (
    <Slide name="Metrics" style={{ backgroundColor: "#FFFFFF" }}>
      <h1 style={{ x: 0.7, y: 0.5, width: 8, height: 0.45, fontSize: 24, fontWeight: 700 }}>
        Business metrics
      </h1>
      <section
        style={{
          x: 0.7,
          y: 1.35,
          width: 11.9,
          height: 4.6,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          columnGap: 0.28,
        }}
      >
        {metrics.map((metric) => (
          <article
            style={{
              backgroundColor: "#F8FAFC",
              border: "1pt solid #CBD5E1",
              borderRadius: 0.12,
              padding: 0.28,
            }}
          >
            <Shape
              shape="rect"
              style={{ x: 0.28, y: 0.28, width: 0.5, height: 0.12, fill: metric.color }}
            />
            <p style={{ x: 0.28, y: 0.65, width: 3, height: 0.25, fontSize: 11, color: "#64748B" }}>
              {metric.label}
            </p>
            <p style={{ x: 0.28, y: 1.05, width: 3, height: 0.55, fontSize: 30, fontWeight: 700 }}>
              {metric.value}
            </p>
            <p
              style={{
                x: 0.28,
                y: 1.75,
                width: 3,
                height: 0.35,
                fontSize: 14,
                color: metric.color,
              }}
            >
              {metric.note}
            </p>
          </article>
        ))}
      </section>
      <footer style={{ x: 11.2, y: 7, width: 1.4, height: 0.25 }}>
        <p style={{ fontSize: 9, color: "#64748B", textAlign: "right" }}>
          {composition.slideIndex + 1} / {composition.totalSlides}
        </p>
      </footer>
    </Slide>
  ));

  await deck.render({ output });
}

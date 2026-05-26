import { Deck } from "deckjsx";

export async function writeLayoutPatterns(output = "layout-patterns.pptx"): Promise<void> {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    meta: { title: "Layout patterns", author: "deckjsx" },
  });

  deck.slide({ name: "Stack and grid", style: { backgroundColor: "#F8FAFC" } }, () => (
    <>
      <section
        style={{
          x: 0.5,
          y: 0.5,
          width: 4,
          height: 4.6,
          display: "flex",
          flexDirection: "column",
          gap: 0.2,
          padding: 0.25,
          backgroundColor: "#FFFFFF",
          border: "1pt solid #CBD5E1",
          borderRadius: 0.1,
        }}
      >
        <h2 style={{ width: 3.4, height: 0.45, fontSize: 20, fontWeight: 700 }}>Stack</h2>
        <p style={{ width: 3.4, height: 0.45, fontSize: 14, color: "#475569" }}>First item</p>
        <p style={{ width: 3.4, height: 0.45, fontSize: 14, color: "#475569" }}>Second item</p>
        <p
          style={{
            position: "absolute",
            left: 2.2,
            top: 3.55,
            width: 1.1,
            height: 0.35,
            fontSize: 10,
            color: "#FFFFFF",
            backgroundColor: "#2563EB",
            textAlign: "center",
            verticalAlign: "middle",
            borderRadius: 0.08,
          }}
        >
          Overlay
        </p>
      </section>

      <section
        style={{
          x: 5,
          y: 0.5,
          width: 4.5,
          height: 4.6,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "0.7in 1fr 1fr",
          columnGap: 0.2,
          rowGap: 0.2,
          padding: 0.25,
          backgroundColor: "#FFFFFF",
          border: "1pt solid #CBD5E1",
          borderRadius: 0.1,
        }}
      >
        <h2 style={{ gridColumn: "span 2", fontSize: 20, fontWeight: 700 }}>Grid</h2>
        <div style={{ backgroundColor: "#DBEAFE", borderRadius: 0.08 }} />
        <div style={{ backgroundColor: "#DCFCE7", borderRadius: 0.08 }} />
        <div style={{ gridColumn: "span 2", backgroundColor: "#FEF3C7", borderRadius: 0.08 }} />
      </section>
    </>
  ));

  await deck.render({ output });
}

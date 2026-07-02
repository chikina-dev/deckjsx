import { write } from "@deckjsx/node";
import { Deck, StyleSheet } from "deckjsx";
import { pdf, pptx } from "deckjsx/adapter";
import type { ProjectInspectionSummary } from "deckjsx/inspect";

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  meta: { title: "Review loop" },
});

deck.useStyles(
  new StyleSheet({
    classes: {
      slide: {
        target: "main.slide",
        style: {
          width: "100%",
          height: "100%",
          padding: 0.58,
          display: "grid",
          gridTemplateRows: ["0.75in", "1fr", "0.3in"],
          rowGap: 0.28,
          backgroundColor: "#F8FAFC",
        },
      },
      title: {
        target: "h1.title",
        style: { height: 0.5, fontSize: 30, fontWeight: 700, color: "#0F172A" },
      },
      body: {
        target: "section.body",
        style: { display: "grid", gridTemplateColumns: ["1.2fr", "0.8fr"], columnGap: 0.32 },
      },
      panel: {
        target: "section.panel",
        style: {
          backgroundColor: "#FFFFFF",
          border: "1pt solid #CBD5E1",
          borderRadius: 8,
          padding: 0.24,
          display: "grid",
          rowGap: 0.14,
        },
      },
      lead: { target: "p.lead", style: { fontSize: 16, lineHeight: 1.22, fit: "shrink" } },
      reviewText: {
        target: "p.reviewText",
        style: { height: 0.36, fontSize: 8, lineHeight: 1.1, fit: "shrink" },
      },
      footer: {
        target: "p.footer",
        style: { height: 0.24, fontSize: 10, color: "#64748B", textAlign: "right" },
      },
    },
  }),
);

function ReviewSlide() {
  return (
    <main className="slide">
      <header>
        <h1 className="title">Project first, render after review</h1>
      </header>
      <section className="body">
        <section className="panel">
          <p className="lead">
            Write slides as typed JSX with CSS-like layout, reusable components, and data-driven
            content.
          </p>
          <p className="reviewText">
            This intentionally small text box demonstrates a visual review hint: the deck is valid,
            but the projected PPTX may need a human pass for fit and readability.
          </p>
        </section>
        <section className="panel">
          <p className="lead">
            The PDF adapter is useful for a quick text-heavy review artifact. It does not replace
            inspecting the generated PPTX for final slide polish.
          </p>
        </section>
      </section>
      <p className="footer">deckjsx review loop sample</p>
    </main>
  );
}

deck.slide({ name: "Review Loop" }, () => <ReviewSlide />);

const projected = await deck.project({ inspection: "summary" });
const summary = projected.summary as ProjectInspectionSummary | undefined;

for (const slide of summary?.slides ?? []) {
  for (const check of slide.visualChecks) {
    console.warn(`${slide.name ?? slide.slideId}: ${check.code} ${check.message}`);
    if (check.metrics) {
      console.info(`${slide.name ?? slide.slideId}: review metrics`, check.metrics);
    }
  }
  // `slide.elements` is top-level; nested group/table content may only appear in checks.
  for (const element of slide.elements) {
    if (element.textMetrics) {
      console.info(
        `${slide.name ?? slide.slideId}: ${element.id} text lines ${element.textMetrics.estimatedLineCount}/${element.textMetrics.estimatedLineCapacity}`,
      );
    }
    if (element.mediaMetrics) {
      console.info(
        `${slide.name ?? slide.slideId}: ${element.id} media ${element.mediaMetrics.fit}${element.mediaMetrics.cropped ? " cropped" : ""}`,
      );
    }
  }
}

await write(await deck.render(pdf()), "review-loop.pdf");
await write(await deck.render(pptx()), "review-loop.pptx");

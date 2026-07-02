import { write } from "@deckjsx/node";
import { Deck, StyleSheet, Theme } from "deckjsx";
import { pptx } from "deckjsx/adapter";

const theme = new Theme({
  colors: {
    ink: "#0F172A",
    muted: "#64748B",
    paper: "#F8FAFC",
    good: "#0F766E",
    risk: "#B45309",
  },
  defaults: {
    h1: { fontSize: 30, fontWeight: 700, color: "#0F172A" },
    h2: { fontSize: 16, fontWeight: 700, color: "#0F172A" },
    p: { fontSize: 13, lineHeight: 1.18, color: "#334155", fit: "shrink" },
  },
});

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  theme,
  templates: {
    report: {
      style: {
        padding: 0.58,
        display: "grid",
        gridTemplateAreas: ['"title"', '"body"', '"footer"'],
        gridTemplateRows: ["0.62in", "1fr", "0.28in"],
        rowGap: 0.28,
      },
      areas: {
        title: { kind: "title", style: { gridArea: "title" } },
        body: { kind: "body", style: { gridArea: "body" } },
        footer: { kind: "footer", style: { gridArea: "footer" } },
      },
    },
  },
});

deck.useStyles(
  new StyleSheet({
    classes: {
      slide: { target: "main.slide", style: { backgroundColor: "#F8FAFC" } },
      title: { target: "h1.title", style: { height: 0.5 } },
      cardGrid: {
        target: "section.cardGrid",
        style: { display: "grid", gridTemplateColumns: ["1fr", "1fr", "1fr"], columnGap: 0.24 },
      },
      card: {
        target: "section.card",
        style: {
          backgroundColor: "#FFFFFF",
          border: "1pt solid #CBD5E1",
          borderRadius: 8,
          padding: 0.22,
          display: "grid",
          gridTemplateRows: ["0.34in", "1fr"],
          rowGap: 0.12,
        },
      },
      good: { target: "section.good", style: { border: "1.5pt solid #0F766E" } },
      risk: { target: "section.risk", style: { border: "1.5pt solid #B45309" } },
      cardTitle: { target: "h2.cardTitle", style: { height: 0.32 } },
      cardBody: { target: "p.cardBody", style: { height: 1.05 } },
      footer: {
        target: "p.footer",
        style: { height: 0.24, fontSize: 10, color: theme.colors.muted, textAlign: "right" },
      },
    },
  }),
);

type Finding = { readonly title: string; readonly body: string; readonly tone: "good" | "risk" };

const findings: Finding[] = [
  {
    title: "Web-like code",
    body: "Slides stay readable as JSX, data arrays, typed style objects, and components.",
    tone: "good",
  },
  {
    title: "Explicit review",
    body: "Project inspection keeps output-facing frames, text metrics, and visual checks visible.",
    tone: "good",
  },
  {
    title: "Final PPTX pass",
    body: "Generated slide files still deserve a human review for wrapping and visual polish.",
    tone: "risk",
  },
];

function FindingCard({ finding }: { readonly finding: Finding }) {
  return (
    <section className={["card", finding.tone]}>
      <h2 className="cardTitle">{finding.title}</h2>
      <p className="cardBody">{finding.body}</p>
    </section>
  );
}

deck.slide({ name: "Findings", template: "report" }, ({ template }) => (
  <main className="slide">
    <h1 area={template.title} className="title">
      Findings
    </h1>
    <section area={template.body} className="cardGrid">
      {findings.map((finding) => (
        <FindingCard key={finding.title} finding={finding} />
      ))}
    </section>
    <p area={template.footer} className="footer">
      Source: internal review
    </p>
  </main>
));

await write(await deck.render(pptx()), "component-pattern.pptx");

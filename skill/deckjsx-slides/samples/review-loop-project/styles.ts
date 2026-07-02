import { StyleSheet, type StyleSheetValue } from "deckjsx";
import { theme } from "./theme";

export const styles: StyleSheetValue = new StyleSheet({
  classes: {
    slide: { target: "main.slide", style: { backgroundColor: theme.colors.paper } },
    titleBlock: { target: "header.titleBlock", style: { display: "grid", rowGap: 0.08 } },
    kicker: {
      target: "p.kicker",
      style: { height: 0.18, fontSize: 8, fontWeight: 700, color: theme.colors.accent },
    },
    lead: { target: "p.lead", style: { height: 0.4, fontSize: 12.5, color: theme.colors.muted } },
    findingGrid: {
      target: "section.findingGrid",
      style: { display: "grid", gridTemplateColumns: ["1fr", "1fr", "1fr"], columnGap: 0.24 },
    },
    findingCard: {
      target: "article.findingCard",
      style: {
        backgroundColor: theme.colors.panel,
        border: `1pt solid ${theme.colors.line}`,
        borderRadius: 8,
        padding: 0.22,
        display: "grid",
        gridTemplateRows: ["0.34in", "1fr"],
        rowGap: 0.1,
      },
    },
    good: { target: "article.good", style: { border: `1.5pt solid ${theme.colors.accent}` } },
    risk: { target: "article.risk", style: { border: `1.5pt solid ${theme.colors.risk}` } },
    cardTitle: { target: "h2.cardTitle", style: { height: 0.32 } },
    cardBody: { target: "p.cardBody", style: { height: 1.05 } },
    sourceNote: {
      target: "p.sourceNote",
      style: { height: 0.22, fontSize: 8.5, color: theme.colors.muted, textAlign: "right" },
    },
  },
});

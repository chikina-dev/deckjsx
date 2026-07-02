import type { SlideTemplateSet } from "deckjsx";

export const templates = {
  report: {
    style: {
      padding: 0.58,
      display: "grid",
      gridTemplateAreas: ['"title"', '"body"', '"footer"'],
      gridTemplateRows: ["0.68in", "1fr", "0.28in"],
      rowGap: 0.28,
    },
    areas: {
      title: { kind: "title", style: { gridArea: "title" } },
      body: { kind: "body", style: { gridArea: "body" } },
      footer: { kind: "footer", style: { gridArea: "footer", justifySelf: "end" } },
    },
  },
} as const satisfies SlideTemplateSet;

export type ReviewLoopTemplates = typeof templates;

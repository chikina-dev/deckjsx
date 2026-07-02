export type Finding = {
  readonly title: string;
  readonly body: string;
  readonly tone: "good" | "risk";
};

export const reviewSnapshot = {
  title: {
    kicker: "B. REVIEW LOOP",
    headline: "Author with web-like JSX, review the projected PPTX state",
    lead: "Use Project inspection and a minimal PDF pass without treating either as a replacement for final PPTX review.",
  },
  findings: [
    {
      title: "Web-like authoring",
      body: "Slides stay readable as data, components, lowercase tags, and CSS-like style objects.",
      tone: "good",
    },
    {
      title: "Inspection first",
      body: "Project summary exposes frames, text metrics, media metrics, and visualChecks before render.",
      tone: "good",
    },
    {
      title: "Final PPTX pass",
      body: "The generated PPTX remains the final artifact to inspect for wrapping and polish.",
      tone: "risk",
    },
  ] satisfies Finding[],
  source: "Source: deckjsx skill review sample",
};

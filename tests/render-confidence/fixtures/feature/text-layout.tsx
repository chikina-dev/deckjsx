/** @jsxImportSource deckjsx */
import { Deck, StyleSheet } from "@/src/index.ts";
import type { RenderConfidenceFixture } from "../../types";

function createTextLayoutDeck(): Deck {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.useStyles(
    new StyleSheet({
      classes: {
        callout: {
          target: "p.callout",
          style: { color: "#2563EB", fontSize: 18, fontWeight: 700 },
        },
      },
    }),
  );

  deck.slide({ name: "Text and layout" }, () => [
    <h1
      style={{ position: "absolute", left: 0.6, top: 0.4, width: 8.8, height: 0.5, fontSize: 28 }}
    >
      Text layout confidence
    </h1>,
    <p
      className="callout"
      style={{ position: "absolute", left: 0.8, top: 1.2, width: 4.8, height: 0.5 }}
    >
      Styled callout signal
    </p>,
    <p
      style={{
        position: "absolute",
        left: 0.8,
        top: 1.95,
        width: 5.8,
        height: 0.6,
        fontSize: 17,
        textAlign: "center",
        color: "#334155",
      }}
    >
      Centered paragraph with <span style={{ color: "#DC2626", fontWeight: 700 }}>rich red</span>{" "}
      run
    </p>,
    <shape
      shape="rect"
      style={{
        position: "absolute",
        left: 6.6,
        top: 1.2,
        width: 2,
        height: 1,
        fill: "#DBEAFE",
        stroke: "1pt solid #1D4ED8",
        zIndex: 1,
      }}
    />,
    <p
      style={{
        position: "absolute",
        left: 6.85,
        top: 1.55,
        width: 2,
        height: 0.4,
        fontSize: 16,
        color: "#0F172A",
        zIndex: 2,
      }}
    >
      Front label
    </p>,
    <p
      style={{
        position: "absolute",
        left: 0.8,
        top: 3.05,
        width: 4,
        height: 0.5,
        fontSize: 16,
        lineHeight: "28pt",
      }}
    >
      Bullet item
    </p>,
  ]);

  return deck;
}

export const featureTextLayoutFixtures: readonly RenderConfidenceFixture[] = [
  {
    name: "feature-text-layout",
    group: "feature-text-layout",
    artifactBaseName: "feature-text-layout",
    description: "Text, rich runs, StyleSheet styling, simple layout, and z-order.",
    rasterPages: [{ page: 1, category: "text" }],
    assertions: {
      expectedSlides: 1,
      requiredTexts: [
        "Text layout confidence",
        "Styled callout signal",
        "Centered paragraph with ",
        "rich red",
        "run",
        "Front label",
        "Bullet item",
      ],
      requireRichTextRunSignal: true,
      requiredXmlSnippets: ["DC2626"],
    },
    createDeck: createTextLayoutDeck,
  },
];

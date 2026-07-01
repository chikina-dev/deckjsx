/** @jsxImportSource deckjsx */
import { Deck, StyleSheet } from "@/src/index.ts";
import type { RenderConfidenceFixture } from "../../types";

function createBusinessReportDeck(): Deck {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.useStyles(
    new StyleSheet({
      classes: {
        metric: {
          target: "p.metric",
          style: { fontSize: 26, fontWeight: 700, color: "#0F766E" },
        },
      },
    }),
  );

  deck.slide({ name: "Business report" }, () => [
    <h1
      style={{ position: "absolute", left: 0.6, top: 0.45, width: 8, height: 0.55, fontSize: 28 }}
    >
      Quarterly business report
    </h1>,
    <p
      className="metric"
      style={{ position: "absolute", left: 0.8, top: 1.3, width: 2.2, height: 0.6 }}
    >
      $1.2M
    </p>,
    <p
      style={{ position: "absolute", left: 0.8, top: 2.15, width: 5.5, height: 0.5, fontSize: 16 }}
    >
      Expansion revenue offset slower new pipeline.
    </p>,
    <shape
      shape="rect"
      style={{ position: "absolute", left: 6.6, top: 1.3, width: 2.3, height: 2, fill: "#ECFDF5" }}
    />,
  ]);

  return deck;
}

function createSalesDeck(): Deck {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.slide({ name: "Sales deck" }, () => [
    <h1
      style={{ position: "absolute", left: 0.7, top: 0.6, width: 7.8, height: 0.6, fontSize: 30 }}
    >
      Launch plan for enterprise teams
    </h1>,
    <p
      style={{ position: "absolute", left: 0.7, top: 1.55, width: 6.4, height: 0.55, fontSize: 18 }}
    >
      Align teams, automate deck generation, and keep brand output stable.
    </p>,
    <shape
      shape="roundRect"
      style={{
        position: "absolute",
        left: 0.7,
        top: 2.55,
        width: 2.4,
        height: 1.1,
        fill: "#DBEAFE",
      }}
    />,
    <p style={{ position: "absolute", left: 1, top: 2.9, width: 2, height: 0.4, fontSize: 16 }}>
      Faster reviews
    </p>,
  ]);

  return deck;
}

function createProductRoadmapDeck(): Deck {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.slide({ name: "Product roadmap" }, () => [
    <h1
      style={{ position: "absolute", left: 0.6, top: 0.45, width: 7.5, height: 0.55, fontSize: 28 }}
    >
      Product roadmap
    </h1>,
    ...["Q1", "Q2", "Q3"].map((quarter, index) => (
      <shape
        key={quarter}
        shape="rect"
        style={{
          position: "absolute",
          left: 0.8 + index * 2.8,
          top: 1.5,
          width: 2.2,
          height: 1.2,
          fill: index === 0 ? "#DCFCE7" : index === 1 ? "#FEF3C7" : "#DBEAFE",
        }}
      />
    )),
    <p
      style={{ position: "absolute", left: 0.95, top: 1.85, width: 1.8, height: 0.4, fontSize: 16 }}
    >
      Q1 Authoring
    </p>,
    <p
      style={{ position: "absolute", left: 3.75, top: 1.85, width: 1.8, height: 0.4, fontSize: 16 }}
    >
      Q2 Render
    </p>,
    <p
      style={{ position: "absolute", left: 6.55, top: 1.85, width: 1.8, height: 0.4, fontSize: 16 }}
    >
      Q3 Publish
    </p>,
  ]);

  return deck;
}

export const businessScenarioFixtures: readonly RenderConfidenceFixture[] = [
  {
    name: "scenario-business-report",
    group: "scenario-business",
    artifactBaseName: "scenario-business-report",
    description: "Business report scenario with metric cards and narrative text.",
    rasterPages: [{ page: 1, category: "complexLayout" }],
    assertions: {
      expectedSlides: 1,
      requiredTexts: ["Quarterly business report", "$1.2M", "Expansion revenue"],
    },
    createDeck: createBusinessReportDeck,
  },
  {
    name: "scenario-sales-deck",
    group: "scenario-business",
    artifactBaseName: "scenario-sales-deck",
    description: "Sales deck scenario with value proposition and cards.",
    rasterPages: [{ page: 1, category: "complexLayout" }],
    assertions: {
      expectedSlides: 1,
      requiredTexts: ["Launch plan for enterprise teams", "Faster reviews"],
    },
    createDeck: createSalesDeck,
  },
  {
    name: "scenario-product-roadmap",
    group: "scenario-business",
    artifactBaseName: "scenario-product-roadmap",
    description: "Roadmap scenario with timeline-like layout.",
    rasterPages: [{ page: 1, category: "geometry" }],
    assertions: {
      expectedSlides: 1,
      requiredTexts: ["Product roadmap", "Q1 Authoring", "Q2 Render", "Q3 Publish"],
    },
    createDeck: createProductRoadmapDeck,
  },
];

/** @jsxImportSource deckjsx */
import { Deck } from "@/src/index.ts";
import type { RenderConfidenceFixture } from "../../types";

function createTechnicalDiagramDeck(): Deck {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.slide({ name: "Technical diagram" }, () => [
    <h1
      style={{ position: "absolute", left: 0.6, top: 0.45, width: 7.5, height: 0.55, fontSize: 28 }}
    >
      Technical diagram
    </h1>,
    <shape
      shape="rect"
      style={{ position: "absolute", left: 0.8, top: 1.5, width: 2, height: 0.9, fill: "#DBEAFE" }}
    />,
    <shape
      shape="rect"
      style={{ position: "absolute", left: 3.8, top: 1.5, width: 2, height: 0.9, fill: "#DCFCE7" }}
    />,
    <shape
      shape="rect"
      style={{ position: "absolute", left: 6.8, top: 1.5, width: 2, height: 0.9, fill: "#FEF3C7" }}
    />,
    <p
      style={{ position: "absolute", left: 1.1, top: 1.78, width: 1.5, height: 0.35, fontSize: 15 }}
    >
      Author
    </p>,
    <p
      style={{
        position: "absolute",
        left: 4.08,
        top: 1.78,
        width: 1.5,
        height: 0.35,
        fontSize: 15,
      }}
    >
      Project
    </p>,
    <p
      style={{ position: "absolute", left: 7.1, top: 1.78, width: 1.5, height: 0.35, fontSize: 15 }}
    >
      Render
    </p>,
  ]);

  return deck;
}

function createMixedDashboardDeck(): Deck {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.slide({ name: "Mixed dashboard" }, () => [
    <h1
      style={{ position: "absolute", left: 0.6, top: 0.45, width: 7.8, height: 0.55, fontSize: 28 }}
    >
      Mixed dashboard
    </h1>,
    <p
      style={{
        position: "absolute",
        left: 0.8,
        top: 1.3,
        width: 2.6,
        height: 0.5,
        fontSize: 22,
        color: "#0F766E",
      }}
    >
      97% healthy
    </p>,
    <shape
      shape="rect"
      style={{ position: "absolute", left: 0.8, top: 2.2, width: 8, height: 0.2, fill: "#CBD5E1" }}
    />,
    <shape
      shape="rect"
      style={{
        position: "absolute",
        left: 0.8,
        top: 2.2,
        width: 6.8,
        height: 0.2,
        fill: "#10B981",
      }}
    />,
    <table style={{ position: "absolute", left: 0.8, top: 3, width: 5.8, height: 1.2 }}>
      <tbody>
        <tr>
          <td>Render</td>
          <td>fast</td>
        </tr>
        <tr>
          <td>Visual diff</td>
          <td>stable</td>
        </tr>
      </tbody>
    </table>,
  ]);

  return deck;
}

export const technicalScenarioFixtures: readonly RenderConfidenceFixture[] = [
  {
    name: "scenario-technical-diagram",
    group: "scenario-technical",
    artifactBaseName: "scenario-technical-diagram",
    description: "Technical diagram scenario with aligned nodes.",
    rasterPages: [{ page: 1, category: "geometry" }],
    assertions: {
      expectedSlides: 1,
      requiredTexts: ["Technical diagram", "Author", "Project", "Render"],
    },
    createDeck: createTechnicalDiagramDeck,
  },
  {
    name: "scenario-mixed-dashboard",
    group: "scenario-technical",
    artifactBaseName: "scenario-mixed-dashboard",
    description: "Mixed dashboard scenario with text, shapes, and table.",
    rasterPages: [{ page: 1, category: "complexLayout" }],
    assertions: {
      expectedSlides: 1,
      requiredTexts: ["Mixed dashboard", "97% healthy", "Render", "Visual diff"],
      requireTableSignal: true,
    },
    createDeck: createMixedDashboardDeck,
  },
];

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
    <table
      style={{
        position: "absolute",
        left: 0.8,
        top: 3,
        width: 5.8,
        height: 1.2,
        tableLayout: "fixed",
      }}
    >
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

function createMultiPageStaticDeck(): Deck {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.slide({ name: "Static overview" }, () => [
    <h1
      style={{ position: "absolute", left: 0.6, top: 0.45, width: 7.8, height: 0.55, fontSize: 28 }}
    >
      Static overview
    </h1>,
    <p style={{ position: "absolute", left: 0.7, top: 1.2, width: 6.8, height: 0.5, fontSize: 17 }}>
      Two page parity fixture for PDF and PPTX rendering.
    </p>,
    ...(
      [
        { label: "Inputs", value: "42", fill: "#E0F2FE" },
        { label: "Layouts", value: "18", fill: "#DCFCE7" },
        { label: "Exports", value: "9", fill: "#FEF3C7" },
      ] as const
    ).flatMap((metric, index) => [
      <shape
        key={`${metric.label}-box`}
        shape="rect"
        style={{
          position: "absolute",
          left: 0.7 + index * 2.9,
          top: 2,
          width: 2.4,
          height: 1.45,
          fill: metric.fill,
        }}
      />,
      <p
        key={`${metric.label}-label`}
        style={{
          position: "absolute",
          left: 1 + index * 2.9,
          top: 2.28,
          width: 1.8,
          height: 0.35,
          fontSize: 13,
        }}
      >
        {metric.label}
      </p>,
      <p
        key={`${metric.label}-value`}
        style={{
          position: "absolute",
          left: 1 + index * 2.9,
          top: 2.68,
          width: 1.4,
          height: 0.5,
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        {metric.value}
      </p>,
    ]),
  ]);

  deck.slide({ name: "Static operating plan" }, () => [
    <h1
      style={{ position: "absolute", left: 0.6, top: 0.45, width: 7.8, height: 0.55, fontSize: 28 }}
    >
      Static operating plan
    </h1>,
    <table
      style={{
        position: "absolute",
        left: 0.7,
        top: 1.35,
        width: 8.5,
        height: 2.4,
        tableLayout: "fixed",
      }}
    >
      <thead>
        <tr>
          <th>Stage</th>
          <th>Owner</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Author</td>
          <td>Design</td>
          <td>ready</td>
        </tr>
        <tr>
          <td>Project</td>
          <td>Runtime</td>
          <td>stable</td>
        </tr>
        <tr>
          <td>Verify</td>
          <td>QA</td>
          <td>tracked</td>
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
    pdfAssertions: {
      expectedPages: 1,
      minimumShapeVisuals: 3,
      requiredTexts: ["Technical diagram", "Author", "Project", "Render"],
      rasterTolerance: {
        maxMeanAbsoluteChannelDifference: 6,
        maxChannelDifference: 255,
        maxChangedPixelRatio: 0.045,
      },
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
    pdfAssertions: {
      expectedPages: 1,
      minimumShapeVisuals: 2,
      requiredTexts: ["Mixed dashboard", "97% healthy", "Render", "Visual diff"],
      requiredTextColorSignals: [{ text: "97% healthy", color: "#0F766E" }],
      requireTableText: true,
      requiredTableTexts: ["Render", "Visual diff"],
      rasterTolerance: {
        maxMeanAbsoluteChannelDifference: 8,
        maxChannelDifference: 255,
        maxChangedPixelRatio: 0.065,
      },
    },
    createDeck: createMixedDashboardDeck,
  },
  {
    name: "scenario-multi-page-static",
    group: "scenario-technical",
    artifactBaseName: "scenario-multi-page-static",
    description: "Multi-page static scenario that exercises whole-deck PDF/PPTX raster parity.",
    rasterPages: [
      { page: 1, category: "complexLayout" },
      { page: 2, category: "complexLayout" },
    ],
    assertions: {
      expectedSlides: 2,
      requiredTexts: [
        "Static overview",
        "Two page parity fixture",
        "Static operating plan",
        "Verify",
      ],
      requireTableSignal: true,
    },
    pdfAssertions: {
      expectedPages: 2,
      requiredTexts: [
        "Static overview",
        "Two page parity fixture",
        "Static operating plan",
        "Verify",
      ],
      requiredTextsByPage: [
        { page: 1, texts: ["Static overview", "Inputs", "Exports"] },
        { page: 2, texts: ["Static operating plan", "Stage", "Verify"] },
      ],
      minimumShapeVisualsByPage: [{ page: 1, minimum: 3 }],
      minimumTableBorderVisualsByPage: [{ page: 2, minimum: 48 }],
      requiredTableCellVisualPages: [2],
      requireTableText: true,
      requiredTableTexts: ["Stage", "Owner", "Status", "Verify"],
      rasterTolerance: {
        maxMeanAbsoluteChannelDifference: 8,
        maxChannelDifference: 255,
        maxChangedPixelRatio: 0.06,
      },
    },
    createDeck: createMultiPageStaticDeck,
  },
];

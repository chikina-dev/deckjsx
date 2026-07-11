/** @jsxImportSource deckjsx */
import { Deck } from "@/src/index.ts";
import type { RenderConfidenceFixture } from "../../types";

const pngData =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyAQMAAACQ++z9AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURSVj6////y1UwPwAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gYIBDIiDubyQgAAAA9JREFUKM9jYBgFo2BoAgACvAABbZIddAAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wNi0wOFQwNDo1MDozNCswMDowMFuMTQoAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDYtMDhUMDQ6NTA6MzQrMDA6MDAq0fW2AAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA2LTA4VDA0OjUwOjM0KzAwOjAwfcTUaQAAAABJRU5ErkJggg==";

function createImageHeavyDeck(): Deck {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.slide({ name: "Image heavy" }, () => [
    <h1
      style={{ position: "absolute", left: 0.6, top: 0.45, width: 7.5, height: 0.55, fontSize: 28 }}
    >
      Image heavy deck
    </h1>,
    ...Array.from({ length: 6 }, (_, index) => (
      <img
        key={index}
        data={pngData}
        style={{
          position: "absolute",
          left: 0.8 + (index % 3) * 2.8,
          top: 1.3 + Math.floor(index / 3) * 1.55,
          width: 2.2,
          height: 1.1,
          objectFit: index % 2 === 0 ? "cover" : "contain",
        }}
      />
    )),
  ]);

  return deck;
}

function createTableHeavyDeck(): Deck {
  const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
  deck.slide({ name: "Table heavy" }, () => [
    <h1
      style={{ position: "absolute", left: 0.6, top: 0.45, width: 7.5, height: 0.55, fontSize: 28 }}
    >
      Table heavy deck
    </h1>,
    <table
      style={{
        position: "absolute",
        left: 0.7,
        top: 1.3,
        width: 8.4,
        height: 3.2,
        tableLayout: "fixed",
      }}
    >
      <thead>
        <tr>
          <th>Region</th>
          <th>ARR</th>
          <th>Pipeline</th>
          <th>Risk</th>
        </tr>
      </thead>
      <tbody>
        {["NA", "EMEA", "APAC", "LATAM"].map((region, index) => (
          <tr key={region}>
            <td>{region}</td>
            <td>${(index + 2) * 120}k</td>
            <td>{index % 2 === 0 ? "strong" : "steady"}</td>
            <td>{index === 3 ? "watch" : "low"}</td>
          </tr>
        ))}
      </tbody>
    </table>,
  ]);

  return deck;
}

export const heavyScenarioFixtures: readonly RenderConfidenceFixture[] = [
  {
    name: "scenario-image-heavy",
    group: "scenario-heavy",
    artifactBaseName: "scenario-image-heavy",
    description: "Image-heavy scenario with repeated media frames.",
    rasterPages: [{ page: 1, category: "imageCrop" }],
    assertions: {
      expectedSlides: 1,
      requiredTexts: ["Image heavy deck"],
      requireImageRelationship: true,
    },
    pdfAssertions: {
      expectedPages: 1,
      minimumImageClipVisuals: 3,
      minimumImageVisuals: 6,
      requiredTexts: ["Image heavy deck"],
      requireImageResource: true,
      requiredImageFitVisuals: [
        { fit: "cover", minimum: 3 },
        { fit: "contain", minimum: 3 },
      ],
      rasterTolerance: {
        maxMeanAbsoluteChannelDifference: 4,
        maxChannelDifference: 255,
        maxChangedPixelRatio: 0.03,
      },
    },
    createDeck: createImageHeavyDeck,
  },
  {
    name: "scenario-table-heavy",
    group: "scenario-heavy",
    artifactBaseName: "scenario-table-heavy",
    description: "Table-heavy scenario with multiple rows and columns.",
    rasterPages: [{ page: 1, category: "complexLayout" }],
    assertions: {
      expectedSlides: 1,
      requiredTexts: ["Table heavy deck", "Region", "ARR", "Pipeline", "LATAM"],
      requireTableSignal: true,
    },
    pdfAssertions: {
      expectedPages: 1,
      minimumTableBorderVisuals: 80,
      requiredTexts: ["Table heavy deck", "Region", "ARR", "Pipeline", "LATAM"],
      requireTableCellVisuals: true,
      requireTableText: true,
      requiredTableTexts: ["Region", "ARR", "Pipeline", "LATAM"],
      rasterTolerance: {
        maxMeanAbsoluteChannelDifference: 7,
        maxChannelDifference: 255,
        maxChangedPixelRatio: 0.06,
      },
    },
    createDeck: createTableHeavyDeck,
  },
];

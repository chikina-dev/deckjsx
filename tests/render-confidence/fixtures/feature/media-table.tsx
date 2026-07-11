/** @jsxImportSource deckjsx */
import { Deck } from "@/src/index.ts";
import type { RenderConfidenceDeck, RenderConfidenceFixture } from "../../types";

const pngData =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyAQMAAACQ++z9AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURSVj6////y1UwPwAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gYIBDIiDubyQgAAAA9JREFUKM9jYBgFo2BoAgACvAABbZIddAAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wNi0wOFQwNDo1MDozNCswMDowMFuMTQoAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDYtMDhUMDQ6NTA6MzQrMDA6MDAq0fW2AAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA2LTA4VDA0OjUwOjM0KzAwOjAwfcTUaQAAAABJRU5ErkJggg==";

function createMediaTableDeck(): RenderConfidenceDeck {
  const deck = new Deck({
    layout: { width: 10, height: 5.625, unit: "in" },
    templates: {
      report: {
        style: {
          display: "grid",
          gridTemplateColumns: "6.1in 2.3in",
          gridTemplateRows: "0.7in 3.8in",
          gridTemplateAreas: ['"title side"', '"body side"'],
          padding: 0.6,
          columnGap: 0.35,
        },
        areas: {
          title: { kind: "title", style: { gridArea: "title" } },
          body: { kind: "body", style: { gridArea: "body" } },
        },
      },
    },
  });

  deck.slide({ name: "Media and table", template: "report" }, ({ template }) => [
    <h1 area={template.title} style={{ fontSize: 25, color: "#0F172A" }}>
      Media table confidence
    </h1>,
    <p area={template.body} style={{ fontSize: 15, color: "#334155" }}>
      Template body text
    </p>,
    <img
      data={pngData}
      style={{
        position: "absolute",
        left: 0.75,
        top: 1.45,
        width: 2.8,
        height: 1.4,
        crop: { left: "10%", right: "20%", bottom: "30%" },
      }}
    />,
    <shape
      shape="rect"
      style={{
        position: "absolute",
        left: 4.1,
        top: 1.45,
        width: 2.5,
        height: 1.25,
        fill: "linear-gradient(45deg, #EF4444 0%, #F59E0B 100%)",
        stroke: "1pt solid #7C2D12",
        boxShadow: "6px 6px 10px rgba(37, 99, 235, 0.45)",
      }}
    />,
    <table
      style={{
        position: "absolute",
        left: 0.75,
        top: 3.2,
        width: 7.2,
        height: 1.2,
        tableLayout: "fixed",
      }}
    >
      <thead>
        <tr>
          <th>Segment</th>
          <th>Revenue</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Enterprise</td>
          <td>$420k</td>
          <td>Growing</td>
        </tr>
      </tbody>
    </table>,
  ]);

  return deck;
}

export const featureMediaTableFixtures: readonly RenderConfidenceFixture[] = [
  {
    name: "feature-media-table",
    group: "feature-media-table",
    artifactBaseName: "feature-media-table",
    description: "Image crop, media relationship, gradient/shadow shape, table, and template.",
    rasterPages: [{ page: 1, category: "imageCrop" }],
    assertions: {
      expectedSlides: 1,
      expectedImageCropSourceRects: ['<a:srcRect l="10000" r="20000" t="0" b="30000"/>'],
      requiredTexts: [
        "Media table confidence",
        "Template body text",
        "Segment",
        "Revenue",
        "Enterprise",
        "$420k",
      ],
      requireGradientFillSignal: true,
      requireImageCropSourceRectSignal: true,
      requireImageRelationship: true,
      requireShadowSignal: true,
      requireTableSignal: true,
      requireTemplateLayoutTopology: true,
    },
    pdfAssertions: {
      expectedPages: 1,
      requiredTexts: [
        "Media table confidence",
        "Template body text",
        "Segment",
        "Revenue",
        "Enterprise",
        "$420k",
      ],
      requireGradientResource: true,
      requireGradientVisual: true,
      requiredGradientVisuals: [
        {
          angle: 45,
          kind: "linear-gradient",
          stops: [
            { color: "#EF4444", offset: 0 },
            { color: "#F59E0B", offset: 1 },
          ],
        },
      ],
      requireImageClip: true,
      requireImageResource: true,
      requiredImageClipBoxes: [{ x: 507.6, y: 118.8, width: 201.6, height: 100.8 }],
      minimumShadowVisuals: 4,
      requireShadowVisual: true,
      requireTableText: true,
      requiredTableTexts: ["Segment", "Revenue", "Enterprise"],
      rasterTolerance: {
        maxMeanAbsoluteChannelDifference: 6,
        maxChannelDifference: 255,
        maxChangedPixelRatio: 0.04,
      },
    },
    createDeck: createMediaTableDeck,
  },
];

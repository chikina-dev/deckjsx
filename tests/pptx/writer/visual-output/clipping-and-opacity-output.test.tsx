import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer clipping and opacity output", () => {
  test("output preserves zIndex order, skips visibility hidden, and applies image opacity", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Visual controls" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5, zIndex: 10 }}>Front</p>
        <p style={{ x: 1, y: 1.6, width: 2, height: 0.5, zIndex: -1 }}>Back</p>
        <p style={{ x: 1, y: 2.2, width: 2, height: 0.5, zIndex: 1 }}>Middle</p>
        <p style={{ x: 1, y: 2.8, width: 2, height: 0.5, visibility: "hidden", zIndex: 100 }}>
          Hidden
        </p>
        <img
          data={H.SAMPLE_SVG_DATA_URI}
          style={{ x: 4, y: 1, width: 1.5, height: 1.5, opacity: 0.25 }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();

    const backIndex = slideXml!.indexOf(">Back<");
    const middleIndex = slideXml!.indexOf(">Middle<");
    const frontIndex = slideXml!.indexOf(">Front<");

    expect(backIndex).toBeGreaterThanOrEqual(0);
    expect(middleIndex).toBeGreaterThan(backIndex);
    expect(frontIndex).toBeGreaterThan(middleIndex);
    expect(slideXml).not.toContain(">Hidden<");
    expect(slideXml).toContain('<a:alphaModFix amt="25000"/>');
  });

  test("output omits fully clipped children for overflow hidden containers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Overflow hidden output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <p style={{ x: 0.5, y: 0.5, width: 4, height: 0.75, fontSize: 18 }}>Clip me</p>
          <p style={{ x: 3.5, y: 0.5, width: 1, height: 0.5, fontSize: 18 }}>Drop me</p>
        </div>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain(">Clip me<");
    expect(slideXml).not.toContain(">Drop me<");
  });

  test("output adjusts clipped image source rects for overflow hidden containers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Overflow hidden image output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <img
            data={H.WIDE_SVG_DATA_URI}
            style={{ x: -0.5, y: 0.5, width: 3, height: 1, fit: "stretch" }}
          />
        </div>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:srcRect l="16667" r="16667" t="0" b="0"/>');
  });

  test("output cascades group opacity to descendant text, image, and shape nodes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Opacity cascade" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 6, height: 3, opacity: 0.5, backgroundColor: "#E5E7EB" }}>
          <p style={{ x: 0.5, y: 0.5, width: 2, height: 0.75, color: "#FF0000" }}>Half text</p>
          <img
            data={H.SAMPLE_SVG_DATA_URI}
            style={{ x: 3, y: 0.5, width: 1.5, height: 1.5, opacity: 0.5 }}
          />
          <shape
            shape="rect"
            style={{ x: 0.5, y: 1.75, width: 1.5, height: 0.75, fill: "#2563EB" }}
          />
        </div>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:alpha val="50000"/>');
    expect(slideXml).toContain('<a:alphaModFix amt="25000"/>');
    expect(slideXml).toContain('<a:srgbClr val="2563EB"><a:alpha val="50000"/></a:srgbClr>');
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer image fit output", () => {
  test("output applies image fit, objectPosition, and crop controls", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " controls output" }, () => (
      <>
        <img
          data={H.WIDE_SVG_DATA_URI}
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            objectFit: "contain",
            objectPosition: "right bottom",
          }}
        />
        <img
          data={H.WIDE_SVG_DATA_URI}
          style={{
            x: 4,
            y: 1,
            width: 1,
            height: 2,
            objectFit: "cover",
            objectPosition: "right center",
          }}
        />
        <img
          data={H.WIDE_SVG_DATA_URI}
          style={{
            x: 6,
            y: 1,
            width: 2,
            height: 1,
            crop: { left: "10%", right: "20%", bottom: "40%" },
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-100000" b="0"/>');
    expect(slideXml).toContain('<a:srcRect l="75000" r="0" t="0" b="0"/>');
    expect(slideXml).toContain('<a:srcRect l="10000" r="20000" t="0" b="40000"/>');
  });

  test("output applies edge-offset and length-based objectPosition controls", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " position offsets output" }, () => (
      <>
        <img
          data={H.WIDE_SVG_DATA_URI}
          style={{
            x: 1,
            y: 1,
            width: 1,
            height: 2,
            objectFit: "cover",
            objectPosition: "right 25% bottom 10%",
          }}
        />
        <img
          data={H.WIDE_SVG_DATA_URI}
          style={{
            x: 3,
            y: 1,
            width: 2,
            height: 2,
            objectFit: "contain",
            objectPosition: "left 25% bottom 0.25in",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:srcRect l="56250" r="18750" t="0" b="0"/>');
    expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-87500" b="-12500"/>');
  });

  test("output emits gradient fill markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Gradient output",
        style: { background: "linear-gradient(90deg, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)" },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 3,
              height: 1.5,
              background: "linear-gradient(to bottom, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
            }}
          />
          <p
            style={{
              x: 1,
              y: 3,
              width: 3,
              height: 0.75,
              fontSize: 18,
              background: "linear-gradient(180deg, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
            }}
          >
            Gradient text
          </p>
          <shape
            shape="rect"
            style={{
              x: 5,
              y: 1,
              width: 2,
              height: 2,
              fill: "linear-gradient(45deg, #EF4444 0%, #F59E0B 100%)",
            }}
          />
        </>
      ),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain("<a:gradFill");
    expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(4);
    expect(slideXml).toContain('ang="5400000"');
    expect(slideXml).toContain('ang="10800000"');
    expect(slideXml).toContain('ang="2700000"');
    expect(slideXml).toContain('val="2563EB"');
    expect(slideXml).toContain('val="F97316"');
    expect(slideXml).toContain('val="22C55E"');
    expect(slideXml).toContain('val="0EA5E9"');
    expect(slideXml).toContain('val="EF4444"');
    expect(slideXml).toContain('val="F59E0B"');
  });
});

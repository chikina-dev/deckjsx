import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer stroke and shape output", () => {
  test("output emits shadow markup through the direct pptx writer", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Shadow output" }, () => (
      <>
        <p
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.75,
            textShadow: "4px 4px 8px rgba(37, 99, 235, 0.5)",
          }}
        >
          Shadow text
        </p>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 2,
            width: 2,
            height: 1,
            fill: "#F97316",
            boxShadow: "6px 6px 10px rgba(15, 23, 42, 0.35)",
          }}
        />
        <img
          data={H.SAMPLE_SVG_DATA_URI}
          style={{ x: 4, y: 1, width: 1.5, height: 1.5, boxShadow: "3px 3px 6px rebeccapurple" }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain("<a:outerShdw");
    expect(slideXml?.match(/<a:outerShdw/g)?.length).toBeGreaterThanOrEqual(3);
    expect(slideXml).toContain('val="2563EB"');
    expect(slideXml).toContain('val="0F172A"');
    expect(slideXml).toContain('val="663399"');
  });

  test("output emits shape strokeDasharray markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " stroke dasharray output" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "dodgerblue",
            strokeWidth: "3pt",
            strokeDasharray: "1 4",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:prstDash val="sysDot"/>');
    expect(slideXml).toContain('<a:srgbClr val="1E90FF"/>');
  });

  test("output emits shape stroke shorthand dash markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " stroke shorthand dash output" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "1pt dashed #2563EB",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:ln w="12700">');
    expect(slideXml).toContain('<a:srgbClr val="2563EB"/>');
    expect(slideXml).toContain('<a:prstDash val="dash"/>');
  });

  test("output emits shape stroke shorthand dotted markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " stroke shorthand dotted output" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "1pt dotted #2563EB",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:ln w="12700">');
    expect(slideXml).toContain('<a:srgbClr val="2563EB"/>');
    expect(slideXml).toContain('<a:prstDash val="sysDot"/>');
  });

  test("output emits strokeLinecap and strokeLinejoin markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " stroke cap and join output" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "dodgerblue",
            strokeWidth: "3pt",
            strokeLinecap: "square",
            strokeLinejoin: "bevel",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('cap="sq"');
    expect(slideXml).toContain("<a:bevel/>");
  });

  test("output emits projected border radius as rounded rectangle geometry", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Rounded geometry output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundColor: "#F8FAFC",
            borderRadius: 0.25,
          }}
        />
        <p
          style={{
            x: 3.5,
            y: 1,
            width: 2,
            height: 1,
            backgroundColor: "#E0F2FE",
            borderRadius: 0.125,
          }}
        >
          Rounded
        </p>
        <shape
          shape="rect"
          style={{ x: 6, y: 1, width: 2, height: 1, fill: "#DCFCE7", radius: 0.375 }}
        />
        <div
          style={{
            x: 1,
            y: 2.5,
            width: 2,
            height: 1,
            backgroundColor: "#FEE2E2",
            borderRadius: "50%",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");
    const shapeBlocks: string[] = slideXml?.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
    const viewBlock = shapeBlocks.find((block) => block.includes('val="F8FAFC"'));
    const textBlock = shapeBlocks.find((block) => block.includes('val="E0F2FE"'));
    const shapeBlock = shapeBlocks.find((block) => block.includes('val="DCFCE7"'));
    const capsuleBlock = shapeBlocks.find((block) => block.includes('val="FEE2E2"'));

    expect(viewBlock).toContain('<a:prstGeom prst="roundRect">');
    expect(viewBlock).toContain('<a:gd name="adj" fmla="val 25000"/>');
    expect(textBlock).toContain('<a:prstGeom prst="roundRect">');
    expect(textBlock).toContain('<a:gd name="adj" fmla="val 12500"/>');
    expect(shapeBlock).toContain('<a:prstGeom prst="roundRect">');
    expect(shapeBlock).toContain('<a:gd name="adj" fmla="val 37500"/>');
    expect(capsuleBlock).toContain('<a:prstGeom prst="roundRect">');
    expect(capsuleBlock).toContain('<a:gd name="adj" fmla="val 50000"/>');
  });

  test("output keeps XML fill and line patches aligned when generated shapes are interleaved", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Patch order output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            outline: "2pt solid #111111",
            borderTop: "3pt solid #222222",
            border: "2pt solid #1E90FF",
            background: "linear-gradient(90deg, #EF4444 0%, #F59E0B 100%)",
            strokeLinecap: "square",
            strokeLinejoin: "bevel",
          }}
        >
          <shape
            shape="rect"
            style={{
              x: 0.5,
              y: 0.5,
              width: 1,
              height: 0.75,
              fill: "linear-gradient(180deg, #22C55E 0%, #0EA5E9 100%)",
              stroke: "#9333EA",
              strokeWidth: "2pt",
              strokeLinecap: "round",
            }}
          />
        </div>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");
    const shapeBlocks: string[] = slideXml?.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
    const backgroundLayerBlock = shapeBlocks.find(
      (block) => block.includes('val="EF4444"') && block.includes('val="F59E0B"'),
    );
    const mainShapeBlock = shapeBlocks.find(
      (block) => block.includes('val="22C55E"') && block.includes('val="0EA5E9"'),
    );
    const outlineBlock = shapeBlocks.find((block) => block.includes('val="111111"'));
    const topEdgeBlock = shapeBlocks.find((block) => block.includes('val="222222"'));
    const viewStrokeBlock = shapeBlocks.find((block) => block.includes('val="1E90FF"'));
    const blockIndex = (block: string | undefined) => (block ? shapeBlocks.indexOf(block) : -1);

    expect(slideXml).toBeDefined();
    expect(backgroundLayerBlock).toBeDefined();
    expect(mainShapeBlock).toBeDefined();
    expect(outlineBlock).toBeDefined();
    expect(topEdgeBlock).toBeDefined();
    expect(viewStrokeBlock).toBeDefined();
    expect(shapeBlocks.filter((block) => block.includes('val="EF4444"'))).toHaveLength(1);
    expect(shapeBlocks.filter((block) => block.includes('val="111111"'))).toHaveLength(1);
    expect(shapeBlocks.filter((block) => block.includes('val="222222"'))).toHaveLength(1);
    expect(backgroundLayerBlock).toContain("<a:gradFill");
    expect(backgroundLayerBlock).not.toContain('cap="sq"');
    expect(mainShapeBlock).toContain("<a:gradFill");
    expect(mainShapeBlock).toContain('cap="rnd"');
    expect(viewStrokeBlock).toContain('cap="sq"');
    expect(viewStrokeBlock).toContain("<a:bevel/>");
    expect(outlineBlock).not.toContain('val="EF4444"');
    expect(topEdgeBlock).not.toContain('val="22C55E"');
    expect(blockIndex(backgroundLayerBlock)).toBeLessThan(blockIndex(topEdgeBlock));
    expect(blockIndex(topEdgeBlock)).toBeLessThan(blockIndex(viewStrokeBlock));
    expect(blockIndex(viewStrokeBlock)).toBeLessThan(blockIndex(outlineBlock));
    expect(blockIndex(outlineBlock)).toBeLessThan(blockIndex(mainShapeBlock));
  });
});

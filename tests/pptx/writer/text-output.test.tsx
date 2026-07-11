import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("direct pptx writer text output", () => {
  test("output emits styled span as rich text runs", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Rich text" }, () => (
      <>
        <p style={{ position: "absolute", left: 1, top: 1, width: 6, height: 1, fontSize: 20 }}>
          Sales <span style={{ color: "#DC2626", fontWeight: 700 }}>grew</span> YoY
        </p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml?.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(
      true,
    );
    expect(slideXml).toContain(
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
    );
    expect(slideXml).toContain("<a:t>Sales </a:t>");
    expect(slideXml).toContain("<a:t>grew</a:t>");
    expect(slideXml).toContain("<a:t> YoY</a:t>");
    expect(slideXml).toContain('val="DC2626"');
    expect(slideXml).toContain('b="1"');
  });

  test("output emits text direction, hyperlinks, and baseline variants", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " semantics output" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 0.75,
            direction: "rtl",
            href: "https://example.com/docs",
            tooltip: "Open docs",
          }}
        >
          RTL link
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 3,
            height: 0.75,
            superscript: true,
          }}
        >
          Super
        </p>
        <p
          style={{ position: "absolute", left: 1, top: 3, width: 3, height: 0.75, subscript: true }}
        >
          Sub
        </p>
        <img
          data={H.SAMPLE_SVG_DATA_URI}
          style={{
            position: "absolute",
            left: 5,
            top: 1,
            width: 1.5,
            height: 1.5,
            href: "https://example.com/image",
            tooltip: "Open image link",
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 5,
            top: 3,
            width: 2,
            height: 1,
            fill: "#2563EB",
            href: "https://example.com/shape",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");
    const relsXml = H.zipEntry(zip, "ppt/slides/_rels/slide1.xml.rels");

    expect(slideXml).toBeDefined();
    expect(relsXml).toBeDefined();
    expect(slideXml).toContain('rtl="1"');
    expect(slideXml).toContain('baseline="30000"');
    expect(slideXml).toContain('baseline="-40000"');
    expect(slideXml).toContain('tooltip="Open docs"');
    expect(slideXml).toContain('tooltip="Open image link"');
    expect(relsXml).toContain('Target="https://example.com/docs"');
    expect(relsXml).toContain('Target="https://example.com/image"');
    expect(relsXml).toContain('Target="https://example.com/shape"');
  });

  test("output emits bullet and numbered list markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "List output" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 0.25,
            width: 3,
            height: 0.5,
            listStyleType: "disc",
          }}
        >
          Disc item
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 0.75,
            listStyleType: "circle",
            listIndent: "18pt",
          }}
        >
          Bullet item
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 3,
            height: 0.75,
            listStyleType: "upper-roman",
            listStart: 3,
          }}
        >
          Number item
        </p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:buChar char="\u2022"/>');
    expect(slideXml).toContain('<a:buChar char="\u25E6"/>');
    expect(slideXml).toContain('marL="228600" indent="-228600"');
    expect(slideXml).toContain('<a:buAutoNum type="romanUcPeriod" startAt="3"/>');
  });

  test("output emits writingMode and underline style/color markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Typography aliases output" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 2,
            writingMode: "vertical-rl",
            textDecorationLine: "underline",
            textDecorationStyle: "wavy",
            textDecorationColor: "tomato",
          }}
        >
          Decorated
        </p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('vert="vert270"');
    expect(slideXml).toContain('u="wavy"');
    expect(slideXml).toContain(
      '<a:uFill><a:solidFill><a:srgbClr val="FF6347"/></a:solidFill></a:uFill>',
    );
  });

  test("output emits tab stop markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Tab stops output" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 1,
            tabStops: [
              { position: "36pt", alignment: "left" },
              { position: "1.5in", alignment: "center" },
              { position: "144px", alignment: "decimal" },
            ],
          }}
        >
          Alpha\tBeta\tGamma
        </p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain("<a:tabLst>");
    expect(slideXml).toContain('<a:tab pos="457200" algn="l"/>');
    expect(slideXml).toContain('<a:tab pos="1371600" algn="ctr"/>');
    expect(slideXml).toContain('<a:tab pos="1371600" algn="dec"/>');
  });

  test("output emits paragraph spacing markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Paragraph spacing output" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 0.75,
            lineHeight: "28pt",
          }}
        >
          Line spacing points
        </p>
        <p
          style={{ position: "absolute", left: 1, top: 2, width: 4, height: 0.75, lineHeight: 1.5 }}
        >
          Line spacing multiple
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 3,
            width: 4,
            height: 0.75,
            paragraphSpacingBefore: 12,
            paragraphSpacingAfter: 18,
          }}
        >
          Paragraph spacing
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 4,
            width: 4,
            height: 0.75,
            paragraphSpacingBefore: "24px",
            paragraphSpacingAfter: "0.5in",
          }}
        >
          CSS-like paragraph spacing
        </p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:lnSpc><a:spcPts val="2800"/></a:lnSpc>');
    expect(slideXml).toContain('<a:lnSpc><a:spcPct val="150000"/></a:lnSpc>');
    expect(slideXml).toContain('<a:spcBef><a:spcPts val="1200"/></a:spcBef>');
    expect(slideXml).toContain('<a:spcAft><a:spcPts val="1800"/></a:spcAft>');
    expect(slideXml).toContain('<a:spcBef><a:spcPts val="1800"/></a:spcBef>');
    expect(slideXml).toContain('<a:spcAft><a:spcPts val="3600"/></a:spcAft>');
  });

  test("output emits character spacing markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Character spacing output" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 0.75,
            fontSize: 18,
            letterSpacing: 1.5,
          }}
        >
          Spaced text
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 4,
            height: 0.75,
            fontSize: 18,
            letterSpacing: "2px",
          }}
        >
          Pixel spaced text
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 3,
            width: 4,
            height: 0.75,
            fontSize: 20,
            letterSpacing: "0.1em",
          }}
        >
          Em spaced text
        </p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('spc="150"');
    expect(slideXml).toContain('spc="200"');
  });

  test("output emits text fit and vertical alignment markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " fit align output" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 0.5,
            fontSize: 18,
            fit: "shrink",
          }}
        >
          Fit shrink
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 2,
            height: 0.5,
            fontSize: 18,
            fit: "resize",
          }}
        >
          Fit resize
        </p>
        <p
          style={{
            position: "absolute",
            left: 4,
            top: 1,
            width: 2,
            height: 1,
            fontSize: 18,
            verticalAlign: "middle",
          }}
        >
          Middle align
        </p>
        <p
          style={{
            position: "absolute",
            left: 4,
            top: 2.5,
            width: 2,
            height: 1,
            fontSize: 18,
            verticalAlign: "bottom",
          }}
        >
          Bottom align
        </p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain("<a:normAutofit/>");
    expect(slideXml).toContain("<a:spAutoFit/>");
    expect(slideXml).toContain('anchor="ctr"');
    expect(slideXml).toContain('anchor="b"');
  });

  test("output emits text padding as body insets", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " padding output" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 3,
            height: 1,
            fontSize: 18,
            padding: ["12pt", "12pt", "6pt", "6pt"],
          }}
        >
          Padded text
        </p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('lIns="76200"');
    expect(slideXml).toContain('tIns="152400"');
    expect(slideXml).toContain('rIns="152400"');
    expect(slideXml).toContain('bIns="76200"');
  });

  test("output explicitly clears default PowerPoint text body insets", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "zero text padding output" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 1 }}>Unpadded text</p>
    ));

    const content = await H.renderDeckBytes(deck);
    const slideXml = H.zipEntry(H.unzipSync(content), "ppt/slides/slide1.xml");

    expect(slideXml).toContain('tIns="0"');
    expect(slideXml).toContain('rIns="0"');
    expect(slideXml).toContain('bIns="0"');
    expect(slideXml).toContain('lIns="0"');
  });

  test("output maps CSS textAlign values to PPTX paragraph alignment values", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " align output" }, () => (
      <>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 0.5,
            fontSize: 18,
            textAlign: "center",
          }}
        >
          Center
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2,
            width: 2,
            height: 0.5,
            fontSize: 18,
            textAlign: "right",
          }}
        >
          Right
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 3,
            width: 2,
            height: 0.5,
            fontSize: 18,
            textAlign: "justify",
          }}
        >
          Justify
        </p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('algn="ctr"');
    expect(slideXml).toContain('algn="r"');
    expect(slideXml).toContain('algn="just"');
    expect(slideXml).not.toContain('algn="center"');
    expect(slideXml).not.toContain('algn="right"');
    expect(slideXml).not.toContain('algn="justify"');
  });

  test("output emits textIndent markup for plain and list paragraphs", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " indent output" }, () => (
      <>
        <p
          style={{ position: "absolute", left: 1, top: 1, width: 4, height: 1, textIndent: "36pt" }}
        >
          Plain indent
        </p>
        <p
          style={{
            position: "absolute",
            left: 1,
            top: 2.25,
            width: 4,
            height: 1,
            listStyleType: "circle",
            listIndent: "18pt",
            textIndent: "18pt",
          }}
        >
          List indent
        </p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('indent="457200" marL="0"');
    expect(slideXml).toContain('<a:buChar char="\u25E6"/>');
    expect(slideXml).toContain('marL="228600" indent="0"');
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer transform and gradient output", () => {
  test("output emits background shorthand gradient layer color fallback markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background shorthand gradient fallback output" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background:
              "linear-gradient(180deg, #111111 0in, #333333 1in) #AAAAAA padding-box content-box",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
    expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
    expect(slideXml).toContain('val="AAAAAA"');
    expect(slideXml).toContain('<a:gs pos="50174">');
  });

  test("output emits per-layer backgroundOrigin and backgroundClip list markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background layer boxes output" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background:
              "linear-gradient(180deg, #111111 0in, #333333 1in), linear-gradient(180deg, #AAAAAA 0in, #CCCCCC 1in)",
            backgroundOrigin: "padding-box, border-box",
            backgroundClip: "content-box, padding-box",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(2);
    expect(slideXml).toContain('<a:off x="917575" y="917575"/>');
    expect(slideXml).toContain('<a:ext cx="3651250" cy="1822450"/>');
    expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
    expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
    expect(slideXml).toContain('<a:gs pos="50000">');
    expect(slideXml).toContain('<a:gs pos="50174">');
  });

  test("output emits transformOrigin-adjusted markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Transform origin output" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            backgroundColor: "#D1D5DB",
            transformOrigin: "left top",
            transform: "scale(2, 0.5)",
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 4,
            top: 1,
            width: 2,
            height: 1,
            fill: "#2563EB",
            transformOrigin: "left top",
            transform: "rotate(90deg)",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
    expect(slideXml).toContain('<a:ext cx="3657600" cy="457200"/>');
    expect(slideXml).toContain('<a:off x="3200400" y="-457200"/>');
    expect(slideXml).toContain('<a:ext cx="1828800" cy="914400"/>');
    expect(slideXml).toContain('rot="5400000"');
  });

  test("output emits skew-adjusted bounding box markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Skew output" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            backgroundColor: "#D1D5DB",
            transformOrigin: "left top",
            transform: "skewX(45deg)",
          }}
        />
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 4,
            top: 1,
            width: 1,
            height: 1,
            fill: "#2563EB",
            transformOrigin: "left top",
            transform: "skewY(45deg)",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
    expect(slideXml).toContain('<a:ext cx="2743200" cy="914400"/>');
    expect(slideXml).toContain('<a:off x="3657600" y="914400"/>');
    expect(slideXml).toContain('<a:ext cx="914400" cy="1828800"/>');
  });

  test("output emits matrix-adjusted bounding box markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Matrix output" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            backgroundColor: "#D1D5DB",
            transformOrigin: "left top",
            transform: "matrix(1, 0.5, 0.25, 1, 96, 48)",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="1828800" y="1371600"/>');
    expect(slideXml).toContain('<a:ext cx="2057400" cy="1828800"/>');
  });

  test("output emits radial-gradient fill markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Radial output",
        style: {
          background:
            "radial-gradient(ellipse 20% 30% at 25% 75%, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)",
        },
      },
      () => (
        <>
          <div
            style={{
              position: "absolute",
              left: 1,
              top: 1,
              width: 2,
              height: 2,
              background:
                "radial-gradient(circle closest-side at 75% 25%, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
            }}
          />
          <p
            style={{
              position: "absolute",
              left: 1,
              top: 3,
              width: 3,
              height: 0.75,
              fontSize: 18,
              background:
                "radial-gradient(ellipse farthest-side at center, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
            }}
          >
            Radial text
          </p>
          <shape
            shape="rect"
            style={{
              position: "absolute",
              left: 5,
              top: 1,
              width: 2,
              height: 2,
              background: "radial-gradient(circle 40% at 20% 30%, #EF4444 0%, #F59E0B 100%)",
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
    expect(slideXml).toContain('<a:path path="circle">');
    expect(slideXml?.match(/<a:path path="circle">/g)?.length).toBeGreaterThanOrEqual(4);
    expect(slideXml).toContain('fillToRect l="5000" t="45000" r="55000" b="-5000"');
    expect(slideXml).toContain('fillToRect l="50000" t="0" r="0" b="50000"');
    expect(slideXml).toContain('fillToRect l="0" t="0" r="0" b="0"');
    expect(slideXml).toContain('fillToRect l="-20000" t="-10000" r="40000" b="30000"');
    expect(slideXml).toContain('val="2563EB"');
    expect(slideXml).toContain('val="0EA5E9"');
    expect(slideXml).toContain('val="0F172A"');
    expect(slideXml).toContain('val="EF4444"');
  });

  test("output emits repeating gradient fill markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Repeating output",
        style: {
          background: "repeating-linear-gradient(90deg, #111111 0%, #EEEEEE 25%, #111111 50%)",
        },
      },
      () => (
        <>
          <div
            style={{
              position: "absolute",
              left: 1,
              top: 1,
              width: 2,
              height: 2,
              background:
                "repeating-radial-gradient(circle 40% at center, #EF4444 0%, #F59E0B 20%, #EF4444 40%)",
            }}
          />
        </>
      ),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<a:gs pos="/g)?.length).toBeGreaterThanOrEqual(10);
    expect(slideXml).toContain('pos="75000"');
    expect(slideXml).toContain('val="EEEEEE"');
    expect(slideXml).toContain('val="F59E0B"');
    expect(slideXml).toContain('<a:path path="circle">');
  });

  test("output emits length-based gradient stop positions", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Length stop output" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            background: "linear-gradient(90deg, #111111 0in, #777777 1in, #EEEEEE 2in)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 1,
            width: 2,
            height: 2,
            background:
              "radial-gradient(circle 40% at center, #EF4444 0in, #F59E0B 0.4in, #FDE68A 0.8in)",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('pos="50000"');
    expect(slideXml).toContain('val="777777"');
    expect(slideXml).toContain('val="F59E0B"');
    expect(slideXml).toContain('val="FDE68A"');
  });

  test("output emits multi-position stops and color hints", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Gradient hints output" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            background: "linear-gradient(90deg, #FF0000 0 50%, 75%, #0000FF 100%)",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('pos="50000"');
    expect(slideXml).toContain('pos="75000"');
    expect(slideXml).toContain('val="800080"');
    expect(slideXml?.match(/val="FF0000"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("output emits multiple background layer markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Multiple background output",
        style: {
          background:
            "linear-gradient(90deg, #FF0000 0%, #00FF00 100%), linear-gradient(180deg, #0000FF 0%, #FFFFFF 100%)",
        },
      },
      () => (
        <>
          <div
            style={{
              position: "absolute",
              left: 1,
              top: 1,
              width: 2,
              height: 1.25,
              background:
                "linear-gradient(45deg, #123456 0%, #654321 100%), linear-gradient(180deg, #ABCDEF 0%, #FEDCBA 100%)",
            }}
          />
        </>
      ),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(4);
    expect(slideXml).toContain('ang="5400000"');
    expect(slideXml).toContain('ang="10800000"');
    expect(slideXml).toContain('ang="2700000"');
    expect(slideXml).toContain('val="FF0000"');
    expect(slideXml).toContain('val="00FF00"');
    expect(slideXml).toContain('val="0000FF"');
    expect(slideXml).toContain('val="123456"');
    expect(slideXml).toContain('val="ABCDEF"');
    expect(slideXml).toContain('val="FEDCBA"');
  });

  test("output emits transform translation, scale, rotation, and flip markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Transform output" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 1,
            fill: "#2563EB",
            transform: "translate(1in, 0.5in) rotate(15deg) scale(2, 1.5) scale(-1, -1)",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('rot="900000"');
    expect(slideXml).toContain('flipH="1"');
    expect(slideXml).toContain('flipV="1"');
    expect(slideXml).toContain('<a:off x="914400" y="1143000"/>');
    expect(slideXml).toContain('<a:ext cx="3657600" cy="1371600"/>');
  });
});

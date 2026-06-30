import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer background layer output", () => {
  test("output emits background gradient markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Background image output",
        style: { background: "linear-gradient(90deg, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)" },
      },
      () => (
        <>
          <div
            style={{
              position: "absolute",
              left: 1,
              top: 1,
              width: 3,
              height: 1.5,
              background: "linear-gradient(to bottom, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
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
              background: "linear-gradient(180deg, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
            }}
          >
            Background image text
          </p>
          <shape
            shape="rect"
            style={{
              position: "absolute",
              left: 5,
              top: 1,
              width: 2,
              height: 2,
              background: "linear-gradient(45deg, #EF4444 0%, #F59E0B 100%)",
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
    expect(slideXml).toContain('val="2563EB"');
    expect(slideXml).toContain('val="22C55E"');
    expect(slideXml).toContain('val="0F172A"');
    expect(slideXml).toContain('val="EF4444"');
  });

  test("output emits background image layer markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Background image layer output",
        style: {
          background: `url("${H.WIDE_SVG_DATA_URI}"), linear-gradient(180deg, #111111 0%, #333333 100%)`,
          backgroundSize: "contain, 100% 100%",
          backgroundPosition: "right bottom, center",
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
              background: `url("${H.WIDE_SVG_DATA_URI}")`,
              backgroundSize: "cover",
              backgroundPosition: "right center",
            }}
          />
        </>
      ),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<p:pic>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-12500" b="0"/>');
    expect(slideXml).toContain('<a:srcRect l="50000" r="0" t="0" b="0"/>');
    expect(slideXml).toContain('val="111111"');
    expect(slideXml).toContain('val="333333"');
  });

  test("output emits repeated background image layer markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background repeat output" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 2,
            height: 2,
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-y",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 1,
            width: 2,
            height: 1,
            background: `url("${H.SAMPLE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-x",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<p:pic>/g)?.length).toBeGreaterThanOrEqual(4);
    expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
    expect(slideXml).toContain('<a:off x="914400" y="1828800"/>');
    expect(slideXml).toContain('<a:off x="3657600" y="914400"/>');
    expect(slideXml).toContain('<a:off x="4572000" y="914400"/>');
  });

  test("output emits background shorthand image layer markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Background shorthand image layer output",
        style: {
          background: `url("${H.WIDE_SVG_DATA_URI}") no-repeat right bottom / contain, linear-gradient(180deg, #111111 0%, #333333 100%)`,
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
              height: 1,
              background: `url("${H.SAMPLE_SVG_DATA_URI}") repeat-x left top / contain`,
            }}
          />
        </>
      ),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<p:pic>/g)?.length).toBeGreaterThanOrEqual(3);
    expect(slideXml).toContain('val="111111"');
    expect(slideXml).toContain('val="333333"');
    expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-12500" b="0"/>');
    expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
    expect(slideXml).toContain('<a:off x="1828800" y="914400"/>');
  });

  test("output emits explicit backgroundSize image layer markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Explicit background size output" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 2,
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
            backgroundSize: "50% auto",
            backgroundPosition: "right bottom",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 3.5,
            width: 4,
            height: 1.5,
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto 50%",
            backgroundPosition: "left top",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="2743200" y="1828800"/>');
    expect(slideXml).toContain('<a:ext cx="1828800" cy="914400"/>');
    expect(slideXml).toContain('<a:off x="914400" y="3200400"/>');
    expect(slideXml).toContain('<a:ext cx="1371600" cy="685800"/>');
  });

  test("output emits intrinsic auto backgroundSize image layer markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Auto background size output" }, () => (
      <>
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            width: 4,
            height: 2,
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto auto",
            backgroundPosition: "right bottom",
          }}
        />
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="3619500" y="2266950"/>');
    expect(slideXml).toContain('<a:ext cx="952500" cy="476250"/>');
  });

  test("output emits backgroundClip image layer markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background clip output" }, () => (
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
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundClip: "content-box",
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
    expect(slideXml).toContain(
      '<a:srcRect l="12587" r="12587" t="25174" b="25174"/><a:stretch><a:fillRect/></a:stretch>',
    );
  });

  test("output emits backgroundOrigin image layer markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background origin output" }, () => (
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
            background: `url("${H.WIDE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
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
    expect(slideXml).toContain(
      '<a:srcRect l="12522" r="12522" t="25087" b="25087"/><a:stretch><a:fillRect/></a:stretch>',
    );
  });

  test("output emits background shorthand visual-box image layer markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background shorthand boxes output" }, () => (
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
            background: `url("${H.WIDE_SVG_DATA_URI}") no-repeat padding-box content-box / 100% 100%`,
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
    expect(slideXml).toContain(
      '<a:srcRect l="12522" r="12522" t="25087" b="25087"/><a:stretch><a:fillRect/></a:stretch>',
    );
  });

  test("output emits backgroundClip gradient fill markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background clip gradient output" }, () => (
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
            background: "linear-gradient(180deg, #111111 0%, #333333 100%)",
            backgroundClip: "content-box",
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
    expect(slideXml).toContain('val="111111"');
    expect(slideXml).toContain('val="333333"');
  });

  test("output emits backgroundOrigin gradient fill markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background origin gradient output" }, () => (
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
            background: "linear-gradient(180deg, #111111 0in, #333333 1in)",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
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
    expect(slideXml).toContain('<a:gs pos="50174">');
  });

  test("output emits background shorthand visual-box gradient fill markup", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background shorthand gradient boxes output" }, () => (
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
            background: "linear-gradient(180deg, #111111 0in, #333333 1in) padding-box content-box",
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
    expect(slideXml).toContain('<a:gs pos="50174">');
  });
});

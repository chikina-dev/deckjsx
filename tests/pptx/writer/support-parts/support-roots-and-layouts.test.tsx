import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer support roots and layouts", () => {
  test("render returns real pptx artifact bytes through the writer", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Artifact output" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Hello PPTX</p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    expect(content.subarray(0, 2).toString()).toBe("80,75");
  });

  test("output emits required support parts with deterministic roots", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Support parts" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support</p>
      </>
    ));

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const themeXml = H.zipEntry(zip, "ppt/theme/theme1.xml");
    const masterXml = H.zipEntry(zip, "ppt/slideMasters/slideMaster1.xml");
    const masterRelsXml = H.zipEntry(zip, "ppt/slideMasters/_rels/slideMaster1.xml.rels");
    const layoutXml = H.zipEntry(zip, "ppt/slideLayouts/slideLayout1.xml");
    const layoutRelsXml = H.zipEntry(zip, "ppt/slideLayouts/_rels/slideLayout1.xml.rels");

    expect(themeXml?.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(
      true,
    );
    expect(themeXml).toContain(
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="deckjsx">',
    );
    expect(themeXml).toContain('<a:accent1><a:srgbClr val="2563EB"/></a:accent1>');
    expect(masterXml).toContain(
      '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
    );
    expect(masterXml).toContain('<p:sldLayoutId id="2147483649" r:id="rId1"/>');
    expect(masterRelsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"',
    );
    expect(masterRelsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"',
    );
    expect(layoutXml).toContain(
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">',
    );
    expect(layoutXml).toContain('<p:cSld name="Blank">');
    expect(layoutRelsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"',
    );
  });

  test("output serializes slide master and layout support payloads", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Support payloads" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support payloads</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.kind === "slide-master") {
            const payload = part.payload as Extract<
              H.PptxSupportPartPayload,
              { readonly kind: "slide-master" }
            >;
            return {
              ...part,
              payload: {
                ...payload,
                colorMap: { ...payload.colorMap, bg1: "accent2", tx1: "accent3" },
              } satisfies H.PptxSupportPartPayload,
            };
          }

          if (part.path === "ppt/slideLayouts/slideLayout1.xml") {
            const payload = part.payload as Extract<
              H.PptxSupportPartPayload,
              { readonly kind: "slide-layout" }
            >;
            return {
              ...part,
              payload: { ...payload, name: "Payload Blank" } satisfies H.PptxSupportPartPayload,
            };
          }

          return part;
        }),
      }),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const masterXml = H.zipEntry(zip, "ppt/slideMasters/slideMaster1.xml");
    const layoutXml = H.zipEntry(zip, "ppt/slideLayouts/slideLayout1.xml");

    expect(masterXml).toContain('bg1="accent2"');
    expect(masterXml).toContain('tx1="accent3"');
    expect(layoutXml).toContain('<p:cSld name="Payload Blank">');
  });

  test("support XML emitters reject malformed theme, master, and layout payloads", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Support payload validation" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support payloads</p>
    ));

    const projection = (await deck.project()).projection!;
    const supportParts = [
      { kind: "theme", message: "Theme support parts must carry a structured theme payload." },
      {
        kind: "slide-master",
        message: "Slide master support parts must carry a structured slide-master payload.",
      },
      {
        kind: "slide-layout",
        message: "Slide layout support parts must carry a structured slide-layout payload.",
      },
    ] as const;

    supportParts.forEach(({ kind, message }) => {
      const part = projection.parts.find((candidate) => candidate.kind === kind);
      expect(part).toBeDefined();
      expect(() =>
        H.emitPartBytes(
          { ...part!, payload: { kind: "malformed-support-payload" } } as H.PptxPackagePart,
          projection,
          { slideBytes: () => new Uint8Array() },
        ),
      ).toThrow(message);
    });
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer presentation and properties", () => {
  test("support XML emitters reject malformed presentation and property payloads", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Support property validation" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support properties</p>
    ));

    const projection = (await deck.project()).projection!;
    const supportParts = [
      {
        path: "ppt/presentation.xml",
        message: "Presentation support parts must carry a structured presentation payload.",
      },
      {
        path: "docProps/core.xml",
        message: "Core document properties parts must carry a structured core properties payload.",
      },
      {
        path: "docProps/app.xml",
        message:
          "Extended document properties parts must carry a structured extended properties payload.",
      },
      {
        path: "ppt/viewProps.xml",
        message: "view-properties parts must carry a structured view-properties payload.",
      },
      {
        path: "ppt/presProps.xml",
        message:
          "presentation-properties parts must carry a structured presentation-properties payload.",
      },
    ] as const;

    supportParts.forEach(({ path, message }) => {
      const part = projection.parts.find((candidate) => candidate.path === path);
      expect(part).toBeDefined();
      expect(() =>
        H.emitPartBytes(
          { ...part!, payload: { kind: "malformed-support-payload" } } as H.PptxPackagePart,
          projection,
          { slideBytes: () => new Uint8Array() },
        ),
      ).toThrow(message);
    });

    const corePropertiesPart = projection.parts.find(
      (candidate) => candidate.path === "docProps/core.xml",
    );
    expect(corePropertiesPart).toBeDefined();
    expect(() =>
      H.emitPartBytes(
        {
          ...corePropertiesPart!,
          payload: {
            ...H.coreDocumentPropertiesPayload(corePropertiesPart),
            meta: undefined as never,
          } as H.PptxPackagePart["payload"],
        },
        projection,
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow("Core document properties parts must carry projected core metadata.");
  });

  test("presentation XML emitter requires a structured presentation payload", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Presentation support part" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Presentation</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = projection.parts.find((part) => part.path === "ppt/presentation.xml");
    expect(presentationPart).toBeDefined();

    expect(() =>
      H.emitPartBytes({ ...presentationPart!, payload: undefined }, projection, {
        slideBytes: () => new Uint8Array(),
      }),
    ).toThrow("Presentation support parts must carry a structured presentation payload.");
  });

  test("presentation XML emitter rejects missing projected size values", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Presentation size validation" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Size</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = projection.parts.find((part) => part.path === "ppt/presentation.xml");
    expect(presentationPart).toBeDefined();

    const payload = presentationPart!.payload as Extract<
      H.PptxSupportPartPayload,
      { readonly kind: "presentation" }
    >;

    expect(() =>
      H.emitPartBytes(
        {
          ...presentationPart!,
          payload: { ...payload, size: { ...payload.size, widthEmu: undefined } },
        } as H.PptxPackagePart,
        projection,
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow("PPTX support XML requires finite presentation.size.widthEmu.");
  });

  test("output serializes document properties from structured support payloads", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      meta: { title: "Initial title", subject: "Initial subject", author: "Initial author" },
    });

    deck.slide({ name: "Doc props 1" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>One</p>
    ));
    deck.slide({ name: "Doc props 2" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Two</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        meta: {
          title: "Ignored top-level title",
          subject: "Ignored top-level subject",
          author: "Ignored top-level author",
        },
        parts: projection.parts.map((part) => {
          if (part.path === "docProps/core.xml") {
            return {
              ...part,
              payload: {
                kind: "document-properties",
                propertyKind: "core",
                editable: true,
                source: "deckjsx-meta",
                meta: {
                  title: "Payload title",
                  subject: "Payload subject",
                  author: "Payload author",
                },
              } satisfies H.PptxSupportPartPayload,
            };
          }

          if (part.path === "docProps/app.xml") {
            return {
              ...part,
              payload: {
                kind: "document-properties",
                propertyKind: "extended",
                editable: true,
                source: "deckjsx-projection",
                application: "deckjsx",
                slideCount: 2,
              } satisfies H.PptxSupportPartPayload,
            };
          }

          return part;
        }),
      }),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const coreXml = H.zipEntry(zip, "docProps/core.xml");
    const appXml = H.zipEntry(zip, "docProps/app.xml");

    expect(coreXml).toContain("<dc:title>Payload title</dc:title>");
    expect(coreXml).toContain("<dc:subject>Payload subject</dc:subject>");
    expect(coreXml).toContain("<dc:creator>Payload author</dc:creator>");
    expect(coreXml).not.toContain("Ignored top-level title");
    expect(appXml).toContain("<Application>deckjsx</Application>");
    expect(appXml).toContain("<Slides>2</Slides>");
  });

  test("output serializes presentation XML from structured support payload", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Presentation payload 1" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>One</p>
    ));
    deck.slide({ name: "Presentation payload 2" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Two</p>
    ));

    const projection = (await deck.project()).projection!;
    const secondSlide = {
      ...projection.slides[1]!,
      payload: { ...projection.slides[1]!.payload, slideId: "333" },
    } satisfies H.PptxSlidePart;

    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === secondSlide.id ? secondSlide : slide,
        ),
        size: { widthEmu: 111111, heightEmu: 222222 },
        parts: projection.parts.map((part) => {
          if (part.id === secondSlide.id) {
            return secondSlide;
          }

          if (part.kind === "presentation") {
            return {
              ...part,
              payload: {
                kind: "presentation",
                size: { widthEmu: 333333, heightEmu: 444444 },
                slideMasterIds: (
                  part.payload as Extract<
                    H.PptxSupportPartPayload,
                    { readonly kind: "presentation" }
                  >
                ).slideMasterIds,
                defaultTextStyle: (
                  part.payload as Extract<
                    H.PptxSupportPartPayload,
                    { readonly kind: "presentation" }
                  >
                ).defaultTextStyle,
                slidePartIds: [secondSlide.id],
              } satisfies H.PptxSupportPartPayload,
            };
          }

          if (part.path === "docProps/app.xml") {
            return {
              ...part,
              payload: {
                ...H.extendedDocumentPropertiesPayload(part),
                slideCount: 1,
              } satisfies H.PptxSupportPartPayload,
            };
          }

          return part;
        }),
      }),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const presentationXml = H.zipEntry(zip, "ppt/presentation.xml");

    expect(presentationXml).toContain('<p:sldId id="333"');
    expect(presentationXml).not.toContain('<p:sldId id="256"');
    expect(presentationXml).not.toContain('<p:sldId id="257"');
    expect(presentationXml).toContain('cx="333333"');
    expect(presentationXml).toContain('cy="444444"');
    expect(presentationXml).not.toContain('cx="111111"');
    expect(presentationXml).not.toContain('cy="222222"');
    expect(presentationXml).toContain("<p:defaultTextStyle>");
    expect(presentationXml).not.toContain('lang="ja-JP"');
  });

  test("output serializes empty support property payload roots", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Support property payload" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support properties</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.kind === "view-properties") {
            return {
              ...part,
              payload: {
                kind: "view-properties",
                editable: true,
                settings: {},
              } satisfies H.PptxSupportPartPayload,
            };
          }

          if (part.kind === "presentation-properties") {
            return {
              ...part,
              payload: {
                kind: "presentation-properties",
                editable: true,
                settings: {},
              } satisfies H.PptxSupportPartPayload,
            };
          }

          return part;
        }),
      }),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const viewPropsXml = H.zipEntry(zip, "ppt/viewProps.xml");
    const presPropsXml = H.zipEntry(zip, "ppt/presProps.xml");

    expect(viewPropsXml).toContain("<p:viewPr");
    expect(viewPropsXml).toContain(
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
    );
    expect(presPropsXml).toContain("<p:presentationPr");
    expect(presPropsXml).not.toContain("<p:viewPr");
  });
});

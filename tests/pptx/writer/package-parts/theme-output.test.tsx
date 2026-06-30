import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer theme output", () => {
  test("output serializes structured theme payload from a defined projection", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Theme payload" }, () => <></>);
    const projection = (await deck.project()).projection!;
    const themePart = projection.parts.find((part) => part.kind === "theme");
    const themePayload = themePart?.payload as H.PptxThemePartPayload | undefined;

    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.kind === "theme" && themePayload
            ? {
                ...part,
                payload: {
                  ...themePayload,
                  name: "custom-deckjsx-theme",
                  colorScheme: {
                    ...themePayload.colorScheme,
                    name: "custom-colors",
                    colors: { ...themePayload.colorScheme.colors, accent1: "123456" },
                  },
                  fontScheme: {
                    name: "custom-fonts",
                    majorLatin: "Inter Display",
                    minorLatin: "Inter",
                  },
                  formatScheme: { name: "custom-format" },
                } satisfies H.PptxThemePartPayload,
              }
            : part,
        ),
      }),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const themeXml = H.zipEntry(zip, "ppt/theme/theme1.xml");

    expect(themeXml).toContain('name="custom-deckjsx-theme"');
    expect(themeXml).toContain('<a:clrScheme name="custom-colors">');
    expect(themeXml).toContain('<a:accent1><a:srgbClr val="123456"/></a:accent1>');
    expect(themeXml).toContain('<a:fontScheme name="custom-fonts">');
    expect(themeXml).toContain('<a:latin typeface="Inter Display"/>');
    expect(themeXml).toContain('<a:latin typeface="Inter"/>');
    expect(themeXml).toContain('<a:fmtScheme name="custom-format">');
  });

  test("theme XML emitter rejects incomplete theme scheme payloads", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Theme payload validation" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const themePart = projection.parts.find((part) => part.kind === "theme");
    const themePayload = themePart?.payload as H.PptxThemePartPayload | undefined;

    expect(themePart).toBeDefined();
    expect(themePayload).toBeDefined();

    const { accent1: _accent1, ...colorsWithoutAccent1 } = themePayload!.colorScheme.colors;
    const malformedPayloads = [
      {
        payload: {
          ...themePayload!,
          colorScheme: { ...themePayload!.colorScheme, colors: colorsWithoutAccent1 },
        },
        message: "Theme support payload must include valid colorScheme.colors.accent1.",
      },
      {
        payload: {
          ...themePayload!,
          colorScheme: {
            ...themePayload!.colorScheme,
            colors: { ...themePayload!.colorScheme.colors, accent2: "#123456" },
          },
        },
        message: "Theme support payload must include valid colorScheme.colors.accent2.",
      },
      {
        payload: { ...themePayload!, fontScheme: { ...themePayload!.fontScheme, majorLatin: "" } },
        message: "Theme support payload must include fontScheme.majorLatin.",
      },
      {
        payload: { ...themePayload!, formatScheme: { ...themePayload!.formatScheme, name: "" } },
        message: "Theme support payload must include formatScheme.name.",
      },
    ] as const;

    malformedPayloads.forEach(({ payload, message }) => {
      expect(() =>
        H.emitPartBytes({ ...themePart!, payload } as H.PptxPackagePart, projection, {
          slideBytes: () => new Uint8Array(),
        }),
      ).toThrow(message);
    });
  });

  test("output follows theme projection reference serialization choices", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new H.Theme({ defaults: { p: { color: "#2563EB", fontFamily: "Aptos" } } }),
    });

    deck.slide({ name: "Theme reference serialization" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>
        Theme reference
      </p>
    ));

    const project = await deck.project();
    const themePayload = project.projection?.parts.find((part) => part.kind === "theme")
      ?.payload as H.PptxThemePartPayload | undefined;

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");

    expect(project.ok).toBe(true);
    expect(themePayload?.projection.trace.referenceSerialization).toContainEqual(
      expect.objectContaining({
        property: "color",
        currentSerialization: "srgbClr",
        decision: "deferThemeReferenceSerialization",
        candidate: expect.objectContaining({ kind: "schemeColor", value: "accent1" }),
      }),
    );
    expect(slideXml).toContain('<a:srgbClr val="2563EB"/>');
    expect(slideXml).toContain('<a:latin typeface="Aptos"/>');
    expect(slideXml).not.toContain('<a:schemeClr val="accent1"');
  });
});

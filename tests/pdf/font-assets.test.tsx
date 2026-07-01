import { describe, expect, test } from "vite-plus/test";
import { integrationContextId, type DeckPlugin } from "@/src/integration";
import type { PdfPageModel } from "@/src/projection/pdf/model";
import { Deck } from "@/tests/helpers";

const fontBytes = new Uint8Array([0, 1, 0, 0]);

function expectPdfPageModel(value: unknown): PdfPageModel {
  expect(value).toMatchObject({ format: "pdf" });
  return value as PdfPageModel;
}

describe("PDF font asset registration", () => {
  test("registered plugin font asset is projected without a PDF font fallback warning", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:inter-font",
      name: "test:inter-font",
      integration: {
        id: integrationContextId("test:inter-font"),
        fontAssets: [
          {
            key: "inter-regular",
            family: "Inter",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Registered Font" }, () => (
      <p style={{ fontFamily: "Inter", fontWeight: 400 }}>Hello</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Inter",
        fallback: false,
        sourceKey: "inter-regular",
        weight: 400,
        style: "normal",
      }),
    );
  });

  test("registered plugin font resource names cannot collide with default PDF font names", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:colliding-font-key",
      name: "test:colliding-font-key",
      integration: {
        id: integrationContextId("test:colliding-font-key"),
        fontAssets: [
          {
            key: "F1",
            family: "Inter",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Colliding Font Key" }, () => (
      <>
        <p>Default text</p>
        <p style={{ fontFamily: "Inter", fontWeight: 400 }}>Registered text</p>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const pageFontNames = projection.resources.fonts
      .filter((font) => projection.pages[0]?.resources.fonts.includes(font.id))
      .map((font) => font.name);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_MODEL_DUPLICATE_PAGE_FONT_RESOURCE_NAME",
    );
    expect(new Set(pageFontNames).size).toBe(pageFontNames.length);
    expect(pageFontNames).toEqual(["F1", "F2"]);
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Inter",
        name: "F2",
        sourceKey: "F1",
      }),
    );
  });

  test("registered plugin font resource ids do not collide with default or fallback-shaped keys", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:font-id-collisions",
      name: "test:font-id-collisions",
      integration: {
        id: integrationContextId("test:font-id-collisions"),
        fontAssets: [
          {
            key: "default-helvetica",
            family: "Inter",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
          {
            key: "fallback-missing-sans-700-normal",
            family: "Source Sans",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Font Id Collisions" }, () => (
      <>
        <p>Default text</p>
        <p style={{ fontFamily: "Inter" }}>Registered default-shaped key</p>
        <p style={{ fontFamily: "Source Sans" }}>Registered fallback-shaped key</p>
        <p style={{ fontFamily: "Missing Sans", fontWeight: 700 }}>Missing fallback</p>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const fontIds = projection.resources.fonts.map((font) => font.id);

    expect(result.ok).toBe(true);
    expect(new Set(fontIds).size).toBe(fontIds.length);
    expect(projection.resources.fonts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pdf:resource:font:default-helvetica",
          family: "Helvetica",
        }),
        expect.objectContaining({
          family: "Inter",
          sourceKey: "default-helvetica",
        }),
        expect.objectContaining({
          family: "Source Sans",
          sourceKey: "fallback-missing-sans-700-normal",
        }),
        expect.objectContaining({
          id: "pdf:resource:font:fallback-missing-sans-700-normal",
          family: "Helvetica",
          fallback: true,
        }),
      ]),
    );
  });

  test("registered inline span font asset is projected without a PDF font fallback warning", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:inline-inter-font",
      name: "test:inline-inter-font",
      integration: {
        id: integrationContextId("test:inline-inter-font"),
        fontAssets: [
          {
            key: "inline-inter",
            family: "Inter",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Inline Font" }, () => (
      <p>
        Hi <span style={{ fontFamily: "Inter" }}>there</span>
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Inter",
        fallback: false,
        sourceKey: "inline-inter",
      }),
    );
  });

  test("missing inline span font family emits a PDF fallback warning", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing Inline Font" }, () => (
      <p>
        Hi <span style={{ fontFamily: "Missing Inline" }}>there</span>
      </p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_FONT_FALLBACK",
        message:
          'PDF projection used Helvetica for missing font request family "Missing Inline", weight 400, style normal.',
      }),
    );
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Helvetica",
        fallback: true,
      }),
    );
  });

  test("missing font family projects with a nonblocking PDF fallback warning", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing Font" }, () => (
      <p style={{ fontFamily: "Missing Sans" }}>fallback</p>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PDF_FONT_FALLBACK", severity: "warning" }),
    );
    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Helvetica",
        fallback: true,
      }),
    );
  });

  test("malformed plugin font asset registration is reported as an integration diagnostic", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:malformed-font",
      name: "test:malformed-font",
      integration: {
        id: integrationContextId("test:malformed-font"),
        fontAssets: [
          {
            key: "broken-weight",
            family: "Broken",
            weight: Number.NaN,
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    } as never;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Malformed Font" }, () => <p style={{ fontFamily: "Broken" }}>malformed</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        message: "Deck plugin integration.fontAssets must be an array of Font Asset Registrations.",
      }),
    );
  });

  test("plugin font asset registration rejects non-byte sources", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:path-font",
      name: "test:path-font",
      integration: {
        id: integrationContextId("test:path-font"),
        fontAssets: [
          {
            key: "path-font",
            family: "Path Font",
            source: { kind: "path", path: "./PathFont.ttf" },
          },
        ],
      },
    } as never;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Path Font" }, () => <p style={{ fontFamily: "Path Font" }}>path</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PLUGIN_INVALID",
        message: "Deck plugin integration.fontAssets must be an array of Font Asset Registrations.",
      }),
    );
  });

  test("font asset registration defaults match regular normal but not bold", async () => {
    const plugin: DeckPlugin = {
      kind: "deckjsx.plugin",
      id: "test:default-font",
      name: "test:default-font",
      integration: {
        id: integrationContextId("test:default-font"),
        fontAssets: [
          {
            key: "default-font",
            family: "Default Font",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    };
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Default Font" }, () => (
      <>
        <p style={{ fontFamily: "Default Font" }}>regular</p>
        <p style={{ fontFamily: "Default Font", fontWeight: 700 }}>bold</p>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expect(projection.resources.fonts).toContainEqual(
      expect.objectContaining({
        family: "Default Font",
        fallback: false,
        sourceKey: "default-font",
        weight: 400,
        style: "normal",
      }),
    );
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_PDF_FONT_FALLBACK",
        message:
          'PDF projection used Helvetica for missing font request family "Default Font", weight 700, style normal.',
      }),
    );
  });

  test("missing same family at multiple weights creates distinct fallback diagnostics and resources", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing Weights" }, () => (
      <>
        <p style={{ fontFamily: "Missing Multi", fontWeight: 400 }}>regular</p>
        <p style={{ fontFamily: "Missing Multi", fontWeight: 700 }}>bold</p>
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const fallbackFonts = projection.resources.fonts.filter((font) => font.fallback);
    const fallbackWarnings = result.diagnostics.items.filter(
      (item) => item.code === "W_PDF_FONT_FALLBACK",
    );

    expect(fallbackFonts).toHaveLength(2);
    expect(new Set(fallbackFonts.map((font) => font.id)).size).toBe(2);
    expect(fallbackWarnings).toHaveLength(2);
    expect(new Set(fallbackWarnings.map((warning) => warning.message)).size).toBe(2);
  });
});

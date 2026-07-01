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

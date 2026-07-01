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
});

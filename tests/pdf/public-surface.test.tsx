import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src";
import { pdf } from "@/src/adapter";

describe("pdf public surface", () => {
  function expectPdfProjectionUnavailable(result: Awaited<ReturnType<Deck["project"]>>) {
    expect(result.format).toBe("pdf");
    expect(result.ok).toBe(false);
    expect(result.projection).toBeUndefined();
    expect(result.stages.project.artifact).toBe("missing");
    expect(result.diagnostics.items).toEqual([
      expect.objectContaining({ code: "E_PROJECT_FAILED" }),
    ]);
  }

  test("exports a PDF writer adapter", () => {
    const adapter = pdf({ inspection: "none" });

    expect(adapter).toMatchObject({
      kind: "deckjsx.writerAdapter",
      name: "pdf",
      projectionFormat: "pdf",
      format: "pdf",
      options: { inspection: "none" },
    });
  });

  test("reports pdf projection unavailable for explicit project format", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expectPdfProjectionUnavailable(result);
  });

  test("reports pdf projection unavailable for deck output preference", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { format: "pdf" },
    });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ inspection: "none" });

    expectPdfProjectionUnavailable(result);
  });

  test("does not reuse a cached pptx projection for a later pdf project request", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const pptxResult = await deck.project({ inspection: "none" });
    const pdfResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(pptxResult.ok).toBe(true);
    expect(pptxResult.format).toBe("pptx");
    expect(pptxResult.projection?.format).toBe("pptx");
    expectPdfProjectionUnavailable(pdfResult);
  });

  test("creates a pdf render artifact through a minimal adapter", async () => {
    const model = { format: "pdf", version: "1.7", pages: [] } as const;
    const result = await pdf({ inspection: "none" }).render(model);

    expect(result.artifact).toMatchObject({
      format: "pdf",
      mediaType: "application/pdf",
      extension: "pdf",
    });
    expect(new TextDecoder().decode(result.artifact?.bytes)).toBe("%PDF-1.7\n%%deckjsx\n");
  });
});

import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src";
import { pdf } from "@/src/adapter";

describe("pdf public surface", () => {
  function expectPdfProjectionAvailable(result: Awaited<ReturnType<Deck["project"]>>) {
    expect(result.format).toBe("pdf");
    expect(result.ok).toBe(true);
    expect(result.projection?.format).toBe("pdf");
    expect(result.stages.project.artifact).toBe("available");
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

  test("projects pdf for explicit project format", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expectPdfProjectionAvailable(result);
  });

  test("projects pdf for deck output preference", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { format: "pdf" },
    });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ inspection: "none" });

    expectPdfProjectionAvailable(result);
  });

  test("does not reuse a cached pptx projection for a later pdf project request", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const pptxResult = await deck.project({ inspection: "none" });
    const pdfResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(pptxResult.ok).toBe(true);
    expect(pptxResult.format).toBe("pptx");
    expect(pptxResult.projection?.format).toBe("pptx");
    expectPdfProjectionAvailable(pdfResult);
  });

  test("creates a pdf render artifact through a minimal adapter", async () => {
    const model = {
      format: "pdf",
      version: "1.7",
      documentId: "pdf:document:demo",
      metadata: { producer: "deckjsx" },
      pages: [],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as const;
    const result = await pdf({ inspection: "none" }).render(model);

    expect(result.artifact).toMatchObject({
      format: "pdf",
      mediaType: "application/pdf",
      extension: "pdf",
    });
    const bytes = new TextDecoder().decode(result.artifact?.bytes);
    expect(bytes.startsWith("%PDF-1.7\n")).toBe(true);
    expect(bytes).toContain("/Type /Catalog");
    expect(bytes).toContain("/Type /Pages");
    expect(bytes).toContain("xref");
    expect(bytes).toContain("trailer");
    expect(bytes).toContain("startxref");
    expect(bytes).toContain("%%EOF");
  });
});

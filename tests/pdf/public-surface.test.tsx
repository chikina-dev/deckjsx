import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src";
import { pdf } from "@/src/adapter";

describe("pdf public surface", () => {
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

  test("accepts pdf as explicit project format", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expect(result.format).toBe("pdf");
  });

  test("accepts pdf as deck output preference", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { format: "pdf" },
    });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ inspection: "none" });

    expect(result.format).toBe("pdf");
  });

  test("creates a pdf render artifact through a minimal adapter", async () => {
    const model = { format: "pdf", version: "1.7", pages: [] } as const;
    const result = await pdf({ inspection: "none" }).render(model);

    expect(result.artifact).toMatchObject({
      format: "pdf",
      mediaType: "application/pdf",
      extension: "pdf",
    });
    expect(new TextDecoder().decode(result.artifact?.bytes.subarray(0, 8))).toBe("%PDF-1.");
  });
});

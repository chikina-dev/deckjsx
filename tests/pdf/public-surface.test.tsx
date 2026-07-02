import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src";
import { pdf, pptx } from "@/src/adapter";
import type { PdfPageModel } from "@/src/projection/pdf/model";

describe("pdf public surface", () => {
  function expectPdfProjectionAvailable(result: Awaited<ReturnType<Deck["project"]>>) {
    expect(result.format).toBe("pdf");
    expect(result.ok).toBe(true);
    expect(result.projection?.format).toBe("pdf");
    expect(result.stages.project.artifact).toBe("available");
  }

  function expectPdfPageModel(value: unknown): PdfPageModel {
    expect(value).toMatchObject({ format: "pdf" });
    return value as PdfPageModel;
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

  test("rejects unknown project formats from JavaScript callers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({
      format: "odp",
      inspection: "none",
    } as never);

    expect(result.ok).toBe(false);
    expect(result.format).toBe("pptx");
    expect(result.projection).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PROJECT_FORMAT_INVALID" }),
    );
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("E_PROJECT_FAILED");
  });

  test("projects authored text into pdf page content operations", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);

    expectPdfProjectionAvailable(result);
    expect(projection.pages[0]?.content).toContainEqual(
      expect.objectContaining({ op: "text", text: "PDF" }),
    );
  });

  test("projects text font resources for pdf writer validation", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });
    const projection = expectPdfPageModel(result.projection);
    const textOp = projection.pages[0]?.content.find((op) => op.op === "text");

    expectPdfProjectionAvailable(result);
    expect(textOp).toMatchObject({ op: "text", text: "PDF" });
    expect(textOp?.fontId).toEqual(expect.any(String));
    expect(projection.pages[0]?.resources.fonts).toContain(textOp?.fontId);
    expect(projection.resources.fonts.map((font) => font.id)).toContain(textOp?.fontId);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_MODEL_TEXT_MISSING_FONT_RESOURCE",
    );
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain(
      "E_PDF_MODEL_PAGE_MISSING_FONT_RESOURCE",
    );
  });

  test("reports unsupported authored media instead of silently omitting it from pdf", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Unsupported PDF" }, () => (
      <>
        <p>Supported text</p>
        <shape
          shape="rect"
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expect(result.ok).toBe(false);
    expect(result.format).toBe("pdf");
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PDF_UNSUPPORTED_AUTHOR_CONTENT" }),
    );
  });

  test("renders authored text into pdf content bytes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.render(pdf({ inspection: "none" }));
    const bytes = new TextDecoder().decode(result.artifact?.bytes);

    expect(result.ok).toBe(true);
    expect(bytes).toContain("(PDF) Tj");
  });

  test("renders rich text as one aggregate pdf text operation until run positioning exists", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Rich PDF" }, () => (
      <p>
        Hi <span style={{ fontWeight: 700 }}>there</span>
      </p>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const textOps = projection.pages[0]?.content.filter((op) => op.op === "text") ?? [];
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(textOps).toHaveLength(1);
    expect(textOps[0]).toMatchObject({ op: "text", text: "Hi there" });
    expect(bytes.match(/\(Hi there\) Tj/g)).toHaveLength(1);
    expect(bytes).not.toContain("(Hi ) Tj");
    expect(bytes).not.toContain("(there) Tj");
  });

  test("does not project hidden text into pdf content", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Hidden PDF" }, () => (
      <>
        <p>Visible</p>
        <p style={{ visibility: "hidden" }}>Hidden</p>
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(projection.pages[0]?.content).toContainEqual(
      expect.objectContaining({ op: "text", text: "Visible" }),
    );
    expect(projection.pages[0]?.content).not.toContainEqual(
      expect.objectContaining({ op: "text", text: "Hidden" }),
    );
    expect(bytes).toContain("(Visible) Tj");
    expect(bytes).not.toContain("(Hidden) Tj");
  });

  test("does not project text inside a hidden parent into pdf content", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Hidden Parent PDF" }, () => (
      <>
        <p>Visible</p>
        <div style={{ visibility: "hidden" }}>
          <p>Hidden Child</p>
        </div>
      </>
    ));

    const projectResult = await deck.project({ format: "pdf", inspection: "none" });
    const renderResult = await deck.render(pdf({ inspection: "none" }));
    const projection = expectPdfPageModel(projectResult.projection);
    const bytes = new TextDecoder().decode(renderResult.artifact?.bytes);

    expect(projectResult.ok).toBe(true);
    expect(renderResult.ok).toBe(true);
    expect(projection.pages[0]?.content).not.toContainEqual(
      expect.objectContaining({ op: "text", text: "Hidden Child" }),
    );
    expect(bytes).not.toContain("(Hidden Child) Tj");
  });

  test("does not warn for the default pdf text font fallback", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
  });

  test("preserves explicit missing font fallback warnings for pdf text", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p style={{ fontFamily: "Missing Sans" }}>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_PDF_FONT_FALLBACK", severity: "warning" }),
    );
  });

  test("projects pdf for deck output preference", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf"] },
    });
    deck.slide({ name: "PDF" }, () => <p>PDF</p>);

    const result = await deck.project({ inspection: "none" });

    expectPdfProjectionAvailable(result);
  });

  test("uses the first configured output format for implicit project with a warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf", "pptx"] },
    });
    deck.slide({ name: "PDF first" }, () => <p>PDF first</p>);

    const result = await deck.project({ inspection: "none" });

    expectPdfProjectionAvailable(result);
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_OUTPUT_FORMATS_IMPLICIT_FIRST",
        severity: "warning",
      }),
    );
  });

  test("uses the first configured output format for implicit render with a warning", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pdf", "pptx"] },
    });
    deck.slide({ name: "PDF first" }, () => <p>PDF first</p>);

    const result = await deck.render({ inspection: "none" });

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({ format: "pdf", mediaType: "application/pdf" });
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "W_OUTPUT_FORMATS_IMPLICIT_FIRST",
        severity: "warning",
      }),
    );
  });

  test("renders explicit pptx and pdf adapters without membership warnings when both formats are configured", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { formats: ["pptx", "pdf"] },
    });
    deck.slide({ name: "Both formats" }, () => <p>Both formats</p>);

    const pptxResult = await deck.render(pptx({ inspection: "none" }));
    const pdfResult = await deck.render(pdf({ inspection: "none" }));

    expect(pptxResult.ok).toBe(true);
    expect(pdfResult.ok).toBe(true);
    expect(pptxResult.artifact?.format).toBe("pptx");
    expect(pdfResult.artifact?.format).toBe("pdf");
    expect(pptxResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "W_RENDER_ADAPTER_FORMAT_NOT_CONFIGURED",
    );
    expect(pdfResult.diagnostics.items.map((item) => item.code)).not.toContain(
      "W_RENDER_ADAPTER_FORMAT_NOT_CONFIGURED",
    );
  });

  test("reports the explicit adapter format when render fails before projection", async () => {
    const deck = new Deck({
      layout: { width: -1, height: 5.625, unit: "in" },
    } as never);
    deck.slide({ name: "Invalid PDF" }, () => <p>Invalid PDF</p>);

    const result = await deck.render(pdf({ inspection: "none" }));

    expect(result.ok).toBe(false);
    expect(result.format).toBe("pdf");
    expect(result.artifact).toBeUndefined();
    expect(result.stages.project.artifact).toBe("missing");
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DECK_INVALID_LAYOUT" }),
    );
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

  test("rejects a defined pptx projection for an explicit pdf project request", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Defined PPTX" }, () => <p>Defined PPTX</p>);
    const pptxResult = await deck.project({ inspection: "none" });

    deck.defineProjection(pptxResult.projection!);

    const pdfResult = await deck.project({ format: "pdf", inspection: "none" });

    expect(pdfResult.ok).toBe(false);
    expect(pdfResult.format).toBe("pdf");
    expect(pdfResult.projection).toBeUndefined();
    expect(pdfResult.stages.project.artifact).toBe("missing");
    expect(pdfResult.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_FORMAT" }),
    );
  });

  test("rejects a defined pptx projection for an explicit pdf render request", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Defined PPTX" }, () => <p>Defined PPTX</p>);
    const pptxResult = await deck.project({ inspection: "none" });

    deck.defineProjection(pptxResult.projection!);

    const pdfResult = await deck.render(pdf({ inspection: "none" }));

    expect(pdfResult.ok).toBe(false);
    expect(pdfResult.format).toBe("pdf");
    expect(pdfResult.artifact).toBeUndefined();
    expect(pdfResult.stages.project.artifact).toBe("missing");
    expect(pdfResult.stages.render.artifact).toBe("missing");
    expect(pdfResult.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_FORMAT" }),
    );
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

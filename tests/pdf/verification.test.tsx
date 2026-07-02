import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src";
import { pdf } from "@/src/adapter";

function decodePdf(bytes: Uint8Array | undefined): string {
  return new TextDecoder().decode(bytes ?? new Uint8Array());
}

function pdfLiteralTextPattern(text: string): RegExp {
  const escapedChars = Array.from(text)
    .map((char) => {
      const escaped = char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
      return `\\\\?${escaped}`;
    })
    .join("");

  return new RegExp(`\\(${escapedChars}\\) Tj`);
}

const libreOfficeOracleTest = process.env.DECKJSX_PDF_LIBREOFFICE_ORACLE === "1" ? test : test.skip;

describe("PDF verification", () => {
  test("renders a structurally inspectable PDF with authored text", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Verification" }, () => <p>Verification text</p>);

    const result = await deck.render(pdf({ inspection: "none" }));
    const output = decodePdf(result.artifact?.bytes);

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({ format: "pdf" });
    expect(output).toContain("/Type /Catalog");
    expect(output).toContain("/Type /Pages");
    expect(output).toContain("/Type /Page");
    expect(output).toContain("xref");
    expect(output).toContain("trailer");
    expect(output).toContain("startxref");
    expect(output).toContain("%%EOF");
    expect(output).toMatch(pdfLiteralTextPattern("Verification text"));
    expect(output).toMatch(/xref\s+0\s+\d+\s+(?:\d{10}\s+\d{5}\s+[fn]\s+)+/);
    expect(output).toMatch(/startxref\s+\d+\s+%%EOF\s*$/);
  });

  libreOfficeOracleTest("can host a future LibreOffice raster oracle", () => {
    expect(process.env.DECKJSX_PDF_LIBREOFFICE_ORACLE).toBe("1");
  });
});

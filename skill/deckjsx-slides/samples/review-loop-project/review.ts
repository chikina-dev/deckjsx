import { write } from "@deckjsx/node";
import { formatDiagnostics, type Deck, type SlideTemplateSet } from "deckjsx";
import { pdf, pptx } from "deckjsx/adapter";
import type { ProjectInspectionSummary } from "deckjsx/inspect";

function writeDiagnosticsToMessage(diagnostics: readonly { readonly message: string }[]): string {
  return diagnostics.map((item) => item.message).join("\n");
}

export async function reviewAndWrite<TTemplates extends SlideTemplateSet>(
  deck: Deck<void, TTemplates>,
) {
  const projected = await deck.project({ inspection: "summary" });
  if (!projected.ok) {
    throw new Error(formatDiagnostics(projected.diagnostics));
  }

  const summary = projected.summary as ProjectInspectionSummary | undefined;
  for (const slide of summary?.slides ?? []) {
    for (const check of slide.visualChecks) {
      console.warn(`${slide.name ?? slide.slideId}: ${check.code} ${check.message}`);
      if (check.metrics) {
        console.info(`${slide.name ?? slide.slideId}: review metrics`, check.metrics);
      }
    }
    // `slide.elements` is top-level; nested group/table content may only appear in checks.
    for (const element of slide.elements) {
      if (element.textMetrics) {
        console.info(
          `${slide.name ?? slide.slideId}: ${element.id} text lines ${element.textMetrics.estimatedLineCount}/${element.textMetrics.estimatedLineCapacity}`,
        );
      }
      if (element.mediaMetrics) {
        console.info(
          `${slide.name ?? slide.slideId}: ${element.id} media ${element.mediaMetrics.fit}${element.mediaMetrics.cropped ? " cropped" : ""}`,
        );
      }
    }
  }

  const reviewPdf = await deck.render(pdf());
  if (!reviewPdf.ok) {
    throw new Error(formatDiagnostics(reviewPdf.diagnostics));
  }
  const reviewPdfWrite = await write(reviewPdf, "review-loop-project.pdf");
  if (!reviewPdfWrite.ok) {
    throw new Error(writeDiagnosticsToMessage(reviewPdfWrite.diagnostics));
  }

  const finalPptx = await deck.render(pptx());
  if (!finalPptx.ok) {
    throw new Error(formatDiagnostics(finalPptx.diagnostics));
  }
  const finalPptxWrite = await write(finalPptx, "review-loop-project.pptx");
  if (!finalPptxWrite.ok) {
    throw new Error(writeDiagnosticsToMessage(finalPptxWrite.diagnostics));
  }
}

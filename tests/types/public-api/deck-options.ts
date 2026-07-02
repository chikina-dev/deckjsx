import type { DeckOptions } from "deckjsx";

const multiOutput = {
  layout: { width: 10, height: 5.625, unit: "in" },
  output: { formats: ["pptx", "pdf"] },
} satisfies DeckOptions;
void multiOutput;

const pdfOnlyOutput = {
  layout: { width: 10, height: 5.625, unit: "in" },
  output: { formats: ["pdf"] },
} satisfies DeckOptions;
void pdfOnlyOutput;

const emptyFormatsOutput = {
  layout: { width: 10, height: 5.625, unit: "in" },
  output: { formats: [] },
} satisfies DeckOptions;
void emptyFormatsOutput;

const removedFormatOutput = {
  layout: { width: 10, height: 5.625, unit: "in" },
  output: {
    // @ts-expect-error output.format has been replaced by output.formats.
    format: "pdf",
  },
} satisfies DeckOptions;
void removedFormatOutput;

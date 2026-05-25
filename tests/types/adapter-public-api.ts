import { pptxgenjs } from "deckjsx/adapter";
import type { WriterAdapter } from "deckjsx/adapter";
import type { ProjectionFormat } from "deckjsx";
import type { PptxPackageModel } from "deckjsx/inspect";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

const adapter = pptxgenjs({ output: "deck.pptx" });
adapter satisfies WriterAdapter<PptxPackageModel>;
adapter.projectionFormat satisfies ProjectionFormat;
adapter.format satisfies "pptx";

const projectionFormat = "pptx" satisfies ProjectionFormat;
void projectionFormat;

const projectionFormatTypeAssertions = {
  pdfIsNotAProjectionFormat: true,
} satisfies {
  pdfIsNotAProjectionFormat: Assert<
    IsAssignable<"pdf", ProjectionFormat> extends true ? false : true
  >;
};
void projectionFormatTypeAssertions;

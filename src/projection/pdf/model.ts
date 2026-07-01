import type { ProjectionFormat } from "../../pipeline/contract";

export type PdfDocumentModel = {
  readonly format: Extract<ProjectionFormat, "pdf">;
  readonly version: "1.7";
  readonly pages: readonly unknown[];
};

import type { DeckOptions } from "../../authoring/options";
import type { Diagnostics } from "../../diagnostics";
import type { AssetEntity, SemanticAuthorGraph } from "../../graph";
import type { ResolvedStyleMap } from "../../style/resolve";
import { POINTS_PER_INCH } from "../../types";
import { pdfDocumentId, pdfPageId } from "./identity";
import type { PdfPage, PdfPageModel } from "./model";

function pointsFromLayout(value: number, unit: DeckOptions["layout"]["unit"]): number {
  return unit === "in" ? value * POINTS_PER_INCH : value;
}

function pageSizeFromOptions(options: DeckOptions): PdfPage["mediaBox"] {
  return {
    x: 0,
    y: 0,
    width: pointsFromLayout(options.layout.width, options.layout.unit),
    height: pointsFromLayout(options.layout.height, options.layout.unit),
  };
}

function slideIdsForGraph(graph: SemanticAuthorGraph): readonly string[] {
  const document = graph.nodes.get(graph.documentId);
  if (document?.kind !== "document") {
    return [graph.documentId];
  }

  return document.children.filter((slideId) => graph.nodes.get(slideId)?.kind === "slide");
}

export function projectGraphToPdfPageModel(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  assets?: ReadonlyMap<AssetEntity["id"], unknown>;
}): PdfPageModel {
  const mediaBox = pageSizeFromOptions(input.options);
  const slideIds = slideIdsForGraph(input.graph);
  const pageSourceIds = slideIds.length > 0 ? slideIds : [input.graph.documentId];

  return {
    format: "pdf",
    version: "1.7",
    documentId: pdfDocumentId(input.graph.documentId),
    metadata: {
      producer: "deckjsx",
      ...input.options.meta,
    },
    pages: pageSourceIds.map((slideId, index): PdfPage => {
      return {
        id: pdfPageId(slideId, index),
        index,
        mediaBox,
        resources: { fonts: [], images: [] },
        content: [],
      };
    }),
    resources: { fonts: [], images: [] },
    fallbacks: [],
  };
}

export const projectGraphToPartialPdfPageModel = projectGraphToPdfPageModel;

import type { DeckOptions } from "../../authoring/options";
import type { Diagnostics } from "../../diagnostics";
import type { AssetEntity, SemanticAuthorGraph } from "../../graph";
import type { DeckIntegrationContext, FontAssetRegistration } from "../../integration-context";
import type { ResolvedStyleMap } from "../../style/resolve";
import { POINTS_PER_INCH } from "../../types";
import { pdfDocumentId, pdfPageId, pdfResourceId } from "./identity";
import type { PdfFallback, PdfFontResource, PdfPage, PdfPageModel } from "./model";

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

type FontRequest = {
  readonly family: string;
  readonly weight: number;
  readonly style: "normal" | "italic";
};

function normalizedFontFamily(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function fontRequestKey(request: FontRequest): string {
  return [request.family, request.weight, request.style].join("\u0000");
}

function resolvedFontWeight(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (value === "bold") {
    return 700;
  }
  return 400;
}

function resolvedFontStyle(value: unknown): "normal" | "italic" {
  return value === "italic" ? "italic" : "normal";
}

function registrationWeight(registration: FontAssetRegistration): number {
  return registration.weight ?? 400;
}

function registrationStyle(registration: FontAssetRegistration): "normal" | "italic" {
  return registration.style ?? "normal";
}

function fontRequestDescription(request: FontRequest): string {
  return `family "${request.family}", weight ${request.weight}, style ${request.style}`;
}

function explicitFontRequests(input: {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
}): readonly FontRequest[] {
  const requests = new Map<string, FontRequest>();

  input.graph.nodes.forEach((node) => {
    if (node.kind !== "text") {
      return;
    }

    const resolvedStyle = input.resolvedStyles.get(node.id);
    const familyProperty = resolvedStyle?.properties.fontFamily;
    if (!familyProperty || familyProperty.source.layer === "default") {
      return;
    }

    const family = normalizedFontFamily(familyProperty.value);
    if (!family) {
      return;
    }

    const weightValue = resolvedStyle.properties.fontWeight?.value;
    const styleValue = resolvedStyle.properties.fontStyle?.value;
    const request: FontRequest = {
      family,
      weight: resolvedFontWeight(weightValue),
      style: resolvedFontStyle(styleValue),
    };
    requests.set(fontRequestKey(request), request);
  });

  return [...requests.values()];
}

function fontRegistrationMatchesRequest(
  registration: FontAssetRegistration,
  request: FontRequest,
): boolean {
  return (
    registration.family === request.family &&
    registrationWeight(registration) === request.weight &&
    registrationStyle(registration) === request.style
  );
}

function pdfFontResourceForRegistration(registration: FontAssetRegistration): PdfFontResource {
  return {
    id: pdfResourceId("font", registration.key),
    name: registration.key,
    family: registration.family,
    weight: registrationWeight(registration),
    style: registrationStyle(registration),
    fallback: false,
    sourceKey: registration.key,
    ...(registration.source.kind === "bytes" ? { data: registration.source.bytes } : {}),
  };
}

function pdfFallbackForRequest(request: FontRequest): PdfFallback {
  return {
    code: "W_PDF_FONT_FALLBACK",
    message: `PDF projection used Helvetica for missing font request ${fontRequestDescription(request)}.`,
  };
}

function pdfFallbackFontResourceForRequest(request: FontRequest): PdfFontResource {
  return {
    id: pdfResourceId("font", `fallback:${request.family}:${request.weight}:${request.style}`),
    name: "Helvetica",
    family: "Helvetica",
    weight: request.weight,
    style: request.style,
    fallback: true,
  };
}

function pdfFontResourcesForRequests(input: {
  readonly requests: readonly FontRequest[];
  readonly integrationContext?: DeckIntegrationContext;
}): { readonly fonts: readonly PdfFontResource[]; readonly fallbacks: readonly PdfFallback[] } {
  const fontAssets = input.integrationContext?.fontAssets ?? [];

  const fonts: PdfFontResource[] = [];
  const fallbacks: PdfFallback[] = [];

  input.requests.forEach((request) => {
    const registration = fontAssets.find((candidate) =>
      fontRegistrationMatchesRequest(candidate, request),
    );

    if (registration) {
      fonts.push(pdfFontResourceForRegistration(registration));
      return;
    }

    fonts.push(pdfFallbackFontResourceForRequest(request));
    fallbacks.push(pdfFallbackForRequest(request));
  });

  return { fonts, fallbacks };
}

export function projectGraphToPdfPageModel(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  assets?: ReadonlyMap<AssetEntity["id"], unknown>;
  integrationContext?: DeckIntegrationContext;
}): PdfPageModel {
  const mediaBox = pageSizeFromOptions(input.options);
  const slideIds = slideIdsForGraph(input.graph);
  const pageSourceIds = slideIds.length > 0 ? slideIds : [input.graph.documentId];
  const fontProjection = pdfFontResourcesForRequests({
    requests: explicitFontRequests({
      graph: input.graph,
      resolvedStyles: input.resolvedStyles,
    }),
    integrationContext: input.integrationContext,
  });
  const pageFontIds = fontProjection.fonts.map((font) => font.id);

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
        resources: { fonts: pageFontIds, images: [] },
        content: [],
      };
    }),
    resources: { fonts: fontProjection.fonts, images: [] },
    fallbacks: fontProjection.fallbacks,
  };
}

export const projectGraphToPartialPdfPageModel = projectGraphToPdfPageModel;

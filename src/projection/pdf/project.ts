import type { DeckOptions } from "../../authoring/options";
import type { Diagnostics } from "../../diagnostics";
import type { AssetEntity, GraphNodeId, SemanticAuthorGraph } from "../../graph";
import type { DeckIntegrationContext, FontAssetRegistration } from "../../integration-context";
import { buildLayoutInputSnapshot } from "../../layout/input";
import type { ProjectedLayoutNode, ProjectedLayoutSlide } from "../../layout/projected";
import { resolveProjectedLayout } from "../../layout/resolve";
import { normalizeColor } from "../../style/color";
import type { ResolvedStyle, ResolvedStyleMap } from "../../style/resolve";
import { EMU_PER_INCH, POINTS_PER_INCH } from "../../types";
import { pdfDocumentId, pdfPageId, pdfResourceId } from "./identity";
import type {
  PdfContentOp,
  PdfFallback,
  PdfFontResource,
  PdfPage,
  PdfPageModel,
  PdfRgbColor,
} from "./model";

const EMU_PER_POINT = EMU_PER_INCH / POINTS_PER_INCH;
const DEFAULT_FONT_RESOURCE_ID = pdfResourceId("font", "default-helvetica");
const DEFAULT_FONT_RESOURCE: PdfFontResource = {
  id: DEFAULT_FONT_RESOURCE_ID,
  name: "F1",
  family: "Helvetica",
  weight: 400,
  style: "normal",
  fallback: false,
};

function pointsFromLayout(value: number, unit: DeckOptions["layout"]["unit"]): number {
  return unit === "in" ? value * POINTS_PER_INCH : value;
}

function pointsFromEmu(value: number): number {
  return value / EMU_PER_POINT;
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

function stableRequestHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function fontRequestResourceId(
  kind: "request" | "fallback",
  request: FontRequest,
): PdfFontResource["id"] {
  const key = fontRequestKey(request);
  return pdfResourceId(
    "font",
    `${kind}:${request.family}:${request.weight}:${request.style}:${stableRequestHash(key)}`,
  );
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

function fontRequestFromResolvedStyle(input: {
  readonly resolvedStyle: ResolvedStyle | undefined;
  readonly requireExplicitFamily: boolean;
}): FontRequest | undefined {
  const familyProperty = input.resolvedStyle?.properties.fontFamily;
  if (!familyProperty) {
    return undefined;
  }
  if (input.requireExplicitFamily && familyProperty.source.layer === "default") {
    return undefined;
  }

  const family = normalizedFontFamily(familyProperty.value);
  if (!family) {
    return undefined;
  }

  return {
    family,
    weight: resolvedFontWeight(input.resolvedStyle?.properties.fontWeight?.value),
    style: resolvedFontStyle(input.resolvedStyle?.properties.fontStyle?.value),
  };
}

function explicitFontRequests(input: {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
}): readonly FontRequest[] {
  const requests = new Map<string, FontRequest>();

  input.graph.nodes.forEach((node) => {
    if (node.kind !== "text" && node.kind !== "textRun") {
      return;
    }
    if (node.kind === "textRun" && !node.styleRef) {
      return;
    }

    const request = fontRequestFromResolvedStyle({
      resolvedStyle: input.resolvedStyles.get(node.id),
      requireExplicitFamily: true,
    });
    if (!request) {
      return;
    }

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

function pdfFontResourceForRegistration(
  request: FontRequest,
  registration: FontAssetRegistration,
  name: string,
): PdfFontResource {
  return {
    id: fontRequestResourceId("request", request),
    name,
    family: "Helvetica",
    weight: request.weight,
    style: request.style,
    fallback: true,
    sourceKey: registration.key,
  };
}

function pdfFallbackForRequest(request: FontRequest): PdfFallback {
  return {
    code: "W_PDF_FONT_FALLBACK",
    message: `PDF projection used Helvetica for missing font request ${fontRequestDescription(request)}.`,
  };
}

function pdfFallbackForRegistration(
  request: FontRequest,
  registration: FontAssetRegistration,
): PdfFallback {
  return {
    code: "W_PDF_FONT_FALLBACK",
    message: `PDF projection used Helvetica because embedding registered font asset key "${registration.key}" for ${fontRequestDescription(request)} is not supported yet.`,
  };
}

function pdfFallbackFontResourceForRequest(request: FontRequest, name: string): PdfFontResource {
  return {
    id: fontRequestResourceId("fallback", request),
    name,
    family: "Helvetica",
    weight: request.weight,
    style: request.style,
    fallback: true,
  };
}

function pdfFontResourcesForRequests(input: {
  readonly requests: readonly FontRequest[];
  readonly integrationContext?: DeckIntegrationContext;
}): {
  readonly fonts: readonly PdfFontResource[];
  readonly fallbacks: readonly PdfFallback[];
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
} {
  const fontAssets = input.integrationContext?.fontAssets ?? [];

  const fonts: PdfFontResource[] = [];
  const fallbacks: PdfFallback[] = [];
  const resourceIdsByRequestKey = new Map<string, PdfFontResource["id"]>();

  input.requests.forEach((request, index) => {
    const name = `F${index + 2}`;
    const registration = fontAssets.find((candidate) =>
      fontRegistrationMatchesRequest(candidate, request),
    );

    if (registration) {
      const font = pdfFontResourceForRegistration(request, registration, name);
      fonts.push(font);
      resourceIdsByRequestKey.set(fontRequestKey(request), font.id);
      fallbacks.push(pdfFallbackForRegistration(request, registration));
      return;
    }

    const font = pdfFallbackFontResourceForRequest(request, name);
    fonts.push(font);
    resourceIdsByRequestKey.set(fontRequestKey(request), font.id);
    fallbacks.push(pdfFallbackForRequest(request));
  });

  return { fonts, fallbacks, resourceIdsByRequestKey };
}

function explicitFontRequestsByTextNode(input: {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
}): ReadonlyMap<GraphNodeId, FontRequest> {
  const requests = new Map<GraphNodeId, FontRequest>();

  input.graph.nodes.forEach((node) => {
    if (node.kind !== "text" && node.kind !== "textRun") {
      return;
    }
    if (node.kind === "textRun" && !node.styleRef) {
      return;
    }

    const request = fontRequestFromResolvedStyle({
      resolvedStyle: input.resolvedStyles.get(node.id),
      requireExplicitFamily: true,
    });
    if (!request) {
      return;
    }

    requests.set(node.id, request);
  });

  return requests;
}

function textNodeFontId(input: {
  readonly node: ProjectedLayoutNode;
  readonly requestsByTextNode: ReadonlyMap<GraphNodeId, FontRequest>;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
}): PdfFontResource["id"] {
  const graphNodeIds = input.node.origin?.graphNodeIds ?? [];
  for (const graphNodeId of graphNodeIds) {
    const request = input.requestsByTextNode.get(graphNodeId);
    if (!request) {
      continue;
    }
    const resourceId = input.resourceIdsByRequestKey.get(fontRequestKey(request));
    if (resourceId) {
      return resourceId;
    }
  }

  return DEFAULT_FONT_RESOURCE_ID;
}

function rgbColorFromStyle(value: string | undefined): PdfRgbColor | undefined {
  const color = normalizeColor(value);
  if (!color || !/^[0-9A-F]{6}$/u.test(color)) {
    return undefined;
  }

  return {
    r: Number.parseInt(color.slice(0, 2), 16) / 255,
    g: Number.parseInt(color.slice(2, 4), 16) / 255,
    b: Number.parseInt(color.slice(4, 6), 16) / 255,
  };
}

function textOpsFromLayoutNode(input: {
  readonly node: ProjectedLayoutNode;
  readonly requestsByTextNode: ReadonlyMap<GraphNodeId, FontRequest>;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
  readonly hidden?: boolean;
}): readonly PdfContentOp[] {
  if (input.hidden || input.node.visibility === "hidden") {
    return [];
  }

  if (input.node.kind === "group") {
    return input.node.children.flatMap((child) =>
      textOpsFromLayoutNode({
        node: child,
        requestsByTextNode: input.requestsByTextNode,
        resourceIdsByRequestKey: input.resourceIdsByRequestKey,
        hidden: false,
      }),
    );
  }

  if (input.node.kind !== "text" || input.node.content.text.length === 0) {
    return [];
  }

  const textNode = input.node;
  const frame = textNode.frame;
  const color = rgbColorFromStyle(textNode.style.color);

  return [
    {
      op: "text",
      text: textNode.content.text,
      x: pointsFromEmu(frame.xEmu),
      y: pointsFromEmu(frame.yEmu),
      fontId: textNodeFontId(input),
      fontSize: textNode.style.fontSizePt ?? 12,
      ...(color ? { color } : {}),
    },
  ];
}

function textOpsFromLayoutSlide(input: {
  readonly layoutSlide: ProjectedLayoutSlide | undefined;
  readonly requestsByTextNode: ReadonlyMap<GraphNodeId, FontRequest>;
  readonly resourceIdsByRequestKey: ReadonlyMap<string, PdfFontResource["id"]>;
}): readonly PdfContentOp[] {
  return (
    input.layoutSlide?.nodes.flatMap((node) =>
      textOpsFromLayoutNode({
        node,
        requestsByTextNode: input.requestsByTextNode,
        resourceIdsByRequestKey: input.resourceIdsByRequestKey,
        hidden: false,
      }),
    ) ?? []
  );
}

function pageFontIdsForContent(content: readonly PdfContentOp[]): readonly PdfFontResource["id"][] {
  return [
    ...new Set(
      content.flatMap((op) => {
        return op.op === "text" && op.fontId ? [op.fontId] : [];
      }),
    ),
  ];
}

function resourceFontsForContent(input: {
  readonly fontProjectionFonts: readonly PdfFontResource[];
  readonly pages: readonly Pick<PdfPage, "resources">[];
}): readonly PdfFontResource[] {
  const usedFontIds = new Set(input.pages.flatMap((page) => page.resources.fonts));

  return [
    ...(usedFontIds.has(DEFAULT_FONT_RESOURCE_ID) ? [DEFAULT_FONT_RESOURCE] : []),
    ...input.fontProjectionFonts,
  ];
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
  const layoutInput = buildLayoutInputSnapshot({
    graph: input.graph,
    resolvedStyles: input.resolvedStyles,
    deckSize: {
      widthEmu: mediaBox.width * EMU_PER_POINT,
      heightEmu: mediaBox.height * EMU_PER_POINT,
    },
    diagnostics: input.diagnostics,
    meta: input.options.meta,
  });
  const projectedLayout = resolveProjectedLayout(input.options, layoutInput.snapshot);
  const requestsByTextNode = explicitFontRequestsByTextNode({
    graph: input.graph,
    resolvedStyles: input.resolvedStyles,
  });
  const pageDrafts = pageSourceIds.map((slideId, index): PdfPage => {
    const content = textOpsFromLayoutSlide({
      layoutSlide: projectedLayout.slides[index],
      requestsByTextNode,
      resourceIdsByRequestKey: fontProjection.resourceIdsByRequestKey,
    });

    return {
      id: pdfPageId(slideId, index),
      index,
      mediaBox,
      resources: {
        fonts: pageFontIdsForContent(content),
        images: [],
      },
      content,
    };
  });

  return {
    format: "pdf",
    version: "1.7",
    documentId: pdfDocumentId(input.graph.documentId),
    metadata: {
      producer: "deckjsx",
      ...input.options.meta,
    },
    pages: pageDrafts,
    resources: {
      fonts: resourceFontsForContent({
        fontProjectionFonts: fontProjection.fonts,
        pages: pageDrafts,
      }),
      images: [],
    },
    fallbacks: fontProjection.fallbacks,
  };
}

export const projectGraphToPartialPdfPageModel = projectGraphToPdfPageModel;

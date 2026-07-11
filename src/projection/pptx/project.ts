import type { DeckOptions } from "@/src/authoring/options";
import type { Diagnostics } from "@/src/diagnostics";
import type { AssetEntity, SemanticAuthorGraph } from "@/src/graph";
import type { DeckIntegrationContext } from "@/src/integration-context";
import { buildLayoutInputSnapshot } from "@/src/layout/input";
import type { FrameIR } from "@/src/layout/projected";
import { resolveProjectedLayout } from "@/src/layout/resolve";
import { textFontMetricsFromRegistrations } from "@/src/layout/text-metrics";
import type { ResolvedStyleMap } from "@/src/style/resolve";
import { EMU_PER_INCH, POINTS_PER_INCH } from "@/src/types";
import { withPackagePartFingerprints } from "./fingerprint";
import { packageIdentity, serializedId, slidePartIdFor } from "./identity";
import { buildPptxManifest } from "./manifest";
import { attachMediaRelationships, mediaPartsFor, withCanonicalMediaPartIds } from "./media";
import type {
  PptxPackageModel,
  PptxPackagePart,
  PptxProjectionAssetArtifact,
  PptxRelationshipsPayload,
  PptxSlidePart,
} from "./model";
import { isPptxSlidePart } from "./model";
import { withPackagePartOrderKeys, withPackagePartRequirements } from "./package-parts";
import { partialPptxSlidePartFor, pptxSlidePartFor } from "./slide";
import { defaultPptxSupportParts, slideLayoutPartForSlide } from "./support";

function sizeFromOptions(options: DeckOptions): PptxPackageModel["size"] {
  return options.layout.unit === "in"
    ? {
        widthEmu: options.layout.width * EMU_PER_INCH,
        heightEmu: options.layout.height * EMU_PER_INCH,
      }
    : {
        widthEmu: (options.layout.width / POINTS_PER_INCH) * EMU_PER_INCH,
        heightEmu: (options.layout.height / POINTS_PER_INCH) * EMU_PER_INCH,
      };
}

function projectGraphToPptxPackageInternal(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
  integrationContext?: DeckIntegrationContext;
  partial?: boolean;
}): PptxPackageModel {
  const size = sizeFromOptions(input.options);
  const document = input.graph.nodes.get(input.graph.documentId);
  const slideIds = document?.kind === "document" ? document.children : [];
  const supportParts = defaultPptxSupportParts({
    graph: input.graph,
    resolvedStyles: input.resolvedStyles,
    options: input.options,
    size,
    slideIds,
  });
  const layoutInput = input.partial
    ? undefined
    : buildLayoutInputSnapshot({
        graph: input.graph,
        resolvedStyles: input.resolvedStyles,
        assetProbeArtifacts: input.assets,
        deckSize: size,
        diagnostics: input.diagnostics,
        meta: input.options.meta,
      });
  const projectedLayout = layoutInput
    ? resolveProjectedLayout(input.options, layoutInput.snapshot, {
        fontMetrics: textFontMetricsFromRegistrations(input.integrationContext?.fontAssets),
      })
    : undefined;
  const slideFrame: FrameIR = {
    xEmu: 0,
    yEmu: 0,
    widthEmu: size.widthEmu,
    heightEmu: size.heightEmu,
  };
  const projectedSlides = slideIds.flatMap((slideId, slideIndex): PptxSlidePart[] => {
    const slide = input.graph.nodes.get(slideId);
    if (slide?.kind !== "slide") {
      return [];
    }
    const layoutSlide = projectedLayout?.slides[slideIndex];
    const partId = slidePartIdFor(slide);
    const slideLayoutPart = slideLayoutPartForSlide({
      graph: input.graph,
      slideId,
      slideLayoutParts: supportParts.slideLayoutParts,
      defaultSlideLayoutPart: supportParts.slideLayoutPart,
    });
    if (input.partial) {
      return [
        partialPptxSlidePartFor({
          graph: input.graph,
          resolvedStyles: input.resolvedStyles,
          slide,
          slideIndex,
          slideFrame,
          slideLayoutPart,
          slidePartId: partId,
        }),
      ];
    }
    if (!layoutSlide) {
      return [];
    }

    return [
      pptxSlidePartFor({
        layoutSlide,
        slideIndex,
        slideFrame,
        slideLayoutPart,
        slidePartId: partId,
      }),
    ];
  });
  const projectedSlidesWithMedia = withCanonicalMediaPartIds(projectedSlides, input.assets);
  const mediaParts = mediaPartsFor(projectedSlidesWithMedia, input.assets);
  const slides = attachMediaRelationships(projectedSlidesWithMedia, mediaParts, input.assets);
  const slideRelationshipParts: PptxPackagePart[] = slides.map((slide, index) => ({
    id: packageIdentity("relationships", `${slide.id}`),
    category: "authored-content",
    kind: "relationships",
    path: `ppt/slides/_rels/slide${index + 1}.xml.rels`,
    relationships: slide.relationships,
    payload: { relationships: slide.relationships ?? [] } satisfies PptxRelationshipsPayload,
    origin: slide.origin,
  }));
  const manifest = buildPptxManifest({
    contentTypes: supportParts.contentTypes,
    rootRelationships: supportParts.rootRelationships,
    presentationPart: supportParts.presentationPart,
    presentationRelationships: supportParts.presentationRelationships,
    themePart: supportParts.themePart,
    slideMasterPart: supportParts.slideMasterPart,
    slideMasterRelationships: supportParts.slideMasterRelationships,
    slideLayoutPart: supportParts.slideLayoutPart,
    slideLayoutRelationships: supportParts.slideLayoutRelationships,
    slideLayoutParts: supportParts.slideLayoutParts,
    slideLayoutRelationshipParts: supportParts.slideLayoutRelationshipParts,
    documentPropertiesPart: supportParts.documentPropertiesPart,
    extendedDocumentPropertiesPart: supportParts.extendedDocumentPropertiesPart,
    viewPropertiesPart: supportParts.viewPropertiesPart,
    presentationPropertiesPart: supportParts.presentationPropertiesPart,
    tableStylesPart: supportParts.tableStylesPart,
    slides,
    mediaParts,
    serializedId,
  });

  const parts = withPackagePartFingerprints(
    withPackagePartRequirements(
      withPackagePartOrderKeys([
        manifest.contentTypes,
        manifest.rootRelationships,
        manifest.presentationPart,
        manifest.presentationRelationships,
        manifest.themePart,
        manifest.slideMasterPart,
        manifest.slideMasterRelationships,
        ...(manifest.slideLayoutParts ?? [manifest.slideLayoutPart]),
        ...(manifest.slideLayoutRelationshipParts ?? [manifest.slideLayoutRelationships]),
        manifest.documentPropertiesPart,
        manifest.extendedDocumentPropertiesPart,
        manifest.viewPropertiesPart,
        manifest.presentationPropertiesPart,
        manifest.tableStylesPart,
        ...slides,
        ...slideRelationshipParts,
        ...mediaParts,
      ]),
    ),
  );

  return {
    format: "pptx",
    size,
    meta: input.options.meta,
    parts,
    slides: parts.filter(isPptxSlidePart),
  };
}

export function projectGraphToPptxPackage(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
  integrationContext?: DeckIntegrationContext;
}): PptxPackageModel {
  return projectGraphToPptxPackageInternal(input);
}

export function projectGraphToPartialPptxPackage(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
  integrationContext?: DeckIntegrationContext;
}): PptxPackageModel {
  return projectGraphToPptxPackageInternal({ ...input, partial: true });
}

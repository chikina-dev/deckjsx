import type { DeckOptions } from "../../authoring/index";
import type { Diagnostics } from "../../diagnostics";
import type { AssetEntity, SemanticAuthorGraph } from "../../graph";
import { resolveProjectedLayoutFromGraph } from "../../layout/graph";
import type { FrameIR } from "../../layout/projected";
import type { ResolvedStyleMap } from "../../style/resolve";
import { EMU_PER_INCH, POINTS_PER_INCH } from "../../types";
import { withPackagePartFingerprints } from "./fingerprint";
import { packageIdentity, serializedId, slidePartIdFor } from "./identity";
import { buildPptxManifest } from "./manifest";
import { attachMediaRelationships, mediaPartsFor, withCanonicalImageMediaPartIds } from "./media";
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
  const projectedLayout = input.partial
    ? undefined
    : resolveProjectedLayoutFromGraph(input.options, input.graph, input.resolvedStyles);
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
    const partId = slidePartIdFor(slide);
    const slideLayoutPart = slideLayoutPartForSlide({
      graph: input.graph,
      slideId,
      slideLayoutParts: supportParts.slideLayoutParts,
      defaultSlideLayoutPart: supportParts.slideLayoutPart,
    });
    return [
      input.partial
        ? partialPptxSlidePartFor({
            graph: input.graph,
            resolvedStyles: input.resolvedStyles,
            slide,
            slideIndex,
            slideFrame,
            slideLayoutPart,
            slidePartId: partId,
          })
        : pptxSlidePartFor({
            graph: input.graph,
            resolvedStyles: input.resolvedStyles,
            slide,
            layoutSlide: projectedLayout?.slides[slideIndex],
            slideIndex,
            slideFrame,
            slideLayoutPart,
            slidePartId: partId,
          }),
    ];
  });
  const projectedSlidesWithMedia = withCanonicalImageMediaPartIds(projectedSlides, input.assets);
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
}): PptxPackageModel {
  return projectGraphToPptxPackageInternal(input);
}

export function projectGraphToPartialPptxPackage(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  assets?: ReadonlyMap<AssetEntity["id"], PptxProjectionAssetArtifact>;
}): PptxPackageModel {
  return projectGraphToPptxPackageInternal({ ...input, partial: true });
}

import type { DeckOptions } from "../authoring/options";
import type { AssetEntityId, GraphNodeId, SemanticAuthorGraph } from "../graph";
import { withPackagePartFingerprints } from "../projection/pptx/fingerprint";
import {
  isPptxPackageModel,
  isPptxSlidePart,
  type PptxPackageModel,
  type PptxPackageModelCandidate,
  type PptxPackagePart,
  type PptxSlidePart,
} from "../projection/pptx/model";
import {
  incrementalProjectionReusePlan,
  slideProjectionFingerprintSnapshots,
} from "../projection/pptx/reuse";
import type { ProjectedDocumentModel } from "../projection/registry";
import type { ResolvedStyleMap } from "../style/resolve";
import type {
  AssetArtifact,
  DefinedGraphArtifact,
  DefinedProjectionArtifact,
  SlideProjectionFingerprintSnapshot,
} from "./artifacts";
import { projectionWithReusablePackageParts } from "./projection-reuse";
import type { ProjectionFormat } from "./public";

export type ProjectionLifecyclePlan = {
  readonly format: ProjectionFormat;
  readonly reusableSlideNodeIds?: ReadonlySet<GraphNodeId>;
  readonly slideProjectionFingerprints?: ReadonlyMap<
    GraphNodeId,
    SlideProjectionFingerprintSnapshot
  >;
};

type ProjectionLifecycleInput = {
  readonly format: ProjectionFormat;
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly options: DeckOptions;
  readonly assets: ReadonlyMap<AssetEntityId, AssetArtifact>;
};

export function prepareProjectionLifecycle(
  input: ProjectionLifecycleInput & {
    readonly previousGraph?: DefinedGraphArtifact;
    readonly previousProjection?: DefinedProjectionArtifact;
    readonly previousOptions?: DeckOptions;
    readonly previousAssets?: ReadonlyMap<AssetEntityId, AssetArtifact>;
    readonly staleAssetEntityIds?: ReadonlySet<AssetEntityId>;
  },
): ProjectionLifecyclePlan {
  if (input.format !== "pptx") {
    return { format: input.format };
  }

  const reuse = incrementalProjectionReusePlan(input);
  return {
    format: input.format,
    ...(reuse?.slideNodeIds ? { reusableSlideNodeIds: reuse.slideNodeIds } : {}),
    ...(reuse?.slideProjectionFingerprints
      ? { slideProjectionFingerprints: reuse.slideProjectionFingerprints }
      : {}),
  };
}

export function applyProjectionReuse(input: {
  readonly projection: ProjectedDocumentModel;
  readonly plan: ProjectionLifecyclePlan;
  readonly previous?: DefinedProjectionArtifact;
  readonly graph: SemanticAuthorGraph;
}): ProjectedDocumentModel {
  const pptxProjection = input.projection as PptxPackageModelCandidate;
  if (input.plan.format !== "pptx" || !isPptxPackageModel(pptxProjection)) {
    return input.projection;
  }

  return projectionWithReusablePackageParts({
    projection: pptxProjection,
    previous: input.previous,
    graph: input.graph,
    reusableSlideNodeIds: input.plan.reusableSlideNodeIds,
  });
}

export function normalizeProjectedDocumentAfterHook(
  projection: ProjectedDocumentModel,
): ProjectedDocumentModel {
  const pptxProjection = projection as PptxPackageModelCandidate;
  if (!isPptxPackageModel(pptxProjection)) {
    return projection;
  }

  const parts = withPackagePartFingerprints(pptxProjection.parts);
  const partsById = new Map(parts.map((part) => [part.id, part]));
  const slides = pptxProjection.slides
    .map((slide): PptxPackagePart | undefined => partsById.get(slide.id))
    .filter((part): part is PptxSlidePart => part !== undefined && isPptxSlidePart(part));

  return { ...pptxProjection, parts, slides } satisfies PptxPackageModel;
}

export function projectionFingerprintsForLifecycle(
  input: ProjectionLifecycleInput & {
    readonly plan: ProjectionLifecyclePlan;
    readonly retain: boolean;
  },
): ReadonlyMap<GraphNodeId, SlideProjectionFingerprintSnapshot> | undefined {
  if (input.format !== "pptx") {
    return undefined;
  }

  return (
    input.plan.slideProjectionFingerprints ??
    (input.retain ? slideProjectionFingerprintSnapshots(input) : undefined)
  );
}

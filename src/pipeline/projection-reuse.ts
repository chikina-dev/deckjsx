import type { GraphNodeId, SemanticAuthorGraph } from "../graph";
import {
  isPptxPackageModel,
  isPptxSlidePart,
  type PptxPackageModel,
  type PptxPackageModelCandidate,
  type PptxPackagePartCandidate,
} from "../projection/pptx/model";
import type { DefinedProjectionArtifact, PptxProjectionArtifact } from "./artifact-contract";

type PptxPackagePartModel = PptxPackageModel["parts"][number];
type DefinedPptxPackageModelArtifact = PptxProjectionArtifact<PptxPackageModel>;

function isDefinedPptxPackageModelArtifact(
  artifact: DefinedProjectionArtifact | undefined,
): artifact is DefinedPptxPackageModelArtifact {
  return (
    artifact !== undefined && isPptxPackageModel(artifact.projection as PptxPackageModelCandidate)
  );
}

export function projectionWithReusablePackageParts(input: {
  projection: PptxPackageModel;
  previous?: DefinedProjectionArtifact;
  graph?: SemanticAuthorGraph;
  reusableSlideNodeIds?: ReadonlySet<GraphNodeId>;
}): PptxPackageModel {
  if (!isDefinedPptxPackageModelArtifact(input.previous) || !input.graph) {
    return input.projection;
  }
  const previousArtifact = input.previous;

  const reusableSlideUnits = reusableSlideUnitIndex({
    graph: input.graph,
    previous: previousArtifact,
    projection: input.projection,
    reusableSlideNodeIds: input.reusableSlideNodeIds,
  });
  let reused = false;
  const parts = input.projection.parts.map((part): PptxPackagePartModel => {
    const previous = previousArtifact.partsById.get(part.id);
    if (
      isIncrementalReusableSlideUnitPart(part, reusableSlideUnits) &&
      previous &&
      isIncrementalReusableSlideUnitPart(previous, reusableSlideUnits) &&
      previous.fingerprint &&
      previous.fingerprint === part.fingerprint
    ) {
      reused = true;
      return previous;
    }

    return part;
  });

  if (!reused) {
    return input.projection;
  }

  return {
    ...input.projection,
    parts,
    slides: parts.filter(isPptxSlidePart),
  };
}

type ReusableSlideUnitIndex = {
  readonly slidePartIds: ReadonlySet<string>;
  readonly slideNodeIds: ReadonlySet<GraphNodeId>;
  readonly slideNodeIdByGraphNodeId: ReadonlyMap<GraphNodeId, GraphNodeId>;
};

function reusableSlideUnitIndex(input: {
  graph: SemanticAuthorGraph;
  previous: DefinedProjectionArtifact;
  projection: PptxPackageModel;
  reusableSlideNodeIds?: ReadonlySet<GraphNodeId>;
}): ReusableSlideUnitIndex {
  const slidePartIds = new Set<string>();
  const slideNodeIds = new Set<GraphNodeId>();
  const reusableSlideNodeIds = input.reusableSlideNodeIds;
  if (!reusableSlideNodeIds) {
    return {
      slidePartIds,
      slideNodeIds,
      slideNodeIdByGraphNodeId: slideNodeIdByGraphNodeId(input.graph),
    };
  }

  input.projection.slides.forEach((slide) => {
    const slideNodeId = slide.origin?.graphNodeIds?.find(
      (id) => input.graph.nodes.get(id)?.kind === "slide",
    );
    if (!slideNodeId) {
      return;
    }
    if (!reusableSlideNodeIds.has(slideNodeId)) {
      return;
    }

    slidePartIds.add(slide.id);
    slideNodeIds.add(slideNodeId);
  });

  return {
    slidePartIds,
    slideNodeIds,
    slideNodeIdByGraphNodeId: slideNodeIdByGraphNodeId(input.graph),
  };
}

function slideNodeIdByGraphNodeId(
  graph: SemanticAuthorGraph,
): ReadonlyMap<GraphNodeId, GraphNodeId> {
  const index = new Map<GraphNodeId, GraphNodeId>();
  const document = graph.nodes.get(graph.documentId);
  if (document?.kind !== "document") {
    return index;
  }

  const visit = (nodeId: GraphNodeId, slideNodeId: GraphNodeId): void => {
    index.set(nodeId, slideNodeId);
    const node = graph.nodes.get(nodeId);
    if (!node) {
      return;
    }

    const children =
      "children" in node ? node.children : "inlineChildren" in node ? node.inlineChildren : [];
    children.forEach((childId) => visit(childId, slideNodeId));
  };

  document.children.forEach((slideNodeId) => {
    const slide = graph.nodes.get(slideNodeId);
    if (slide?.kind === "slide") {
      visit(slideNodeId, slideNodeId);
    }
  });

  return index;
}

function graphNodeIdsBelongToReusableSlideUnit(
  graphNodeIds: readonly GraphNodeId[] | undefined,
  reusableSlideUnits: ReusableSlideUnitIndex,
): boolean {
  if (!graphNodeIds || graphNodeIds.length === 0) {
    return false;
  }

  let ownerSlideNodeId: GraphNodeId | undefined;
  for (const graphNodeId of graphNodeIds) {
    const slideNodeId = reusableSlideUnits.slideNodeIdByGraphNodeId.get(graphNodeId);
    if (!slideNodeId || !reusableSlideUnits.slideNodeIds.has(slideNodeId)) {
      return false;
    }
    if (ownerSlideNodeId && ownerSlideNodeId !== slideNodeId) {
      return false;
    }
    ownerSlideNodeId = slideNodeId;
  }

  return ownerSlideNodeId !== undefined;
}

function isIncrementalReusableSlideUnitPart(
  part: PptxPackagePartCandidate,
  reusableSlideUnits: ReusableSlideUnitIndex,
): boolean {
  if (isPptxSlidePart(part)) {
    return reusableSlideUnits.slidePartIds.has(part.id);
  }

  if (part.category !== "authored-content") {
    return false;
  }

  return part.kind === "media" ||
    (part.kind === "relationships" && part.path.startsWith("ppt/slides/_rels/"))
    ? graphNodeIdsBelongToReusableSlideUnit(part.origin?.graphNodeIds, reusableSlideUnits)
    : false;
}

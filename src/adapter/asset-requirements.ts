import type { WriterAdapter } from "./public";
import type { AssetArtifact, AssetLoadRequirement } from "../asset-artifact";
import type { PptxPackageBuildArtifact } from "../pipeline/artifact-contract";
import type { ProjectedDocumentModel } from "../projection/registry";
import type { PackagePartId } from "../projection/pptx/model";
import type { AssetEntityId } from "../graph";

type RequirementContext = {
  readonly assetsById?: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly pptxBuildArtifactsByPartId?: ReadonlyMap<PackagePartId, PptxPackageBuildArtifact>;
};

type RequirementPlanner = (
  projection: ProjectedDocumentModel,
  context: RequirementContext,
) => readonly AssetLoadRequirement[];

const REQUIREMENT_PLANNER = Symbol.for("deckjsx.writerAdapter.assetRequirements");

type AdapterWithRequirementPlanner = WriterAdapter & {
  readonly [REQUIREMENT_PLANNER]?: RequirementPlanner;
};

/** Attach built-in output preparation policy to the adapter that owns it. */
export function registerAdapterAssetRequirements<TAdapter extends WriterAdapter>(
  adapter: TAdapter,
  planner: RequirementPlanner,
): TAdapter {
  Object.defineProperty(adapter, REQUIREMENT_PLANNER, {
    configurable: false,
    enumerable: false,
    value: planner,
    writable: false,
  });
  return adapter;
}

/** Plan only the byte dependencies of the selected adapter; custom adapters default to none. */
export function assetLoadRequirementsForAdapter(input: {
  readonly adapter: WriterAdapter;
  readonly projection: ProjectedDocumentModel;
  readonly context: RequirementContext;
}): readonly AssetLoadRequirement[] {
  return (
    (input.adapter as AdapterWithRequirementPlanner)[REQUIREMENT_PLANNER]?.(
      input.projection,
      input.context,
    ) ?? []
  );
}

import type { WriterAdapter } from "./adapter";
import {
  attachIntegrationContext,
  type HmrInvalidation,
  type IntegrationContext,
} from "./integration-context";
import {
  mediaSourceOrigins,
  type MediaSourceOrigin,
  type MediaSourceOriginByField,
} from "./media-source-origin";
import type {
  AssetLoadResult,
  AssetLoader,
  AssetLoaderContext,
  AssetLoaderOutcome,
  AssetMediaType,
  AssetProbeResult,
  AssetSource,
  AssetSourceField,
} from "./assets";
import type { RenderPatchPlan, RenderPatchPlanPart, RenderPatchPlanPartKind } from "./pipeline";

export type {
  AssetLoadResult,
  AssetLoader,
  AssetLoaderContext,
  AssetLoaderOutcome,
  AssetMediaType,
  AssetProbeResult,
  AssetSource,
  AssetSourceField,
  RenderPatchPlan,
  RenderPatchPlanPart,
  RenderPatchPlanPartKind,
  HmrInvalidation,
  IntegrationContext,
  MediaSourceOrigin,
  MediaSourceOriginByField,
};

export function withIntegrationContext<TAdapter extends WriterAdapter>(
  adapter: TAdapter,
  context: IntegrationContext,
): TAdapter {
  return attachIntegrationContext(adapter, context);
}

export { mediaSourceOrigins };

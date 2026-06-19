export const RENDER_PATCH_PLAN_KIND = "deckjsx.renderPatchPlan" as const;
export const PATCH_MANIFEST_KIND = "deckjsx.patchManifest" as const;
export const PATCH_MANIFEST_VERSION = 1 as const;
export const PATCH_MANIFEST_PATH = "ppt/deckjsx/patch-manifest.json" as const;

export type RenderPatchPlanPartKind = "manifest" | "media" | "xml";

export type RenderPatchPlanPart = {
  readonly packagePartId: string;
  readonly path: string;
  readonly patchableKind: RenderPatchPlanPartKind;
  readonly reservedCapacity: number;
  readonly logicalByteLength: number;
  readonly storedByteLength: number;
  readonly fingerprint: string;
  readonly buildStatus?: "rebuilt" | "reused";
  readonly buildReason?: string;
};

export type RenderPatchPlan = {
  readonly kind: typeof RENDER_PATCH_PLAN_KIND;
  readonly version: typeof PATCH_MANIFEST_VERSION;
  readonly manifestPath: typeof PATCH_MANIFEST_PATH;
  readonly sourceInvalidation?: {
    readonly changedSourceIds: readonly string[];
  };
  readonly parts: readonly RenderPatchPlanPart[];
};

export type PersistentPatchPlanPart = Omit<RenderPatchPlanPart, "buildReason" | "buildStatus">;

export type PatchManifest = {
  readonly kind: typeof PATCH_MANIFEST_KIND;
  readonly version: typeof PATCH_MANIFEST_VERSION;
  readonly parts: readonly PersistentPatchPlanPart[];
};

export function patchManifestFromParts(parts: readonly RenderPatchPlanPart[]): PatchManifest {
  return {
    kind: PATCH_MANIFEST_KIND,
    version: PATCH_MANIFEST_VERSION,
    parts: parts.flatMap(({ buildReason: _buildReason, buildStatus: _buildStatus, ...part }) =>
      part.patchableKind === "manifest" ? [] : [part],
    ),
  };
}

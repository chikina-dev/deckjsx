/**
 * Public Node integration surface.
 *
 * File Asset loading and artifact output are separate effect Modules; this file defines the package
 * entry seam so internal runtime files never need to import the package entry back.
 */
export {
  createNodeFileAssetLoader,
  nodeAssets,
  nodeFontAssets,
  type NodeFileAssetLoaderOptions,
  type NodeFontAssetsOptions,
} from "./node-file-assets";

export {
  inspectPatchablePptx,
  write,
  type PatchablePptxInspectionResult,
  type PatchablePptxPartInspection,
  type PatchablePptxPartInspectionStatus,
  type WriteDiagnostic,
  type WriteResult,
  type WriteStrategy,
} from "./artifact-file-output";

export {
  defineConfig,
  resolveConfig,
  type DeckjsxConfigContext,
  type DeckjsxConfigDefinition,
  type DeckjsxConfigFactory,
  type DeckjsxConfigInput,
  type DeckjsxResolveResult,
  type ResolvedDeckjsxConfig,
} from "./config";
export { resolveEntries, type ResolvedDeckjsxEntries } from "./entries";

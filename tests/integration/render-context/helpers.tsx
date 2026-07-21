import { pptx, type WriterAdapter, type WriterRenderContext } from "@/src/adapter/index.ts";
import { createDiagnostics } from "@/src/diagnostics/index.ts";
import type { PptxPackageModel } from "@/src/inspect.ts";
import { claimIncrementalArtifactRenderSlot } from "@/src/incremental-artifact-session.ts";
import { ROOT_SOURCE_ARTIFACT_KEY } from "@/src/pipeline/artifacts.ts";
import {
  integrationContextId,
  mediaSourceOrigins,
  createIncrementalArtifactSession,
  claimArtifactWrite,
  getArtifactWriteToken,
  recordArtifactWrite,
  runIncrementalArtifactCycle,
  withRenderExecutionContext,
  type ArtifactWriteToken,
  type AssetLoader,
  type DeckPlugin,
  type IncrementalArtifactCycle,
  type IncrementalArtifactSession,
  type IncrementalArtifactWriteRecord,
} from "@/src/integration.ts";
import { Deck, expectPptxProjection, unzipSync } from "@/tests/helpers.ts";
export const textDecoder = new TextDecoder();
export const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);
export const mp4Bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
export function assetExtension(input: {
  readonly name: string;
  readonly loader?: AssetLoader;
  readonly importer?: string;
}): DeckPlugin {
  return {
    kind: "deckjsx.plugin",
    id: input.name,
    name: input.name,
    integration: {
      id: integrationContextId(input.name),
      ...(input.loader ? { assetLoaders: [input.loader] } : {}),
      ...(input.importer ? { mediaSourceOrigin: { importer: input.importer } } : {}),
    },
  };
}

export {
  claimIncrementalArtifactRenderSlot,
  createDiagnostics,
  createIncrementalArtifactSession,
  claimArtifactWrite,
  Deck,
  getArtifactWriteToken,
  integrationContextId,
  mediaSourceOrigins,
  pptx,
  recordArtifactWrite,
  ROOT_SOURCE_ARTIFACT_KEY,
  runIncrementalArtifactCycle,
  unzipSync,
  withRenderExecutionContext,
  expectPptxProjection,
};
export type {
  ArtifactWriteToken,
  AssetLoader,
  DeckPlugin,
  IncrementalArtifactCycle,
  IncrementalArtifactSession,
  IncrementalArtifactWriteRecord,
  PptxPackageModel,
  WriterAdapter,
  WriterRenderContext,
};

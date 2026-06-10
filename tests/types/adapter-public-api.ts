import { pptx } from "deckjsx/adapter";
import type { PptxRenderOptions, WriterAdapter, WriterRenderContext } from "deckjsx/adapter";
import type { ProjectionFormat } from "deckjsx";
import type { PptxPackageModel } from "deckjsx/inspect";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

const adapter = pptx({ output: "deck.pptx" });
adapter satisfies WriterAdapter<PptxPackageModel>;
adapter.projectionFormat satisfies ProjectionFormat;
adapter.format satisfies "pptx";

const renderOptions = {
  inspection: "summary",
  output: "deck.pptx",
} satisfies PptxRenderOptions;
void renderOptions;

// @ts-expect-error compression is no longer a public render option.
pptx({ compression: "fast" });

type RemovedCompressionSurfaceAssertions = {
  // @ts-expect-error compression mode is not public API.
  compressionMode: import("deckjsx/adapter").PptxCompressionMode;
};
declare const removedCompressionSurfaceAssertions: RemovedCompressionSurfaceAssertions;
void removedCompressionSurfaceAssertions;

const projectionFormat = "pptx" satisfies ProjectionFormat;
void projectionFormat;

const projectionFormatTypeAssertions = {
  pdfIsNotAProjectionFormat: true,
} satisfies {
  pdfIsNotAProjectionFormat: Assert<
    IsAssignable<"pdf", ProjectionFormat> extends true ? false : true
  >;
};
void projectionFormatTypeAssertions;

declare const renderContext: WriterRenderContext;
renderContext.kind satisfies "deckjsx.writerRenderContext";

// @ts-expect-error WriterRenderContext is intentionally opaque to public adapter authors.
void renderContext.assetsById;

// @ts-expect-error WriterRenderContext must not expose internal build artifact storage.
void renderContext.pptxBuildArtifactsByPartId;

type AdapterPrivateLeakAssertions = {
  // @ts-expect-error the historical pptxgenjs adapter is removed from the core adapter API.
  pptxgenjs: typeof import("deckjsx/adapter").pptxgenjs;
  // @ts-expect-error internal asset artifacts are not adapter public API.
  assetArtifact: import("deckjsx/adapter").AssetArtifact;
  // @ts-expect-error internal PPTX package build artifacts are not adapter public API.
  buildArtifact: import("deckjsx/adapter").PptxPackageBuildArtifact;
  // @ts-expect-error writer render context construction is owned by the internal Render pipeline.
  createWriterRenderContext: typeof import("deckjsx/adapter").createWriterRenderContext;
  // @ts-expect-error PPTX media payload inspection belongs to deckjsx/inspect.
  mediaPayload: import("deckjsx/adapter").PptxMediaPartPayload;
  // @ts-expect-error PPTX package dependency inspection belongs to deckjsx/inspect.
  packageDependencySummary: import("deckjsx/adapter").ProjectInspectionPackageDependencySummary;
  // @ts-expect-error derived projection inspection views belong to deckjsx/inspect.
  projectInspectionDetails: import("deckjsx/adapter").ProjectInspectionDetails;
  // @ts-expect-error detailed package dependency invalidation view belongs to deckjsx/inspect.
  packageDependencyInvalidation: import("deckjsx/adapter").ProjectInspectionPackageDependencyInvalidationView;
  // @ts-expect-error detailed paint fallback aggregation view belongs to deckjsx/inspect.
  paintFallbackAggregation: import("deckjsx/adapter").ProjectInspectionPaintFallbackAggregationView;
  // @ts-expect-error detailed theme projection view belongs to deckjsx/inspect.
  themeProjections: import("deckjsx/adapter").ProjectInspectionThemeProjectionView;
  // @ts-expect-error XML byte writer helpers are internal writer implementation details.
  xmlWriter: import("deckjsx/adapter").XmlChunkWriter;
  // @ts-expect-error ZIP helpers stay behind the direct writer.
  zipBytes: import("deckjsx/adapter").createPptxZipBytes;
  // @ts-expect-error deep direct-writer modules are not public adapter subpaths.
  writerSubpath: import("deckjsx/writers/pptx");
  // @ts-expect-error deep ZIP implementation modules are not public adapter subpaths.
  zipSubpath: import("deckjsx/writers/pptx/zip");
  // @ts-expect-error runtime output modules are not public adapter subpaths.
  runtimeOutputSubpath: import("deckjsx/runtime/node-output");
};
declare const adapterPrivateLeakAssertions: AdapterPrivateLeakAssertions;
void adapterPrivateLeakAssertions;

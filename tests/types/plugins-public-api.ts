import type {
  NodeFileAssetLoaderOptions,
  PatchablePptxInspectionResult,
  PatchablePptxPartInspection,
  PatchablePptxPartInspectionStatus,
  WriteDiagnostic,
  WriteResult,
  WriteStrategy,
} from "@deckjsx/node";
import { createNodeFileAssetLoader, inspectPatchablePptx, write } from "@deckjsx/node";
import type { DeckjsxVitePlugin, ViteAssetLoaderOptions } from "@deckjsx/vite";
import deckjsx, { createViteAssetLoader } from "@deckjsx/vite";
import type { RenderResult } from "deckjsx";
import type { AssetLoader, RenderPatchPlanPart } from "deckjsx/integration";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

const writeStrategy = "in-place" satisfies WriteStrategy;
void writeStrategy;

const writeDiagnostic = {
  code: "deckjsx.node.write.example",
  message: "example diagnostic",
  path: "/project/out.pptx",
} satisfies WriteDiagnostic;
void writeDiagnostic;

const writeResult = {
  path: "/project/out.pptx",
  status: "patched",
  strategy: "in-place",
  bytesWritten: 1024,
  patchedParts: ["ppt/slides/slide1.xml"],
  diagnostics: [writeDiagnostic],
} satisfies WriteResult;
void writeResult;

const nodeLoaderOptions = {
  root: "/project",
  resolverIdentity: "test:node-loader",
} satisfies NodeFileAssetLoaderOptions;

const nodeLoader = createNodeFileAssetLoader(nodeLoaderOptions);
nodeLoader satisfies AssetLoader;

declare const renderResult: RenderResult;
const writePromise = write(renderResult, "/project/out.pptx");
void (writePromise satisfies Promise<WriteResult>);

const inspectionStatus = "verified" satisfies PatchablePptxPartInspectionStatus;
void inspectionStatus;

const inspectedPart = {
  packagePartId: "pptx:slide:example",
  path: "ppt/slides/slide1.xml",
  patchableKind: "xml",
  reservedCapacity: 65536,
  logicalByteLength: 1024,
  storedByteLength: 66589,
  fingerprint: "fnv1a32:11111111",
  status: inspectionStatus,
  currentFingerprint: "fnv1a32:11111111",
  zipMethod: 0,
} satisfies PatchablePptxPartInspection;
void inspectedPart;

const inspection = {
  path: "/project/out.pptx",
  ok: true,
  patchable: true,
  manifestPath: "ppt/deckjsx/patch-manifest.json",
  partCount: 1,
  parts: [inspectedPart],
  diagnostics: [],
} satisfies PatchablePptxInspectionResult;
void inspection;

const inspectionPromise = inspectPatchablePptx("/project/out.pptx");
void (inspectionPromise satisfies Promise<PatchablePptxInspectionResult>);

const viteOptions = {
  root: "/project",
  publicDir: "/project/public",
} satisfies ViteAssetLoaderOptions;

const viteLoader = createViteAssetLoader(viteOptions);
viteLoader satisfies AssetLoader;

const vitePlugin = deckjsx();
vitePlugin satisfies DeckjsxVitePlugin;

type PluginAssertions = {
  readonly nodeInspectionKeepsPatchPlanPartShape: Assert<
    IsAssignable<
      PatchablePptxPartInspection,
      Omit<RenderPatchPlanPart, "buildReason" | "buildStatus">
    >
  >;
  readonly writeResultStatusIsClosed: Assert<
    IsAssignable<WriteResult["status"], "created" | "failed" | "patched" | "replaced">
  >;
};

declare const pluginAssertions: PluginAssertions;
void pluginAssertions;

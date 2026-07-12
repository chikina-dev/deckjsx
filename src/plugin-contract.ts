import type { AssetLoader } from "./assets";
import type { ComposedAuthorRoot } from "./composition/types";
import type { Diagnostic } from "./diagnostics";
import type { AssetEntityId, SemanticAuthorGraph } from "./graph";
import type { DeckIntegrationContext } from "./integration-context";
import type { MediaSourceOrigin } from "./media-source-origin";
import type { RenderedArtifact } from "./pipeline/public";
import type { AssetArtifact } from "./pipeline/artifacts";
import type { ProjectedDocumentModel } from "./projection/registry";
import type { ResolvedStyleMap } from "./style/resolve";

export type { SourceInvalidation } from "./source-invalidation";

export type PluginHookResult<TUpdate extends object = object> =
  | void
  | (Partial<TUpdate> & {
      readonly diagnostics?: readonly Diagnostic[];
    });

export type TreeLifecycleSnapshot = {
  readonly stage: "tree";
  readonly phase: "before" | "after";
  readonly rootCount?: number;
};

export type BeforeTreeLifecycleContext = {
  readonly stage: "tree";
  readonly phase: "before";
};

export type AfterTreeLifecycleContext = {
  readonly stage: "tree";
  readonly phase: "after";
  readonly roots: readonly ComposedAuthorRoot[];
};

export type AfterTreeLifecycleUpdate = {
  readonly roots: readonly ComposedAuthorRoot[];
};

export type GraphLifecycleSnapshot = {
  readonly stage: "graph";
  readonly phase: "before" | "after";
  readonly nodeCount?: number;
  readonly assetCount?: number;
  readonly styleCount?: number;
};

export type BeforeGraphLifecycleContext = {
  readonly stage: "graph";
  readonly phase: "before";
  readonly roots: readonly ComposedAuthorRoot[];
};

export type BeforeGraphLifecycleUpdate = {
  readonly roots: readonly ComposedAuthorRoot[];
};

export type AfterGraphLifecycleContext = {
  readonly stage: "graph";
  readonly phase: "after";
  readonly roots: readonly ComposedAuthorRoot[];
  readonly graph?: SemanticAuthorGraph;
  readonly resolvedStyles?: ResolvedStyleMap;
};

export type AfterGraphLifecycleUpdate = {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
};

export type AssetLifecycleSnapshot = {
  readonly stage: "asset";
  readonly phase: "before" | "after";
  readonly assetCount?: number;
};

export type BeforeAssetLifecycleContext = {
  readonly stage: "asset";
  readonly phase: "before";
  readonly operation: "probe" | "load";
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
  readonly integrationContext?: DeckIntegrationContext;
};

export type BeforeAssetLifecycleUpdate = {
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
  readonly integrationContext?: DeckIntegrationContext;
};

export type AfterAssetLifecycleContext = {
  readonly stage: "asset";
  readonly phase: "after";
  readonly operation: "probe" | "load";
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
  readonly integrationContext?: DeckIntegrationContext;
};

export type AfterAssetLifecycleUpdate = {
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
  readonly integrationContext?: DeckIntegrationContext;
};

export type ProjectLifecycleSnapshot = {
  readonly stage: "project";
  readonly phase: "before" | "after";
  readonly format: string;
  readonly partCount?: number;
};

export type BeforeProjectLifecycleContext = {
  readonly stage: "project";
  readonly phase: "before";
  readonly format: string;
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
};

export type BeforeProjectLifecycleUpdate = {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
};

export type AfterProjectLifecycleContext = {
  readonly stage: "project";
  readonly phase: "after";
  readonly format: string;
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly projection: ProjectedDocumentModel;
};

export type AfterProjectLifecycleUpdate = {
  readonly projection: ProjectedDocumentModel;
};

export type RenderLifecycleSnapshot = {
  readonly stage: "render";
  readonly phase: "before" | "after";
  readonly format: string;
  readonly artifactByteLength?: number;
};

export type BeforeRenderLifecycleContext = {
  readonly stage: "render";
  readonly phase: "before";
  readonly format: string;
  readonly projection: ProjectedDocumentModel;
};

export type BeforeRenderLifecycleUpdate = {
  readonly projection: ProjectedDocumentModel;
};

export type AfterRenderLifecycleContext = {
  readonly stage: "render";
  readonly phase: "after";
  readonly format: string;
  readonly projection: ProjectedDocumentModel;
  readonly artifact?: RenderedArtifact;
};

export type AfterRenderLifecycleUpdate = {
  readonly artifact?: RenderedArtifact;
};

export type DeckPluginHooks = {
  beforeTree?(context: BeforeTreeLifecycleContext): PluginHookResult;
  afterTree?(context: AfterTreeLifecycleContext): PluginHookResult<AfterTreeLifecycleUpdate>;
  beforeGraph?(context: BeforeGraphLifecycleContext): PluginHookResult<BeforeGraphLifecycleUpdate>;
  afterGraph?(context: AfterGraphLifecycleContext): PluginHookResult<AfterGraphLifecycleUpdate>;
  beforeAsset?(context: BeforeAssetLifecycleContext): PluginHookResult<BeforeAssetLifecycleUpdate>;
  afterAsset?(context: AfterAssetLifecycleContext): PluginHookResult<AfterAssetLifecycleUpdate>;
  beforeProject?(
    context: BeforeProjectLifecycleContext,
  ): PluginHookResult<BeforeProjectLifecycleUpdate>;
  afterProject?(
    context: AfterProjectLifecycleContext,
  ): PluginHookResult<AfterProjectLifecycleUpdate>;
  beforeRender?(
    context: BeforeRenderLifecycleContext,
  ): PluginHookResult<BeforeRenderLifecycleUpdate>;
  afterRender?(context: AfterRenderLifecycleContext): PluginHookResult<AfterRenderLifecycleUpdate>;
};

export type DeckPlugin = {
  readonly kind: "deckjsx.plugin";
  readonly id: string;
  readonly name?: string;
  readonly integration?: DeckIntegrationContext;
  readonly hooks?: DeckPluginHooks;
};

export type ValidatedPluginSnapshot = {
  readonly plugins: readonly DeckPlugin[];
};

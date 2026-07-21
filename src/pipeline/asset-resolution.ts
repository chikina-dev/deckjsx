import type { AssetLoader, AssetLoadResult, AssetProbeResult } from "../assets";
import { loadBuiltInAssetSource, probeBuiltInAssetSource } from "../asset-builtins";
import {
  BUILTIN_ASSET_RESOLVER_IDENTITY,
  assetDependencyBoundaryValue,
  assetDiagnostic,
  assetLoaderBoundaryOutcome,
  assetLoaderForIdentity,
  assetLoadersWithIdentities,
  assetSourceFromEntity,
  missingAssetContextDiagnostics,
  missingRequiredAssetProbeDiagnostics,
  missingRequiredAssetProbeFields,
  normalizedAssetLoadResult,
  normalizedAssetProbeResult,
} from "../asset-loading";
import { createDiagnostics, type Diagnostics } from "../diagnostics";
import type { AssetEntityId, SemanticAuthorGraph } from "../graph";
import {
  fontAssetEntityId,
  type DeckIntegrationContext,
  type FontAssetRegistration,
} from "../integration-context";
import type { MediaSourceOrigin } from "../media-source-origin";
import {
  assetSourceCacheKey,
  type AssetArtifact,
  type AssetArtifactStore,
  type AssetLoadRequirement,
} from "../asset-artifact";

function combineDiagnostics(...diagnostics: readonly Diagnostics[]): Diagnostics {
  return createDiagnostics(diagnostics.flatMap((item) => item.items));
}

function emptyDiagnostics(): Diagnostics {
  return createDiagnostics();
}

async function resolveFontAssetRegistration(input: {
  readonly registration: FontAssetRegistration;
  readonly loaders?: readonly AssetLoader[];
  readonly artifacts?: AssetArtifactStore;
  readonly origin?: MediaSourceOrigin;
}): Promise<{
  readonly registration: FontAssetRegistration;
  readonly artifact: AssetArtifact;
  readonly diagnostics: Diagnostics;
}> {
  const source = input.registration.source;
  const assetEntityId = fontAssetEntityId(input.registration);
  const loaders = assetLoadersWithIdentities(input.loaders);
  let cached = input.artifacts?.assetsById.get(assetEntityId);
  const cachedMatchesSource =
    cached !== undefined &&
    assetSourceCacheKey(
      cached.source,
      cached.resolverIdentity,
      cached.origin,
      cached.sourceField,
    ) === assetSourceCacheKey(source, cached.resolverIdentity, input.origin, "font");
  if (!cachedMatchesSource) {
    cached = undefined;
  }
  if (!cached) {
    for (const { resolverIdentity } of loaders) {
      cached = input.artifacts?.assetsBySourceCacheKey.get(
        assetSourceCacheKey(source, resolverIdentity, input.origin, "font"),
      );
      if (cached?.load) {
        break;
      }
    }
  }
  cached ??= input.artifacts?.assetsBySourceCacheKey.get(
    assetSourceCacheKey(source, BUILTIN_ASSET_RESOLVER_IDENTITY, input.origin, "font"),
  );

  if (cached?.load) {
    const probeDiagnostics = cached.probeDiagnostics ?? cached.diagnostics;
    const loadDiagnostics = cached.loadDiagnostics ?? emptyDiagnostics();
    const diagnostics = combineDiagnostics(probeDiagnostics, loadDiagnostics);
    const artifact = {
      ...cached,
      assetEntityId,
      source,
      sourceField: "font" as const,
      ...(input.origin ? { origin: input.origin } : {}),
      probeDiagnostics,
      loadDiagnostics,
      diagnostics,
    } satisfies AssetArtifact;
    input.artifacts?.materializeAsset(artifact);
    return {
      registration: fontRegistrationWithLoad(input.registration, cached.load),
      artifact,
      diagnostics,
    };
  }

  let probe = cached?.probe;
  let load = cached?.load;
  let resolverIdentity = cached?.resolverIdentity ?? BUILTIN_ASSET_RESOLVER_IDENTITY;
  let probeDiagnostics = cached?.probeDiagnostics ?? cached?.diagnostics ?? emptyDiagnostics();
  let loadDiagnostics = cached?.loadDiagnostics ?? emptyDiagnostics();
  let resolutionStopped = false;
  const scopedProbeLoader = cached?.resolverIdentity
    ? assetLoaderForIdentity(loaders, cached.resolverIdentity)
    : undefined;
  const probeLoaders = cached?.resolverIdentity
    ? scopedProbeLoader
      ? [scopedProbeLoader]
      : []
    : loaders;

  if (!probe) {
    for (const { loader, resolverIdentity: loaderResolverIdentity } of probeLoaders) {
      const outcome = await assetLoaderBoundaryOutcome({
        invoke: () =>
          loader.probe?.({
            source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId,
            sourceField: "font",
            ...(input.origin ? { origin: input.origin } : {}),
          }),
        stage: "project",
        code: "E_PROJECT_ASSET_PROBE_OUTCOME_INVALID",
        title: "asset probe outcome is invalid",
        failureCode: "E_PROJECT_ASSET_PROBE_FAILED",
        failureTitle: "asset probe failed",
        phase: "probe",
        source,
        resolverIdentity: loaderResolverIdentity,
        assetEntityId,
      });
      if (outcome.kind === "failed") {
        probeDiagnostics = combineDiagnostics(probeDiagnostics, outcome.diagnostics);
        resolverIdentity = loaderResolverIdentity;
        resolutionStopped = true;
        break;
      }
      if (outcome.kind === "resolved") {
        const normalized = normalizedAssetProbeResult({
          result: outcome.value,
          source,
          resolverIdentity: loaderResolverIdentity,
          assetEntityId,
        });
        if (!normalized.ok) {
          probeDiagnostics = combineDiagnostics(probeDiagnostics, normalized.diagnostics);
          continue;
        }
        probe = normalized.result;
        resolverIdentity = loaderResolverIdentity;
        probeDiagnostics = combineDiagnostics(probeDiagnostics, outcome.diagnostics);
        break;
      }
    }
  }

  if (!probe && !resolutionStopped) {
    const builtInResult = await assetDependencyBoundaryValue({
      invoke: () => probeBuiltInAssetSource(source),
      stage: "project",
      code: "E_PROJECT_ASSET_PROBE_FAILED",
      title: "asset probe failed",
      phase: "probe",
      source,
      resolverIdentity: BUILTIN_ASSET_RESOLVER_IDENTITY,
      assetEntityId,
    });
    if (builtInResult.ok) {
      const builtIn = builtInResult.value;
      if (builtIn) {
        probe = builtIn.probe;
        load = builtIn.load;
        resolverIdentity = BUILTIN_ASSET_RESOLVER_IDENTITY;
        probeDiagnostics = combineDiagnostics(
          probeDiagnostics,
          builtIn.diagnostics ?? emptyDiagnostics(),
        );
        resolutionStopped = builtIn.diagnostics?.hasErrors ?? false;
      }
    } else {
      probeDiagnostics = combineDiagnostics(probeDiagnostics, builtInResult.diagnostics);
    }
  }

  const resolvedLoader =
    resolverIdentity === BUILTIN_ASSET_RESOLVER_IDENTITY
      ? undefined
      : assetLoaderForIdentity(loaders, resolverIdentity);
  const loadLoaders = resolvedLoader ? [resolvedLoader] : loaders;

  for (const { loader, resolverIdentity: loaderResolverIdentity } of loadLoaders) {
    if (load || resolutionStopped) {
      break;
    }
    const outcome = await assetLoaderBoundaryOutcome({
      invoke: () =>
        loader.load?.({
          source,
          resolverIdentity: loaderResolverIdentity,
          assetEntityId,
          sourceField: "font",
          ...(input.origin ? { origin: input.origin } : {}),
        }),
      stage: "project",
      code: "E_PROJECT_ASSET_LOAD_OUTCOME_INVALID",
      title: "asset load outcome is invalid",
      failureCode: "E_PROJECT_ASSET_LOAD_FAILED",
      failureTitle: "asset load failed",
      phase: "load",
      source,
      resolverIdentity: loaderResolverIdentity,
      assetEntityId,
    });
    if (outcome.kind === "failed") {
      loadDiagnostics = combineDiagnostics(loadDiagnostics, outcome.diagnostics);
      resolverIdentity = loaderResolverIdentity;
      resolutionStopped = true;
      break;
    }
    if (outcome.kind === "resolved") {
      const normalized = normalizedAssetLoadResult({
        result: outcome.value,
        source,
        resolverIdentity: loaderResolverIdentity,
        stage: "project",
        assetEntityId,
      });
      if (!normalized.ok) {
        loadDiagnostics = combineDiagnostics(loadDiagnostics, normalized.diagnostics);
        continue;
      }

      load = normalized.result;
      resolverIdentity = loaderResolverIdentity;
      loadDiagnostics = combineDiagnostics(loadDiagnostics, outcome.diagnostics);
      break;
    }
  }

  if (!load && !resolutionStopped && resolverIdentity === BUILTIN_ASSET_RESOLVER_IDENTITY) {
    const builtInResult = await assetDependencyBoundaryValue({
      invoke: () => loadBuiltInAssetSource(source),
      stage: "project",
      code: "E_PROJECT_ASSET_LOAD_FAILED",
      title: "asset load failed",
      phase: "load",
      source,
      resolverIdentity,
      assetEntityId,
    });
    if (builtInResult.ok) {
      load = builtInResult.value;
    } else {
      loadDiagnostics = combineDiagnostics(loadDiagnostics, builtInResult.diagnostics);
    }
  }

  const phaseDiagnostics = combineDiagnostics(probeDiagnostics, loadDiagnostics);
  if (!load && !phaseDiagnostics.hasErrors && source.kind === "path") {
    loadDiagnostics = combineDiagnostics(
      loadDiagnostics,
      missingAssetContextDiagnostics({ source, sourceField: "font", assetEntityId }),
    );
  }

  const diagnostics = combineDiagnostics(probeDiagnostics, loadDiagnostics);
  const artifact = {
    assetEntityId,
    source,
    sourceField: "font" as const,
    resolverIdentity,
    ...(input.origin ? { origin: input.origin } : {}),
    ...(probe ? { probe } : {}),
    ...(load ? { load } : {}),
    probeDiagnostics,
    loadDiagnostics,
    diagnostics,
  } satisfies AssetArtifact;
  input.artifacts?.materializeAsset(artifact);

  return {
    registration: load ? fontRegistrationWithLoad(input.registration, load) : input.registration,
    artifact,
    diagnostics,
  };
}

function fontRegistrationWithLoad(
  registration: FontAssetRegistration,
  load: AssetLoadResult,
): FontAssetRegistration {
  return {
    ...registration,
    source: {
      kind: "bytes",
      bytes: load.bytes,
      ...(load.mediaType ? { mediaType: load.mediaType } : {}),
      ...(load.extension ? { extension: load.extension } : {}),
    },
  };
}

export async function resolveIntegrationFontAssets(input: {
  readonly integrationContext?: DeckIntegrationContext;
  readonly loaders?: readonly AssetLoader[];
  readonly artifacts?: AssetArtifactStore;
  readonly origin?: MediaSourceOrigin;
}): Promise<{
  readonly integrationContext?: DeckIntegrationContext;
  readonly assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
  readonly diagnostics: Diagnostics;
}> {
  const fontAssets = input.integrationContext?.fontAssets;
  if (!input.integrationContext || !fontAssets || fontAssets.length === 0) {
    return {
      integrationContext: input.integrationContext,
      assetsById: new Map(),
      diagnostics: emptyDiagnostics(),
    };
  }

  const resolved: Awaited<ReturnType<typeof resolveFontAssetRegistration>>[] = [];
  for (const registration of fontAssets) {
    resolved.push(
      await resolveFontAssetRegistration({
        registration,
        loaders: input.loaders,
        artifacts: input.artifacts,
        ...(input.origin ? { origin: input.origin } : {}),
      }),
    );
  }
  const nextFontAssets = resolved.map((entry) => entry.registration);
  const assetsById = new Map(
    resolved.map((entry) => [entry.artifact.assetEntityId, entry.artifact]),
  );
  const diagnostics = combineDiagnostics(...resolved.map((entry) => entry.diagnostics));
  const changed = nextFontAssets.some((registration, index) => registration !== fontAssets[index]);

  return {
    integrationContext: changed
      ? {
          ...input.integrationContext,
          fontAssets: nextFontAssets,
        }
      : input.integrationContext,
    assetsById,
    diagnostics,
  };
}

export async function resolveAssetArtifacts(input: {
  graph: SemanticAuthorGraph;
  loaders?: readonly AssetLoader[];
  artifacts?: AssetArtifactStore;
  mediaSourceOrigin?: MediaSourceOrigin;
}): Promise<{
  diagnostics: Diagnostics;
  assetsById: ReadonlyMap<AssetEntityId, AssetArtifact>;
}> {
  const diagnostics: Diagnostics[] = [];
  const assetsById = new Map<AssetEntityId, AssetArtifact>();

  for (const [assetEntityId, asset] of input.graph.assets) {
    const source = assetSourceFromEntity(asset);
    const assetOrigin = asset.origin ?? input.mediaSourceOrigin;
    const loaders = assetLoadersWithIdentities(input.loaders);
    let probe: AssetProbeResult | undefined;
    let load: AssetLoadResult | undefined;
    let resolverIdentity = BUILTIN_ASSET_RESOLVER_IDENTITY;
    let assetDiagnostics = emptyDiagnostics();
    let resolutionStopped = false;
    let cached = input.artifacts?.assetsById.get(assetEntityId);
    const cachedMatchesSource =
      cached !== undefined &&
      assetSourceCacheKey(
        cached.source,
        cached.resolverIdentity,
        cached.origin,
        cached.sourceField,
      ) === assetSourceCacheKey(source, cached.resolverIdentity, assetOrigin, asset.sourceField);
    if (!cachedMatchesSource) {
      cached = undefined;
    }

    if (!cached) {
      for (const { resolverIdentity } of loaders) {
        cached = input.artifacts?.assetsBySourceCacheKey.get(
          assetSourceCacheKey(source, resolverIdentity, assetOrigin, asset.sourceField),
        );
        if (cached?.probe) {
          break;
        }
      }
    }

    if (!cached) {
      cached = input.artifacts?.assetsBySourceCacheKey.get(
        assetSourceCacheKey(
          source,
          BUILTIN_ASSET_RESOLVER_IDENTITY,
          assetOrigin,
          asset.sourceField,
        ),
      );
    }

    if (cached?.probe) {
      const probeDiagnostics = cached.probeDiagnostics ?? cached.diagnostics;
      const durableLoadDiagnostics =
        cached.loadDiagnostics && !cached.loadDiagnostics.hasErrors
          ? cached.loadDiagnostics
          : emptyDiagnostics();
      const reusableDiagnostics = combineDiagnostics(probeDiagnostics, durableLoadDiagnostics);
      const artifact = {
        ...cached,
        assetEntityId,
        probeDiagnostics,
        diagnostics: reusableDiagnostics,
      } satisfies AssetArtifact;
      input.artifacts?.materializeAsset(artifact);
      assetsById.set(assetEntityId, artifact);
      diagnostics.push(reusableDiagnostics);
      continue;
    }

    for (const { loader, resolverIdentity: loaderResolverIdentity } of loaders) {
      const outcome = await assetLoaderBoundaryOutcome({
        invoke: () =>
          loader.probe?.({
            source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId,
            sourceField: asset.sourceField,
            ...(assetOrigin ? { origin: assetOrigin } : {}),
          }),
        stage: "project",
        code: "E_PROJECT_ASSET_PROBE_OUTCOME_INVALID",
        title: "asset probe outcome is invalid",
        failureCode: "E_PROJECT_ASSET_PROBE_FAILED",
        failureTitle: "asset probe failed",
        phase: "probe",
        source,
        resolverIdentity: loaderResolverIdentity,
        assetEntityId,
      });
      if (outcome.kind === "failed") {
        assetDiagnostics = outcome.diagnostics;
        resolverIdentity = loaderResolverIdentity;
        resolutionStopped = true;
        break;
      }
      if (outcome.kind === "resolved") {
        const normalized = normalizedAssetProbeResult({
          result: outcome.value,
          source,
          resolverIdentity: loaderResolverIdentity,
          assetEntityId,
        });
        if (!normalized.ok) {
          diagnostics.push(normalized.diagnostics);
          continue;
        }

        probe = normalized.result;
        resolverIdentity = loaderResolverIdentity;
        assetDiagnostics = outcome.diagnostics;
        break;
      }
    }

    if (!probe && !resolutionStopped) {
      const builtInResult = await assetDependencyBoundaryValue({
        invoke: () => probeBuiltInAssetSource(source),
        stage: "project",
        code: "E_PROJECT_ASSET_PROBE_FAILED",
        title: "asset probe failed",
        phase: "probe",
        source,
        resolverIdentity: BUILTIN_ASSET_RESOLVER_IDENTITY,
        assetEntityId,
      });
      if (builtInResult.ok) {
        const builtInProbe = builtInResult.value;
        if (builtInProbe) {
          const normalized = normalizedAssetProbeResult({
            result: builtInProbe.probe,
            source,
            resolverIdentity: BUILTIN_ASSET_RESOLVER_IDENTITY,
            assetEntityId,
          });
          if (normalized.ok) {
            probe = normalized.result;
            load = builtInProbe.load;
            if (builtInProbe.diagnostics) {
              assetDiagnostics = builtInProbe.diagnostics;
              resolutionStopped = builtInProbe.diagnostics.hasErrors;
            }
          } else {
            diagnostics.push(normalized.diagnostics);
          }
        }
      } else {
        diagnostics.push(builtInResult.diagnostics);
      }
      resolverIdentity = BUILTIN_ASSET_RESOLVER_IDENTITY;
    }

    if (!probe && !resolutionStopped && source.kind === "path") {
      assetDiagnostics = missingAssetContextDiagnostics({
        source,
        sourceField: asset.sourceField,
        assetEntityId,
      });
      resolutionStopped = true;
    }

    const missingRequiredFields = missingRequiredAssetProbeFields({
      probe,
      assetKind: asset.kind,
    });
    if (!resolutionStopped && missingRequiredFields.length > 0) {
      diagnostics.push(
        missingRequiredAssetProbeDiagnostics({
          source,
          resolverIdentity,
          assetEntityId,
          missingFields: missingRequiredFields,
        }),
      );
    }

    const artifactDiagnostics = assetDiagnostics;
    diagnostics.push(artifactDiagnostics);
    const artifact = {
      assetEntityId,
      source,
      sourceField: asset.sourceField,
      resolverIdentity,
      ...(assetOrigin ? { origin: assetOrigin } : {}),
      ...(probe ? { probe } : {}),
      ...(load ? { load } : {}),
      probeDiagnostics: artifactDiagnostics,
      diagnostics: artifactDiagnostics,
    } satisfies AssetArtifact;
    input.artifacts?.materializeAsset(artifact);
    assetsById.set(assetEntityId, artifact);
  }

  return { diagnostics: combineDiagnostics(...diagnostics), assetsById };
}

export async function loadAssetArtifacts(input: {
  artifacts?: AssetArtifactStore;
  loaders?: readonly AssetLoader[];
  mediaSourceOrigin?: MediaSourceOrigin;
  requirements: readonly AssetLoadRequirement[];
}): Promise<Diagnostics> {
  if (!input.artifacts) {
    return emptyDiagnostics();
  }

  const diagnostics: Diagnostics[] = [];
  const mediaPayloads = input.requirements;

  mediaLoop: for (const media of mediaPayloads) {
    const current = input.artifacts.assetsById.get(media.assetEntityId);
    const mediaOrigin = current?.origin ?? input.mediaSourceOrigin;
    const loaders = assetLoadersWithIdentities(input.loaders);
    const currentMatchesSource =
      current !== undefined &&
      assetSourceCacheKey(
        current.source,
        current.resolverIdentity,
        current.origin,
        current.sourceField,
      ) ===
        assetSourceCacheKey(
          media.source,
          current.resolverIdentity,
          current.origin,
          media.sourceField,
        );

    if (currentMatchesSource && current.load) {
      continue;
    }

    const currentResolverIdentity = currentMatchesSource ? current.resolverIdentity : undefined;
    const cached = input.artifacts.assetsBySourceCacheKey.get(
      assetSourceCacheKey(media.source, currentResolverIdentity, mediaOrigin, media.sourceField),
    );
    if (cached?.load) {
      input.artifacts.materializeAsset({
        ...cached,
        assetEntityId: media.assetEntityId,
      });
      diagnostics.push(cached.diagnostics);
      continue;
    }

    let load: AssetLoadResult | undefined;
    let resolverIdentity = currentResolverIdentity ?? BUILTIN_ASSET_RESOLVER_IDENTITY;
    let assetDiagnostics = emptyDiagnostics();
    let resolutionStopped = false;
    const scopedLoader = currentResolverIdentity
      ? assetLoaderForIdentity(loaders, currentResolverIdentity)
      : undefined;
    const scopedLoaders = currentResolverIdentity ? (scopedLoader ? [scopedLoader] : []) : loaders;

    for (const { loader, resolverIdentity: loaderResolverIdentity } of scopedLoaders) {
      const loaderCached = input.artifacts.assetsBySourceCacheKey.get(
        assetSourceCacheKey(media.source, loaderResolverIdentity, mediaOrigin, media.sourceField),
      );
      if (loaderCached?.load) {
        input.artifacts.materializeAsset({
          ...loaderCached,
          assetEntityId: media.assetEntityId,
        });
        diagnostics.push(loaderCached.diagnostics);
        continue mediaLoop;
      }

      const outcome = await assetLoaderBoundaryOutcome({
        invoke: () =>
          loader.load?.({
            source: media.source,
            resolverIdentity: loaderResolverIdentity,
            assetEntityId: media.assetEntityId,
            sourceField: media.sourceField,
            ...(mediaOrigin ? { origin: mediaOrigin } : {}),
          }),
        stage: "render",
        code: "E_RENDER_ASSET_LOAD_OUTCOME_INVALID",
        title: "asset load outcome is invalid",
        failureCode: "E_RENDER_ASSET_LOAD_FAILED",
        failureTitle: "asset load failed",
        phase: "load",
        source: media.source,
        resolverIdentity: loaderResolverIdentity,
        assetEntityId: media.assetEntityId,
        packagePartPath: media.packagePartPath,
      });
      if (outcome.kind === "failed") {
        assetDiagnostics = outcome.diagnostics;
        resolverIdentity = loaderResolverIdentity;
        resolutionStopped = true;
        break;
      }
      if (outcome.kind === "resolved") {
        const normalized = normalizedAssetLoadResult({
          result: outcome.value,
          source: media.source,
          resolverIdentity: loaderResolverIdentity,
          assetEntityId: media.assetEntityId,
          packagePartPath: media.packagePartPath,
        });
        if (!normalized.ok) {
          diagnostics.push(normalized.diagnostics);
          continue;
        }

        load = normalized.result;
        resolverIdentity = loaderResolverIdentity;
        assetDiagnostics = outcome.diagnostics;
        break;
      }
    }

    if (
      !load &&
      !resolutionStopped &&
      (!currentResolverIdentity || currentResolverIdentity === BUILTIN_ASSET_RESOLVER_IDENTITY)
    ) {
      const builtInResult = await assetDependencyBoundaryValue({
        invoke: () => loadBuiltInAssetSource(media.source),
        stage: "render",
        code: "E_RENDER_ASSET_LOAD_FAILED",
        title: "asset load failed",
        phase: "load",
        source: media.source,
        resolverIdentity,
        assetEntityId: media.assetEntityId,
        packagePartPath: media.packagePartPath,
      });
      if (builtInResult.ok) {
        const builtInLoad = builtInResult.value;
        if (builtInLoad) {
          const normalized = normalizedAssetLoadResult({
            result: builtInLoad,
            source: media.source,
            resolverIdentity: BUILTIN_ASSET_RESOLVER_IDENTITY,
            assetEntityId: media.assetEntityId,
            packagePartPath: media.packagePartPath,
          });
          if (normalized.ok) {
            load = normalized.result;
          } else {
            diagnostics.push(normalized.diagnostics);
          }
        }
        resolverIdentity = BUILTIN_ASSET_RESOLVER_IDENTITY;
      } else {
        diagnostics.push(builtInResult.diagnostics);
      }
    }

    if (!load && resolutionStopped) {
      diagnostics.push(assetDiagnostics);
      const probeDiagnostics =
        currentMatchesSource && current.probe
          ? (current.probeDiagnostics ?? current.diagnostics)
          : emptyDiagnostics();
      input.artifacts.materializeAsset({
        assetEntityId: media.assetEntityId,
        source: currentMatchesSource ? current.source : media.source,
        sourceField: media.sourceField,
        resolverIdentity,
        ...(currentMatchesSource && current.origin ? { origin: current.origin } : {}),
        ...(currentMatchesSource && current.probe ? { probe: current.probe } : {}),
        probeDiagnostics,
        loadDiagnostics: assetDiagnostics,
        diagnostics: combineDiagnostics(probeDiagnostics, assetDiagnostics),
      });
      continue;
    }

    if (!load) {
      diagnostics.push(
        assetDiagnostic({
          stage: "render",
          code: "E_RENDER_ASSET_LOAD_FAILED",
          title: "asset load failed",
          phase: "load",
          source: media.source,
          resolverIdentity,
          assetEntityId: media.assetEntityId,
          packagePartPath: media.packagePartPath,
          message: "No asset loader returned bytes for this media source.",
        }),
      );
      continue;
    }

    const probeDiagnostics =
      currentMatchesSource && current.probe
        ? (current.probeDiagnostics ?? current.diagnostics)
        : emptyDiagnostics();
    const artifactDiagnostics = combineDiagnostics(probeDiagnostics, assetDiagnostics);
    diagnostics.push(assetDiagnostics);
    input.artifacts.materializeAsset({
      assetEntityId: media.assetEntityId,
      source: currentMatchesSource ? current.source : media.source,
      sourceField: media.sourceField,
      resolverIdentity,
      ...(currentMatchesSource && current.origin ? { origin: current.origin } : {}),
      ...(currentMatchesSource && current.probe ? { probe: current.probe } : {}),
      load,
      probeDiagnostics,
      loadDiagnostics: assetDiagnostics,
      diagnostics: artifactDiagnostics,
    });
  }

  return combineDiagnostics(...diagnostics);
}

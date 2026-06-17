import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import type {
  AssetLoadResult,
  AssetLoader,
  AssetLoaderOutcome,
  AssetProbeResult,
  AssetResolutionProvenanceKind,
  AssetSource,
  HmrInvalidation,
} from "deckjsx/integration";
import { integrationContextId, withRenderExecutionContext } from "deckjsx/integration";
import { canTransformDeckRenderCalls, transformDeckjsxModule } from "./transform";

export type DeckjsxVitePlugin = Plugin;
const VIRTUAL_PROJECT_INTEGRATION_ID = "virtual:deckjsx/vite";
const RESOLVED_VIRTUAL_PROJECT_INTEGRATION_ID = `\0${VIRTUAL_PROJECT_INTEGRATION_ID}`;

export type DeckjsxVitePluginOptions = {
  readonly include?: ViteTransformFilter;
  readonly exclude?: ViteTransformFilter;
};

type ViteTransformFilter = RegExp | string | readonly (RegExp | string)[];

export type ViteResolverAlias = {
  readonly find: string;
  readonly replacement: string;
};

export type ViteAssetLoaderOptions = {
  readonly root: string;
  readonly publicDir?: string;
  readonly base?: string;
  readonly aliases?: readonly ViteResolverAlias[];
  readonly resolverFingerprint?: string;
  readonly resolverToken?: string;
};

export type ViteRenderIntegrationOptions = ViteAssetLoaderOptions & {
  readonly importer: string;
  readonly changedModuleIds?: readonly string[];
};

export type ViteProjectAssetResolverInput = {
  readonly sourcePath: string;
  readonly importer?: string;
};

export type ViteProjectAssetResolverResult =
  | {
      readonly filePath: string;
      readonly provenanceKind?: AssetResolutionProvenanceKind;
    }
  | undefined;

export type ViteProjectAssetResolver = (
  input: ViteProjectAssetResolverInput,
) => Promise<ViteProjectAssetResolverResult>;

const viteProjectAssetResolvers = new Map<string, ViteProjectAssetResolver>();

export function registerViteProjectAssetResolver(
  token: string,
  resolver: ViteProjectAssetResolver,
): () => void {
  viteProjectAssetResolvers.set(token, resolver);
  return () => {
    if (viteProjectAssetResolvers.get(token) === resolver) {
      viteProjectAssetResolvers.delete(token);
    }
  };
}

export function withViteRenderIntegration<TInput extends object>(
  input: TInput,
  options: ViteRenderIntegrationOptions,
): TInput {
  const integrationId = `@deckjsx/vite/project:${options.importer}`;
  const hmrInvalidation: HmrInvalidation | undefined = options.changedModuleIds?.length
    ? {
        importer: options.importer,
        changedModuleIds: options.changedModuleIds,
      }
    : undefined;
  return withRenderExecutionContext(input as never, {
    integration: {
      id: integrationContextId(integrationId),
      assetLoaders: [createViteAssetLoader(options)],
      mediaSourceOrigin: {
        importer: options.importer,
        source: options.importer,
      },
    },
    ...(hmrInvalidation ? { hmrInvalidation } : {}),
  }) as TInput;
}

function extensionFromPath(filePath: string): string | undefined {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return extension || undefined;
}

function mediaTypeFromExtension(extension: string | undefined): string | undefined {
  switch (extension) {
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return undefined;
  }
}

function pngDimensions(bytes: Uint8Array): { readonly width?: number; readonly height?: number } {
  if (
    bytes.byteLength < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return {};
  }

  const width = ((bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!) >>> 0;
  const height = ((bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!) >>> 0;
  return { width, height };
}

function fingerprintBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function viteAssetResolverIdentity(options: ViteAssetLoaderOptions): string {
  const publicDir = options.publicDir ?? path.join(options.root, "public");
  const config = JSON.stringify({
    package: "@deckjsx/vite",
    root: options.root,
    publicDir,
    base: options.base ?? "/",
    aliases: normalizeViteAliases(options.aliases),
    resolverFingerprint: options.resolverFingerprint ?? "",
    resolverToken: options.resolverToken ?? "",
  });
  return `@deckjsx/vite:${fingerprintBytes(new TextEncoder().encode(config))}`;
}

export function normalizeViteAliases(input: unknown): readonly ViteResolverAlias[] {
  if (!input) {
    return [];
  }

  const aliases = Array.isArray(input)
    ? input
    : Object.entries(input as Record<string, unknown>).map(([find, replacement]) => ({
        find,
        replacement,
      }));

  return aliases
    .flatMap((alias): ViteResolverAlias[] => {
      if (!alias || typeof alias !== "object") {
        return [];
      }
      const record = alias as Record<string, unknown>;
      return typeof record.find === "string" && typeof record.replacement === "string"
        ? [{ find: record.find, replacement: record.replacement }]
        : [];
    })
    .sort(
      (left, right) =>
        right.find.length - left.find.length ||
        left.find.localeCompare(right.find) ||
        left.replacement.localeCompare(right.replacement),
    );
}

function applyViteAlias(input: {
  readonly options: ViteAssetLoaderOptions;
  readonly sourcePath: string;
}): string | undefined {
  for (const alias of normalizeViteAliases(input.options.aliases)) {
    if (input.sourcePath !== alias.find && !input.sourcePath.startsWith(`${alias.find}/`)) {
      continue;
    }

    const suffix = input.sourcePath.slice(alias.find.length).replace(/^\/+/, "");
    const basePath = path.isAbsolute(alias.replacement)
      ? alias.replacement
      : path.resolve(input.options.root, alias.replacement);
    return path.resolve(basePath, suffix);
  }

  return undefined;
}

async function resolveViteProjectAsset(input: {
  readonly options: ViteAssetLoaderOptions;
  readonly source: AssetSource;
  readonly importer?: string;
}): Promise<
  | {
      readonly filePath: string;
      readonly provenanceKind: AssetResolutionProvenanceKind;
    }
  | undefined
> {
  if (input.source.kind !== "path" || !input.options.resolverToken) {
    return undefined;
  }

  const resolver = viteProjectAssetResolvers.get(input.options.resolverToken);
  if (!resolver) {
    return undefined;
  }

  const resolved = await resolver({
    sourcePath: input.source.path,
    ...(input.importer ? { importer: input.importer } : {}),
  });
  if (!resolved?.filePath) {
    return undefined;
  }

  return {
    filePath: resolved.filePath,
    provenanceKind: resolved.provenanceKind ?? viteAssetProvenanceKind(input.source),
  };
}

function resolveViteAssetPathFallback(input: {
  readonly options: ViteAssetLoaderOptions;
  readonly source: AssetSource;
  readonly importer?: string;
}): string | undefined {
  if (input.source.kind !== "path") {
    return undefined;
  }

  const aliased = applyViteAlias({ options: input.options, sourcePath: input.source.path });
  if (aliased) {
    return aliased;
  }

  if (input.source.path.startsWith("/")) {
    return path.join(
      input.options.publicDir ?? path.join(input.options.root, "public"),
      input.source.path,
    );
  }

  if (!input.importer) {
    return undefined;
  }

  return path.resolve(path.dirname(input.importer), input.source.path);
}

function isImporterRequiredViteAsset(source: AssetSource): boolean {
  return source.kind === "path" && !source.path.startsWith("/");
}

function viteAssetProvenanceKind(source: AssetSource): AssetResolutionProvenanceKind {
  return source.kind === "path" && source.path.startsWith("/") ? "publicAsset" : "file";
}

async function resolveViteAsset(input: {
  readonly options: ViteAssetLoaderOptions;
  readonly source: AssetSource;
  readonly importer?: string;
}): Promise<
  | {
      readonly filePath: string;
      readonly provenanceKind: AssetResolutionProvenanceKind;
    }
  | undefined
> {
  const pluginResolved = await resolveViteProjectAsset(input);
  if (pluginResolved) {
    return pluginResolved;
  }

  const filePath = resolveViteAssetPathFallback(input);
  return filePath ? { filePath, provenanceKind: viteAssetProvenanceKind(input.source) } : undefined;
}

async function probeFileAsset(
  filePath: string,
  provenanceKind: AssetResolutionProvenanceKind,
): Promise<AssetProbeResult> {
  const [metadata, bytes] = await Promise.all([stat(filePath), readFile(filePath)]);
  const extension = extensionFromPath(filePath);
  const mediaType = mediaTypeFromExtension(extension);
  const dimensions = mediaType === "image/png" ? pngDimensions(bytes) : {};
  const hash = fingerprintBytes(bytes);
  return {
    ...(mediaType ? { mediaType } : {}),
    ...(extension ? { extension } : {}),
    ...(dimensions.width ? { width: dimensions.width } : {}),
    ...(dimensions.height ? { height: dimensions.height } : {}),
    byteLength: metadata.size,
    hash,
    provenance: {
      kind: provenanceKind,
      resolvedId: hash,
      hashSource: "bytes",
    },
  };
}

async function loadFileAsset(
  filePath: string,
  provenanceKind: AssetResolutionProvenanceKind,
): Promise<AssetLoadResult> {
  const buffer = await readFile(filePath);
  const bytes = new Uint8Array(buffer);
  const probe = await probeFileAsset(filePath, provenanceKind);
  return {
    ...probe,
    bytes,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function viteAssetReadFailure<T>(input: {
  readonly phase: "load" | "probe";
  readonly filePath: string;
  readonly source: AssetSource;
  readonly error: unknown;
}): AssetLoaderOutcome<T> {
  const authoredSource =
    input.source.kind === "path" ? input.source.path : JSON.stringify(input.source);
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "E_VITE_ASSET_READ_FAILED",
        title: "vite asset could not be read",
        message:
          "@deckjsx/vite resolved this media source to a project file, but could not read its bytes.",
        labels: [
          {
            path: input.filePath,
            message: errorMessage(input.error),
          },
        ],
        notes: [`phase=${input.phase}`, `source=${authoredSource}`],
        help: [
          "Check that the media path exists relative to the importing slide/component module or Vite public directory.",
        ],
      },
    ],
  };
}

function viteAssetOriginMissing<T>(input: {
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
}): AssetLoaderOutcome<T> {
  const authoredSource =
    input.source.kind === "path" ? input.source.path : JSON.stringify(input.source);
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "E_VITE_ASSET_ORIGIN_MISSING",
        title: "vite asset importer origin is missing",
        message:
          "@deckjsx/vite received a relative media path but no importing module id was attached to the asset source.",
        labels: [
          {
            path: authoredSource,
            message: "relative Vite asset paths require media source origin importer metadata",
          },
        ],
        notes: [`phase=${input.phase}`, `source=${authoredSource}`],
        help: [
          "Let the @deckjsx/vite transform attach media source origins, or pass mediaSourceOrigins metadata through the deckjsx integration subpath.",
        ],
      },
    ],
  };
}

export function createViteAssetLoader(options: ViteAssetLoaderOptions): AssetLoader {
  return {
    resolverIdentity: viteAssetResolverIdentity(options),
    async probe(context) {
      if (isImporterRequiredViteAsset(context.source) && !context.origin?.importer) {
        return viteAssetOriginMissing({ phase: "probe", source: context.source });
      }

      const resolved = await resolveViteAsset({
        options,
        source: context.source,
        importer: context.origin?.importer,
      });
      if (!resolved) {
        return undefined;
      }

      try {
        return {
          ok: true,
          value: await probeFileAsset(resolved.filePath, resolved.provenanceKind),
        };
      } catch (error) {
        return viteAssetReadFailure({
          phase: "probe",
          filePath: resolved.filePath,
          source: context.source,
          error,
        });
      }
    },
    async load(context) {
      if (isImporterRequiredViteAsset(context.source) && !context.origin?.importer) {
        return viteAssetOriginMissing({ phase: "load", source: context.source });
      }

      const resolved = await resolveViteAsset({
        options,
        source: context.source,
        importer: context.origin?.importer,
      });
      if (!resolved) {
        return undefined;
      }

      try {
        return {
          ok: true,
          value: await loadFileAsset(resolved.filePath, resolved.provenanceKind),
        };
      } catch (error) {
        return viteAssetReadFailure({
          phase: "load",
          filePath: resolved.filePath,
          source: context.source,
          error,
        });
      }
    },
  };
}

function createPluginViteAssetResolver(input: {
  readonly root: string;
  readonly publicDir?: string;
  readonly server: {
    readonly pluginContainer?: {
      resolveId?(
        id: string,
        importer?: string,
      ): Promise<string | { readonly id?: string } | null | undefined>;
    };
  };
}): ViteProjectAssetResolver {
  return async ({ sourcePath, importer }) => {
    if (sourcePath.startsWith("/")) {
      const publicFilePath = path.join(
        input.publicDir ?? path.join(input.root, "public"),
        sourcePath,
      );
      return { filePath: publicFilePath, provenanceKind: "publicAsset" };
    }

    const resolved = await input.server.pluginContainer?.resolveId?.(sourcePath, importer);
    const resolvedId =
      typeof resolved === "string"
        ? resolved
        : typeof resolved?.id === "string"
          ? resolved.id
          : undefined;
    const filePath = filePathFromViteResolvedId(resolvedId);
    return filePath ? { filePath, provenanceKind: "file" } : undefined;
  };
}

function filePathFromViteResolvedId(id: string | undefined): string | undefined {
  if (!id || id.startsWith("\0")) {
    return undefined;
  }

  const cleanId = id.replace(/[?#].*$/, "");
  const fsPath = cleanId.startsWith("/@fs/") ? cleanId.slice("/@fs".length) : cleanId;
  return path.isAbsolute(fsPath) ? fsPath : undefined;
}

function filterMatches(filter: ViteTransformFilter | undefined, id: string): boolean {
  if (!filter) {
    return false;
  }
  if (typeof filter === "string") {
    return globLikeFilterMatches(filter, id);
  }
  if (filter instanceof RegExp) {
    return filter.test(id);
  }
  return filter.some((entry) => filterMatches(entry, id));
}

function globLikeFilterMatches(filter: string, id: string): boolean {
  if (!filter.includes("*")) {
    return id.includes(filter);
  }
  const normalizedId = id.replace(/\\/g, "/");
  return new RegExp(`(^|/)${globLikeFilterPattern(filter)}$`).test(normalizedId);
}

function globLikeFilterPattern(filter: string): string {
  let pattern = "";
  for (let index = 0; index < filter.length; index += 1) {
    const char = filter[index]!;
    if (char === "*" && filter[index + 1] === "*" && filter[index + 2] === "/") {
      pattern += "(?:.*/)?";
      index += 2;
      continue;
    }
    if (char === "*" && filter[index + 1] === "*") {
      pattern += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      pattern += "[^/]*";
      continue;
    }
    pattern += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
  }
  return pattern;
}

function shouldTransformModule(input: {
  readonly id: string;
  readonly options: DeckjsxVitePluginOptions;
}): boolean {
  if (filterMatches(input.options.exclude, input.id)) {
    return false;
  }
  if (input.options.include) {
    return filterMatches(input.options.include, input.id);
  }
  return true;
}

function createPluginResolverToken(root: string): string {
  return `@deckjsx/vite/resolver:${fingerprintBytes(new TextEncoder().encode(`${root}:${Date.now()}:${Math.random()}`))}`;
}

export default function deckjsx(options: DeckjsxVitePluginOptions = {}): DeckjsxVitePlugin {
  let root = process.cwd();
  let publicDir: string | undefined;
  let base: string | undefined;
  let aliases: readonly ViteResolverAlias[] = [];
  let resolverToken = createPluginResolverToken(root);
  let unregisterResolver: (() => void) | undefined;
  const changedModuleIds = new Set<string>();
  const changedModuleIdsByRenderModuleId = new Map<string, Set<string>>();
  const renderModuleIds = new Set<string>();

  return {
    name: "@deckjsx/vite",
    apply: "serve",
    configResolved(config: ResolvedConfig) {
      root = config.root;
      publicDir = typeof config.publicDir === "string" ? config.publicDir : undefined;
      base = typeof config.base === "string" ? config.base : undefined;
      aliases = normalizeViteAliases(config.resolve.alias);
      resolverToken = createPluginResolverToken(root);
    },
    configureServer(server) {
      unregisterResolver?.();
      unregisterResolver = registerViteProjectAssetResolver(
        resolverToken,
        createPluginViteAssetResolver({ root, ...(publicDir ? { publicDir } : {}), server }),
      );
      server.httpServer?.once("close", () => {
        unregisterResolver?.();
        unregisterResolver = undefined;
      });
    },
    resolveId(id) {
      return id === VIRTUAL_PROJECT_INTEGRATION_ID ? RESOLVED_VIRTUAL_PROJECT_INTEGRATION_ID : null;
    },
    load(id) {
      return id === RESOLVED_VIRTUAL_PROJECT_INTEGRATION_ID
        ? 'export { withViteRenderIntegration } from "@deckjsx/vite";'
        : null;
    },
    transform(code, id) {
      if (!shouldTransformModule({ id, options })) {
        return null;
      }
      const renderModule = canTransformDeckRenderCalls(code);
      const renderModuleChangedModuleIds = changedModuleIdsByRenderModuleId.get(id);
      const hmrInvalidationSnapshot = renderModule
        ? [...(renderModuleChangedModuleIds ?? changedModuleIds)]
        : [];
      const transformed = transformDeckjsxModule(code, id, {
        root,
        ...(publicDir ? { publicDir } : {}),
        ...(base ? { base } : {}),
        ...(aliases.length > 0 ? { aliases } : {}),
        resolverToken,
        changedModuleIds: hmrInvalidationSnapshot,
      });
      if (transformed && renderModule) {
        renderModuleIds.add(id);
      }
      if (transformed && hmrInvalidationSnapshot.length > 0 && renderModule) {
        changedModuleIdsByRenderModuleId.delete(id);
        if (changedModuleIdsByRenderModuleId.size === 0) {
          changedModuleIds.clear();
        }
      }
      return transformed ? { code: transformed, map: null } : null;
    },
    handleHotUpdate(context) {
      changedModuleIds.add(context.file);
      for (const id of renderModuleIds) {
        const pending = changedModuleIdsByRenderModuleId.get(id) ?? new Set<string>();
        pending.add(context.file);
        changedModuleIdsByRenderModuleId.set(id, pending);
      }
      const modules = [...context.modules];
      const moduleGraph = context.server?.moduleGraph;
      if (!moduleGraph) {
        return modules;
      }
      for (const id of renderModuleIds) {
        const module = moduleGraph.getModuleById(id);
        if (!module || modules.includes(module)) {
          continue;
        }

        moduleGraph.invalidateModule(module);
        modules.push(module);
      }
      return modules;
    },
  };
}

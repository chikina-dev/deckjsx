import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import type {
  AssetLoadResult,
  AssetLoader,
  AssetLoaderOutcome,
  AssetProbeResult,
  AssetSource,
} from "deckjsx/integration";
import { canTransformDeckRenderCalls, transformDeckjsxModule } from "./transform";

export type DeckjsxVitePlugin = Plugin;

export type ViteAssetLoaderOptions = {
  readonly root: string;
  readonly publicDir?: string;
};

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
  });
  return `@deckjsx/vite:${fingerprintBytes(new TextEncoder().encode(config))}`;
}

function resolveViteAssetPath(input: {
  readonly options: ViteAssetLoaderOptions;
  readonly source: AssetSource;
  readonly importer?: string;
}): string | undefined {
  if (input.source.kind !== "path") {
    return undefined;
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

async function probeFileAsset(filePath: string): Promise<AssetProbeResult> {
  const [metadata, bytes] = await Promise.all([stat(filePath), readFile(filePath)]);
  const extension = extensionFromPath(filePath);
  const mediaType = mediaTypeFromExtension(extension);
  const dimensions = mediaType === "image/png" ? pngDimensions(bytes) : {};
  return {
    ...(mediaType ? { mediaType } : {}),
    ...(extension ? { extension } : {}),
    ...(dimensions.width ? { width: dimensions.width } : {}),
    ...(dimensions.height ? { height: dimensions.height } : {}),
    byteLength: metadata.size,
    hash: fingerprintBytes(bytes),
  };
}

async function loadFileAsset(filePath: string): Promise<AssetLoadResult> {
  const buffer = await readFile(filePath);
  const bytes = new Uint8Array(buffer);
  const probe = await probeFileAsset(filePath);
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

      const filePath = resolveViteAssetPath({
        options,
        source: context.source,
        importer: context.origin?.importer,
      });
      if (!filePath) {
        return undefined;
      }

      try {
        return { ok: true, value: await probeFileAsset(filePath) };
      } catch (error) {
        return viteAssetReadFailure({
          phase: "probe",
          filePath,
          source: context.source,
          error,
        });
      }
    },
    async load(context) {
      if (isImporterRequiredViteAsset(context.source) && !context.origin?.importer) {
        return viteAssetOriginMissing({ phase: "load", source: context.source });
      }

      const filePath = resolveViteAssetPath({
        options,
        source: context.source,
        importer: context.origin?.importer,
      });
      if (!filePath) {
        return undefined;
      }

      try {
        return { ok: true, value: await loadFileAsset(filePath) };
      } catch (error) {
        return viteAssetReadFailure({
          phase: "load",
          filePath,
          source: context.source,
          error,
        });
      }
    },
  };
}

export default function deckjsx(): DeckjsxVitePlugin {
  let root = process.cwd();
  let publicDir: string | undefined;
  const changedModuleIds = new Set<string>();
  const changedModuleIdsByRenderModuleId = new Map<string, Set<string>>();
  const renderModuleIds = new Set<string>();

  return {
    name: "@deckjsx/vite",
    apply: "serve",
    configResolved(config: ResolvedConfig) {
      root = config.root;
      publicDir = typeof config.publicDir === "string" ? config.publicDir : undefined;
    },
    transform(code, id) {
      const renderModule = canTransformDeckRenderCalls(code);
      const renderModuleChangedModuleIds = changedModuleIdsByRenderModuleId.get(id);
      const hmrInvalidationSnapshot = renderModule
        ? [...(renderModuleChangedModuleIds ?? changedModuleIds)]
        : [];
      const transformed = transformDeckjsxModule(code, id, {
        root,
        ...(publicDir ? { publicDir } : {}),
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

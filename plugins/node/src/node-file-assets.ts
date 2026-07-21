import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type {
  AssetLoadResult,
  AssetLoader,
  AssetLoaderOutcome,
  AssetProbeResult,
  AssetSource,
  AssetSourceField,
  DeckPlugin,
  FontAssetRegistration,
} from "deckjsx/integration";
import { integrationContextId } from "deckjsx/integration";
import { observeDeckjsxDevAssetFile } from "./dev-asset-observer";
import { fingerprintBytes } from "./package-patch";

const textEncoder = new TextEncoder();

/**
 * Options for the Node file asset loader.
 *
 * The loader resolves local filesystem assets only. When `root` is provided, resolved assets must
 * stay inside that directory. `resolverIdentity` can be set by integrations that need stable cache
 * identity across equivalent loader configurations.
 */
export type NodeFileAssetLoaderOptions = {
  /** Optional filesystem root that local asset paths must remain within. */
  readonly root?: string;
  /** Optional stable identity used for asset cache and invalidation records. */
  readonly resolverIdentity?: string;
};

/**
 * Options for registering local font assets in a Node.js render.
 *
 * Relative font paths are resolved from `root`, or from the Node.js current working directory when
 * `root` is omitted. The same root is used as a containment boundary for every registered path.
 */
export type NodeFontAssetsOptions = NodeFileAssetLoaderOptions & {
  /** Font Asset registrations to make available to the render pipeline. */
  readonly fontAssets: readonly FontAssetRegistration[];
};

/**
 * Create a Node.js local file asset loader.
 *
 * Use this when deck authoring references `src` paths such as `<img src="./chart.png" />` and the
 * render pipeline should load them from disk. Remote URLs and inline data are handled by other
 * asset paths; this loader only resolves local files.
 */
export function createNodeFileAssetLoader(options: NodeFileAssetLoaderOptions = {}): AssetLoader {
  return createSourceFieldAwareNodeFileAssetLoader(options, "all");
}

type NodeFileAssetLoaderScope = "all" | "font" | "media";

function createSourceFieldAwareNodeFileAssetLoader(
  options: NodeFileAssetLoaderOptions,
  scope: NodeFileAssetLoaderScope,
): AssetLoader {
  const normalizedOptions = {
    ...options,
    root: options.root ? path.resolve(options.root) : undefined,
  };

  return {
    resolverIdentity: options.resolverIdentity ?? nodeFileAssetResolverIdentity(normalizedOptions),
    async probe(context) {
      if (!nodeFileAssetLoaderHandlesSourceField(scope, context.sourceField)) {
        return undefined;
      }
      const filePath = resolveNodeFileAssetPath({
        options: normalizedOptions,
        source: context.source,
        importer: context.origin?.importer,
      });
      if (!filePath.ok) {
        return nodeFileAssetPathFailure<AssetProbeResult>({
          phase: "probe",
          source: context.source,
          sourceField: context.sourceField,
          reason: filePath.reason,
        });
      }
      if (!filePath.path) {
        return undefined;
      }

      try {
        await verifyNodeFileAssetContainment(filePath);
        const value = await probeFileAsset(filePath.path);
        observeDeckjsxDevAssetFile(filePath.path);
        return { ok: true, value };
      } catch (error) {
        return nodeFileAssetReadFailure({
          phase: "probe",
          filePath: filePath.path,
          source: context.source,
          sourceField: context.sourceField,
          error,
        });
      }
    },
    async load(context) {
      if (!nodeFileAssetLoaderHandlesSourceField(scope, context.sourceField)) {
        return undefined;
      }
      const filePath = resolveNodeFileAssetPath({
        options: normalizedOptions,
        source: context.source,
        importer: context.origin?.importer,
      });
      if (!filePath.ok) {
        return nodeFileAssetPathFailure<AssetLoadResult>({
          phase: "load",
          source: context.source,
          sourceField: context.sourceField,
          reason: filePath.reason,
        });
      }
      if (!filePath.path) {
        return undefined;
      }

      try {
        await verifyNodeFileAssetContainment(filePath);
        const value = await loadFileAsset(filePath.path);
        observeDeckjsxDevAssetFile(filePath.path);
        return { ok: true, value };
      } catch (error) {
        return nodeFileAssetReadFailure({
          phase: "load",
          filePath: filePath.path,
          source: context.source,
          sourceField: context.sourceField,
          error,
        });
      }
    },
  };
}

function nodeFileAssetLoaderHandlesSourceField(
  scope: NodeFileAssetLoaderScope,
  sourceField: AssetSourceField,
): boolean {
  return scope === "all" || (scope === "font" ? sourceField === "font" : sourceField !== "font");
}

/**
 * Create a Deck plugin that installs the Node.js local file asset loader.
 *
 * Register it with `deck.plugin(nodeAssets())` in Node-based rendering contexts. Browser and remote
 * runtimes should provide their own asset loaders instead of relying on filesystem access.
 */
export function nodeAssets(options: NodeFileAssetLoaderOptions = {}): DeckPlugin {
  return {
    kind: "deckjsx.plugin",
    id: "@deckjsx/node/assets",
    name: "@deckjsx/node/assets",
    integration: {
      id: integrationContextId("@deckjsx/node/assets"),
      assetLoaders: [createSourceFieldAwareNodeFileAssetLoader(options, "media")],
    },
  };
}

/**
 * Register local Font Assets for Node.js rendering.
 *
 * This plugin combines Font Asset registrations with a filesystem loader, so a registration such
 * as `{ source: { kind: "path", path: "./fonts/Brand.ttf" } }` works for PDF rendering without
 * authoring a custom loader. Paths remain constrained to `root`; when omitted, `root` defaults to
 * the current working directory. Asset-load failures are returned as render diagnostics.
 */
export function nodeFontAssets(options: NodeFontAssetsOptions): DeckPlugin {
  const root = options.root ?? process.cwd();
  const loaderOptions: NodeFileAssetLoaderOptions = {
    root,
    ...(options.resolverIdentity ? { resolverIdentity: options.resolverIdentity } : {}),
  };
  return {
    kind: "deckjsx.plugin",
    id: "@deckjsx/node/fonts",
    name: "@deckjsx/node/fonts",
    integration: {
      id: integrationContextId("@deckjsx/node/fonts"),
      assetLoaders: [createSourceFieldAwareNodeFileAssetLoader(loaderOptions, "font")],
      fontAssets: options.fontAssets,
    },
  };
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

function nodeFileAssetResolverIdentity(options: NodeFileAssetLoaderOptions): string {
  const config = JSON.stringify({
    package: "@deckjsx/node",
    root: options.root ?? process.cwd(),
  });
  return `@deckjsx/node:file:${fingerprintBytes(textEncoder.encode(config))}`;
}

type NodeFileAssetPathResult =
  | {
      readonly ok: true;
      readonly path?: string;
      readonly allowedBase?: string;
    }
  | { readonly ok: false; readonly reason: "missing-origin" | "outside-root" };

function resolveNodeFileAssetPath(input: {
  readonly options: NodeFileAssetLoaderOptions;
  readonly source: AssetSource;
  readonly importer?: string;
}): NodeFileAssetPathResult {
  if (input.source.kind !== "path") {
    return { ok: true };
  }

  if (input.options.root) {
    const resolvedPath = path.isAbsolute(input.source.path)
      ? path.resolve(input.source.path)
      : path.resolve(input.options.root, input.source.path);
    return pathIsWithin(resolvedPath, input.options.root)
      ? { ok: true, path: resolvedPath, allowedBase: input.options.root }
      : { ok: false, reason: "outside-root" };
  }

  if (path.isAbsolute(input.source.path)) {
    return { ok: true, path: path.resolve(input.source.path) };
  }

  if (input.importer) {
    const importerDirectory = path.dirname(input.importer);
    const resolvedPath = path.resolve(importerDirectory, input.source.path);
    return pathIsWithin(resolvedPath, importerDirectory)
      ? { ok: true, path: resolvedPath, allowedBase: importerDirectory }
      : { ok: false, reason: "outside-root" };
  }

  return { ok: false, reason: "missing-origin" };
}

function pathIsWithin(filePath: string, basePath: string): boolean {
  const relativePath = path.relative(basePath, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

async function verifyNodeFileAssetContainment(filePath: {
  readonly path?: string;
  readonly allowedBase?: string;
}): Promise<void> {
  if (!filePath.path || !filePath.allowedBase) {
    return;
  }

  const [realFilePath, realBasePath] = await Promise.all([
    realpath(filePath.path),
    realpath(filePath.allowedBase),
  ]);
  if (!pathIsWithin(realFilePath, realBasePath)) {
    throw new Error(`Resolved asset path escapes the configured asset root: ${filePath.path}`);
  }
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
    provenance: {
      kind: "file",
      resolvedId: fingerprintBytes(bytes),
      hashSource: "bytes",
    },
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

function authoredAssetSource(source: AssetSource): string {
  return source.kind === "path" ? source.path : JSON.stringify(source);
}

function nodeFileAssetKind(sourceField: AssetSourceField): "font" | "media" {
  return sourceField === "font" ? "font" : "media";
}

function nodeFileAssetReadFailure<T>(input: {
  readonly phase: "load" | "probe";
  readonly filePath: string;
  readonly source: AssetSource;
  readonly sourceField: AssetSourceField;
  readonly error: unknown;
}): AssetLoaderOutcome<T> {
  const assetKind = nodeFileAssetKind(input.sourceField);
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "E_NODE_FILE_ASSET_READ_FAILED",
        title: "node file asset could not be read",
        message: `@deckjsx/node resolved this ${assetKind} source to a local file, but could not read its bytes.`,
        labels: [
          {
            path: input.filePath,
            message: errorMessage(input.error),
          },
        ],
        notes: [
          `phase=${input.phase}`,
          `sourceField=${input.sourceField}`,
          `source=${authoredAssetSource(input.source)}`,
        ],
        help: [
          `Check that the ${assetKind} path exists relative to the importing module or configured node asset root.`,
        ],
      },
    ],
  };
}

function nodeFileAssetPathFailure<T>(input: {
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly sourceField: AssetSourceField;
  readonly reason: "missing-origin" | "outside-root";
}): AssetLoaderOutcome<T> {
  return input.reason === "missing-origin"
    ? nodeFileAssetOriginMissing(input)
    : nodeFileAssetOutsideRoot(input);
}

function nodeFileAssetOriginMissing<T>(input: {
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly sourceField: AssetSourceField;
}): AssetLoaderOutcome<T> {
  const source = authoredAssetSource(input.source);
  const assetKind = nodeFileAssetKind(input.sourceField);
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "E_NODE_FILE_ASSET_ORIGIN_MISSING",
        title: "node file asset importer origin is missing",
        message: `@deckjsx/node received a relative ${assetKind} path but no importing module path or asset root was available.`,
        labels: [
          {
            path: source,
            message: `relative node ${assetKind} paths require an importer origin or createNodeFileAssetLoader root`,
          },
        ],
        notes: [`phase=${input.phase}`, `sourceField=${input.sourceField}`, `source=${source}`],
        help: [
          assetKind === "font"
            ? "Configure nodeFontAssets({ root, fontAssets }) or createNodeFileAssetLoader({ root })."
            : "Pass mediaSourceOrigins metadata from JSX transforms or configure createNodeFileAssetLoader({ root }).",
        ],
      },
    ],
  };
}

function nodeFileAssetOutsideRoot<T>(input: {
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly sourceField: AssetSourceField;
}): AssetLoaderOutcome<T> {
  const source = authoredAssetSource(input.source);
  const assetKind = nodeFileAssetKind(input.sourceField);
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "E_NODE_FILE_ASSET_OUTSIDE_ROOT",
        title: "node file asset path escapes its allowed root",
        message: `@deckjsx/node refused to load a ${assetKind} path that resolves outside the importing module directory or configured node asset root.`,
        labels: [
          {
            path: source,
            message: `${assetKind} paths must stay within their importer directory or createNodeFileAssetLoader root`,
          },
        ],
        notes: [`phase=${input.phase}`, `sourceField=${input.sourceField}`, `source=${source}`],
        help: [
          `Move the asset under the allowed directory or use a non-traversing ${assetKind} path.`,
        ],
      },
    ],
  };
}

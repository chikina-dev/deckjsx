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

export type DeckjsxVitePlugin = Plugin;

export type ViteAssetLoaderOptions = {
  readonly root: string;
  readonly publicDir?: string;
};

const DECKJSX_RENDER_INTEGRATION_IMPORT =
  'import { withIntegrationContext, mediaSourceOrigins as __deckjsxMediaSourceOrigins } from "deckjsx/integration";';
const DECKJSX_MEDIA_ORIGIN_IMPORT =
  'import { mediaSourceOrigins as __deckjsxMediaSourceOrigins } from "deckjsx/integration";';
const VITE_LOADER_IMPORT =
  'import { createViteAssetLoader as __deckjsxCreateViteAssetLoader } from "@deckjsx/vite";';

function isDeckjsxTransformableModule(id: string): boolean {
  return /\.[cm]?[jt]sx?(?:\?.*)?$/.test(id) && !/(?:^|\/)node_modules\//.test(id);
}

function canTransformDeckRenderCalls(code: string): boolean {
  return code.includes(".render(") && code.includes("pptx(");
}

function moduleIntegrationContext(input: {
  readonly id: string;
  readonly root: string;
  readonly publicDir?: string;
  readonly changedModuleIds?: readonly string[];
}): string {
  const importer = JSON.stringify(input.id);
  const root = JSON.stringify(input.root);
  const publicDir = input.publicDir ? `, publicDir: ${JSON.stringify(input.publicDir)}` : "";
  const changedModuleIds = input.changedModuleIds?.length
    ? `, hmrInvalidation: { importer: ${importer}, changedModuleIds: [${input.changedModuleIds.map((id) => JSON.stringify(id)).join(", ")}] }`
    : "";
  return `{ assetLoaders: [__deckjsxCreateViteAssetLoader({ root: ${root}${publicDir} })], mediaSourceOrigin: { importer: ${importer}, source: ${importer} }${changedModuleIds} }`;
}

function transformDeckRenderCallsCode(
  code: string,
  id: string,
  input: {
    readonly root: string;
    readonly publicDir?: string;
    readonly changedModuleIds?: readonly string[];
  },
): string {
  const pattern = /(\b[A-Za-z_$][\w$]*\.render\()\s*pptx\(/g;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(code)) !== null) {
    const matchedText = match[0];
    const renderPrefix = match[1]!;
    const pptxStart = match.index + matchedText.lastIndexOf("pptx(");
    const pptxOpen = pptxStart + "pptx".length;
    const pptxClose = findMatchingCloseParen(code, pptxOpen);
    if (pptxClose < 0) {
      continue;
    }

    const renderClose = skipWhitespace(code, pptxClose + 1);
    if (code[renderClose] !== ")") {
      continue;
    }

    output += code.slice(cursor, match.index);
    output += `${renderPrefix}withIntegrationContext(${code.slice(pptxStart, pptxClose + 1)}, ${moduleIntegrationContext({ ...input, id })})`;
    output += code.slice(pptxClose + 1, renderClose + 1);
    cursor = renderClose + 1;
    pattern.lastIndex = cursor;
  }

  return output ? output + code.slice(cursor) : code;
}

function skipWhitespace(code: string, start: number): number {
  let index = start;
  while (/\s/.test(code[index] ?? "")) {
    index += 1;
  }
  return index;
}

function findMatchingCloseParen(code: string, openIndex: number): number {
  let depth = 0;
  let quote: "'" | '"' | "`" | undefined;
  let escaped = false;

  for (let index = openIndex; index < code.length; index += 1) {
    const char = code[index]!;
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function jsxStringAttributeValue(attributes: string, name: string): string | undefined {
  const attribute = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*"([^"]*)"\\s*\\}|\\{\\s*'([^']*)'\\s*\\})`,
  );
  const match = attribute.exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? match?.[4];
}

function isLocalMediaPath(value: string): boolean {
  return value.startsWith(".") || value.startsWith("/");
}

function mediaOriginField(input: {
  readonly field: string;
  readonly importer: string;
  readonly source: string | undefined;
}): string | undefined {
  if (!input.source || !isLocalMediaPath(input.source)) {
    return undefined;
  }

  return `${input.field}: { importer: ${JSON.stringify(input.importer)}, source: ${JSON.stringify(input.source)} }`;
}

function transformMediaSourceOriginProps(code: string, id: string): string {
  return code.replace(
    /<(?<tag>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\b(?<attributes>[^<>]*?)(?<closing>\s*\/?>)/g,
    (match: string, ...args: unknown[]) => {
      const groups = args.at(-1) as
        | { readonly tag?: string; readonly attributes?: string; readonly closing?: string }
        | undefined;
      const tag = groups?.tag;
      const attributes = groups?.attributes ?? "";
      const closing = groups?.closing ?? "";
      if (!tag || attributes.includes("__deckjsxMediaSourceOrigins")) {
        return match;
      }
      const isMediaIntrinsic = tag === "img" || tag === "video";
      const isComponent = /^[A-Z]/.test(tag);
      if (!isMediaIntrinsic && !isComponent) {
        return match;
      }

      const fields = [
        mediaOriginField({
          field: "src",
          importer: id,
          source: jsxStringAttributeValue(attributes, "src"),
        }),
        tag === "video" || isComponent
          ? mediaOriginField({
              field: "poster",
              importer: id,
              source: jsxStringAttributeValue(attributes, "poster"),
            })
          : undefined,
      ].filter((field): field is string => field !== undefined);
      if (fields.length === 0) {
        return match;
      }

      return `<${tag} {...__deckjsxMediaSourceOrigins({ ${fields.join(", ")} })}${attributes}${closing}`;
    },
  );
}

function transformDeckjsxModule(
  code: string,
  id: string,
  input: {
    readonly root: string;
    readonly publicDir?: string;
    readonly changedModuleIds?: readonly string[];
  },
): string | undefined {
  if (!isDeckjsxTransformableModule(id)) {
    return undefined;
  }

  const renderTransformed = canTransformDeckRenderCalls(code)
    ? transformDeckRenderCallsCode(code, id, input)
    : code;
  const transformed = transformMediaSourceOriginProps(renderTransformed, id);
  if (transformed === code) {
    return undefined;
  }

  const renderChanged = renderTransformed !== code;
  const imports = renderChanged
    ? [DECKJSX_RENDER_INTEGRATION_IMPORT, VITE_LOADER_IMPORT]
    : [DECKJSX_MEDIA_ORIGIN_IMPORT];
  return `${imports.join("\n")}\n${transformed}`;
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
  const renderModuleIds = new Set<string>();

  return {
    name: "@deckjsx/vite",
    apply: "serve",
    configResolved(config: ResolvedConfig) {
      root = config.root;
      publicDir = typeof config.publicDir === "string" ? config.publicDir : undefined;
    },
    transform(code, id) {
      const hmrInvalidationSnapshot = [...changedModuleIds];
      const renderModule = canTransformDeckRenderCalls(code);
      const transformed = transformDeckjsxModule(code, id, {
        root,
        ...(publicDir ? { publicDir } : {}),
        changedModuleIds: hmrInvalidationSnapshot,
      });
      if (transformed && renderModule) {
        renderModuleIds.add(id);
      }
      if (transformed && hmrInvalidationSnapshot.length > 0 && renderModule) {
        changedModuleIds.clear();
      }
      return transformed ? { code: transformed, map: null } : null;
    },
    handleHotUpdate(context) {
      changedModuleIds.add(context.file);
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

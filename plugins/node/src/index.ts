import { constants } from "node:fs";
import {
  access,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { FileHandle } from "node:fs/promises";
import type { RenderResult } from "deckjsx";
import type {
  AssetLoadResult,
  AssetLoader,
  AssetLoaderOutcome,
  AssetProbeResult,
  AssetSource,
  DeckPlugin,
  RenderPatchPlanPart,
} from "deckjsx/integration";
import {
  getArtifactWriteToken,
  integrationContextId,
  recordArtifactWrite,
} from "deckjsx/integration";
import { observeDeckjsxDevAssetFile } from "./dev-asset-observer";
import {
  PATCH_MANIFEST_PATH,
  STORE_METHOD,
  fingerprintBytes,
  fingerprintPatchableEntry,
  parsePatchManifest,
  parseZipArchive,
  tryCreateInPlacePatch,
  type PatchSegment,
  type WriteDiagnostic,
} from "./package-patch";

export type { WriteDiagnostic } from "./package-patch";
export type WriteStrategy = "atomic-replace" | "in-place" | "write-file";

export type WriteResult = {
  readonly path: string;
  readonly status: "created" | "failed" | "patched" | "replaced";
  readonly strategy: WriteStrategy;
  readonly bytesWritten: number;
  readonly patchedParts: readonly string[];
  readonly diagnostics: readonly WriteDiagnostic[];
};

export type PatchablePptxPartInspectionStatus = "missing" | "stale" | "unsupported" | "verified";

export type PatchablePptxPartInspection = Omit<
  RenderPatchPlanPart,
  "buildReason" | "buildStatus"
> & {
  readonly status: PatchablePptxPartInspectionStatus;
  readonly currentFingerprint?: string;
  readonly zipMethod?: number;
};

export type PatchablePptxInspectionResult = {
  readonly path: string;
  readonly ok: boolean;
  readonly patchable: boolean;
  readonly manifestPath: string;
  readonly partCount: number;
  readonly parts: readonly PatchablePptxPartInspection[];
  readonly diagnostics: readonly WriteDiagnostic[];
};

export type NodeFileAssetLoaderOptions = {
  readonly root?: string;
  readonly resolverIdentity?: string;
};

type WriteLock = {
  readonly path: string;
  readonly handle: FileHandle;
};

type WriteLockResult =
  | {
      readonly ok: true;
      readonly lock: WriteLock;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly WriteDiagnostic[];
    };

const WRITE_LOCK_HEADER = "deckjsx-lock-v1";
const textEncoder = new TextEncoder();

export function createNodeFileAssetLoader(options: NodeFileAssetLoaderOptions = {}): AssetLoader {
  const normalizedOptions = {
    ...options,
    root: options.root ? path.resolve(options.root) : undefined,
  };

  return {
    resolverIdentity: options.resolverIdentity ?? nodeFileAssetResolverIdentity(normalizedOptions),
    async probe(context) {
      const filePath = resolveNodeFileAssetPath({
        options: normalizedOptions,
        source: context.source,
        importer: context.origin?.importer,
      });
      if (!filePath.ok) {
        return nodeFileAssetPathFailure<AssetProbeResult>({
          phase: "probe",
          source: context.source,
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
          error,
        });
      }
    },
    async load(context) {
      const filePath = resolveNodeFileAssetPath({
        options: normalizedOptions,
        source: context.source,
        importer: context.origin?.importer,
      });
      if (!filePath.ok) {
        return nodeFileAssetPathFailure<AssetLoadResult>({
          phase: "load",
          source: context.source,
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
          error,
        });
      }
    },
  };
}

export function nodeAssets(options: NodeFileAssetLoaderOptions = {}): DeckPlugin {
  return {
    kind: "deckjsx.plugin",
    id: "@deckjsx/node/assets",
    name: "@deckjsx/node/assets",
    integration: {
      id: integrationContextId("@deckjsx/node/assets"),
      assetLoaders: [createNodeFileAssetLoader(options)],
    },
  };
}

export async function inspectPatchablePptx(
  outputPath: string,
): Promise<PatchablePptxInspectionResult> {
  try {
    return inspectPatchablePptxBytes(new Uint8Array(await readFile(outputPath)), outputPath);
  } catch (error) {
    return {
      path: outputPath,
      ok: false,
      patchable: false,
      manifestPath: PATCH_MANIFEST_PATH,
      partCount: 0,
      parts: [],
      diagnostics: [
        {
          code: "deckjsx.node.inspect.readFailed",
          message: error instanceof Error ? error.message : String(error),
          path: outputPath,
        },
      ],
    };
  }
}

export async function write(render: RenderResult, outputPath: string): Promise<WriteResult> {
  const writeToken = getArtifactWriteToken(render);
  const finishWrite = (result: WriteResult): WriteResult => {
    recordArtifactWrite(writeToken, { path: outputPath, result });
    return result;
  };

  if (!render.ok) {
    const renderDiagnosticCodes = render.diagnostics.items.map((item) => item.code);
    return finishWrite({
      path: outputPath,
      status: "failed",
      strategy: "write-file",
      bytesWritten: 0,
      patchedParts: [],
      diagnostics: [
        {
          code: "deckjsx.node.write.renderFailed",
          message: renderDiagnosticCodes.length
            ? `@deckjsx/node write() requires a successful render result. Render diagnostics: ${renderDiagnosticCodes.join(", ")}.`
            : "@deckjsx/node write() requires a successful render result.",
          path: outputPath,
        },
      ],
    });
  }

  const artifact = render.artifact;
  if (!artifact) {
    return finishWrite({
      path: outputPath,
      status: "failed",
      strategy: "write-file",
      bytesWritten: 0,
      patchedParts: [],
      diagnostics: [
        {
          code: "deckjsx.node.write.missingArtifact",
          message: "@deckjsx/node write() requires a render result with an artifact.",
          path: outputPath,
        },
      ],
    });
  }
  if (artifact.format !== "pptx") {
    return finishWrite({
      path: outputPath,
      status: "failed",
      strategy: "write-file",
      bytesWritten: 0,
      patchedParts: [],
      diagnostics: [
        {
          code: "deckjsx.node.write.unsupportedFormat",
          message: `@deckjsx/node write() can only write pptx artifacts, got ${artifact.format}.`,
          path: outputPath,
        },
      ],
    });
  }

  const lock = await acquireWriteLock(outputPath);
  if (!lock.ok) {
    return finishWrite({
      path: outputPath,
      status: "failed",
      strategy: "write-file",
      bytesWritten: 0,
      patchedParts: [],
      diagnostics: lock.diagnostics,
    });
  }

  try {
    if (!(await pathExists(outputPath))) {
      await replaceWithLockFile(lock.lock, outputPath, artifact.bytes);
      return finishWrite({
        path: outputPath,
        status: "created",
        strategy: "write-file",
        bytesWritten: artifact.bytes.byteLength,
        patchedParts: [],
        diagnostics: [],
      });
    }

    const patch = render.patchPlan
      ? tryCreateInPlacePatch(await readFile(outputPath), artifact.bytes, render.patchPlan)
      : undefined;
    if (patch?.ok) {
      await writePatchSegments(outputPath, patch.segments);
      return finishWrite({
        path: outputPath,
        status: "patched",
        strategy: "in-place",
        bytesWritten: patch.segments.reduce(
          (total, segment) => total + segment.bytes.byteLength,
          0,
        ),
        patchedParts: patch.patchedParts,
        diagnostics: [],
      });
    }

    await replaceWithLockFile(lock.lock, outputPath, artifact.bytes, {
      preserveLockMetadata: true,
    });
    return finishWrite({
      path: outputPath,
      status: "replaced",
      strategy: "atomic-replace",
      bytesWritten: artifact.bytes.byteLength,
      patchedParts: [],
      diagnostics: patch?.diagnostics ?? [],
    });
  } catch (error) {
    return finishWrite({
      path: outputPath,
      status: "failed",
      strategy: "write-file",
      bytesWritten: 0,
      patchedParts: [],
      diagnostics: [
        {
          code: "deckjsx.node.write.failed",
          message: error instanceof Error ? error.message : String(error),
          path: outputPath,
        },
      ],
    });
  } finally {
    await releaseWriteLock(lock.lock);
  }
}

function inspectPatchablePptxBytes(
  bytes: Uint8Array,
  outputPath: string,
): PatchablePptxInspectionResult {
  const archive = parseZipArchive(bytes);
  if (!archive) {
    return {
      path: outputPath,
      ok: false,
      patchable: false,
      manifestPath: PATCH_MANIFEST_PATH,
      partCount: 0,
      parts: [],
      diagnostics: [
        {
          code: "deckjsx.node.inspect.unreadableZip",
          message: "Existing PPTX bytes could not be read as a ZIP archive.",
          path: outputPath,
        },
      ],
    };
  }

  const manifestEntry = archive.entries.get(PATCH_MANIFEST_PATH);
  if (!manifestEntry) {
    return {
      path: outputPath,
      ok: false,
      patchable: false,
      manifestPath: PATCH_MANIFEST_PATH,
      partCount: 0,
      parts: [],
      diagnostics: [
        {
          code: "deckjsx.node.inspect.missingPatchManifest",
          message: "Existing PPTX does not contain a deckjsx patch manifest.",
          path: PATCH_MANIFEST_PATH,
        },
      ],
    };
  }

  const manifest = parsePatchManifest(manifestEntry.bytes);
  if (!manifest) {
    return {
      path: outputPath,
      ok: false,
      patchable: false,
      manifestPath: PATCH_MANIFEST_PATH,
      partCount: 0,
      parts: [],
      diagnostics: [
        {
          code: "deckjsx.node.inspect.invalidPatchManifest",
          message: "Existing PPTX deckjsx patch manifest could not be parsed.",
          path: PATCH_MANIFEST_PATH,
        },
      ],
    };
  }

  const diagnostics: WriteDiagnostic[] = [];
  const parts = manifest.parts.map((part): PatchablePptxPartInspection => {
    const entry = archive.entries.get(part.path);
    if (!entry) {
      diagnostics.push({
        code: "deckjsx.node.inspect.missingPatchPart",
        message: "Patch manifest references a package part that is missing from the PPTX archive.",
        path: part.path,
      });
      return { ...part, status: "missing" };
    }

    if (entry.method !== STORE_METHOD) {
      diagnostics.push({
        code: "deckjsx.node.inspect.unsupportedZipEntry",
        message: "Patch manifest references a ZIP entry that cannot be updated in place.",
        path: part.path,
      });
      return { ...part, status: "unsupported", zipMethod: entry.method };
    }

    const currentFingerprint = fingerprintPatchableEntry(part, entry.bytes);
    if (currentFingerprint !== part.fingerprint) {
      diagnostics.push({
        code: "deckjsx.node.inspect.patchManifestStale",
        message: "Existing PPTX package part bytes do not match the deckjsx patch manifest.",
        path: part.path,
      });
      return { ...part, status: "stale", currentFingerprint, zipMethod: entry.method };
    }

    return { ...part, status: "verified", currentFingerprint, zipMethod: entry.method };
  });

  return {
    path: outputPath,
    ok: diagnostics.length === 0,
    patchable: diagnostics.length === 0,
    manifestPath: PATCH_MANIFEST_PATH,
    partCount: parts.length,
    parts,
    diagnostics,
  };
}

function lockPathFor(outputPath: string): string {
  return path.join(path.dirname(outputPath), ".deckjsx-lock");
}

function outputScopedLockPathFor(outputPath: string): string {
  return path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.deckjsx-lock`);
}

async function acquireWriteLock(outputPath: string): Promise<WriteLockResult> {
  const lockPath = lockPathFor(outputPath);
  const lock = await tryAcquireWriteLock(lockPath, outputPath);
  if (lock.ok) {
    return lock;
  }
  const diagnostic = lock.diagnostics[0];
  if (diagnostic?.code !== "deckjsx.node.write.lockUnavailable") {
    return lock;
  }

  const lockedOutputPath = await readLockedOutputPath(lockPath);
  if (!lockedOutputPath || path.resolve(lockedOutputPath) === path.resolve(outputPath)) {
    return lock;
  }

  return tryAcquireWriteLock(outputScopedLockPathFor(outputPath), outputPath);
}

async function tryAcquireWriteLock(lockPath: string, outputPath: string): Promise<WriteLockResult> {
  let handle: FileHandle;
  try {
    handle = await open(lockPath, "wx");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
    return {
      ok: false,
      diagnostics: [
        {
          code:
            code === "EEXIST"
              ? "deckjsx.node.write.lockUnavailable"
              : "deckjsx.node.write.lockFailed",
          message:
            code === "EEXIST"
              ? "Another deckjsx write appears to hold the output lock."
              : error instanceof Error
                ? error.message
                : String(error),
          path: lockPath,
        },
      ],
    };
  }

  try {
    await handle.writeFile(lockFileContentsFor(outputPath));
  } catch {
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
    return {
      ok: false,
      diagnostics: [
        {
          code: "deckjsx.node.write.lockFailed",
          message: "Deckjsx could not initialize the output lock file.",
          path: lockPath,
        },
      ],
    };
  }

  return { ok: true, lock: { path: lockPath, handle } };
}

function lockFileContentsFor(outputPath: string): string {
  return `${WRITE_LOCK_HEADER}\n${process.pid}\n${path.resolve(outputPath)}\n`;
}

async function readLockedOutputPath(lockPath: string): Promise<string | undefined> {
  try {
    const [header, , outputPath] = (await readFile(lockPath, "utf8")).split("\n");
    if (header !== WRITE_LOCK_HEADER || !outputPath) {
      return undefined;
    }
    return outputPath;
  } catch {
    return undefined;
  }
}

async function releaseWriteLock(lock: WriteLock): Promise<void> {
  await lock.handle.close().catch(() => undefined);
  await unlink(lock.path).catch(() => undefined);
}

async function pathExists(outputPath: string): Promise<boolean> {
  try {
    await access(outputPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function replaceWithLockFile(
  lock: WriteLock,
  outputPath: string,
  bytes: Uint8Array,
  options: { readonly preserveLockMetadata?: boolean } = {},
): Promise<void> {
  const stagingPath = stagingPathForLockedWrite(lock.path, outputPath, options);
  await lock.handle.close();
  try {
    if (stagingPath === lock.path) {
      await writeFile(stagingPath, bytes);
    } else {
      await writeFile(stagingPath, bytes, { flag: "wx" });
    }
    await rename(stagingPath, outputPath);
  } catch (error) {
    await unlink(stagingPath).catch(() => undefined);
    throw error;
  }
}

function stagingPathForLockedWrite(
  lockPath: string,
  outputPath: string,
  options: { readonly preserveLockMetadata?: boolean },
): string {
  return options.preserveLockMetadata && lockPath === lockPathFor(outputPath)
    ? outputScopedLockPathFor(outputPath)
    : lockPath;
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

function nodeFileAssetReadFailure<T>(input: {
  readonly phase: "load" | "probe";
  readonly filePath: string;
  readonly source: AssetSource;
  readonly error: unknown;
}): AssetLoaderOutcome<T> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "E_NODE_FILE_ASSET_READ_FAILED",
        title: "node file asset could not be read",
        message:
          "@deckjsx/node resolved this media source to a local file, but could not read its bytes.",
        labels: [
          {
            path: input.filePath,
            message: errorMessage(input.error),
          },
        ],
        notes: [`phase=${input.phase}`, `source=${authoredAssetSource(input.source)}`],
        help: [
          "Check that the media path exists relative to the importing slide/component module or configured node asset root.",
        ],
      },
    ],
  };
}

function nodeFileAssetPathFailure<T>(input: {
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
  readonly reason: "missing-origin" | "outside-root";
}): AssetLoaderOutcome<T> {
  return input.reason === "missing-origin"
    ? nodeFileAssetOriginMissing(input)
    : nodeFileAssetOutsideRoot(input);
}

function nodeFileAssetOriginMissing<T>(input: {
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
}): AssetLoaderOutcome<T> {
  const source = authoredAssetSource(input.source);
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "E_NODE_FILE_ASSET_ORIGIN_MISSING",
        title: "node file asset importer origin is missing",
        message:
          "@deckjsx/node received a relative media path but no importing module path or asset root was available.",
        labels: [
          {
            path: source,
            message:
              "relative node asset paths require an importer origin or createNodeFileAssetLoader root",
          },
        ],
        notes: [`phase=${input.phase}`, `source=${source}`],
        help: [
          "Pass mediaSourceOrigins metadata from JSX transforms or configure createNodeFileAssetLoader({ root }).",
        ],
      },
    ],
  };
}

function nodeFileAssetOutsideRoot<T>(input: {
  readonly phase: "load" | "probe";
  readonly source: AssetSource;
}): AssetLoaderOutcome<T> {
  const source = authoredAssetSource(input.source);
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "E_NODE_FILE_ASSET_OUTSIDE_ROOT",
        title: "node file asset path escapes its allowed root",
        message:
          "@deckjsx/node refused to load a media path that resolves outside the importing module directory or configured node asset root.",
        labels: [
          {
            path: source,
            message:
              "asset paths must stay within their importer directory or createNodeFileAssetLoader root",
          },
        ],
        notes: [`phase=${input.phase}`, `source=${source}`],
        help: ["Move the asset under the allowed directory or use a non-traversing media path."],
      },
    ],
  };
}

async function writePatchSegments(
  outputPath: string,
  segments: readonly PatchSegment[],
): Promise<void> {
  const file = await open(outputPath, "r+");
  try {
    for (const segment of segments) {
      await file.write(segment.bytes, 0, segment.bytes.byteLength, segment.position);
    }
    await file.sync();
  } finally {
    await file.close();
  }
}

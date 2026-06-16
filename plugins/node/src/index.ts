import { constants } from "node:fs";
import { access, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileHandle } from "node:fs/promises";
import type { RenderResult } from "deckjsx";
import type {
  AssetLoadResult,
  AssetLoader,
  AssetLoaderOutcome,
  AssetProbeResult,
  AssetSource,
  RenderPatchPlanPart,
} from "deckjsx/integration";
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
        return nodeFileAssetOriginMissing<AssetProbeResult>({
          phase: "probe",
          source: context.source,
        });
      }
      if (!filePath.path) {
        return undefined;
      }

      try {
        return { ok: true, value: await probeFileAsset(filePath.path) };
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
        return nodeFileAssetOriginMissing<AssetLoadResult>({
          phase: "load",
          source: context.source,
        });
      }
      if (!filePath.path) {
        return undefined;
      }

      try {
        return { ok: true, value: await loadFileAsset(filePath.path) };
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
  if (!render.ok) {
    const renderDiagnosticCodes = render.diagnostics.items.map((item) => item.code);
    return {
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
    };
  }

  const artifact = render.artifact;
  if (!artifact) {
    return {
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
    };
  }
  if (artifact.format !== "pptx") {
    return {
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
    };
  }

  const lock = await acquireWriteLock(outputPath);
  if (!lock.ok) {
    return {
      path: outputPath,
      status: "failed",
      strategy: "write-file",
      bytesWritten: 0,
      patchedParts: [],
      diagnostics: lock.diagnostics,
    };
  }

  try {
    if (!(await pathExists(outputPath))) {
      await writeFile(outputPath, artifact.bytes);
      return {
        path: outputPath,
        status: "created",
        strategy: "write-file",
        bytesWritten: artifact.bytes.byteLength,
        patchedParts: [],
        diagnostics: [],
      };
    }

    const patch = render.patchPlan
      ? tryCreateInPlacePatch(await readFile(outputPath), artifact.bytes, render.patchPlan)
      : undefined;
    if (patch?.ok) {
      await writePatchSegments(outputPath, patch.segments);
      return {
        path: outputPath,
        status: "patched",
        strategy: "in-place",
        bytesWritten: patch.segments.reduce(
          (total, segment) => total + segment.bytes.byteLength,
          0,
        ),
        patchedParts: patch.patchedParts,
        diagnostics: [],
      };
    }

    await replaceFile(outputPath, artifact.bytes);
    return {
      path: outputPath,
      status: "replaced",
      strategy: "atomic-replace",
      bytesWritten: artifact.bytes.byteLength,
      patchedParts: [],
      diagnostics: patch?.diagnostics ?? [],
    };
  } catch (error) {
    return {
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
    };
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
  return path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.deckjsx-lock`);
}

async function acquireWriteLock(outputPath: string): Promise<WriteLockResult> {
  const lockPath = lockPathFor(outputPath);
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
    await handle.writeFile(`${process.pid}\n`);
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

async function replaceFile(outputPath: string, bytes: Uint8Array): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.deckjsx-tmp`,
  );
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, outputPath);
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
    }
  | { readonly ok: false };

function resolveNodeFileAssetPath(input: {
  readonly options: NodeFileAssetLoaderOptions;
  readonly source: AssetSource;
  readonly importer?: string;
}): NodeFileAssetPathResult {
  if (input.source.kind !== "path") {
    return { ok: true };
  }

  if (path.isAbsolute(input.source.path)) {
    return { ok: true, path: input.source.path };
  }

  if (input.importer) {
    return { ok: true, path: path.resolve(path.dirname(input.importer), input.source.path) };
  }

  if (input.options.root) {
    return { ok: true, path: path.resolve(input.options.root, input.source.path) };
  }

  return { ok: false };
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

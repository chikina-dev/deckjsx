import {
  PATCH_MANIFEST_KIND,
  PATCH_MANIFEST_PATH,
  PATCH_MANIFEST_VERSION,
  patchManifestFromParts,
  type PatchManifest,
  type RenderPatchPlan,
} from "deckjsx/integration";

export { PATCH_MANIFEST_PATH };

export type WriteDiagnostic = {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
};

export type ZipEntry = {
  readonly path: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
  readonly centralHeaderOffset: number;
  readonly dataOffset: number;
  readonly bytes: Uint8Array;
};

export type ZipArchive = {
  readonly entries: ReadonlyMap<string, ZipEntry>;
};

export type PatchSegment = {
  readonly position: number;
  readonly bytes: Uint8Array;
};

type InPlacePatch = {
  readonly ok: true;
  readonly segments: readonly PatchSegment[];
  readonly patchedParts: readonly string[];
};

type InPlacePatchFailure = {
  readonly ok: false;
  readonly diagnostics: readonly WriteDiagnostic[];
};

export type InPlacePatchResult = InPlacePatch | InPlacePatchFailure;

export const STORE_METHOD = 0;

const PATCH_RESERVE_MARKER = "deckjsx-patch-reserve:";
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const CRC32_TABLE = createCrc32Table();

export function tryCreateInPlacePatch(
  currentBytes: Uint8Array,
  nextBytes: Uint8Array,
  patchPlan: RenderPatchPlan,
): InPlacePatchResult {
  const currentArchive = parseZipArchive(currentBytes);
  const nextArchive = parseZipArchive(nextBytes);
  if (!currentArchive || !nextArchive) {
    return inPlacePatchFailure(
      "deckjsx.node.write.unreadableZip",
      "Existing or rendered PPTX bytes could not be read as a ZIP archive.",
    );
  }

  const manifestEntry = currentArchive.entries.get(PATCH_MANIFEST_PATH);
  const currentManifest = manifestEntry ? parsePatchManifest(manifestEntry.bytes) : undefined;
  if (!manifestEntry || !currentManifest) {
    return inPlacePatchFailure(
      "deckjsx.node.write.missingPatchManifest",
      "Existing PPTX does not contain a deckjsx patch manifest.",
      PATCH_MANIFEST_PATH,
    );
  }

  const currentParts = new Map(
    currentManifest.parts.map((part) => [part.packagePartId, part] as const),
  );
  const nextParts = new Map(
    patchPlan.parts
      .filter((part) => part.patchableKind !== "manifest")
      .map((part) => [part.packagePartId, part] as const),
  );
  for (const currentPart of currentParts.values()) {
    if (!nextParts.has(currentPart.packagePartId)) {
      return inPlacePatchFailure(
        "deckjsx.node.write.patchManifestRemovedPart",
        "Existing PPTX patch manifest contains a package part that is not present in the current render patch plan.",
        currentPart.path,
      );
    }
  }
  const segments: PatchSegment[] = [];
  const patchedParts: string[] = [];

  for (const nextPart of patchPlan.parts) {
    if (nextPart.patchableKind === "manifest") {
      continue;
    }

    const currentPart = currentParts.get(nextPart.packagePartId);
    if (!currentPart || currentPart.path !== nextPart.path) {
      return inPlacePatchFailure(
        "deckjsx.node.write.patchManifestMismatch",
        "Existing PPTX patch manifest does not match the current render patch plan.",
        nextPart.path,
      );
    }

    const currentEntry = currentArchive.entries.get(currentPart.path);
    const nextEntry = nextArchive.entries.get(nextPart.path);
    if (
      !currentEntry ||
      !nextEntry ||
      currentEntry.method !== STORE_METHOD ||
      nextEntry.method !== STORE_METHOD
    ) {
      return inPlacePatchFailure(
        "deckjsx.node.write.unsupportedZipEntry",
        "Changed package part cannot be updated in place because its ZIP entry is missing or unsupported.",
        nextPart.path,
      );
    }

    const currentFingerprint = fingerprintPatchableEntry(currentPart, currentEntry.bytes);
    if (currentFingerprint !== currentPart.fingerprint) {
      return inPlacePatchFailure(
        "deckjsx.node.write.patchManifestStale",
        "Existing PPTX package part bytes do not match the deckjsx patch manifest.",
        currentPart.path,
      );
    }
    if (currentPart.fingerprint === nextPart.fingerprint) {
      continue;
    }

    let patchedBytes: Uint8Array | undefined;
    if (nextPart.patchableKind === "xml") {
      patchedBytes = paddedXmlBytes(nextEntry.bytes, currentEntry.compressedSize);
    } else if (nextPart.patchableKind === "media") {
      patchedBytes =
        nextEntry.bytes.byteLength === currentEntry.compressedSize ? nextEntry.bytes : undefined;
    } else {
      return inPlacePatchFailure(
        "deckjsx.node.write.unsupportedPatchableKind",
        "Changed package part cannot be updated in place by the current node writer.",
        nextPart.path,
      );
    }

    if (!patchedBytes) {
      return inPlacePatchFailure(
        "deckjsx.node.write.inPlacePatchExceededCapacity",
        "Changed package part exceeded its reserved in-place patch capacity.",
        nextPart.path,
      );
    }

    segments.push(...zipEntryPatchSegments(currentEntry, patchedBytes));
    patchedParts.push(nextPart.path);
  }

  const manifestBytes = paddedManifestBytes(
    patchManifestLogicalBytes(patchPlan),
    manifestEntry.compressedSize,
  );
  if (!manifestBytes) {
    return inPlacePatchFailure(
      "deckjsx.node.write.inPlacePatchExceededCapacity",
      "Patch manifest exceeded its reserved in-place patch capacity.",
      PATCH_MANIFEST_PATH,
    );
  }
  segments.push(...zipEntryPatchSegments(manifestEntry, manifestBytes));
  patchedParts.push(PATCH_MANIFEST_PATH);

  return { ok: true, segments, patchedParts };
}

export function fingerprintPatchableEntry(
  part: PatchManifest["parts"][number],
  bytes: Uint8Array,
): string {
  if (part.patchableKind === "xml") {
    return fingerprintBytes(stripXmlReserve(bytes));
  }
  return fingerprintBytes(bytes);
}

export function parsePatchManifest(bytes: Uint8Array): PatchManifest | undefined {
  try {
    const value = JSON.parse(textDecoder.decode(bytes).trim());
    return isPatchManifest(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isPatchManifest(value: unknown): value is PatchManifest {
  if (
    !isRecord(value) ||
    value.kind !== PATCH_MANIFEST_KIND ||
    value.version !== PATCH_MANIFEST_VERSION
  ) {
    return false;
  }

  return Array.isArray(value.parts) && value.parts.every(isPatchManifestPart);
}

function isPatchManifestPart(value: unknown): value is PatchManifest["parts"][number] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.packagePartId === "string" &&
    typeof value.path === "string" &&
    isPatchableKind(value.patchableKind) &&
    typeof value.reservedCapacity === "number" &&
    Number.isSafeInteger(value.reservedCapacity) &&
    value.reservedCapacity >= 0 &&
    typeof value.logicalByteLength === "number" &&
    Number.isSafeInteger(value.logicalByteLength) &&
    value.logicalByteLength >= 0 &&
    typeof value.storedByteLength === "number" &&
    Number.isSafeInteger(value.storedByteLength) &&
    value.storedByteLength >= 0 &&
    typeof value.fingerprint === "string"
  );
}

function isPatchableKind(value: unknown): value is PatchManifest["parts"][number]["patchableKind"] {
  return value === "manifest" || value === "media" || value === "xml";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseZipArchive(bytes: Uint8Array): ZipArchive | undefined {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    return undefined;
  }

  const entryCount = readUint16(bytes, eocdOffset + 10);
  const centralDirectorySize = readUint32(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readUint32(bytes, eocdOffset + 16);
  if (
    entryCount === undefined ||
    centralDirectorySize === undefined ||
    centralDirectoryOffset === undefined
  ) {
    return undefined;
  }
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > bytes.byteLength) {
    return undefined;
  }

  const entries = new Map<string, ZipEntry>();
  let cursor = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    const centralSignature = readUint32(bytes, cursor);
    const method = readUint16(bytes, cursor + 10);
    const compressedSize = readUint32(bytes, cursor + 20);
    const uncompressedSize = readUint32(bytes, cursor + 24);
    const pathByteLength = readUint16(bytes, cursor + 28);
    const extraByteLength = readUint16(bytes, cursor + 30);
    const commentByteLength = readUint16(bytes, cursor + 32);
    const localHeaderOffset = readUint32(bytes, cursor + 42);
    if (
      centralSignature !== 0x02014b50 ||
      method === undefined ||
      compressedSize === undefined ||
      uncompressedSize === undefined ||
      pathByteLength === undefined ||
      extraByteLength === undefined ||
      commentByteLength === undefined ||
      localHeaderOffset === undefined
    ) {
      return undefined;
    }

    const pathStart = cursor + 46;
    const pathEnd = pathStart + pathByteLength;
    if (pathEnd > bytes.byteLength) {
      return undefined;
    }
    const entryPath = textDecoder.decode(bytes.subarray(pathStart, pathEnd));
    const localEntry = localZipEntry(bytes, {
      compressedSize,
      localHeaderOffset,
      path: entryPath,
    });
    if (!localEntry) {
      return undefined;
    }

    entries.set(entryPath, {
      path: entryPath,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      centralHeaderOffset: cursor,
      dataOffset: localEntry.dataOffset,
      bytes: bytes.subarray(localEntry.dataOffset, localEntry.dataOffset + compressedSize),
    });
    cursor = pathEnd + extraByteLength + commentByteLength;
  }

  return { entries };
}

export function fingerprintBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function inPlacePatchFailure(code: string, message: string, path?: string): InPlacePatchFailure {
  return {
    ok: false,
    diagnostics: [
      {
        code,
        message,
        ...(path ? { path } : {}),
      },
    ],
  };
}

function patchManifestLogicalBytes(patchPlan: RenderPatchPlan): Uint8Array {
  const manifest = patchManifestFromParts(patchPlan.parts);
  return textEncoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);
}

function paddedManifestBytes(logical: Uint8Array, targetSize: number): Uint8Array | undefined {
  if (logical.byteLength > targetSize) {
    return undefined;
  }
  const bytes = new Uint8Array(targetSize);
  bytes.set(logical, 0);
  bytes.fill(0x20, logical.byteLength);
  return bytes;
}

function paddedXmlBytes(bytes: Uint8Array, targetSize: number): Uint8Array | undefined {
  const logical = stripXmlReserve(bytes);
  if (logical.byteLength === targetSize) {
    return logical;
  }

  const prefix = textEncoder.encode(`\n<!--${PATCH_RESERVE_MARKER}`);
  const suffix = textEncoder.encode("-->");
  const reserveByteLength = targetSize - logical.byteLength - prefix.byteLength - suffix.byteLength;
  if (reserveByteLength < 0) {
    return undefined;
  }

  const result = new Uint8Array(targetSize);
  result.set(logical, 0);
  result.set(prefix, logical.byteLength);
  result.fill(0x2e, logical.byteLength + prefix.byteLength, targetSize - suffix.byteLength);
  result.set(suffix, targetSize - suffix.byteLength);
  return result;
}

function stripXmlReserve(bytes: Uint8Array): Uint8Array {
  const text = textDecoder.decode(bytes);
  const markerIndex = text.lastIndexOf(`<!--${PATCH_RESERVE_MARKER}`);
  if (markerIndex < 0) {
    return bytes;
  }
  return textEncoder.encode(text.slice(0, markerIndex));
}

function zipEntryPatchSegments(entry: ZipEntry, bytes: Uint8Array): readonly PatchSegment[] {
  const crc = uint32Bytes(crc32(bytes));
  return [
    { position: entry.localHeaderOffset + 14, bytes: crc },
    { position: entry.centralHeaderOffset + 16, bytes: crc },
    { position: entry.dataOffset, bytes },
  ];
}

function localZipEntry(
  bytes: Uint8Array,
  input: {
    readonly compressedSize: number;
    readonly localHeaderOffset: number;
    readonly path: string;
  },
): { readonly dataOffset: number } | undefined {
  if (readUint32(bytes, input.localHeaderOffset) !== 0x04034b50) {
    return undefined;
  }
  const pathByteLength = readUint16(bytes, input.localHeaderOffset + 26);
  const extraByteLength = readUint16(bytes, input.localHeaderOffset + 28);
  if (pathByteLength === undefined || extraByteLength === undefined) {
    return undefined;
  }
  const dataOffset = input.localHeaderOffset + 30 + pathByteLength + extraByteLength;
  return dataOffset + input.compressedSize <= bytes.byteLength ? { dataOffset } : undefined;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimumOffset = Math.max(0, bytes.byteLength - 0xffff - 22);
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function readUint16(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    return undefined;
  }
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    return undefined;
  }
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function uint32Bytes(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

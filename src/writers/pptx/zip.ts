import { deflateSync, strToU8 } from "fflate";
import type { PptxCompressionMode } from "../../pptx-options";
import { createCollectingPptxZipSink, type PptxZipSink } from "./sinks";

export type PptxZipEntry = {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly compression?: "default" | "store";
};

type CentralDirectoryEntry = {
  readonly pathBytes: Uint8Array;
  readonly flags: number;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
};

const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 0x0021;
const ZIP_VERSION = 20;
const UTF8_FLAG = 0x0800;
const DEFLATE_METHOD = 8;
const STORE_METHOD = 0;
const UINT32_MAX = 0xffffffff;

const CRC32_TABLE = createCrc32Table();

function zipLevel(compression: PptxCompressionMode | undefined): 0 | 1 | 6 | 9 {
  switch (compression) {
    case "store":
      return 0;
    case "balanced":
      return 6;
    case "small":
      return 9;
    case "fast":
    default:
      return 1;
  }
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

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function assertZip32Size(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`PPTX ZIP ${name} exceeds ZIP32 limits.`);
  }
}

function encodedPath(path: string): { readonly bytes: Uint8Array; readonly flags: number } {
  const bytes = strToU8(path);
  if (bytes.byteLength > 0xffff) {
    throw new Error(`PPTX ZIP entry path is too long: ${path}`);
  }

  return {
    bytes,
    flags: bytes.byteLength === path.length ? 0 : UTF8_FLAG,
  };
}

function compressedBytesForEntry(
  entry: PptxZipEntry,
  options: { readonly compression?: PptxCompressionMode },
): { readonly bytes: Uint8Array; readonly method: number } {
  const shouldStore = entry.compression === "store" || options.compression === "store";
  if (shouldStore) {
    return { bytes: entry.bytes, method: STORE_METHOD };
  }

  return {
    bytes: deflateSync(entry.bytes, { level: zipLevel(options.compression) }),
    method: DEFLATE_METHOD,
  };
}

function localHeader(entry: CentralDirectoryEntry): Uint8Array {
  const header = new Uint8Array(30 + entry.pathBytes.byteLength);
  writeUint32(header, 0, 0x04034b50);
  writeUint16(header, 4, ZIP_VERSION);
  writeUint16(header, 6, entry.flags);
  writeUint16(header, 8, entry.method);
  writeUint16(header, 10, FIXED_DOS_TIME);
  writeUint16(header, 12, FIXED_DOS_DATE);
  writeUint32(header, 14, entry.crc);
  writeUint32(header, 18, entry.compressedSize);
  writeUint32(header, 22, entry.uncompressedSize);
  writeUint16(header, 26, entry.pathBytes.byteLength);
  writeUint16(header, 28, 0);
  header.set(entry.pathBytes, 30);
  return header;
}

function centralDirectoryHeader(entry: CentralDirectoryEntry): Uint8Array {
  const header = new Uint8Array(46 + entry.pathBytes.byteLength);
  writeUint32(header, 0, 0x02014b50);
  writeUint16(header, 4, ZIP_VERSION);
  writeUint16(header, 6, ZIP_VERSION);
  writeUint16(header, 8, entry.flags);
  writeUint16(header, 10, entry.method);
  writeUint16(header, 12, FIXED_DOS_TIME);
  writeUint16(header, 14, FIXED_DOS_DATE);
  writeUint32(header, 16, entry.crc);
  writeUint32(header, 20, entry.compressedSize);
  writeUint32(header, 24, entry.uncompressedSize);
  writeUint16(header, 28, entry.pathBytes.byteLength);
  writeUint16(header, 30, 0);
  writeUint16(header, 32, 0);
  writeUint16(header, 34, 0);
  writeUint16(header, 36, 0);
  writeUint32(header, 38, 0);
  writeUint32(header, 42, entry.localHeaderOffset);
  header.set(entry.pathBytes, 46);
  return header;
}

function endOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number) {
  if (entryCount > 0xffff) {
    throw new Error("PPTX ZIP entry count exceeds ZIP32 limits.");
  }
  assertZip32Size("central directory size", centralSize);
  assertZip32Size("central directory offset", centralOffset);

  const header = new Uint8Array(22);
  writeUint32(header, 0, 0x06054b50);
  writeUint16(header, 4, 0);
  writeUint16(header, 6, 0);
  writeUint16(header, 8, entryCount);
  writeUint16(header, 10, entryCount);
  writeUint32(header, 12, centralSize);
  writeUint32(header, 16, centralOffset);
  writeUint16(header, 20, 0);
  return header;
}

export function writePptxZipEntriesToSink(
  entries: Iterable<PptxZipEntry>,
  sink: PptxZipSink,
  options: { readonly compression?: PptxCompressionMode } = {},
): void {
  const centralEntries: CentralDirectoryEntry[] = [];
  let offset = 0;

  const write = (chunk: Uint8Array): void => {
    sink.write(chunk);
    offset += chunk.byteLength;
    assertZip32Size("archive offset", offset);
  };

  try {
    for (const entry of entries) {
      const path = encodedPath(entry.path);
      const compressed = compressedBytesForEntry(entry, options);
      assertZip32Size("compressed entry size", compressed.bytes.byteLength);
      assertZip32Size("uncompressed entry size", entry.bytes.byteLength);

      const centralEntry: CentralDirectoryEntry = {
        pathBytes: path.bytes,
        flags: path.flags,
        method: compressed.method,
        crc: crc32(entry.bytes),
        compressedSize: compressed.bytes.byteLength,
        uncompressedSize: entry.bytes.byteLength,
        localHeaderOffset: offset,
      };

      centralEntries.push(centralEntry);
      write(localHeader(centralEntry));
      write(compressed.bytes);
    }

    const centralOffset = offset;
    for (const entry of centralEntries) {
      write(centralDirectoryHeader(entry));
    }
    write(endOfCentralDirectory(centralEntries.length, offset - centralOffset, centralOffset));
  } finally {
    sink.close?.();
  }
}

export function createPptxZipBytesFromEntries(
  entries: Iterable<PptxZipEntry>,
  options: { readonly compression?: PptxCompressionMode } = {},
): Uint8Array {
  const sink = createCollectingPptxZipSink();
  writePptxZipEntriesToSink(entries, sink, options);
  return sink.bytes();
}

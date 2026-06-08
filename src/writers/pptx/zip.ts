import { Zip, ZipDeflate, ZipPassThrough, type ZipInputFile } from "fflate";
import type { PptxCompressionMode } from "../../pptx-options";
import { createCollectingPptxZipSink, type PptxZipSink } from "./sinks";

export type PptxZipEntry = {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly compression?: "default" | "store";
};

const FIXED_MTIME = new Date(1980, 0, 1, 0, 0, 0, 0);

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

function zipInputFileForEntry(
  entry: PptxZipEntry,
  options: { readonly compression?: PptxCompressionMode },
): ZipInputFile & { push(chunk: Uint8Array, final?: boolean): void } {
  const shouldStore = entry.compression === "store" || options.compression === "store";
  const file = shouldStore
    ? new ZipPassThrough(entry.path)
    : new ZipDeflate(entry.path, { level: zipLevel(options.compression) });
  file.mtime = FIXED_MTIME;
  return file;
}

export function writePptxZipEntriesToSink(
  entries: Iterable<PptxZipEntry>,
  sink: PptxZipSink,
  options: { readonly compression?: PptxCompressionMode } = {},
): void {
  let failure: unknown;
  const zip = new Zip((error, chunk) => {
    if (error) {
      failure = error;
      return;
    }
    if (chunk) {
      try {
        sink.write(chunk);
      } catch (sinkError) {
        failure = sinkError;
      }
    }
  });

  for (const entry of entries) {
    const file = zipInputFileForEntry(entry, options);
    zip.add(file);
    file.push(entry.bytes, true);
    if (failure) {
      zip.terminate();
      throw failure;
    }
  }

  zip.end();
  if (failure) {
    throw failure;
  }

  sink.close?.();
}

export function createPptxZipBytesFromEntries(
  entries: Iterable<PptxZipEntry>,
  options: { readonly compression?: PptxCompressionMode } = {},
): Uint8Array {
  const sink = createCollectingPptxZipSink();
  writePptxZipEntriesToSink(entries, sink, options);
  return sink.bytes();
}

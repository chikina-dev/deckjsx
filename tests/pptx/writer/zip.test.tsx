import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("direct pptx writer ZIP assembly", () => {
  test("ZIP assembly writes ordered entries through a collecting sink", () => {
    const encoder = new TextEncoder();
    const sink = H.createCollectingPptxZipSink();

    H.writePptxZipEntriesToSink(
      [
        { path: "first.txt", bytes: encoder.encode("first") },
        { path: "second.txt", bytes: encoder.encode("second") },
      ],
      sink,
    );

    const zip = H.unzipSync(sink.bytes());

    expect(H.strFromU8(zip["first.txt"]!)).toBe("first");
    expect(H.strFromU8(zip["second.txt"]!)).toBe("second");
  });

  test("ZIP byte helper uses the same collecting sink path", () => {
    const encoder = new TextEncoder();
    const bytes = H.createPptxZipBytesFromEntries([
      { path: "deckjsx.txt", bytes: encoder.encode("sink boundary") },
    ]);

    expect(H.strFromU8(H.unzipSync(bytes)["deckjsx.txt"]!)).toBe("sink boundary");
  });

  test("ZIP test helper rejects truncated local headers", () => {
    const truncatedHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

    expect(() => H.unzipSync(truncatedHeader)).toThrow(
      "Truncated ZIP archive while reading local header at offset 0.",
    );
  });

  test("ZIP test helper rejects truncated file names", () => {
    const bytes = new Uint8Array(30);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(26, 1, true);

    expect(() => H.unzipSync(bytes)).toThrow(
      "Truncated ZIP archive while reading file name at offset 0.",
    );
  });

  test("ZIP test helper rejects truncated stored data", () => {
    const encoder = new TextEncoder();
    const path = encoder.encode("deckjsx.txt");
    const bytes = new Uint8Array(30 + path.byteLength + 2);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint32(18, 4, true);
    view.setUint32(22, 4, true);
    view.setUint16(26, path.byteLength, true);
    bytes.set(path, 30);
    bytes.set(encoder.encode("hi"), 30 + path.byteLength);

    expect(() => H.unzipSync(bytes)).toThrow(
      "Truncated ZIP archive while reading stored data for ZIP entry deckjsx.txt.",
    );
  });

  test("ZIP byte helper writes deterministic central directory metadata", () => {
    const encoder = new TextEncoder();
    const bytes = H.createPptxZipBytesFromEntries([
      { path: "first.txt", bytes: encoder.encode("first") },
      { path: "second.txt", bytes: encoder.encode("second") },
    ]);

    expect(H.centralDirectoryEntries(bytes)).toEqual([
      { path: "first.txt", modifiedDate: 0x0021, modifiedTime: 0 },
      { path: "second.txt", modifiedDate: 0x0021, modifiedTime: 0 },
    ]);
  });

  test("ZIP byte helper writes local headers without data descriptors", () => {
    const encoder = new TextEncoder();
    const bytes = H.createPptxZipBytesFromEntries([
      { path: "ppt/slides/slide1.xml", bytes: encoder.encode("<p:sld/>") },
      { path: "ppt/media/media1.png", bytes: new Uint8Array([137, 80, 78, 71]) },
    ]);

    expect(H.localFileHeaderEntries(bytes)).toEqual([
      {
        path: "ppt/slides/slide1.xml",
        flags: 0,
        compressedSize: expect.any(Number),
        uncompressedSize: 8,
      },
      {
        path: "ppt/media/media1.png",
        flags: 0,
        compressedSize: expect.any(Number),
        uncompressedSize: 4,
      },
    ]);
  });

  test("tee sink fans out chunks without changing collecting sink ownership", () => {
    const first = H.createCollectingPptxZipSink();
    const second = H.createCollectingPptxZipSink();
    const tee = H.createTeePptxZipSink([first, second]);
    const chunk = new Uint8Array([1, 2, 3]);

    tee.write(chunk);
    tee.close?.();

    expect(Array.from(first.bytes())).toEqual([1, 2, 3]);
    expect(Array.from(second.bytes())).toEqual([1, 2, 3]);
  });
});

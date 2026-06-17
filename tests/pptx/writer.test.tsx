import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vite-plus/test";
import { Deck, Theme } from "../../src/index.ts";
import { isPptxSlidePart, isPptxSupportPart } from "../../src/inspect.ts";
import type {
  PptxBackgroundLayer,
  PptxContentTypesPayload,
  PptxMediaPartPayload,
  PptxPackageModel,
  PptxPackagePart,
  PptxRelationship,
  PptxRelationshipsPayload,
  PptxSlideMasterPartPayload,
  PptxSlidePart,
  PptxSupportPartPayload,
  PptxThemePartPayload,
} from "../../src/inspect.ts";
import { withPackagePartFingerprints } from "../../src/projection/pptx/fingerprint.ts";
import { expectedAssemblyEntryForPart } from "../../src/writers/pptx/assembly.ts";
import { buildArtifactForPart } from "../../src/writers/pptx/build.ts";
import {
  writeColor,
  writeFill,
  writeNonVisual,
  writeShadow,
  writeShapeProperties,
  writeTransform,
} from "../../src/writers/pptx/drawing-xml.ts";
import { emitPartBytes } from "../../src/writers/pptx/emit.ts";
import { mediaPartPayload } from "../../src/writers/pptx/media.ts";
import { relationshipsBytes } from "../../src/writers/pptx/package-xml.ts";
import { slideBytes } from "../../src/writers/pptx/slide-xml.ts";
import { writeTextBody } from "../../src/writers/pptx/text-xml.ts";
import { createCollectingPptxZipSink, createTeePptxZipSink } from "../../src/writers/pptx/sinks.ts";
import {
  createPptxZipBytesFromEntries,
  writePptxZipEntriesToSink,
} from "../../src/writers/pptx/zip.ts";
import { XmlChunkWriter } from "../../src/writers/pptx/xml-writer.ts";
import {
  SAMPLE_SVG_DATA_URI,
  strFromU8,
  unzipSync,
  type Unzipped,
  WIDE_SVG_DATA_URI,
} from "../helpers.ts";

function malformedBackgroundLayer(
  layer: Partial<PptxBackgroundLayer> & { readonly kind: "solid"; readonly color: string },
): PptxBackgroundLayer {
  return layer as PptxBackgroundLayer;
}

function coreDocumentPropertiesPayload(part: PptxPackagePart | undefined) {
  if (
    part &&
    isPptxSupportPart(part) &&
    part.payload.kind === "document-properties" &&
    part.payload.propertyKind === "core"
  ) {
    return part.payload;
  }

  throw new Error("Expected a core document properties part.");
}

function extendedDocumentPropertiesPayload(part: PptxPackagePart) {
  if (
    isPptxSupportPart(part) &&
    part.payload.kind === "document-properties" &&
    part.payload.propertyKind === "extended"
  ) {
    return part.payload;
  }

  throw new Error("Expected an extended document properties part.");
}

function zipEntry(zip: Unzipped, path: string): string | undefined {
  const content = zip[path];
  return content ? strFromU8(content) : undefined;
}

function packagePaths(zip: Unzipped): readonly string[] {
  return Object.keys(zip).sort((left, right) => left.localeCompare(right));
}

async function renderDeckBytes(deck: Deck): Promise<Uint8Array> {
  const result = await deck.render();
  expect(result.ok).toBe(true);
  expect(result.artifact?.format).toBe("pptx");
  expect(result.artifact?.bytes.byteLength).toBeGreaterThan(0);
  return result.artifact?.bytes ?? new Uint8Array();
}

function withFreshPackageFingerprints(projection: PptxPackageModel): PptxPackageModel {
  const parts = withPackagePartFingerprints(projection.parts);
  const partsById = new Map(parts.map((part) => [part.id, part]));
  return {
    ...projection,
    parts,
    slides: projection.slides.map((slide) => {
      const part = partsById.get(slide.id);
      return part && isPptxSlidePart(part) ? part : slide;
    }),
  };
}

function relationshipOwnerPath(path: string): string {
  if (path === "_rels/.rels") {
    return "";
  }

  return path.replace(/_rels\/(.+)\.rels$/, "$1");
}

function centralDirectoryEntries(
  bytes: Uint8Array,
): Array<{ path: string; modifiedDate: number; modifiedTime: number }> {
  const decoder = new TextDecoder();
  const entries: Array<{ path: string; modifiedDate: number; modifiedTime: number }> = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let offset = 0; offset <= bytes.byteLength - 46; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      continue;
    }

    const modifiedTime = view.getUint16(offset + 12, true);
    const modifiedDate = view.getUint16(offset + 14, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;

    entries.push({
      path: decoder.decode(bytes.subarray(nameStart, nameEnd)),
      modifiedDate,
      modifiedTime,
    });

    offset = nameEnd + extraLength + commentLength - 1;
  }

  return entries;
}

function localFileHeaderEntries(
  bytes: Uint8Array,
): Array<{ path: string; flags: number; compressedSize: number; uncompressedSize: number }> {
  const decoder = new TextDecoder();
  const entries: Array<{
    path: string;
    flags: number;
    compressedSize: number;
    uncompressedSize: number;
  }> = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let offset = 0; offset <= bytes.byteLength - 30; ) {
    if (view.getUint32(offset, true) !== 0x04034b50) {
      break;
    }

    const flags = view.getUint16(offset + 6, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;

    entries.push({
      path: decoder.decode(bytes.subarray(nameStart, nameEnd)),
      flags,
      compressedSize,
      uncompressedSize,
    });

    offset = nameEnd + extraLength + compressedSize;
  }

  return entries;
}

function relationshipsFor(part: PptxPackagePart): readonly PptxRelationship[] {
  return (
    part.relationships ??
    (part.payload as PptxRelationshipsPayload | undefined)?.relationships ??
    []
  );
}

const MINIMAL_TEXT_BODY_STYLE = {
  fit: "none",
  textDirection: "horz",
  verticalAlign: "top",
  wrap: true,
} as const;

describe("direct pptx writer", () => {
  test("primary PPTX XML emitters avoid raw XML fragment insertion", async () => {
    const emitterFiles = [
      "drawing-layer-xml.ts",
      "drawing-xml.ts",
      "package-xml.ts",
      "picture-xml.ts",
      "shape-xml.ts",
      "slide-xml.ts",
      "support-xml.ts",
      "text-xml.ts",
    ] as const;

    const sources = await Promise.all(
      emitterFiles.map(async (fileName) => ({
        fileName,
        source: await readFile(
          new URL(`../../src/writers/pptx/${fileName}`, import.meta.url),
          "utf8",
        ),
      })),
    );

    expect(sources).toEqual(
      expect.arrayContaining(
        emitterFiles.map((fileName) =>
          expect.objectContaining({ fileName, source: expect.not.stringContaining(".raw(") }),
        ),
      ),
    );
  });

  test("XML chunk writer preserves deterministic escaping while reusing static chunks", () => {
    const xml = new TextDecoder().decode(
      new XmlChunkWriter()
        .declaration()
        .open("p:root")
        .open("a:rPr")
        .empty("a:latin")
        .close("a:rPr")
        .open("a:rPr")
        .empty("a:latin")
        .close("a:rPr")
        .element("a:t", { value: "A&B<\"'" }, " & <\"'>")
        .close("p:root")
        .bytes(),
    );

    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        "<p:root>" +
        "<a:rPr><a:latin/></a:rPr>" +
        "<a:rPr><a:latin/></a:rPr>" +
        '<a:t value="A&amp;B&lt;&quot;&apos;"> &amp; &lt;&quot;&apos;&gt;</a:t>' +
        "</p:root>",
    );
  });

  test("drawing XML helpers reject missing projected frame and color values", () => {
    expect(() =>
      writeTransform(new XmlChunkWriter(), {
        xEmu: undefined,
        yEmu: 0,
        widthEmu: 100,
        heightEmu: 100,
      } as never),
    ).toThrow("PPTX drawing XML requires finite frame.xEmu.");

    expect(() =>
      writeTransform(new XmlChunkWriter(), {
        xEmu: 0,
        yEmu: 0,
        widthEmu: Number.NaN,
        heightEmu: 100,
      }),
    ).toThrow("PPTX drawing XML requires finite frame.widthEmu.");

    expect(() =>
      writeShapeProperties(new XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: -1, heightEmu: 100 },
        geometry: "rect",
      }),
    ).toThrow("PPTX drawing XML requires non-negative shape frame size.");

    expect(() =>
      writeShapeProperties(new XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 0, heightEmu: 0 },
        geometry: "line",
      }),
    ).toThrow("PPTX drawing XML requires line frame size on at least one axis.");

    expect(() => writeColor(new XmlChunkWriter(), undefined)).toThrow(
      "PPTX drawing XML requires a projected color value.",
    );

    expect(() => writeColor(new XmlChunkWriter(), "#FFFFFF")).toThrow(
      "PPTX drawing XML requires a projected six-digit RGB color value.",
    );

    expect(() => writeColor(new XmlChunkWriter(), "tomato")).toThrow(
      "PPTX drawing XML requires a projected six-digit RGB color value.",
    );

    expect(() => writeColor(new XmlChunkWriter(), "FFFFFF", Number.NaN)).toThrow(
      "PPTX drawing XML requires finite transparency.",
    );

    expect(() => writeColor(new XmlChunkWriter(), "FFFFFF", -1)).toThrow(
      "PPTX drawing XML requires transparency between 0 and 100.",
    );

    expect(() => writeColor(new XmlChunkWriter(), "FFFFFF", undefined, 1.5)).toThrow(
      "PPTX drawing XML requires opacity between 0 and 1.",
    );

    expect(() =>
      writeTransform(
        new XmlChunkWriter(),
        { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        Number.NaN,
      ),
    ).toThrow("PPTX drawing XML requires finite rotation.");

    expect(() =>
      writeFill(new XmlChunkWriter(), {
        kind: "linear-gradient",
        angle: 0,
        stops: [{ color: "FFFFFF", position: Number.NaN }],
      }),
    ).toThrow("PPTX drawing XML requires finite fill.stops.0.position.");

    expect(() =>
      writeFill(new XmlChunkWriter(), { kind: "linear-gradient", angle: 0, stops: [] }),
    ).toThrow("PPTX drawing XML requires fill.stops.");

    expect(() =>
      writeFill(new XmlChunkWriter(), {
        kind: "linear-gradient",
        angle: 0,
        stops: [{ color: "FFFFFF", position: 1.5 }],
      }),
    ).toThrow("PPTX drawing XML requires fill.stops.0.position between 0 and 1.");

    expect(() =>
      writeFill(new XmlChunkWriter(), {
        kind: "radial-gradient",
        shape: "circle",
        center: { x: 0.5, y: 0.5 },
        radius: { x: 0, y: 0.5 },
        stops: [{ color: "FFFFFF", position: 0 }],
      }),
    ).toThrow("PPTX drawing XML requires positive fill.radius.x.");

    expect(() =>
      writeFill(new XmlChunkWriter(), {
        kind: "radial-gradient",
        shape: "square" as never,
        center: { x: 0.5, y: 0.5 },
        radius: { x: 0.5, y: 0.5 },
        stops: [{ color: "FFFFFF", position: 0 }],
      }),
    ).toThrow("PPTX drawing XML requires supported radial fill.shape.");

    expect(() =>
      writeShapeProperties(new XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        stroke: { color: "FFFFFF", widthPt: Number.NaN },
      }),
    ).toThrow("PPTX drawing XML requires finite stroke.widthPt.");

    expect(() =>
      writeShapeProperties(new XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        stroke: { color: "FFFFFF" } as never,
      }),
    ).toThrow("PPTX drawing XML requires finite stroke.widthPt.");

    expect(() =>
      writeShapeProperties(new XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        stroke: { color: "FFFFFF", widthPt: -1 },
      }),
    ).toThrow("PPTX drawing XML requires non-negative stroke.widthPt.");

    expect(() =>
      writeShapeProperties(new XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        stroke: { color: "FFFFFF", widthPt: 1, lineJoin: "flat" as never },
      }),
    ).toThrow("PPTX drawing XML requires supported stroke.lineJoin.");

    expect(() =>
      writeShapeProperties(new XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        stroke: { color: "FFFFFF", widthPt: 1, style: "dash" },
      }),
    ).toThrow("PPTX drawing XML requires projected stroke.dashType for dashed strokes.");

    expect(() =>
      writeShapeProperties(new XmlChunkWriter(), {
        frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
        geometry: "rect",
        radiusEmu: -1,
      }),
    ).toThrow("PPTX drawing XML requires non-negative radiusEmu.");

    expect(() =>
      writeShadow(new XmlChunkWriter(), {
        type: "outer",
        color: "000000",
        opacity: 1,
        blurPt: 0,
        offsetPt: 0,
        angle: Number.NaN,
      }),
    ).toThrow("PPTX drawing XML requires finite shadow.angle.");

    expect(() =>
      writeShadow(new XmlChunkWriter(), { type: "outer", color: "000000" } as never),
    ).toThrow("PPTX drawing XML requires shadow.opacity between 0 and 1.");

    expect(() =>
      writeShadow(new XmlChunkWriter(), {
        type: "outer",
        color: "000000",
        opacity: 1,
        offsetPt: 0,
        angle: 0,
      } as never),
    ).toThrow("PPTX drawing XML requires finite shadow.blurPt.");

    expect(() =>
      writeShadow(new XmlChunkWriter(), {
        type: "outer",
        color: "000000",
        opacity: 1,
        blurPt: 0,
        angle: 0,
      } as never),
    ).toThrow("PPTX drawing XML requires finite shadow.offsetPt.");

    expect(() =>
      writeShadow(new XmlChunkWriter(), {
        type: "outer",
        color: "000000",
        opacity: 1,
        blurPt: 0,
        offsetPt: 0,
      } as never),
    ).toThrow("PPTX drawing XML requires finite shadow.angle.");

    expect(() =>
      writeShadow(new XmlChunkWriter(), {
        type: "outer",
        color: "000000",
        opacity: 2,
        blurPt: 0,
        offsetPt: 0,
        angle: 0,
      }),
    ).toThrow("PPTX drawing XML requires shadow.opacity between 0 and 1.");

    expect(() => writeNonVisual(new XmlChunkWriter(), "sp", undefined, " 1")).toThrow(
      " 1 must carry a projected positive shape object id.",
    );

    expect(() => writeNonVisual(new XmlChunkWriter(), "pic", "0", "Picture 1")).toThrow(
      "Picture 1 must carry a projected positive shape object id.",
    );

    expect(() => writeNonVisual(new XmlChunkWriter(), "sp", "1abc", " 1")).toThrow(
      " 1 must carry a projected positive shape object id.",
    );

    expect(() => writeNonVisual(new XmlChunkWriter(), "sp", "9007199254740991", " 1")).toThrow(
      " 1 must carry a projected positive shape object id.",
    );
  });

  test("text XML helper rejects malformed projected text style values", () => {
    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        fontSizePt: Number.NaN,
      }),
    ).toThrow("PPTX text XML requires finite text style.fontSizePt.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        paddingPt: [0, Number.NaN, 0, 0],
      }),
    ).toThrow("PPTX text XML requires finite text style.paddingPt.1.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        fontWeight: 0,
      }),
    ).toThrow("PPTX text XML requires text style.fontWeight between 1 and 1000.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        lineSpacing: -1,
      }),
    ).toThrow("PPTX text XML requires non-negative text style.lineSpacing.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        lineSpacingMultiple: 0,
      }),
    ).toThrow("PPTX text XML requires positive text style.lineSpacingMultiple.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        paragraphSpacingAfter: -1,
      }),
    ).toThrow("PPTX text XML requires non-negative text style.paragraphSpacingAfter.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        list: { type: "bullet", characterCode: "not-hex" },
      }),
    ).toThrow("PPTX text XML requires valid text style.list.characterCode.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        list: { type: "bullet", characterCode: "D800" },
      }),
    ).toThrow("PPTX text XML requires valid text style.list.characterCode.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        list: { type: "bullet" },
      } as never),
    ).toThrow("PPTX text XML requires valid text style.list.characterCode.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        textDirection: "sideways" as never,
      }),
    ).toThrow("PPTX text XML requires supported text style.textDirection.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        tabStops: [{ positionIn: 1, alignment: "middle" as never }],
      }),
    ).toThrow("PPTX text XML requires supported text style.tabStops.0.alignment.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", [{ text: 123 as never }], {
        ...MINIMAL_TEXT_BODY_STYLE,
      }),
    ).toThrow("PPTX text XML requires string text content.run.text.");

    expect(() => writeTextBody(new XmlChunkWriter(), "Broken", undefined, {} as never)).toThrow(
      "PPTX text XML requires projected text style.wrap.",
    );

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        fit: undefined,
      } as never),
    ).toThrow("PPTX text XML requires projected text style.fit.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        textDirection: undefined,
      } as never),
    ).toThrow("PPTX text XML requires projected text style.textDirection.");

    expect(() =>
      writeTextBody(new XmlChunkWriter(), "Broken", undefined, {
        ...MINIMAL_TEXT_BODY_STYLE,
        verticalAlign: undefined,
      } as never),
    ).toThrow("PPTX text XML requires projected text style.verticalAlign.");
  });

  test("ZIP assembly writes ordered entries through a collecting sink", () => {
    const encoder = new TextEncoder();
    const sink = createCollectingPptxZipSink();

    writePptxZipEntriesToSink(
      [
        { path: "first.txt", bytes: encoder.encode("first") },
        { path: "second.txt", bytes: encoder.encode("second") },
      ],
      sink,
    );

    const zip = unzipSync(sink.bytes());

    expect(strFromU8(zip["first.txt"]!)).toBe("first");
    expect(strFromU8(zip["second.txt"]!)).toBe("second");
  });

  test("ZIP byte helper uses the same collecting sink path", () => {
    const encoder = new TextEncoder();
    const bytes = createPptxZipBytesFromEntries([
      { path: "deckjsx.txt", bytes: encoder.encode("sink boundary") },
    ]);

    expect(strFromU8(unzipSync(bytes)["deckjsx.txt"]!)).toBe("sink boundary");
  });

  test("ZIP test helper rejects truncated local headers", () => {
    const truncatedHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

    expect(() => unzipSync(truncatedHeader)).toThrow(
      "Truncated ZIP archive while reading local header at offset 0.",
    );
  });

  test("ZIP test helper rejects truncated file names", () => {
    const bytes = new Uint8Array(30);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(26, 1, true);

    expect(() => unzipSync(bytes)).toThrow(
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

    expect(() => unzipSync(bytes)).toThrow(
      "Truncated ZIP archive while reading stored data for ZIP entry deckjsx.txt.",
    );
  });

  test("ZIP byte helper writes deterministic central directory metadata", () => {
    const encoder = new TextEncoder();
    const bytes = createPptxZipBytesFromEntries([
      { path: "first.txt", bytes: encoder.encode("first") },
      { path: "second.txt", bytes: encoder.encode("second") },
    ]);

    expect(centralDirectoryEntries(bytes)).toEqual([
      { path: "first.txt", modifiedDate: 0x0021, modifiedTime: 0 },
      { path: "second.txt", modifiedDate: 0x0021, modifiedTime: 0 },
    ]);
  });

  test("ZIP byte helper writes local headers without data descriptors", () => {
    const encoder = new TextEncoder();
    const bytes = createPptxZipBytesFromEntries([
      { path: "ppt/slides/slide1.xml", bytes: encoder.encode("<p:sld/>") },
      { path: "ppt/media/media1.png", bytes: new Uint8Array([137, 80, 78, 71]) },
    ]);

    expect(localFileHeaderEntries(bytes)).toEqual([
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
    const first = createCollectingPptxZipSink();
    const second = createCollectingPptxZipSink();
    const tee = createTeePptxZipSink([first, second]);
    const chunk = new Uint8Array([1, 2, 3]);

    tee.write(chunk);
    tee.close?.();

    expect(Array.from(first.bytes())).toEqual([1, 2, 3]);
    expect(Array.from(second.bytes())).toEqual([1, 2, 3]);
  });

  test("render returns real pptx artifact bytes through the writer", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Artifact output" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Hello PPTX</p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    expect(content.subarray(0, 2).toString()).toBe("80,75");
  });

  test("output emits styled span as rich text runs", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Rich text" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 6, height: 1, fontSize: 20 }}>
          Sales <span style={{ color: "#DC2626", fontWeight: 700 }}>grew</span> YoY
        </p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml?.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(
      true,
    );
    expect(slideXml).toContain(
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
    );
    expect(slideXml).toContain("<a:t>Sales </a:t>");
    expect(slideXml).toContain("<a:t>grew</a:t>");
    expect(slideXml).toContain("<a:t> YoY</a:t>");
    expect(slideXml).toContain('val="DC2626"');
    expect(slideXml).toContain('b="1"');
  });

  test("output emits required support parts with deterministic roots", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Support parts" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support</p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const themeXml = zipEntry(zip, "ppt/theme/theme1.xml");
    const masterXml = zipEntry(zip, "ppt/slideMasters/slideMaster1.xml");
    const masterRelsXml = zipEntry(zip, "ppt/slideMasters/_rels/slideMaster1.xml.rels");
    const layoutXml = zipEntry(zip, "ppt/slideLayouts/slideLayout1.xml");
    const layoutRelsXml = zipEntry(zip, "ppt/slideLayouts/_rels/slideLayout1.xml.rels");

    expect(themeXml?.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(
      true,
    );
    expect(themeXml).toContain(
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="deckjsx">',
    );
    expect(themeXml).toContain('<a:accent1><a:srgbClr val="2563EB"/></a:accent1>');
    expect(masterXml).toContain(
      '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
    );
    expect(masterXml).toContain('<p:sldLayoutId id="2147483649" r:id="rId1"/>');
    expect(masterRelsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"',
    );
    expect(masterRelsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"',
    );
    expect(layoutXml).toContain(
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">',
    );
    expect(layoutXml).toContain('<p:cSld name="Blank">');
    expect(layoutRelsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"',
    );
  });

  test("output serializes slide master and layout support payloads", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Support payloads" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support payloads</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.kind === "slide-master") {
            const payload = part.payload as Extract<
              PptxSupportPartPayload,
              { readonly kind: "slide-master" }
            >;
            return {
              ...part,
              payload: {
                ...payload,
                colorMap: { ...payload.colorMap, bg1: "accent2", tx1: "accent3" },
              } satisfies PptxSupportPartPayload,
            };
          }

          if (part.path === "ppt/slideLayouts/slideLayout1.xml") {
            const payload = part.payload as Extract<
              PptxSupportPartPayload,
              { readonly kind: "slide-layout" }
            >;
            return {
              ...part,
              payload: { ...payload, name: "Payload Blank" } satisfies PptxSupportPartPayload,
            };
          }

          return part;
        }),
      }),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const masterXml = zipEntry(zip, "ppt/slideMasters/slideMaster1.xml");
    const layoutXml = zipEntry(zip, "ppt/slideLayouts/slideLayout1.xml");

    expect(masterXml).toContain('bg1="accent2"');
    expect(masterXml).toContain('tx1="accent3"');
    expect(layoutXml).toContain('<p:cSld name="Payload Blank">');
  });

  test("support XML emitters reject malformed theme, master, and layout payloads", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Support payload validation" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support payloads</p>
    ));

    const projection = (await deck.project()).projection!;
    const supportParts = [
      { kind: "theme", message: "Theme support parts must carry a structured theme payload." },
      {
        kind: "slide-master",
        message: "Slide master support parts must carry a structured slide-master payload.",
      },
      {
        kind: "slide-layout",
        message: "Slide layout support parts must carry a structured slide-layout payload.",
      },
    ] as const;

    supportParts.forEach(({ kind, message }) => {
      const part = projection.parts.find((candidate) => candidate.kind === kind);
      expect(part).toBeDefined();
      expect(() =>
        emitPartBytes(
          { ...part!, payload: { kind: "malformed-support-payload" } } as PptxPackagePart,
          projection,
          { slideBytes: () => new Uint8Array() },
        ),
      ).toThrow(message);
    });
  });

  test("support XML emitters reject malformed presentation and property payloads", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Support property validation" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support properties</p>
    ));

    const projection = (await deck.project()).projection!;
    const supportParts = [
      {
        path: "ppt/presentation.xml",
        message: "Presentation support parts must carry a structured presentation payload.",
      },
      {
        path: "docProps/core.xml",
        message: "Core document properties parts must carry a structured core properties payload.",
      },
      {
        path: "docProps/app.xml",
        message:
          "Extended document properties parts must carry a structured extended properties payload.",
      },
      {
        path: "ppt/viewProps.xml",
        message: "view-properties parts must carry a structured view-properties payload.",
      },
      {
        path: "ppt/presProps.xml",
        message:
          "presentation-properties parts must carry a structured presentation-properties payload.",
      },
    ] as const;

    supportParts.forEach(({ path, message }) => {
      const part = projection.parts.find((candidate) => candidate.path === path);
      expect(part).toBeDefined();
      expect(() =>
        emitPartBytes(
          { ...part!, payload: { kind: "malformed-support-payload" } } as PptxPackagePart,
          projection,
          { slideBytes: () => new Uint8Array() },
        ),
      ).toThrow(message);
    });

    const corePropertiesPart = projection.parts.find(
      (candidate) => candidate.path === "docProps/core.xml",
    );
    expect(corePropertiesPart).toBeDefined();
    expect(() =>
      emitPartBytes(
        {
          ...corePropertiesPart!,
          payload: {
            ...coreDocumentPropertiesPayload(corePropertiesPart),
            meta: undefined as never,
          } as PptxPackagePart["payload"],
        },
        projection,
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow("Core document properties parts must carry projected core metadata.");
  });

  test("presentation XML emitter does not recover a missing support payload from projection globals", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Presentation support part" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Presentation</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = projection.parts.find((part) => part.path === "ppt/presentation.xml");
    expect(presentationPart).toBeDefined();

    expect(() =>
      emitPartBytes({ ...presentationPart!, payload: undefined }, projection, {
        slideBytes: () => new Uint8Array(),
      }),
    ).toThrow("Presentation support parts must carry a structured presentation payload.");
  });

  test("presentation XML emitter rejects missing projected size values", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Presentation size validation" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Size</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = projection.parts.find((part) => part.path === "ppt/presentation.xml");
    expect(presentationPart).toBeDefined();

    const payload = presentationPart!.payload as Extract<
      PptxSupportPartPayload,
      { readonly kind: "presentation" }
    >;

    expect(() =>
      emitPartBytes(
        {
          ...presentationPart!,
          payload: { ...payload, size: { ...payload.size, widthEmu: undefined } },
        } as PptxPackagePart,
        projection,
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow("PPTX support XML requires finite presentation.size.widthEmu.");
  });

  test("output serializes document properties from structured support payloads", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      meta: { title: "Initial title", subject: "Initial subject", author: "Initial author" },
    });

    deck.slide({ name: "Doc props 1" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>One</p>
    ));
    deck.slide({ name: "Doc props 2" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Two</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        meta: {
          title: "Ignored top-level title",
          subject: "Ignored top-level subject",
          author: "Ignored top-level author",
        },
        parts: projection.parts.map((part) => {
          if (part.path === "docProps/core.xml") {
            return {
              ...part,
              payload: {
                kind: "document-properties",
                propertyKind: "core",
                editable: true,
                source: "deckjsx-meta",
                meta: {
                  title: "Payload title",
                  subject: "Payload subject",
                  author: "Payload author",
                },
              } satisfies PptxSupportPartPayload,
            };
          }

          if (part.path === "docProps/app.xml") {
            return {
              ...part,
              payload: {
                kind: "document-properties",
                propertyKind: "extended",
                editable: true,
                source: "deckjsx-projection",
                application: "deckjsx",
                slideCount: 2,
              } satisfies PptxSupportPartPayload,
            };
          }

          return part;
        }),
      }),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const coreXml = zipEntry(zip, "docProps/core.xml");
    const appXml = zipEntry(zip, "docProps/app.xml");

    expect(coreXml).toContain("<dc:title>Payload title</dc:title>");
    expect(coreXml).toContain("<dc:subject>Payload subject</dc:subject>");
    expect(coreXml).toContain("<dc:creator>Payload author</dc:creator>");
    expect(coreXml).not.toContain("Ignored top-level title");
    expect(appXml).toContain("<Application>deckjsx</Application>");
    expect(appXml).toContain("<Slides>2</Slides>");
  });

  test("output serializes presentation XML from structured support payload", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Presentation payload 1" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>One</p>
    ));
    deck.slide({ name: "Presentation payload 2" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Two</p>
    ));

    const projection = (await deck.project()).projection!;
    const secondSlide = {
      ...projection.slides[1]!,
      payload: { ...projection.slides[1]!.payload, slideId: "333" },
    } satisfies PptxSlidePart;

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === secondSlide.id ? secondSlide : slide,
        ),
        size: { widthEmu: 111111, heightEmu: 222222 },
        parts: projection.parts.map((part) => {
          if (part.id === secondSlide.id) {
            return secondSlide;
          }

          if (part.kind === "presentation") {
            return {
              ...part,
              payload: {
                kind: "presentation",
                size: { widthEmu: 333333, heightEmu: 444444 },
                slideMasterIds: (
                  part.payload as Extract<PptxSupportPartPayload, { readonly kind: "presentation" }>
                ).slideMasterIds,
                defaultTextStyle: (
                  part.payload as Extract<PptxSupportPartPayload, { readonly kind: "presentation" }>
                ).defaultTextStyle,
                slidePartIds: [secondSlide.id],
              } satisfies PptxSupportPartPayload,
            };
          }

          if (part.path === "docProps/app.xml") {
            return {
              ...part,
              payload: {
                ...extendedDocumentPropertiesPayload(part),
                slideCount: 1,
              } satisfies PptxSupportPartPayload,
            };
          }

          return part;
        }),
      }),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const presentationXml = zipEntry(zip, "ppt/presentation.xml");

    expect(presentationXml).toContain('<p:sldId id="333"');
    expect(presentationXml).not.toContain('<p:sldId id="256"');
    expect(presentationXml).not.toContain('<p:sldId id="257"');
    expect(presentationXml).toContain('cx="333333"');
    expect(presentationXml).toContain('cy="444444"');
    expect(presentationXml).not.toContain('cx="111111"');
    expect(presentationXml).not.toContain('cy="222222"');
    expect(presentationXml).toContain("<p:defaultTextStyle>");
    expect(presentationXml).not.toContain('lang="ja-JP"');
  });

  test("output serializes empty support property payload roots", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Support property payload" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Support properties</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.kind === "view-properties") {
            return {
              ...part,
              payload: {
                kind: "view-properties",
                editable: true,
                settings: {},
              } satisfies PptxSupportPartPayload,
            };
          }

          if (part.kind === "presentation-properties") {
            return {
              ...part,
              payload: {
                kind: "presentation-properties",
                editable: true,
                settings: {},
              } satisfies PptxSupportPartPayload,
            };
          }

          return part;
        }),
      }),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const viewPropsXml = zipEntry(zip, "ppt/viewProps.xml");
    const presPropsXml = zipEntry(zip, "ppt/presProps.xml");

    expect(viewPropsXml).toContain("<p:viewPr");
    expect(viewPropsXml).toContain(
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
    );
    expect(presPropsXml).toContain("<p:presentationPr");
    expect(presPropsXml).not.toContain("<p:viewPr");
  });

  test("output emits template-derived slide layout topology", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      templates: {
        report: {
          areas: {
            title: { kind: "title", frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } },
            body: { frame: { x: 0.7, y: 1.6, width: 8, height: 3.5 } },
          },
        },
      },
    });

    deck.slide({ name: "Template topology", template: "report" }, ({ template }) => (
      <>
        <h1 area={template.title}>Quarterly Review</h1>
        <section area={template.body}>
          <p style={{ width: "100%", height: 0.5 }}>Performance highlights</p>
        </section>
      </>
    ));

    const project = await deck.project();
    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const templateLayout = project.projection?.parts.find(
      (part) =>
        part.kind === "slide-layout" &&
        (part.payload as { template?: { name?: string } } | undefined)?.template?.name === "report",
    );
    const contentTypesXml = zipEntry(zip, "[Content_Types].xml");
    const masterXml = zipEntry(zip, "ppt/slideMasters/slideMaster1.xml");
    const masterRelsXml = zipEntry(zip, "ppt/slideMasters/_rels/slideMaster1.xml.rels");
    const slideRelsXml = zipEntry(zip, "ppt/slides/_rels/slide1.xml.rels");
    const templateLayoutXml = zipEntry(zip, templateLayout?.path ?? "");
    const templateLayoutRelsPath = templateLayout?.path.replace(
      "ppt/slideLayouts/",
      "ppt/slideLayouts/_rels/",
    );
    const templateLayoutRelsXml = zipEntry(
      zip,
      templateLayoutRelsPath ? `${templateLayoutRelsPath}.rels` : "",
    );

    expect(project.ok).toBe(true);
    expect(render.ok).toBe(true);
    expect(templateLayout).toMatchObject({
      path: "ppt/slideLayouts/slideLayout2.xml",
      payload: expect.objectContaining({
        name: "report",
        layoutAnchors: expect.arrayContaining([
          expect.objectContaining({ area: "title", kind: "title" }),
          expect.objectContaining({ area: "body", kind: "generic" }),
        ]),
      }),
    });

    expect(packagePaths(zip)).toEqual(
      expect.arrayContaining([
        "ppt/slideLayouts/slideLayout1.xml",
        "ppt/slideLayouts/slideLayout2.xml",
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
        "ppt/slideLayouts/_rels/slideLayout2.xml.rels",
      ]),
    );
    expect(contentTypesXml).toContain(
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    );
    expect(contentTypesXml).toContain(
      '<Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    );
    expect(masterXml).toContain('<p:sldLayoutId id="2147483649" r:id="rId1"/>');
    expect(masterXml).toContain('<p:sldLayoutId id="2147483650" r:id="rId2"/>');
    expect(masterRelsXml).toContain('Target="../slideLayouts/slideLayout1.xml"');
    expect(masterRelsXml).toContain('Target="../slideLayouts/slideLayout2.xml"');
    expect(slideRelsXml).toContain('Target="../slideLayouts/slideLayout2.xml"');
    expect(slideRelsXml).not.toContain('Target="../slideLayouts/slideLayout1.xml"');
    expect(templateLayoutRelsXml).toContain('Target="../slideMasters/slideMaster1.xml"');
    expect(templateLayoutXml).toContain(
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">',
    );
    expect(templateLayoutXml).toContain('<p:cSld name="report">');
  });

  test("support XML consumes projected ids instead of inventing support ids", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Relationship ids" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const remapRelationship = (relationship: PptxRelationship): PptxRelationship => {
      if (relationship.type === "slideMaster") {
        return { ...relationship, id: "rIdModelMaster" as PptxRelationship["id"] };
      }
      if (relationship.type === "slide") {
        return { ...relationship, id: "rIdModelSlide" as PptxRelationship["id"] };
      }
      if (relationship.type === "slideLayout") {
        return { ...relationship, id: "rIdModelLayout" as PptxRelationship["id"] };
      }
      return relationship;
    };
    const remapPartRelationships = <T extends PptxPackagePart>(part: T): T => {
      if (!part.relationships) {
        return part;
      }
      return { ...part, relationships: part.relationships.map(remapRelationship) };
    };

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) => remapPartRelationships(slide) as PptxSlidePart),
        parts: projection.parts.map((part) => {
          const partWithRelationships = remapPartRelationships(part);
          if (partWithRelationships.kind === "presentation") {
            return {
              ...partWithRelationships,
              payload: {
                ...(partWithRelationships.payload as Extract<
                  PptxSupportPartPayload,
                  { readonly kind: "presentation" }
                >),
                slideMasterIds: [
                  {
                    slideMasterPartId: projection.parts.find(
                      (candidate) => candidate.kind === "slide-master",
                    )!.id,
                    id: "2147483700",
                  },
                ],
              } satisfies PptxSupportPartPayload,
            };
          }

          if (partWithRelationships.kind === "slide-master") {
            return {
              ...partWithRelationships,
              payload: {
                ...(partWithRelationships.payload as PptxSlideMasterPartPayload),
                slideLayoutIds: (
                  partWithRelationships.payload as PptxSlideMasterPartPayload
                ).slideLayoutIds.map((slideLayoutId) => ({ ...slideLayoutId, id: "2147483701" })),
              } satisfies PptxSupportPartPayload,
            };
          }

          if (partWithRelationships.kind !== "relationships") {
            return partWithRelationships;
          }

          const relationships = relationshipsFor(partWithRelationships).map(remapRelationship);
          return {
            ...partWithRelationships,
            relationships,
            payload: { relationships } satisfies PptxRelationshipsPayload,
          };
        }),
      }),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const presentationXml = zipEntry(zip, "ppt/presentation.xml");
    const presentationRelsXml = zipEntry(zip, "ppt/_rels/presentation.xml.rels");
    const masterXml = zipEntry(zip, "ppt/slideMasters/slideMaster1.xml");
    const masterRelsXml = zipEntry(zip, "ppt/slideMasters/_rels/slideMaster1.xml.rels");

    expect(presentationXml).toContain('<p:sldMasterId id="2147483700" r:id="rIdModelMaster"/>');
    expect(presentationXml).toContain('<p:sldId id="256" r:id="rIdModelSlide"/>');
    expect(presentationRelsXml).toContain('Id="rIdModelMaster"');
    expect(presentationRelsXml).toContain('Id="rIdModelSlide"');
    expect(masterXml).toContain('<p:sldLayoutId id="2147483701" r:id="rIdModelLayout"/>');
    expect(masterRelsXml).toContain('Id="rIdModelLayout"');
  });

  test("support XML emitters reject missing projected relationship ids", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Missing relationship ids" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = projection.parts.find((part) => part.path === "ppt/presentation.xml");
    const slideMasterPart = projection.parts.find(
      (part) => part.path === "ppt/slideMasters/slideMaster1.xml",
    );
    const withoutOwnerRelationships = (
      ownerPath: string,
      predicate: (relationship: PptxRelationship) => boolean,
    ): PptxPackageModel => ({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind !== "relationships" || relationshipOwnerPath(part.path) !== ownerPath) {
          return part;
        }

        const relationships = relationshipsFor(part).filter(
          (relationship) => !predicate(relationship),
        );
        return {
          ...part,
          relationships,
          payload: { relationships } satisfies PptxRelationshipsPayload,
        };
      }),
    });

    expect(presentationPart).toBeDefined();
    expect(slideMasterPart).toBeDefined();

    expect(() =>
      emitPartBytes(
        presentationPart!,
        withoutOwnerRelationships(
          "ppt/presentation.xml",
          (relationship) => relationship.type === "slideMaster",
        ),
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow(
      "Presentation support XML must reference projected relationship id for pptx:support:slide-master-default from ppt/presentation.xml.",
    );

    expect(() =>
      emitPartBytes(
        {
          ...presentationPart!,
          payload: {
            ...(presentationPart!.payload as Extract<
              PptxSupportPartPayload,
              { readonly kind: "presentation" }
            >),
            slideMasterIds: [{ slideMasterPartId: slideMasterPart!.id, id: "1" }],
          } satisfies PptxSupportPartPayload,
        },
        projection,
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow("Presentation support XML requires projected numeric slideMasterIds.0.id.");

    expect(() =>
      emitPartBytes(
        presentationPart!,
        withoutOwnerRelationships(
          "ppt/presentation.xml",
          (relationship) => relationship.type === "slide",
        ),
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow(
      `Presentation support XML must reference projected relationship id for ${projection.slides[0]?.id} from ppt/presentation.xml.`,
    );

    expect(() =>
      emitPartBytes(
        slideMasterPart!,
        withoutOwnerRelationships(
          "ppt/slideMasters/slideMaster1.xml",
          (relationship) => relationship.type === "slideLayout",
        ),
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow(
      "Slide master support XML must reference projected relationship id for pptx:support:slide-layout-default from ppt/slideMasters/slideMaster1.xml.",
    );

    expect(() =>
      emitPartBytes(
        {
          ...slideMasterPart!,
          payload: {
            ...(slideMasterPart!.payload as PptxSlideMasterPartPayload),
            slideLayoutIds: (
              slideMasterPart!.payload as PptxSlideMasterPartPayload
            ).slideLayoutIds.map((slideLayoutId) => ({ ...slideLayoutId, id: "1" })),
          } satisfies PptxSupportPartPayload,
        },
        projection,
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow("Slide master support XML requires projected numeric slideLayoutIds.0.id.");
  });

  test("support XML emitters reject missing projected owner paths", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Missing owner paths" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Owner paths</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = projection.parts.find((part) => part.path === "ppt/presentation.xml");
    const slideMasterPart = projection.parts.find(
      (part) => part.path === "ppt/slideMasters/slideMaster1.xml",
    );

    expect(presentationPart).toBeDefined();
    expect(slideMasterPart).toBeDefined();

    expect(() =>
      emitPartBytes({ ...presentationPart!, path: undefined as never }, projection, {
        slideBytes: () => new Uint8Array(),
      }),
    ).toThrow("Presentation support XML requires projected package part path.");

    expect(() =>
      emitPartBytes({ ...slideMasterPart!, path: "" } as PptxPackagePart, projection, {
        slideBytes: () => new Uint8Array(),
      }),
    ).toThrow("Slide master support XML requires projected package part path.");
  });

  test("slide XML emitter rejects missing image and hyperlink relationship ids", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Slide relationship validation" }, () => (
      <>
        <img
          data={SAMPLE_SVG_DATA_URI}
          style={{ x: 1, y: 1, width: 1, height: 1, href: "https://example.test/image" }}
        />
        <p style={{ x: 3, y: 1, width: 2, height: 0.5, href: "https://example.test/text" }}>Link</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const imageElement = slide.payload.drawing.children.find((element) => element.kind === "image");
    const textElement = slide.payload.drawing.children.find((element) => element.kind === "text");
    const withSlide = (nextSlide: PptxSlidePart): PptxPackageModel => ({
      ...projection,
      slides: projection.slides.map((candidate) =>
        candidate.id === nextSlide.id ? nextSlide : candidate,
      ),
      parts: projection.parts.map((part) => (part.id === nextSlide.id ? nextSlide : part)),
    });

    expect(imageElement?.kind).toBe("image");
    expect(textElement?.kind).toBe("text");

    const missingImageRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? { ...element, serialized: { ...element.serialized, relationshipId: undefined } }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() => slideBytes(missingImageRelationship, withSlide(missingImageRelationship))).toThrow(
      ` drawing element ${imageElement?.id} must reference projected image relationship id.`,
    );

    const missingImageObjectPosition = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) => {
            if (element.kind !== "image") {
              return element;
            }
            const { objectPosition: _objectPosition, ...rest } = element;
            return rest;
          }),
        },
      },
    } as PptxSlidePart;

    expect(() =>
      slideBytes(missingImageObjectPosition, withSlide(missingImageObjectPosition)),
    ).toThrow(" requires projected image objectPosition.");

    const malformedImageCrop = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? { ...element, crop: { top: -0.1, right: 0, bottom: 0, left: 0 } }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() => slideBytes(malformedImageCrop, withSlide(malformedImageCrop))).toThrow(
      "PPTX picture XML requires image crop.top between 0 and 1.",
    );

    const overcropped = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? { ...element, crop: { top: 0, right: 0.7, bottom: 0, left: 0.4 } }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() => slideBytes(overcropped, withSlide(overcropped))).toThrow(
      "PPTX picture XML requires image crop to leave positive source width.",
    );

    const missingImageHyperlinkRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? {
                  ...element,
                  serialized: { ...element.serialized, hyperlinkRelationshipId: undefined },
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() =>
      slideBytes(missingImageHyperlinkRelationship, withSlide(missingImageHyperlinkRelationship)),
    ).toThrow(
      ` drawing element ${imageElement?.id} must reference projected hyperlink relationship id.`,
    );

    const missingTextHyperlinkRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "text"
              ? {
                  ...element,
                  serialized: { ...element.serialized, hyperlinkRelationshipId: undefined },
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() =>
      slideBytes(missingTextHyperlinkRelationship, withSlide(missingTextHyperlinkRelationship)),
    ).toThrow(
      `text drawing element ${textElement?.id} must reference projected hyperlink relationship id.`,
    );

    const staleImageRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? { ...element, serialized: { ...element.serialized, relationshipId: "rIdStale" } }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() => slideBytes(staleImageRelationship, withSlide(staleImageRelationship))).toThrow(
      ` drawing element ${imageElement?.id} must reference existing projected image relationship rIdStale.`,
    );

    const staleImageHyperlinkRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "image"
              ? {
                  ...element,
                  serialized: {
                    ...element.serialized,
                    hyperlinkRelationshipId: "rIdStaleImageLink",
                  },
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() =>
      slideBytes(staleImageHyperlinkRelationship, withSlide(staleImageHyperlinkRelationship)),
    ).toThrow(
      ` drawing element ${imageElement?.id} must reference existing projected hyperlink relationship rIdStaleImageLink.`,
    );

    const staleTextHyperlinkRelationship = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "text"
              ? {
                  ...element,
                  serialized: {
                    ...element.serialized,
                    hyperlinkRelationshipId: "rIdStaleTextLink",
                  },
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() =>
      slideBytes(staleTextHyperlinkRelationship, withSlide(staleTextHyperlinkRelationship)),
    ).toThrow(
      `text drawing element ${textElement?.id} must reference existing projected hyperlink relationship rIdStaleTextLink.`,
    );
  });

  test("slide XML emitter rejects missing background image relationship ids", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background relationship validation" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 2,
          height: 1,
          background: `url("${SAMPLE_SVG_DATA_URI}")`,
          backgroundRepeat: "no-repeat",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const missingBackgroundRelationship = {
      ...slide,
      relationships: slide.relationships?.filter((relationship) => relationship.type !== "image"),
    } satisfies PptxSlidePart;
    const nextProjection = {
      ...projection,
      slides: projection.slides.map((candidate) =>
        candidate.id === slide.id ? missingBackgroundRelationship : candidate,
      ),
      parts: projection.parts.map((part) =>
        part.id === slide.id ? missingBackgroundRelationship : part,
      ),
    } satisfies PptxPackageModel;

    expect(() => slideBytes(missingBackgroundRelationship, nextProjection)).toThrow(
      /Background image layer .* must reference projected image relationship id\./,
    );

    const missingBackgroundImageSerialized = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  backgroundLayers: element.backgroundLayers?.map((layer) =>
                    layer.kind === "background-image" ? { ...layer, serialized: undefined } : layer,
                  ),
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() => slideBytes(missingBackgroundImageSerialized, projection)).toThrow(
      "Background image layer must carry a projected shape object id.",
    );

    const missingBackgroundImageObjectPosition = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  backgroundLayers: element.backgroundLayers?.map((layer) => {
                    if (layer.kind !== "background-image") {
                      return layer;
                    }
                    const { objectPosition: _objectPosition, ...rest } = layer;
                    return rest;
                  }),
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() => slideBytes(missingBackgroundImageObjectPosition, projection)).toThrow(
      "Background image requires projected image objectPosition.",
    );
  });

  test("slide XML emitter requires projected frames for non-image background layers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background layer frame validation" }, () => (
      <div style={{ x: 1, y: 1, width: 2, height: 1, backgroundColor: "#2563EB" }} />
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const missingBackgroundLayerFrame = {
      ...slide,
      payload: {
        ...slide.payload,
        backgroundLayers: [malformedBackgroundLayer({ kind: "solid", color: "111111" })],
      },
    } as PptxSlidePart;

    expect(() => slideBytes(missingBackgroundLayerFrame, projection)).toThrow(
      "Background layer 5000 is missing projected frame",
    );

    const missingBackgroundLayerSerialized = {
      ...slide,
      payload: {
        ...slide.payload,
        backgroundLayers: [
          malformedBackgroundLayer({
            kind: "solid",
            color: "111111",
            frame: { xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
          }),
        ],
      },
    } as PptxSlidePart;

    expect(() => slideBytes(missingBackgroundLayerSerialized, projection)).toThrow(
      "Background layer 5000 must carry a projected shape object id",
    );
  });

  test("slide XML emitter requires projected generated stroke layers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Generated stroke validation" }, () => (
      <div style={{ x: 1, y: 1, width: 2, height: 1, borderTop: "1pt solid #111111" }} />
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const sourceElement = slide.payload.drawing.children[0];
    const missingGeneratedStrokeLayers = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "group" ? { ...element, generatedStrokes: undefined } : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() => slideBytes(missingGeneratedStrokeLayers, projection)).toThrow(
      `Drawing element ${sourceElement?.id} is missing projected generated stroke layers`,
    );
  });

  test("slide XML emitter requires projected generated stroke shape geometry", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Generated stroke geometry validation" }, () => (
      <div style={{ x: 1, y: 1, width: 2, height: 1, borderTop: "1pt solid #111111" }} />
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const sourceElement = slide.payload.drawing.children[0];
    if (sourceElement?.kind !== "group" || !sourceElement.generatedStrokes?.[0]) {
      throw new Error("Expected generated stroke layer fixture");
    }

    const malformedGeneratedStroke = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "group"
              ? {
                  ...element,
                  generatedStrokes: element.generatedStrokes?.map((layer, index) =>
                    index === 0 ? { ...layer, shape: "curve" as never } : layer,
                  ),
                }
              : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() => slideBytes(malformedGeneratedStroke, projection)).toThrow(
      `Generated stroke layer ${sourceElement.generatedStrokes[0].id} is missing projected shape geometry`,
    );
  });

  test("slide XML emitter requires projected shape geometry", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " geometry validation" }, () => (
      <shape
        shape="ellipse"
        style={{ x: 1, y: 1, width: 2, height: 1, backgroundColor: "#111111" }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slide = projection.slides[0]!;
    const sourceElement = slide.payload.drawing.children[0];
    if (sourceElement?.kind !== "shape") {
      throw new Error("Expected shape element fixture");
    }

    const malformedShapeGeometry = {
      ...slide,
      payload: {
        ...slide.payload,
        drawing: {
          ...slide.payload.drawing,
          children: slide.payload.drawing.children.map((element) =>
            element.kind === "shape" ? { ...element, shape: "triangle" as never } : element,
          ),
        },
      },
    } as PptxSlidePart;

    expect(() => slideBytes(malformedShapeGeometry, projection)).toThrow(
      ` element ${sourceElement.id} is missing projected shape geometry`,
    );
  });

  test("picture XML emitter requires projected media dimensions for fit calculations", async () => {
    const withoutMediaDimensions = (projection: PptxPackageModel): PptxPackageModel => ({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind !== "media") {
          return part;
        }

        const payload = part.payload as PptxMediaPartPayload;
        const { widthPx: _widthPx, heightPx: _heightPx, ...metadata } = payload.metadata ?? {};
        return {
          ...part,
          payload: {
            ...payload,
            ...(Object.keys(metadata).length > 0 ? { metadata } : { metadata: undefined }),
          },
        };
      }),
    });
    const withoutMediaSources = (projection: PptxPackageModel): PptxPackageModel => ({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind !== "media") {
          return part;
        }

        const payload = part.payload as PptxMediaPartPayload;
        const { sources: _sources, ...payloadWithoutSources } = payload;
        return { ...part, payload: payloadWithoutSources as PptxMediaPartPayload };
      }),
    });

    const imageDeck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    imageDeck.slide({ name: " metadata required" }, () => (
      <img
        data={WIDE_SVG_DATA_URI}
        style={{ x: 1, y: 1, width: 2, height: 2, objectFit: "contain" }}
      />
    ));

    const imageProjection = (await imageDeck.project()).projection!;
    expect(() =>
      slideBytes(imageProjection.slides[0]!, withoutMediaDimensions(imageProjection)),
    ).toThrow(" contain fit requires projected media metadata widthPx and heightPx.");
    expect(() =>
      slideBytes(imageProjection.slides[0]!, withoutMediaSources(imageProjection)),
    ).toThrow("Media package parts must carry structured media payload sources.");

    const backgroundDeck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    backgroundDeck.slide({ name: "Background metadata required" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 4,
          height: 2,
          background: `url("${WIDE_SVG_DATA_URI}")`,
          backgroundSize: "auto auto",
        }}
      />
    ));

    const backgroundProjection = (await backgroundDeck.project()).projection!;
    expect(() =>
      slideBytes(backgroundProjection.slides[0]!, withoutMediaDimensions(backgroundProjection)),
    ).toThrow(
      "Background image size calculation requires projected media metadata widthPx and heightPx.",
    );
  });

  test("build and assembly helpers require projected package metadata", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Build metadata validation" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Metadata</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide");
    expect(slidePart).toBeDefined();

    expect(() =>
      buildArtifactForPart({
        part: { ...slidePart!, orderKey: undefined } as PptxPackagePart,
        bytes: new Uint8Array([1, 2, 3]),
        reason: "missingArtifact",
      }),
    ).toThrow(`Package part ${slidePart?.id} must carry a deterministic order key.`);

    expect(() =>
      buildArtifactForPart({
        part: { ...slidePart!, fingerprint: undefined } as PptxPackagePart,
        bytes: new Uint8Array([1, 2, 3]),
        reason: "missingArtifact",
      }),
    ).toThrow(`Package part ${slidePart?.id} must carry a projected package part fingerprint.`);

    expect(() =>
      expectedAssemblyEntryForPart({ ...slidePart!, requirement: undefined } as PptxPackagePart),
    ).toThrow(`Package part ${slidePart?.id} must carry projected requirement metadata.`);
  });

  test("output package topology matches projected package parts and relationships", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Topology 1" }, () => (
      <>
        <p style={{ x: 0.7, y: 0.6, width: 3, height: 0.5, href: "https://example.com/docs" }}>
          Docs
        </p>
        <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1.4, width: 1, height: 1 }} />
        <img data={SAMPLE_SVG_DATA_URI} style={{ x: 2.3, y: 1.4, width: 1, height: 1 }} />
      </>
    ));
    deck.slide({ name: "Topology 2" }, () => (
      <shape
        shape="rect"
        style={{ x: 1, y: 1, width: 2, height: 1, fill: "#2563EB", stroke: "#F97316" }}
      />
    ));

    const project = await deck.project();
    const projection = project.projection!;
    const render = await deck.render();
    const zip = unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const contentTypes = projection.parts.find((part) => part.kind === "content-types")?.payload as
      | PptxContentTypesPayload
      | undefined;
    const contentTypesXml = zipEntry(zip, "[Content_Types].xml");
    const assemblyEntries = render.summary?.assembly?.entries ?? [];
    const emittedEntries = assemblyEntries.filter(
      (entry) => entry.final.status === "rebuilt" || entry.final.status === "reused",
    );
    const partsByPath = new Map(projection.parts.map((part) => [part.path, part]));

    expect(project.ok).toBe(true);
    expect(render.ok).toBe(true);
    expect(packagePaths(zip)).toEqual(
      [...emittedEntries.map((entry) => entry.path), "ppt/deckjsx/patch-manifest.json"].sort(
        (left, right) => left.localeCompare(right),
      ),
    );
    expect(zip["ppt/deckjsx/patch-manifest.json"]).toBeDefined();
    expect(emittedEntries).toHaveLength(projection.parts.length);

    for (const entry of emittedEntries) {
      const part = partsByPath.get(entry.path);

      expect(part).toBeDefined();
      expect(zip[entry.path]).toBeDefined();
      expect(entry.expected).toMatchObject({
        path: part?.path,
        packagePartId: part?.id,
        orderKey: part?.orderKey?.value,
        requirement: part?.requirement?.status,
        required: part?.requirement?.required,
      });
      expect(entry.final.status).toBe("rebuilt");
      expect(entry.final.byteLength).toBe(zip[entry.path]?.byteLength);
    }

    for (const item of contentTypes?.defaults ?? []) {
      expect(contentTypesXml).toContain(
        `<Default Extension="${item.extension}" ContentType="${item.contentType}"/>`,
      );
    }

    for (const item of contentTypes?.overrides ?? []) {
      expect(contentTypesXml).toContain(
        `<Override PartName="${item.partName}" ContentType="${item.contentType}"/>`,
      );
    }

    for (const part of projection.parts.filter((item) => item.kind === "relationships")) {
      const relsXml = zipEntry(zip, part.path);

      expect(relsXml).toBeDefined();
      for (const relationship of relationshipsFor(part)) {
        expect(relsXml).toContain(`Id="${relationship.id}"`);
        expect(relsXml).toContain(`Target="${relationship.target}"`);
        if (relationship.targetMode === "external") {
          expect(relsXml).toContain('TargetMode="External"');
        }
      }
    }

    const mediaParts = projection.parts.filter((part) => part.kind === "media");
    const slide1Rels = projection.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    );
    const imageRelationships = relationshipsFor(slide1Rels!).filter(
      (relationship) => relationship.type === "image",
    );
    const hyperlinkRelationships = relationshipsFor(slide1Rels!).filter(
      (relationship) => relationship.type === "hyperlink",
    );
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");
    const repeatedImageEmbedCount =
      slideXml?.match(new RegExp(`r:embed="${imageRelationships[0]?.id}"`, "g"))?.length ?? 0;

    expect(mediaParts).toHaveLength(1);
    expect(zip[mediaParts[0]!.path]).toBeDefined();
    expect(imageRelationships).toHaveLength(1);
    expect(hyperlinkRelationships).toHaveLength(1);
    expect(repeatedImageEmbedCount).toBe(2);
  });

  test("output serializes structured manifest payloads from a defined projection", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Manifest payloads" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Manifest payloads</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.kind === "content-types") {
            const payload = part.payload as PptxContentTypesPayload;
            return {
              ...part,
              payload: {
                defaults: [
                  ...payload.defaults,
                  { extension: "deckjsx", contentType: "application/vnd.deckjsx.manifest-test" },
                ],
                overrides: payload.overrides,
              } satisfies PptxContentTypesPayload,
            };
          }

          if (part.path === "_rels/.rels") {
            const payload = part.payload as PptxRelationshipsPayload;
            const relationships = [
              ...payload.relationships,
              {
                id: "rIdManifestPayload" as PptxRelationship["id"],
                type: "https://deckjsx.dev/relationships/manifest-test",
                target: "https://deckjsx.dev/manifest",
                targetMode: "external",
                targetPath: "https://deckjsx.dev/manifest",
              },
            ] satisfies PptxRelationshipsPayload["relationships"];
            return {
              ...part,
              relationships,
              payload: { relationships } satisfies PptxRelationshipsPayload,
            };
          }

          return part;
        }),
      }),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const contentTypesXml = zipEntry(zip, "[Content_Types].xml");
    const rootRelsXml = zipEntry(zip, "_rels/.rels");

    expect(contentTypesXml).toContain(
      '<Default Extension="deckjsx" ContentType="application/vnd.deckjsx.manifest-test"/>',
    );
    expect(contentTypesXml).toContain(
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    );
    expect(rootRelsXml).toContain('Id="rIdManifestPayload"');
    expect(rootRelsXml).toContain('Type="https://deckjsx.dev/relationships/manifest-test"');
    expect(rootRelsXml).toContain('Target="https://deckjsx.dev/manifest"');
    expect(rootRelsXml).toContain('TargetMode="External"');
  });

  test("manifest XML emitters reject malformed content type and relationship payloads", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Manifest payload validation" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Manifest payloads</p>
    ));

    const projection = (await deck.project()).projection!;
    const manifestParts = [
      {
        kind: "content-types",
        message: "Content type package parts must carry a structured content-types payload.",
      },
      {
        kind: "relationships",
        message: "Relationship package parts must carry a structured relationships payload.",
      },
    ] as const;

    manifestParts.forEach(({ kind, message }) => {
      const part = projection.parts.find((candidate) => candidate.kind === kind);
      expect(part).toBeDefined();
      expect(() =>
        emitPartBytes(
          { ...part!, payload: { kind: "malformed-manifest-payload" } } as PptxPackagePart,
          projection,
          { slideBytes: () => new Uint8Array() },
        ),
      ).toThrow(message);
    });

    expect(() =>
      relationshipsBytes(
        [
          {
            id: "bad id" as PptxRelationship["id"],
            type: "officeDocument",
            target: "ppt/presentation.xml",
            targetPath: "ppt/presentation.xml",
            targetPartId: "pptx:presentation" as never,
          },
        ],
        "",
      ),
    ).toThrow("Relationship XML requires a valid relationship id.");

    expect(() =>
      relationshipsBytes(
        [
          {
            id: "rIdBadType" as PptxRelationship["id"],
            type: "not a relationship uri",
            target: "https://example.test/target",
            targetMode: "external",
            targetPath: "https://example.test/target",
          },
        ],
        "",
      ),
    ).toThrow("Relationship XML requires a valid relationship type.");

    expect(
      strFromU8(
        relationshipsBytes(
          [
            {
              id: "rIdProjectedTarget" as PptxRelationship["id"],
              type: "slide",
              target: "projected/target.xml",
              targetPath: "ppt/slides/slide9.xml",
              targetPartId: "pptx:slide:projected-target" as never,
            },
          ],
          "ppt/presentation.xml",
        ),
      ),
    ).toContain('Target="projected/target.xml"');
  });

  test("media writer helper rejects malformed media payload sources", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Media payload validation" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = projection.parts.find((part) => part.kind === "media");
    expect(mediaPart).toBeDefined();

    const malformedPayloads = [
      undefined,
      { kind: "malformed-media-payload" },
      { source: { kind: "file", path: "asset.png" } },
      { source: { kind: "url", url: 123 } },
      { source: { kind: "data", data: null } },
    ] as const;

    malformedPayloads.forEach((payload) => {
      expect(() => mediaPartPayload({ ...mediaPart!, payload } as PptxPackagePart)).toThrow(
        "Media package parts must carry a structured media payload source.",
      );
    });
  });

  test("output serializes media bytes from structured media payload source", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const replacement = "replacement-media-bytes";

    deck.slide({ name: "Media payload" }, () => (
      <img data={SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = projection.parts.find((part) => part.kind === "media")!;
    const mediaPayload = mediaPart.payload as PptxMediaPartPayload;
    const replacementSource = {
      kind: "data",
      data: replacement,
    } satisfies PptxMediaPartPayload["source"];

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === mediaPart.id
            ? {
                ...part,
                payload: {
                  ...mediaPayload,
                  source: replacementSource,
                  sources: [mediaPayload.source, replacementSource],
                } satisfies PptxMediaPartPayload,
              }
            : part,
        ),
      }),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);

    expect(strFromU8(zip[mediaPart.path]!)).toBe(replacement);
  });

  test("output serializes structured theme payload from a defined projection", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Theme payload" }, () => <></>);
    const projection = (await deck.project()).projection!;
    const themePart = projection.parts.find((part) => part.kind === "theme");
    const themePayload = themePart?.payload as PptxThemePartPayload | undefined;

    deck.defineProjection(
      withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.kind === "theme" && themePayload
            ? {
                ...part,
                payload: {
                  ...themePayload,
                  name: "custom-deckjsx-theme",
                  colorScheme: {
                    ...themePayload.colorScheme,
                    name: "custom-colors",
                    colors: { ...themePayload.colorScheme.colors, accent1: "123456" },
                  },
                  fontScheme: {
                    name: "custom-fonts",
                    majorLatin: "Inter Display",
                    minorLatin: "Inter",
                  },
                  formatScheme: { name: "custom-format" },
                } satisfies PptxThemePartPayload,
              }
            : part,
        ),
      }),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const themeXml = zipEntry(zip, "ppt/theme/theme1.xml");

    expect(themeXml).toContain('name="custom-deckjsx-theme"');
    expect(themeXml).toContain('<a:clrScheme name="custom-colors">');
    expect(themeXml).toContain('<a:accent1><a:srgbClr val="123456"/></a:accent1>');
    expect(themeXml).toContain('<a:fontScheme name="custom-fonts">');
    expect(themeXml).toContain('<a:latin typeface="Inter Display"/>');
    expect(themeXml).toContain('<a:latin typeface="Inter"/>');
    expect(themeXml).toContain('<a:fmtScheme name="custom-format">');
  });

  test("theme XML emitter rejects incomplete theme scheme payloads", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Theme payload validation" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const themePart = projection.parts.find((part) => part.kind === "theme");
    const themePayload = themePart?.payload as PptxThemePartPayload | undefined;

    expect(themePart).toBeDefined();
    expect(themePayload).toBeDefined();

    const { accent1: _accent1, ...colorsWithoutAccent1 } = themePayload!.colorScheme.colors;
    const malformedPayloads = [
      {
        payload: {
          ...themePayload!,
          colorScheme: { ...themePayload!.colorScheme, colors: colorsWithoutAccent1 },
        },
        message: "Theme support payload must include valid colorScheme.colors.accent1.",
      },
      {
        payload: {
          ...themePayload!,
          colorScheme: {
            ...themePayload!.colorScheme,
            colors: { ...themePayload!.colorScheme.colors, accent2: "#123456" },
          },
        },
        message: "Theme support payload must include valid colorScheme.colors.accent2.",
      },
      {
        payload: { ...themePayload!, fontScheme: { ...themePayload!.fontScheme, majorLatin: "" } },
        message: "Theme support payload must include fontScheme.majorLatin.",
      },
      {
        payload: { ...themePayload!, formatScheme: { ...themePayload!.formatScheme, name: "" } },
        message: "Theme support payload must include formatScheme.name.",
      },
    ] as const;

    malformedPayloads.forEach(({ payload, message }) => {
      expect(() =>
        emitPartBytes({ ...themePart!, payload } as PptxPackagePart, projection, {
          slideBytes: () => new Uint8Array(),
        }),
      ).toThrow(message);
    });
  });

  test("output follows theme projection reference serialization choices", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      theme: new Theme({ defaults: { p: { color: "#2563EB", fontFamily: "Aptos" } } }),
    });

    deck.slide({ name: "Theme reference serialization" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Theme reference</p>
    ));

    const project = await deck.project();
    const themePayload = project.projection?.parts.find((part) => part.kind === "theme")
      ?.payload as PptxThemePartPayload | undefined;

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(project.ok).toBe(true);
    expect(themePayload?.projection.trace.referenceSerialization).toContainEqual(
      expect.objectContaining({
        property: "color",
        currentSerialization: "srgbClr",
        decision: "deferThemeReferenceSerialization",
        candidate: expect.objectContaining({ kind: "schemeColor", value: "accent1" }),
      }),
    );
    expect(slideXml).toContain('<a:srgbClr val="2563EB"/>');
    expect(slideXml).toContain('<a:latin typeface="Aptos"/>');
    expect(slideXml).not.toContain('<a:schemeClr val="accent1"');
  });

  test("output emits shadow markup through the direct pptx writer", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Shadow output" }, () => (
      <>
        <p
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.75,
            textShadow: "4px 4px 8px rgba(37, 99, 235, 0.5)",
          }}
        >
          Shadow text
        </p>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 2,
            width: 2,
            height: 1,
            fill: "#F97316",
            boxShadow: "6px 6px 10px rgba(15, 23, 42, 0.35)",
          }}
        />
        <img
          data={SAMPLE_SVG_DATA_URI}
          style={{ x: 4, y: 1, width: 1.5, height: 1.5, boxShadow: "3px 3px 6px rebeccapurple" }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain("<a:outerShdw");
    expect(slideXml?.match(/<a:outerShdw/g)?.length).toBeGreaterThanOrEqual(3);
    expect(slideXml).toContain('val="2563EB"');
    expect(slideXml).toContain('val="0F172A"');
    expect(slideXml).toContain('val="663399"');
  });

  test("output emits shape strokeDasharray markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " stroke dasharray output" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "dodgerblue",
            strokeWidth: "3pt",
            strokeDasharray: "1 4",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:prstDash val="sysDot"/>');
    expect(slideXml).toContain('<a:srgbClr val="1E90FF"/>');
  });

  test("output emits shape stroke shorthand dash markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " stroke shorthand dash output" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "1pt dashed #2563EB",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:ln w="12700">');
    expect(slideXml).toContain('<a:srgbClr val="2563EB"/>');
    expect(slideXml).toContain('<a:prstDash val="dash"/>');
  });

  test("output emits shape stroke shorthand dotted markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " stroke shorthand dotted output" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "1pt dotted #2563EB",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:ln w="12700">');
    expect(slideXml).toContain('<a:srgbClr val="2563EB"/>');
    expect(slideXml).toContain('<a:prstDash val="sysDot"/>');
  });

  test("output emits strokeLinecap and strokeLinejoin markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " stroke cap and join output" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 1.5,
            height: 0.75,
            fill: "#F97316",
            stroke: "dodgerblue",
            strokeWidth: "3pt",
            strokeLinecap: "square",
            strokeLinejoin: "bevel",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('cap="sq"');
    expect(slideXml).toContain("<a:bevel/>");
  });

  test("output emits projected border radius as rounded rectangle geometry", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Rounded geometry output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundColor: "#F8FAFC",
            borderRadius: 0.25,
          }}
        />
        <p
          style={{
            x: 3.5,
            y: 1,
            width: 2,
            height: 1,
            backgroundColor: "#E0F2FE",
            borderRadius: 0.125,
          }}
        >
          Rounded
        </p>
        <shape
          shape="rect"
          style={{ x: 6, y: 1, width: 2, height: 1, fill: "#DCFCE7", radius: 0.375 }}
        />
        <div
          style={{
            x: 1,
            y: 2.5,
            width: 2,
            height: 1,
            backgroundColor: "#FEE2E2",
            borderRadius: "50%",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");
    const shapeBlocks: string[] = slideXml?.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
    const viewBlock = shapeBlocks.find((block) => block.includes('val="F8FAFC"'));
    const textBlock = shapeBlocks.find((block) => block.includes('val="E0F2FE"'));
    const shapeBlock = shapeBlocks.find((block) => block.includes('val="DCFCE7"'));
    const capsuleBlock = shapeBlocks.find((block) => block.includes('val="FEE2E2"'));

    expect(viewBlock).toContain('<a:prstGeom prst="roundRect">');
    expect(viewBlock).toContain('<a:gd name="adj" fmla="val 25000"/>');
    expect(textBlock).toContain('<a:prstGeom prst="roundRect">');
    expect(textBlock).toContain('<a:gd name="adj" fmla="val 12500"/>');
    expect(shapeBlock).toContain('<a:prstGeom prst="roundRect">');
    expect(shapeBlock).toContain('<a:gd name="adj" fmla="val 37500"/>');
    expect(capsuleBlock).toContain('<a:prstGeom prst="roundRect">');
    expect(capsuleBlock).toContain('<a:gd name="adj" fmla="val 50000"/>');
  });

  test("output keeps XML fill and line patches aligned when generated shapes are interleaved", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Patch order output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            outline: "2pt solid #111111",
            borderTop: "3pt solid #222222",
            border: "2pt solid #1E90FF",
            background: "linear-gradient(90deg, #EF4444 0%, #F59E0B 100%)",
            strokeLinecap: "square",
            strokeLinejoin: "bevel",
          }}
        >
          <shape
            shape="rect"
            style={{
              x: 0.5,
              y: 0.5,
              width: 1,
              height: 0.75,
              fill: "linear-gradient(180deg, #22C55E 0%, #0EA5E9 100%)",
              stroke: "#9333EA",
              strokeWidth: "2pt",
              strokeLinecap: "round",
            }}
          />
        </div>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");
    const shapeBlocks: string[] = slideXml?.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
    const backgroundLayerBlock = shapeBlocks.find(
      (block) => block.includes('val="EF4444"') && block.includes('val="F59E0B"'),
    );
    const mainShapeBlock = shapeBlocks.find(
      (block) => block.includes('val="22C55E"') && block.includes('val="0EA5E9"'),
    );
    const outlineBlock = shapeBlocks.find((block) => block.includes('val="111111"'));
    const topEdgeBlock = shapeBlocks.find((block) => block.includes('val="222222"'));
    const viewStrokeBlock = shapeBlocks.find((block) => block.includes('val="1E90FF"'));
    const blockIndex = (block: string | undefined) => (block ? shapeBlocks.indexOf(block) : -1);

    expect(slideXml).toBeDefined();
    expect(backgroundLayerBlock).toBeDefined();
    expect(mainShapeBlock).toBeDefined();
    expect(outlineBlock).toBeDefined();
    expect(topEdgeBlock).toBeDefined();
    expect(viewStrokeBlock).toBeDefined();
    expect(shapeBlocks.filter((block) => block.includes('val="EF4444"'))).toHaveLength(1);
    expect(shapeBlocks.filter((block) => block.includes('val="111111"'))).toHaveLength(1);
    expect(shapeBlocks.filter((block) => block.includes('val="222222"'))).toHaveLength(1);
    expect(backgroundLayerBlock).toContain("<a:gradFill");
    expect(backgroundLayerBlock).not.toContain('cap="sq"');
    expect(mainShapeBlock).toContain("<a:gradFill");
    expect(mainShapeBlock).toContain('cap="rnd"');
    expect(viewStrokeBlock).toContain('cap="sq"');
    expect(viewStrokeBlock).toContain("<a:bevel/>");
    expect(outlineBlock).not.toContain('val="EF4444"');
    expect(topEdgeBlock).not.toContain('val="22C55E"');
    expect(blockIndex(backgroundLayerBlock)).toBeLessThan(blockIndex(topEdgeBlock));
    expect(blockIndex(topEdgeBlock)).toBeLessThan(blockIndex(viewStrokeBlock));
    expect(blockIndex(viewStrokeBlock)).toBeLessThan(blockIndex(outlineBlock));
    expect(blockIndex(outlineBlock)).toBeLessThan(blockIndex(mainShapeBlock));
  });

  test("output preserves zIndex order, skips visibility hidden, and applies image opacity", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Visual controls" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5, zIndex: 10 }}>Front</p>
        <p style={{ x: 1, y: 1.6, width: 2, height: 0.5, zIndex: -1 }}>Back</p>
        <p style={{ x: 1, y: 2.2, width: 2, height: 0.5, zIndex: 1 }}>Middle</p>
        <p style={{ x: 1, y: 2.8, width: 2, height: 0.5, visibility: "hidden", zIndex: 100 }}>
          Hidden
        </p>
        <img
          data={SAMPLE_SVG_DATA_URI}
          style={{ x: 4, y: 1, width: 1.5, height: 1.5, opacity: 0.25 }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();

    const backIndex = slideXml!.indexOf(">Back<");
    const middleIndex = slideXml!.indexOf(">Middle<");
    const frontIndex = slideXml!.indexOf(">Front<");

    expect(backIndex).toBeGreaterThanOrEqual(0);
    expect(middleIndex).toBeGreaterThan(backIndex);
    expect(frontIndex).toBeGreaterThan(middleIndex);
    expect(slideXml).not.toContain(">Hidden<");
    expect(slideXml).toContain('<a:alphaModFix amt="25000"/>');
  });

  test("output omits fully clipped children for overflow hidden containers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Overflow hidden output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 2,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <p style={{ x: 0.5, y: 0.5, width: 4, height: 0.75, fontSize: 18 }}>Clip me</p>
          <p style={{ x: 3.5, y: 0.5, width: 1, height: 0.5, fontSize: 18 }}>Drop me</p>
        </div>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain(">Clip me<");
    expect(slideXml).not.toContain(">Drop me<");
  });

  test("output adjusts clipped image source rects for overflow hidden containers", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Overflow hidden image output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <img
            data={WIDE_SVG_DATA_URI}
            style={{ x: -0.5, y: 0.5, width: 3, height: 1, fit: "stretch" }}
          />
        </div>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:srcRect l="16667" r="16667" t="0" b="0"/>');
  });

  test("output cascades group opacity to descendant text, image, and shape nodes", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Opacity cascade" }, () => (
      <>
        <div style={{ x: 1, y: 1, width: 6, height: 3, opacity: 0.5, backgroundColor: "#E5E7EB" }}>
          <p style={{ x: 0.5, y: 0.5, width: 2, height: 0.75, color: "#FF0000" }}>Half text</p>
          <img
            data={SAMPLE_SVG_DATA_URI}
            style={{ x: 3, y: 0.5, width: 1.5, height: 1.5, opacity: 0.5 }}
          />
          <shape
            shape="rect"
            style={{ x: 0.5, y: 1.75, width: 1.5, height: 0.75, fill: "#2563EB" }}
          />
        </div>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:alpha val="50000"/>');
    expect(slideXml).toContain('<a:alphaModFix amt="25000"/>');
    expect(slideXml).toContain('<a:srgbClr val="2563EB"><a:alpha val="50000"/></a:srgbClr>');
  });

  test("output applies image fit, objectPosition, and crop controls", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " controls output" }, () => (
      <>
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            objectFit: "contain",
            objectPosition: "right bottom",
          }}
        />
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 4,
            y: 1,
            width: 1,
            height: 2,
            objectFit: "cover",
            objectPosition: "right center",
          }}
        />
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 6,
            y: 1,
            width: 2,
            height: 1,
            crop: { left: "10%", right: "20%", bottom: "40%" },
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-100000" b="0"/>');
    expect(slideXml).toContain('<a:srcRect l="75000" r="0" t="0" b="0"/>');
    expect(slideXml).toContain('<a:srcRect l="10000" r="20000" t="0" b="40000"/>');
  });

  test("output applies edge-offset and length-based objectPosition controls", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " position offsets output" }, () => (
      <>
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 1,
            y: 1,
            width: 1,
            height: 2,
            objectFit: "cover",
            objectPosition: "right 25% bottom 10%",
          }}
        />
        <img
          data={WIDE_SVG_DATA_URI}
          style={{
            x: 3,
            y: 1,
            width: 2,
            height: 2,
            objectFit: "contain",
            objectPosition: "left 25% bottom 0.25in",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:srcRect l="56250" r="18750" t="0" b="0"/>');
    expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-87500" b="-12500"/>');
  });

  test("output emits gradient fill markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Gradient output",
        style: { background: "linear-gradient(90deg, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)" },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 3,
              height: 1.5,
              background: "linear-gradient(to bottom, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
            }}
          />
          <p
            style={{
              x: 1,
              y: 3,
              width: 3,
              height: 0.75,
              fontSize: 18,
              background: "linear-gradient(180deg, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
            }}
          >
            Gradient text
          </p>
          <shape
            shape="rect"
            style={{
              x: 5,
              y: 1,
              width: 2,
              height: 2,
              fill: "linear-gradient(45deg, #EF4444 0%, #F59E0B 100%)",
            }}
          />
        </>
      ),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain("<a:gradFill");
    expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(4);
    expect(slideXml).toContain('ang="5400000"');
    expect(slideXml).toContain('ang="10800000"');
    expect(slideXml).toContain('ang="2700000"');
    expect(slideXml).toContain('val="2563EB"');
    expect(slideXml).toContain('val="F97316"');
    expect(slideXml).toContain('val="22C55E"');
    expect(slideXml).toContain('val="0EA5E9"');
    expect(slideXml).toContain('val="EF4444"');
    expect(slideXml).toContain('val="F59E0B"');
  });

  test("output emits background gradient markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Background image output",
        style: { background: "linear-gradient(90deg, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)" },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 3,
              height: 1.5,
              background: "linear-gradient(to bottom, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
            }}
          />
          <p
            style={{
              x: 1,
              y: 3,
              width: 3,
              height: 0.75,
              fontSize: 18,
              background: "linear-gradient(180deg, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
            }}
          >
            Background image text
          </p>
          <shape
            shape="rect"
            style={{
              x: 5,
              y: 1,
              width: 2,
              height: 2,
              background: "linear-gradient(45deg, #EF4444 0%, #F59E0B 100%)",
            }}
          />
        </>
      ),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain("<a:gradFill");
    expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(4);
    expect(slideXml).toContain('val="2563EB"');
    expect(slideXml).toContain('val="22C55E"');
    expect(slideXml).toContain('val="0F172A"');
    expect(slideXml).toContain('val="EF4444"');
  });

  test("output emits background image layer markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Background image layer output",
        style: {
          background: `url("${WIDE_SVG_DATA_URI}"), linear-gradient(180deg, #111111 0%, #333333 100%)`,
          backgroundSize: "contain, 100% 100%",
          backgroundPosition: "right bottom, center",
        },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 2,
              height: 2,
              background: `url("${WIDE_SVG_DATA_URI}")`,
              backgroundSize: "cover",
              backgroundPosition: "right center",
            }}
          />
        </>
      ),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<p:pic>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-12500" b="0"/>');
    expect(slideXml).toContain('<a:srcRect l="50000" r="0" t="0" b="0"/>');
    expect(slideXml).toContain('val="111111"');
    expect(slideXml).toContain('val="333333"');
  });

  test("output emits repeated background image layer markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background repeat output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-y",
          }}
        />
        <div
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 1,
            background: `url("${SAMPLE_SVG_DATA_URI}")`,
            backgroundSize: "contain",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-x",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<p:pic>/g)?.length).toBeGreaterThanOrEqual(4);
    expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
    expect(slideXml).toContain('<a:off x="914400" y="1828800"/>');
    expect(slideXml).toContain('<a:off x="3657600" y="914400"/>');
    expect(slideXml).toContain('<a:off x="4572000" y="914400"/>');
  });

  test("output emits background shorthand image layer markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Background shorthand image layer output",
        style: {
          background: `url("${WIDE_SVG_DATA_URI}") no-repeat right bottom / contain, linear-gradient(180deg, #111111 0%, #333333 100%)`,
        },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 2,
              height: 1,
              background: `url("${SAMPLE_SVG_DATA_URI}") repeat-x left top / contain`,
            }}
          />
        </>
      ),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<p:pic>/g)?.length).toBeGreaterThanOrEqual(3);
    expect(slideXml).toContain('val="111111"');
    expect(slideXml).toContain('val="333333"');
    expect(slideXml).toContain('<a:srcRect l="0" r="0" t="-12500" b="0"/>');
    expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
    expect(slideXml).toContain('<a:off x="1828800" y="914400"/>');
  });

  test("output emits explicit backgroundSize image layer markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Explicit background size output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "50% auto",
            backgroundPosition: "right bottom",
          }}
        />
        <div
          style={{
            x: 1,
            y: 3.5,
            width: 4,
            height: 1.5,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto 50%",
            backgroundPosition: "left top",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="2743200" y="1828800"/>');
    expect(slideXml).toContain('<a:ext cx="1828800" cy="914400"/>');
    expect(slideXml).toContain('<a:off x="914400" y="3200400"/>');
    expect(slideXml).toContain('<a:ext cx="1371600" cy="685800"/>');
  });

  test("output emits intrinsic auto backgroundSize image layer markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Auto background size output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "auto auto",
            backgroundPosition: "right bottom",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="3619500" y="2266950"/>');
    expect(slideXml).toContain('<a:ext cx="952500" cy="476250"/>');
  });

  test("output emits backgroundClip image layer markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background clip output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundClip: "content-box",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
    expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
    expect(slideXml).toContain(
      '<a:srcRect l="12587" r="12587" t="25174" b="25174"/><a:stretch><a:fillRect/></a:stretch>',
    );
  });

  test("output emits backgroundOrigin image layer markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background origin output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: `url("${WIDE_SVG_DATA_URI}")`,
            backgroundSize: "100% 100%",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
    expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
    expect(slideXml).toContain(
      '<a:srcRect l="12522" r="12522" t="25087" b="25087"/><a:stretch><a:fillRect/></a:stretch>',
    );
  });

  test("output emits background shorthand visual-box image layer markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background shorthand boxes output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: `url("${WIDE_SVG_DATA_URI}") no-repeat padding-box content-box / 100% 100%`,
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
    expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
    expect(slideXml).toContain(
      '<a:srcRect l="12522" r="12522" t="25087" b="25087"/><a:stretch><a:fillRect/></a:stretch>',
    );
  });

  test("output emits backgroundClip gradient fill markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background clip gradient output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: "linear-gradient(180deg, #111111 0%, #333333 100%)",
            backgroundClip: "content-box",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
    expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
    expect(slideXml).toContain('val="111111"');
    expect(slideXml).toContain('val="333333"');
  });

  test("output emits backgroundOrigin gradient fill markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background origin gradient output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: "linear-gradient(180deg, #111111 0in, #333333 1in)",
            backgroundClip: "content-box",
            backgroundOrigin: "padding-box",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
    expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
    expect(slideXml).toContain('<a:gs pos="50174">');
  });

  test("output emits background shorthand visual-box gradient fill markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background shorthand gradient boxes output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background: "linear-gradient(180deg, #111111 0in, #333333 1in) padding-box content-box",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
    expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
    expect(slideXml).toContain('<a:gs pos="50174">');
  });

  test("output emits background shorthand gradient layer color fallback markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background shorthand gradient fallback output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background:
              "linear-gradient(180deg, #111111 0in, #333333 1in) #AAAAAA padding-box content-box",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
    expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
    expect(slideXml).toContain('val="AAAAAA"');
    expect(slideXml).toContain('<a:gs pos="50174">');
  });

  test("output emits per-layer backgroundOrigin and backgroundClip list markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Background layer boxes output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 2,
            borderWidth: 0.25,
            borderColor: "#111111",
            padding: 0.5,
            background:
              "linear-gradient(180deg, #111111 0in, #333333 1in), linear-gradient(180deg, #AAAAAA 0in, #CCCCCC 1in)",
            backgroundOrigin: "padding-box, border-box",
            backgroundClip: "content-box, padding-box",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(2);
    expect(slideXml).toContain('<a:off x="917575" y="917575"/>');
    expect(slideXml).toContain('<a:ext cx="3651250" cy="1822450"/>');
    expect(slideXml).toContain('<a:off x="1374775" y="1374775"/>');
    expect(slideXml).toContain('<a:ext cx="2736850" cy="908050"/>');
    expect(slideXml).toContain('<a:gs pos="50000">');
    expect(slideXml).toContain('<a:gs pos="50174">');
  });

  test("output emits transformOrigin-adjusted markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Transform origin output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundColor: "#D1D5DB",
            transformOrigin: "left top",
            transform: "scale(2, 0.5)",
          }}
        />
        <shape
          shape="rect"
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 1,
            fill: "#2563EB",
            transformOrigin: "left top",
            transform: "rotate(90deg)",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
    expect(slideXml).toContain('<a:ext cx="3657600" cy="457200"/>');
    expect(slideXml).toContain('<a:off x="3200400" y="-457200"/>');
    expect(slideXml).toContain('<a:ext cx="1828800" cy="914400"/>');
    expect(slideXml).toContain('rot="5400000"');
  });

  test("output emits skew-adjusted bounding box markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Skew output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundColor: "#D1D5DB",
            transformOrigin: "left top",
            transform: "skewX(45deg)",
          }}
        />
        <shape
          shape="rect"
          style={{
            x: 4,
            y: 1,
            width: 1,
            height: 1,
            fill: "#2563EB",
            transformOrigin: "left top",
            transform: "skewY(45deg)",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="914400" y="914400"/>');
    expect(slideXml).toContain('<a:ext cx="2743200" cy="914400"/>');
    expect(slideXml).toContain('<a:off x="3657600" y="914400"/>');
    expect(slideXml).toContain('<a:ext cx="914400" cy="1828800"/>');
  });

  test("output emits matrix-adjusted bounding box markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Matrix output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            backgroundColor: "#D1D5DB",
            transformOrigin: "left top",
            transform: "matrix(1, 0.5, 0.25, 1, 96, 48)",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:off x="1828800" y="1371600"/>');
    expect(slideXml).toContain('<a:ext cx="2057400" cy="1828800"/>');
  });

  test("output emits radial-gradient fill markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Radial output",
        style: {
          background:
            "radial-gradient(ellipse 20% 30% at 25% 75%, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)",
        },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 2,
              height: 2,
              background:
                "radial-gradient(circle closest-side at 75% 25%, #22C55E 0%, rgba(14, 165, 233, 0.5) 100%)",
            }}
          />
          <p
            style={{
              x: 1,
              y: 3,
              width: 3,
              height: 0.75,
              fontSize: 18,
              background:
                "radial-gradient(ellipse farthest-side at center, #FFFFFF 0%, rgba(15, 23, 42, 0.25) 100%)",
            }}
          >
            Radial text
          </p>
          <shape
            shape="rect"
            style={{
              x: 5,
              y: 1,
              width: 2,
              height: 2,
              background: "radial-gradient(circle 40% at 20% 30%, #EF4444 0%, #F59E0B 100%)",
            }}
          />
        </>
      ),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain("<a:gradFill");
    expect(slideXml).toContain('<a:path path="circle">');
    expect(slideXml?.match(/<a:path path="circle">/g)?.length).toBeGreaterThanOrEqual(4);
    expect(slideXml).toContain('fillToRect l="5000" t="45000" r="55000" b="-5000"');
    expect(slideXml).toContain('fillToRect l="50000" t="0" r="0" b="50000"');
    expect(slideXml).toContain('fillToRect l="0" t="0" r="0" b="0"');
    expect(slideXml).toContain('fillToRect l="-20000" t="-10000" r="40000" b="30000"');
    expect(slideXml).toContain('val="2563EB"');
    expect(slideXml).toContain('val="0EA5E9"');
    expect(slideXml).toContain('val="0F172A"');
    expect(slideXml).toContain('val="EF4444"');
  });

  test("output emits repeating gradient fill markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Repeating output",
        style: {
          background: "repeating-linear-gradient(90deg, #111111 0%, #EEEEEE 25%, #111111 50%)",
        },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 2,
              height: 2,
              background:
                "repeating-radial-gradient(circle 40% at center, #EF4444 0%, #F59E0B 20%, #EF4444 40%)",
            }}
          />
        </>
      ),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<a:gs pos="/g)?.length).toBeGreaterThanOrEqual(10);
    expect(slideXml).toContain('pos="75000"');
    expect(slideXml).toContain('val="EEEEEE"');
    expect(slideXml).toContain('val="F59E0B"');
    expect(slideXml).toContain('<a:path path="circle">');
  });

  test("output emits length-based gradient stop positions", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Length stop output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            background: "linear-gradient(90deg, #111111 0in, #777777 1in, #EEEEEE 2in)",
          }}
        />
        <div
          style={{
            x: 4,
            y: 1,
            width: 2,
            height: 2,
            background:
              "radial-gradient(circle 40% at center, #EF4444 0in, #F59E0B 0.4in, #FDE68A 0.8in)",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('pos="50000"');
    expect(slideXml).toContain('val="777777"');
    expect(slideXml).toContain('val="F59E0B"');
    expect(slideXml).toContain('val="FDE68A"');
  });

  test("output emits multi-position stops and color hints", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Gradient hints output" }, () => (
      <>
        <div
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            background: "linear-gradient(90deg, #FF0000 0 50%, 75%, #0000FF 100%)",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('pos="50000"');
    expect(slideXml).toContain('pos="75000"');
    expect(slideXml).toContain('val="800080"');
    expect(slideXml?.match(/val="FF0000"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("output emits multiple background layer markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide(
      {
        name: "Multiple background output",
        style: {
          background:
            "linear-gradient(90deg, #FF0000 0%, #00FF00 100%), linear-gradient(180deg, #0000FF 0%, #FFFFFF 100%)",
        },
      },
      () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 2,
              height: 1.25,
              background:
                "linear-gradient(45deg, #123456 0%, #654321 100%), linear-gradient(180deg, #ABCDEF 0%, #FEDCBA 100%)",
            }}
          />
        </>
      ),
    );

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml?.match(/<a:gradFill/g)?.length).toBeGreaterThanOrEqual(4);
    expect(slideXml).toContain('ang="5400000"');
    expect(slideXml).toContain('ang="10800000"');
    expect(slideXml).toContain('ang="2700000"');
    expect(slideXml).toContain('val="FF0000"');
    expect(slideXml).toContain('val="00FF00"');
    expect(slideXml).toContain('val="0000FF"');
    expect(slideXml).toContain('val="123456"');
    expect(slideXml).toContain('val="ABCDEF"');
    expect(slideXml).toContain('val="FEDCBA"');
  });

  test("output emits transform translation, scale, rotation, and flip markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Transform output" }, () => (
      <>
        <shape
          shape="rect"
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 1,
            fill: "#2563EB",
            transform: "translate(1in, 0.5in) rotate(15deg) scale(2, 1.5) scale(-1, -1)",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('rot="900000"');
    expect(slideXml).toContain('flipH="1"');
    expect(slideXml).toContain('flipV="1"');
    expect(slideXml).toContain('<a:off x="914400" y="1143000"/>');
    expect(slideXml).toContain('<a:ext cx="3657600" cy="1371600"/>');
  });

  test("output emits text direction, hyperlinks, and baseline variants", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " semantics output" }, () => (
      <>
        <p
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.75,
            direction: "rtl",
            href: "https://example.com/docs",
            tooltip: "Open docs",
          }}
        >
          RTL link
        </p>
        <p style={{ x: 1, y: 2, width: 3, height: 0.75, superscript: true }}>Super</p>
        <p style={{ x: 1, y: 3, width: 3, height: 0.75, subscript: true }}>Sub</p>
        <img
          data={SAMPLE_SVG_DATA_URI}
          style={{
            x: 5,
            y: 1,
            width: 1.5,
            height: 1.5,
            href: "https://example.com/image",
            tooltip: "Open image link",
          }}
        />
        <shape
          shape="rect"
          style={{
            x: 5,
            y: 3,
            width: 2,
            height: 1,
            fill: "#2563EB",
            href: "https://example.com/shape",
          }}
        />
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");
    const relsXml = zipEntry(zip, "ppt/slides/_rels/slide1.xml.rels");

    expect(slideXml).toBeDefined();
    expect(relsXml).toBeDefined();
    expect(slideXml).toContain('rtl="1"');
    expect(slideXml).toContain('baseline="30000"');
    expect(slideXml).toContain('baseline="-40000"');
    expect(slideXml).toContain('tooltip="Open docs"');
    expect(slideXml).toContain('tooltip="Open image link"');
    expect(relsXml).toContain('Target="https://example.com/docs"');
    expect(relsXml).toContain('Target="https://example.com/image"');
    expect(relsXml).toContain('Target="https://example.com/shape"');
  });

  test("output emits bullet and numbered list markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "List output" }, () => (
      <>
        <p style={{ x: 1, y: 0.25, width: 3, height: 0.5, listStyleType: "disc" }}>Disc item</p>
        <p
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 0.75,
            listStyleType: "circle",
            listIndent: "18pt",
          }}
        >
          Bullet item
        </p>
        <p
          style={{ x: 1, y: 2, width: 3, height: 0.75, listStyleType: "upper-roman", listStart: 3 }}
        >
          Number item
        </p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:buChar char="\u2022"/>');
    expect(slideXml).toContain('<a:buChar char="\u25E6"/>');
    expect(slideXml).toContain('marL="228600" indent="-228600"');
    expect(slideXml).toContain('<a:buAutoNum type="romanUcPeriod" startAt="3"/>');
  });

  test("output emits writingMode and underline style/color markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Typography aliases output" }, () => (
      <>
        <p
          style={{
            x: 1,
            y: 1,
            width: 2,
            height: 2,
            writingMode: "vertical-rl",
            textDecorationLine: "underline",
            textDecorationStyle: "wavy",
            textDecorationColor: "tomato",
          }}
        >
          Decorated
        </p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('vert="vert270"');
    expect(slideXml).toContain('u="wavy"');
    expect(slideXml).toContain(
      '<a:uFill><a:solidFill><a:srgbClr val="FF6347"/></a:solidFill></a:uFill>',
    );
  });

  test("output emits tab stop markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Tab stops output" }, () => (
      <>
        <p
          style={{
            x: 1,
            y: 1,
            width: 4,
            height: 1,
            tabStops: [
              { position: "36pt", alignment: "left" },
              { position: "1.5in", alignment: "center" },
              { position: "144px", alignment: "decimal" },
            ],
          }}
        >
          Alpha\tBeta\tGamma
        </p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain("<a:tabLst>");
    expect(slideXml).toContain('<a:tab pos="457200" algn="l"/>');
    expect(slideXml).toContain('<a:tab pos="1371600" algn="ctr"/>');
    expect(slideXml).toContain('<a:tab pos="1371600" algn="dec"/>');
  });

  test("output emits paragraph spacing markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Paragraph spacing output" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.75, lineHeight: "28pt" }}>
          Line spacing points
        </p>
        <p style={{ x: 1, y: 2, width: 4, height: 0.75, lineHeight: 1.5 }}>Line spacing multiple</p>
        <p
          style={{
            x: 1,
            y: 3,
            width: 4,
            height: 0.75,
            paragraphSpacingBefore: 12,
            paragraphSpacingAfter: 18,
          }}
        >
          Paragraph spacing
        </p>
        <p
          style={{
            x: 1,
            y: 4,
            width: 4,
            height: 0.75,
            paragraphSpacingBefore: "24px",
            paragraphSpacingAfter: "0.5in",
          }}
        >
          CSS-like paragraph spacing
        </p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('<a:lnSpc><a:spcPts val="2800"/></a:lnSpc>');
    expect(slideXml).toContain('<a:lnSpc><a:spcPct val="150000"/></a:lnSpc>');
    expect(slideXml).toContain('<a:spcBef><a:spcPts val="1200"/></a:spcBef>');
    expect(slideXml).toContain('<a:spcAft><a:spcPts val="1800"/></a:spcAft>');
    expect(slideXml).toContain('<a:spcBef><a:spcPts val="1800"/></a:spcBef>');
    expect(slideXml).toContain('<a:spcAft><a:spcPts val="3600"/></a:spcAft>');
  });

  test("output emits character spacing markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Character spacing output" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 0.75, fontSize: 18, letterSpacing: 1.5 }}>
          Spaced text
        </p>
        <p style={{ x: 1, y: 2, width: 4, height: 0.75, fontSize: 18, letterSpacing: "2px" }}>
          Pixel spaced text
        </p>
        <p style={{ x: 1, y: 3, width: 4, height: 0.75, fontSize: 20, letterSpacing: "0.1em" }}>
          Em spaced text
        </p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('spc="150"');
    expect(slideXml).toContain('spc="200"');
  });

  test("output emits text fit and vertical alignment markup", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " fit align output" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5, fontSize: 18, fit: "shrink" }}>Fit shrink</p>
        <p style={{ x: 1, y: 2, width: 2, height: 0.5, fontSize: 18, fit: "resize" }}>Fit resize</p>
        <p style={{ x: 4, y: 1, width: 2, height: 1, fontSize: 18, verticalAlign: "middle" }}>
          Middle align
        </p>
        <p style={{ x: 4, y: 2.5, width: 2, height: 1, fontSize: 18, verticalAlign: "bottom" }}>
          Bottom align
        </p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain("<a:normAutofit/>");
    expect(slideXml).toContain("<a:spAutoFit/>");
    expect(slideXml).toContain('anchor="ctr"');
    expect(slideXml).toContain('anchor="b"');
  });

  test("output emits text padding as body insets", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " padding output" }, () => (
      <>
        <p
          style={{
            x: 1,
            y: 1,
            width: 3,
            height: 1,
            fontSize: 18,
            padding: ["12pt", "12pt", "6pt", "6pt"],
          }}
        >
          Padded text
        </p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('lIns="76200"');
    expect(slideXml).toContain('tIns="152400"');
    expect(slideXml).toContain('rIns="152400"');
    expect(slideXml).toContain('bIns="76200"');
  });

  test("output maps CSS textAlign values to PPTX paragraph alignment values", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " align output" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5, fontSize: 18, textAlign: "center" }}>
          Center
        </p>
        <p style={{ x: 1, y: 2, width: 2, height: 0.5, fontSize: 18, textAlign: "right" }}>Right</p>
        <p style={{ x: 1, y: 3, width: 2, height: 0.5, fontSize: 18, textAlign: "justify" }}>
          Justify
        </p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('algn="ctr"');
    expect(slideXml).toContain('algn="r"');
    expect(slideXml).toContain('algn="just"');
    expect(slideXml).not.toContain('algn="center"');
    expect(slideXml).not.toContain('algn="right"');
    expect(slideXml).not.toContain('algn="justify"');
  });

  test("output emits textIndent markup for plain and list paragraphs", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: " indent output" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 4, height: 1, textIndent: "36pt" }}>Plain indent</p>
        <p
          style={{
            x: 1,
            y: 2.25,
            width: 4,
            height: 1,
            listStyleType: "circle",
            listIndent: "18pt",
            textIndent: "18pt",
          }}
        >
          List indent
        </p>
      </>
    ));

    const content = await renderDeckBytes(deck);

    const zip = unzipSync(content);
    const slideXml = zipEntry(zip, "ppt/slides/slide1.xml");

    expect(slideXml).toBeDefined();
    expect(slideXml).toContain('indent="457200" marL="0"');
    expect(slideXml).toContain('<a:buChar char="\u25E6"/>');
    expect(slideXml).toContain('marL="228600" indent="0"');
  });
});

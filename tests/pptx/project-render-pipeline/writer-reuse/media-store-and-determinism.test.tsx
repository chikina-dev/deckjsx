import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render writer media store and determinism", () => {
  test("direct writer invalidates media build artifacts when media bytes change", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Media bytes" }, () => (
      <>
        <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await H.renderPptxPackage(projection);
    const staleArtifacts = new Map(
      (cold.buildArtifacts ?? []).map((artifact) => [
        artifact.packagePartId,
        artifact.path.startsWith("ppt/media/")
          ? { ...artifact, mediaByteFingerprint: "test:old-media-bytes" }
          : artifact,
      ]),
    );
    const warm = await H.renderPptxPackage(
      projection,
      {},
      { pptxBuildArtifactsByPartId: staleArtifacts },
    );

    expect(cold.artifact).toBeDefined();
    expect(
      cold.buildArtifacts?.find((artifact) => artifact.path.startsWith("ppt/media/"))
        ?.mediaByteFingerprint,
    ).toMatch(/^fnv1a32:/);
    expect(warm.artifact).toBeDefined();
    expect(warm.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/media/media1.svg",
        reason: "mediaBytesChanged",
        status: "rebuilt",
        previousBuild: expect.objectContaining({ mediaByteFingerprint: "test:old-media-bytes" }),
        reasonDetails: expect.objectContaining({
          kind: "mediaBytesChanged",
          mediaByteFingerprint: expect.objectContaining({
            previous: "test:old-media-bytes",
            current: expect.stringMatching(/^fnv1a32:/),
          }),
        }),
        build: expect.objectContaining({
          mediaByteFingerprint: expect.stringMatching(/^fnv1a32:/),
        }),
      }),
    );
    expect(
      warm.buildArtifacts?.find((artifact) => artifact.path === "ppt/media/media1.svg"),
    ).toMatchObject({
      buildNotes: [
        expect.objectContaining({
          kind: "packagePartBytesBuilt",
          reason: "mediaBytesChanged",
          partKind: "media",
          mediaByteFingerprint: expect.stringMatching(/^fnv1a32:/),
        }),
      ],
    });
  });

  test("render reuses package part build artifacts across store-only renders", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Store reuse" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>store</p>
      </>
    ));

    const first = await deck.render();
    const second = await deck.render();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.artifact?.bytes).toEqual(second.artifact?.bytes);
    expect(second.summary?.assembly?.reusedCount).toBeGreaterThan(0);
    expect(second.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        status: "reused",
      }),
    );
  });

  test("render emits store-only ZIP entries", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Store entries" }, () => (
      <>
        <img
          data={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 2, height: 1, objectFit: "stretch" }}
        />
      </>
    ));

    const render = await deck.render();
    const bytes = render.artifact?.bytes ?? new Uint8Array();

    expect(render.ok).toBe(true);
    expect(render.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({ path: "ppt/media/media1.png" }),
    );
    expect(H.localZipCompressionMethod(bytes, "ppt/slides/slide1.xml")).toBe(0);
    expect(H.localZipCompressionMethod(bytes, "ppt/media/media1.png")).toBe(0);
  });

  test("render produces deterministic PPTX bytes for fixed data-uri media", async () => {
    function buildDeck() {
      const deck = new H.Deck({
        layout: { width: 10, height: 5.625, unit: "in" },
        meta: { title: "Deterministic media", author: "deckjsx" },
      });
      deck.slide({ name: "Deterministic media bytes" }, () => (
        <>
          <img
            data={H.SAMPLE_SVG_DATA_URI}
            style={{ x: 1, y: 1, width: 1.25, height: 1.25, fit: "stretch" }}
          />
          <div
            style={{
              x: 2.75,
              y: 1,
              width: 3,
              height: 1.25,
              background: `url("${H.SAMPLE_SVG_DATA_URI}")`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
            }}
          />
        </>
      ));
      return deck;
    }

    const first = await buildDeck().render();
    const second = await buildDeck().render();
    const firstZip = H.unzipSync(first.artifact?.bytes ?? new Uint8Array());

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.artifact?.bytes).toEqual(second.artifact?.bytes);
    expect(
      Object.keys(firstZip)
        .filter((path) => path.startsWith("ppt/media/"))
        .sort(),
    ).toEqual(["ppt/media/media1.svg"]);
    expect(first.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/media/media1.svg",
        status: "rebuilt",
        reason: "missingArtifact",
        build: expect.objectContaining({
          mediaByteFingerprint: expect.stringMatching(/^fnv1a32:/),
          mediaByteFingerprintSource: "byteHash",
        }),
      }),
    );
  });
});

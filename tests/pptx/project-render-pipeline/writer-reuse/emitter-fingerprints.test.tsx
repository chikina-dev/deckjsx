import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render writer emitter fingerprints", () => {
  test("direct writer records document property emitter fingerprints at core and app granularity", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "DocProps emitter" }, () => (
      <>
        <p style={{ position: "absolute", left: 1, top: 1, width: 2, height: 0.5 }}>docprops</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await H.renderPptxPackage(projection);
    const coreArtifact = cold.buildArtifacts?.find(
      (artifact) => artifact.path === "docProps/core.xml",
    );
    const appArtifact = cold.buildArtifacts?.find(
      (artifact) => artifact.path === "docProps/app.xml",
    );

    expect(coreArtifact?.emitterFingerprint).toMatch(/^deckjsx:pptx-emitter:docprops-core:/);
    expect(appArtifact?.emitterFingerprint).toMatch(/^deckjsx:pptx-emitter:docprops-app:/);
    expect(coreArtifact?.emitterFingerprint).not.toBe(appArtifact?.emitterFingerprint);
  });

  test("direct writer records relationship emitter fingerprints by owner path family", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Relationship emitters" }, () => (
      <>
        <p style={{ position: "absolute", left: 1, top: 1, width: 2, height: 0.5 }}>
          relationships
        </p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await H.renderPptxPackage(projection);
    const emitterFingerprintByPath = new Map(
      (cold.buildArtifacts ?? []).map((artifact) => [artifact.path, artifact.emitterFingerprint]),
    );

    expect(emitterFingerprintByPath.get("_rels/.rels")).toMatch(
      /^deckjsx:pptx-emitter:relationships-root:/,
    );
    expect(emitterFingerprintByPath.get("ppt/_rels/presentation.xml.rels")).toMatch(
      /^deckjsx:pptx-emitter:relationships-presentation:/,
    );
    expect(emitterFingerprintByPath.get("ppt/slides/_rels/slide1.xml.rels")).toMatch(
      /^deckjsx:pptx-emitter:relationships-slide:/,
    );
    expect(emitterFingerprintByPath.get("ppt/slideMasters/_rels/slideMaster1.xml.rels")).toMatch(
      /^deckjsx:pptx-emitter:relationships-slide-master:/,
    );
    expect(emitterFingerprintByPath.get("ppt/slideLayouts/_rels/slideLayout1.xml.rels")).toMatch(
      /^deckjsx:pptx-emitter:relationships-slide-layout:/,
    );
    expect(
      new Set([
        emitterFingerprintByPath.get("_rels/.rels"),
        emitterFingerprintByPath.get("ppt/_rels/presentation.xml.rels"),
        emitterFingerprintByPath.get("ppt/slides/_rels/slide1.xml.rels"),
        emitterFingerprintByPath.get("ppt/slideMasters/_rels/slideMaster1.xml.rels"),
        emitterFingerprintByPath.get("ppt/slideLayouts/_rels/slideLayout1.xml.rels"),
      ]).size,
    ).toBe(5);
  });

  test("direct writer records support and manifest emitter fingerprints by package part family", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Support emitters" }, () => (
      <>
        <img
          data={H.SAMPLE_SVG_DATA_URI}
          style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await H.renderPptxPackage(projection);
    const emitterFingerprintByPath = new Map(
      (cold.buildArtifacts ?? []).map((artifact) => [artifact.path, artifact.emitterFingerprint]),
    );
    const expected = [
      ["[Content_Types].xml", /^deckjsx:pptx-emitter:content-types:/],
      ["ppt/presentation.xml", /^deckjsx:pptx-emitter:presentation:/],
      ["ppt/theme/theme1.xml", /^deckjsx:pptx-emitter:theme:/],
      ["ppt/slideMasters/slideMaster1.xml", /^deckjsx:pptx-emitter:slide-master:/],
      ["ppt/slideLayouts/slideLayout1.xml", /^deckjsx:pptx-emitter:slide-layout:/],
      ["ppt/viewProps.xml", /^deckjsx:pptx-emitter:view-properties:/],
      ["ppt/presProps.xml", /^deckjsx:pptx-emitter:presentation-properties:/],
      ["ppt/media/media1.svg", /^deckjsx:pptx-emitter:media-copy:/],
    ] as const;

    expected.forEach(([path, pattern]) => {
      expect(emitterFingerprintByPath.get(path)).toMatch(pattern);
    });
    expect(new Set(expected.map(([path]) => emitterFingerprintByPath.get(path))).size).toBe(
      expected.length,
    );
  });

  test("direct writer invalidates build artifacts when the artifact package part id changes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Artifact identity" }, () => (
      <>
        <p style={{ position: "absolute", left: 1, top: 1, width: 2, height: 0.5 }}>identity</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await H.renderPptxPackage(projection);
    const slidePart = projection.parts.find((part) => part.path === "ppt/slides/slide1.xml")!;
    const staleArtifacts = new Map(
      (cold.buildArtifacts ?? []).map((artifact) => [
        artifact.packagePartId,
        artifact.packagePartId === slidePart.id
          ? { ...artifact, packagePartId: "pptx:test:wrong-artifact-part" as H.PackagePartId }
          : artifact,
      ]),
    );
    const warm = await H.renderPptxPackage(
      projection,
      {},
      { pptxBuildArtifactsByPartId: staleArtifacts },
    );

    expect(cold.artifact).toBeDefined();
    expect(warm.artifact).toBeDefined();
    expect(warm.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        reason: "packagePartIdChanged",
        status: "rebuilt",
        reasonDetails: expect.objectContaining({
          kind: "packagePartIdChanged",
          packagePartId: { previous: "pptx:test:wrong-artifact-part", current: slidePart.id },
        }),
      }),
    );
    expect(
      warm.buildArtifacts?.find((artifact) => artifact.path === "ppt/slides/slide1.xml"),
    ).toMatchObject({
      packagePartId: slidePart.id,
      buildNotes: [expect.objectContaining({ reason: "packagePartIdChanged" })],
    });
  });
});

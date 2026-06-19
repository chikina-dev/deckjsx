import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render writer warm reuse and patch plans", () => {
  test("render reuses matching package part build artifacts on warm path without leaking artifacts into summary", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Warm path" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>warm</p>
      </>
    ));

    const cold = await deck.render();
    const warm = await deck.render();

    expect(cold.ok).toBe(true);
    expect(cold.summary?.assembly?.rebuiltCount).toBeGreaterThan(0);
    expect(cold.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        reason: "missingArtifact",
        status: "rebuilt",
        build: expect.objectContaining({
          partFingerprint: expect.stringMatching(/^fnv1a32:/),
          writerFingerprint: expect.stringMatching(/^deckjsx:pptx-writer:/),
          emitterFingerprint: expect.stringMatching(/^deckjsx:pptx-emitter:slide:/),
          dependencyFingerprintCount: expect.any(Number),
          diagnosticCodes: [],
        }),
      }),
    );
    expect(warm.ok).toBe(true);
    expect(warm.summary?.assembly?.reusedCount).toBeGreaterThan(0);
    expect(warm.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        reason: "buildArtifactFingerprintMatched",
        status: "reused",
        expected: expect.objectContaining({
          path: "ppt/slides/slide1.xml",
        }),
        final: expect.objectContaining({
          status: "reused",
          reason: "buildArtifactFingerprintMatched",
          reasonDetails: expect.objectContaining({
            kind: "buildArtifactFingerprintMatched",
            matchedBuild: expect.objectContaining({
              partFingerprint: expect.stringMatching(/^fnv1a32:/),
            }),
          }),
        }),
        reasonDetails: expect.objectContaining({
          kind: "buildArtifactFingerprintMatched",
          matchedBuild: expect.objectContaining({
            writerFingerprint: expect.stringMatching(/^deckjsx:pptx-writer:/),
          }),
        }),
        build: expect.objectContaining({
          partFingerprint: expect.stringMatching(/^fnv1a32:/),
          writerFingerprint: expect.stringMatching(/^deckjsx:pptx-writer:/),
          emitterFingerprint: expect.stringMatching(/^deckjsx:pptx-emitter:slide:/),
          dependencyFingerprintCount: expect.any(Number),
          diagnosticCodes: [],
        }),
      }),
    );
    const warmAssemblyEntries = warm.summary?.assembly?.entries ?? [];
    expect(warmAssemblyEntries.length).toBeGreaterThan(0);
    for (const entry of warmAssemblyEntries) {
      expect(entry).not.toHaveProperty("bytes");
      expect(entry).not.toHaveProperty("buildArtifact");
      expect(entry).not.toHaveProperty("zipEntry");
      expect(entry.expected).not.toHaveProperty("part");
      expect(entry.final).not.toHaveProperty("bytes");
      expect(entry.build).not.toHaveProperty("bytes");
    }
  });

  test("render emits patchable package metadata for node runtime writers", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Patchable" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>patchable</p>
    ));

    const render = await deck.render({ inspection: "none" });
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const manifestBytes = zip["ppt/deckjsx/patch-manifest.json"];
    const contentTypes = new TextDecoder().decode(zip["[Content_Types].xml"] ?? new Uint8Array());
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
      readonly kind: string;
      readonly version: number;
      readonly parts: readonly {
        readonly packagePartId: string;
        readonly path: string;
        readonly patchableKind: string;
        readonly reservedCapacity: number;
        readonly logicalByteLength: number;
        readonly storedByteLength: number;
        readonly fingerprint: string;
        readonly buildStatus?: string;
      }[];
    };
    const patchPlan = render.patchPlan;
    const slideEntry = manifest.parts.find((part) => part.path.endsWith(".xml"));
    const relationshipEntry = manifest.parts.find((part) => part.path.endsWith(".rels"));
    const slideBytes = zip[slideEntry?.path ?? ""];
    const slideText = new TextDecoder().decode(slideBytes ?? new Uint8Array());

    expect(render.ok).toBe(true);
    expect(patchPlan).toEqual(
      expect.objectContaining({
        kind: "deckjsx.renderPatchPlan",
        version: 1,
      }),
    );
    expect(manifest).toEqual(
      expect.objectContaining({
        kind: "deckjsx.patchManifest",
        version: 1,
      }),
    );
    expect(contentTypes).toContain('Extension="json"');
    expect(contentTypes).toContain('ContentType="application/json"');
    expect(manifest.parts.length).toBeGreaterThan(0);
    expect(patchPlan?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packagePartId: "deckjsx:patch-manifest",
          path: "ppt/deckjsx/patch-manifest.json",
          patchableKind: "manifest",
          reservedCapacity: expect.any(Number),
          storedByteLength: expect.any(Number),
          fingerprint: expect.stringMatching(/^fnv1a32:/),
          buildStatus: "rebuilt",
        }),
        expect.objectContaining({
          packagePartId: slideEntry?.packagePartId,
          path: slideEntry?.path,
          reservedCapacity: slideEntry?.reservedCapacity,
          logicalByteLength: slideEntry?.logicalByteLength,
          storedByteLength: slideEntry?.storedByteLength,
          fingerprint: slideEntry?.fingerprint,
          buildStatus: "rebuilt",
        }),
      ]),
    );
    expect(patchPlan?.parts.find((part) => part.patchableKind === "manifest")).toEqual(
      expect.objectContaining({
        logicalByteLength: expect.any(Number),
        reservedCapacity: expect.any(Number),
        storedByteLength: expect.any(Number),
      }),
    );
    expect(slideEntry).toEqual(
      expect.objectContaining({
        patchableKind: "xml",
        reservedCapacity: expect.any(Number),
        logicalByteLength: expect.any(Number),
        storedByteLength: expect.any(Number),
        fingerprint: expect.stringMatching(/^fnv1a32:/),
      }),
    );
    expect(slideEntry!.reservedCapacity).toBeGreaterThan(0);
    expect(slideEntry!.storedByteLength).toBeGreaterThan(slideEntry!.logicalByteLength);
    expect(slideText).toContain("deckjsx-patch-reserve:");
    expect(slideEntry).not.toHaveProperty("buildStatus");
    expect(relationshipEntry).toEqual(
      expect.objectContaining({
        patchableKind: "xml",
        reservedCapacity: expect.any(Number),
      }),
    );
    expect(relationshipEntry!.reservedCapacity).toBeGreaterThan(0);
  });

  test("render patch plan reports warm package part reuse without persisting reuse state", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Patch reuse" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>patch reuse</p>
    ));

    const cold = await deck.render({ inspection: "none" });
    const warm = await deck.render({ inspection: "none" });
    const warmZip = H.unzipSync(warm.artifact?.bytes ?? new Uint8Array());
    const manifest = JSON.parse(
      new TextDecoder().decode(warmZip["ppt/deckjsx/patch-manifest.json"]),
    ) as {
      readonly parts: readonly { readonly path: string; readonly buildStatus?: string }[];
    };
    const warmXmlPart = warm.patchPlan?.parts.find((part) => part.patchableKind === "xml");
    const manifestXmlPart = manifest.parts.find((part) => part.path === warmXmlPart?.path);

    expect(cold.patchPlan?.parts.some((part) => part.buildStatus === "rebuilt")).toBe(true);
    expect(warmXmlPart).toEqual(
      expect.objectContaining({
        buildStatus: "reused",
      }),
    );
    expect(manifestXmlPart).not.toHaveProperty("buildStatus");
  });

  test("render explains rebuilds when a defined projection changes a package part fingerprint", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Original" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>same bytes</p>
      </>
    ));

    const cold = await deck.render();
    const projection = (await deck.project()).projection!;
    const changedSlideParts = projection.slides.map((slide) => ({
      ...slide,
      payload: { ...slide.payload, name: "Changed metadata" },
    }));
    const changedProjection = H.withFreshPackageFingerprints({
      ...projection,
      slides: changedSlideParts,
      parts: projection.parts.map((part) =>
        part.kind === "slide"
          ? (changedSlideParts.find((slide) => slide.id === part.id) ?? part)
          : part,
      ),
    });

    deck.defineProjection(changedProjection);
    const changed = await deck.render();
    const coldSlideBuild = cold.summary?.assembly?.entries.find(
      (entry) => entry.path === "ppt/slides/slide1.xml",
    )?.build;

    expect(cold.ok).toBe(true);
    expect(changed.ok).toBe(true);
    expect(coldSlideBuild?.partFingerprint).toMatch(/^fnv1a32:/);
    expect(changed.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        reason: "partFingerprintChanged",
        status: "rebuilt",
        previousBuild: expect.objectContaining({
          partFingerprint: coldSlideBuild?.partFingerprint,
          writerFingerprint: coldSlideBuild?.writerFingerprint,
          emitterFingerprint: coldSlideBuild?.emitterFingerprint,
        }),
        reasonDetails: expect.objectContaining({
          kind: "partFingerprintChanged",
          partFingerprint: {
            previous: coldSlideBuild?.partFingerprint,
            current: expect.not.stringMatching(coldSlideBuild?.partFingerprint ?? ""),
          },
        }),
        build: expect.objectContaining({
          partFingerprint: expect.not.stringMatching(coldSlideBuild?.partFingerprint ?? ""),
          writerFingerprint: coldSlideBuild?.writerFingerprint,
          emitterFingerprint: coldSlideBuild?.emitterFingerprint,
        }),
      }),
    );
  });

  test("render invalidates owner XML when its relationship part fingerprint changes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Relationship dependency" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>relationship dependency</p>
      </>
    ));

    const cold = await deck.render();
    const projection = (await deck.project()).projection!;
    const presentationRelationshipsPart = projection.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    );
    const changedPresentationRelationshipId =
      "rIdModelChangedSlideMaster" as H.PptxRelationship["id"];
    const changedProjection = H.withFreshPackageFingerprints({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.id === presentationRelationshipsPart?.id) {
          const relationships = (
            part.relationships ??
            (part.payload as H.PptxRelationshipsPayload | undefined)?.relationships ??
            []
          ).map((relationship) =>
            relationship.type === "slideMaster"
              ? { ...relationship, id: changedPresentationRelationshipId }
              : relationship,
          );
          return {
            ...part,
            relationships,
            payload: { relationships } satisfies H.PptxRelationshipsPayload,
          };
        }

        return part;
      }),
    });

    deck.defineProjection(changedProjection);
    const changed = await deck.render();
    const zip = H.unzipSync(changed.artifact?.bytes ?? new Uint8Array());
    const presentationXml = new TextDecoder().decode(
      zip["ppt/presentation.xml"] ?? new Uint8Array(),
    );
    const coldPresentationBuild = cold.summary?.assembly?.entries.find(
      (entry) => entry.path === "ppt/presentation.xml",
    )?.build;
    const changedPresentationEntry = changed.summary?.assembly?.entries.find(
      (entry) => entry.path === "ppt/presentation.xml",
    );

    expect(cold.ok).toBe(true);
    expect(changed.ok).toBe(true);
    expect(coldPresentationBuild?.dependencyFingerprints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packagePartId: presentationRelationshipsPart?.id,
          fingerprint: expect.stringMatching(/^fnv1a32:/),
        }),
      ]),
    );
    expect(changed.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/presentation.xml",
        reason: "dependencyFingerprintChanged",
        status: "rebuilt",
        previousBuild: expect.objectContaining({
          dependencyFingerprints: coldPresentationBuild?.dependencyFingerprints,
        }),
        reasonDetails: expect.objectContaining({
          kind: "dependencyFingerprintChanged",
          dependencyFingerprints: expect.objectContaining({
            previous: coldPresentationBuild?.dependencyFingerprints,
            current: expect.any(Array),
          }),
        }),
        build: expect.objectContaining({ dependencyFingerprints: expect.any(Array) }),
      }),
    );
    expect(changedPresentationEntry?.build?.dependencyFingerprints).not.toEqual(
      coldPresentationBuild?.dependencyFingerprints,
    );
    expect(presentationXml).toContain(`r:id="${changedPresentationRelationshipId}"`);
  });

  test("direct writer invalidates build artifacts when the part emitter fingerprint changes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Emitter fingerprint" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>emitter</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await H.renderPptxPackage(projection);
    const staleArtifacts = new Map(
      (cold.buildArtifacts ?? []).map((artifact) => [
        artifact.packagePartId,
        artifact.path === "ppt/slides/slide1.xml"
          ? { ...artifact, emitterFingerprint: "test:old-slide-emitter" }
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
      cold.buildArtifacts?.find((artifact) => artifact.path === "ppt/slides/slide1.xml")
        ?.emitterFingerprint,
    ).toMatch(/^deckjsx:pptx-emitter:slide:/);
    expect(
      cold.buildArtifacts?.find((artifact) => artifact.path === "ppt/slides/slide1.xml"),
    ).toMatchObject({
      buildNotes: [
        expect.objectContaining({
          kind: "packagePartBytesBuilt",
          reason: "missingArtifact",
          partKind: "slide",
          byteLength: expect.any(Number),
          partFingerprint: expect.stringMatching(/^fnv1a32:/),
          writerFingerprint: expect.stringMatching(/^deckjsx:pptx-writer:/),
          emitterFingerprint: expect.stringMatching(/^deckjsx:pptx-emitter:slide:/),
          dependencyFingerprintCount: expect.any(Number),
          diagnosticCodes: [],
        }),
      ],
    });
    expect(warm.artifact).toBeDefined();
    expect(warm.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        reason: "emitterFingerprintChanged",
        status: "rebuilt",
        reasonDetails: expect.objectContaining({
          kind: "emitterFingerprintChanged",
          emitterFingerprint: expect.objectContaining({
            previous: "test:old-slide-emitter",
            current: expect.stringMatching(/^deckjsx:pptx-emitter:slide:/),
          }),
        }),
      }),
    );
    expect(
      warm.buildArtifacts?.find((artifact) => artifact.path === "ppt/slides/slide1.xml"),
    ).toMatchObject({
      buildNotes: [
        expect.objectContaining({
          kind: "packagePartBytesBuilt",
          reason: "emitterFingerprintChanged",
          partKind: "slide",
        }),
      ],
    });
  });
});

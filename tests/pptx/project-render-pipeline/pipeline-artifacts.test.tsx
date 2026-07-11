import { describe, expect, test } from "vite-plus/test";
import * as H from "./helpers.tsx";

describe("project/render pipeline artifacts", () => {
  test("pipeline artifact collection keeps keyed snapshots behind whole-artifact defines", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Artifacts" }, () => <></>);
    const graph = deck.compile().graph!;
    const projection = (await deck.project()).projection!;
    const artifacts = new H.PipelineArtifactCollection();

    artifacts.replaceGraphArtifact(deck, graph);

    expect(artifacts.sourcesByKey.get("deck:root")?.rootCount).toBe(1);
    expect(artifacts.graph?.sourceKey).toBe("deck:root");
    expect(artifacts.graphsBySourceKey.get("deck:root")?.graph).toBe(graph);
    expect(artifacts.projection).toBeUndefined();

    artifacts.replaceProjectionArtifact(projection);

    expect(artifacts.graph).toBeUndefined();
    expect(artifacts.projection?.projection).toBe(projection);
    expect(artifacts.projection?.partsById.get(projection.parts[0]!.id)).toBe(projection.parts[0]);
    expect(artifacts.projection?.packageDependencies.dependenciesByPartId.size).toBeGreaterThan(0);
  });

  test("pipeline artifact collection replaces projection artifacts with pdf models", () => {
    const artifacts = new H.PipelineArtifactCollection();
    const projection = {
      format: "pdf",
      version: "1.7",
      documentId: "pdf:document:artifact",
      metadata: { producer: "deckjsx" },
      pages: [],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    } as const;

    expect(() => artifacts.replaceProjectionArtifact(projection as never)).not.toThrow();

    expect(artifacts.graph).toBeUndefined();
    expect(artifacts.projection?.projection).toBe(projection);
    expect(artifacts.projection?.partsById.size).toBe(0);
    expect(artifacts.projection?.packageDependencies.dependenciesByPartId.size).toBe(0);
  });

  test("pipeline artifact invalidation clears stale package part build artifacts", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Build artifact lifecycle" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>lifecycle</p>
    ));
    const graph = deck.compile().graph!;
    const projection = (await deck.project()).projection!;
    const render = await H.renderPptxPackage(projection);
    const artifacts = new H.PipelineArtifactCollection();

    const materializeBuildArtifacts = () => {
      artifacts.materializePptxBuildArtifacts(render.buildArtifacts ?? []);
      expect(artifacts.pptxBuildArtifactsByPartId.size).toBeGreaterThan(0);
    };

    expect(render.artifact).toBeDefined();

    materializeBuildArtifacts();
    artifacts.invalidateFromSource();
    expect(artifacts.pptxBuildArtifactsByPartId.size).toBe(0);

    materializeBuildArtifacts();
    artifacts.replaceGraphArtifact(deck, graph);
    expect(artifacts.pptxBuildArtifactsByPartId.size).toBe(0);

    materializeBuildArtifacts();
    artifacts.invalidateFromProjection();
    expect(artifacts.pptxBuildArtifactsByPartId.size).toBe(0);

    materializeBuildArtifacts();
    artifacts.invalidateAssets();
    expect(artifacts.pptxBuildArtifactsByPartId.size).toBe(0);

    materializeBuildArtifacts();
    artifacts.replaceProjectionArtifact(projection);
    expect(artifacts.projection?.projection).toBe(projection);
    expect(artifacts.graph).toBeUndefined();
    expect(artifacts.pptxBuildArtifactsByPartId.size).toBeGreaterThan(0);
  });

  test("stage operations materialize source graph and package part snapshots", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Materialized" }, () => <></>);
    const artifacts = new H.PipelineArtifactCollection();

    const compile = H.compileSource(deck, artifacts);
    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      definedGraph: artifacts.graph,
      artifacts,
    });

    expect(compile.ok).toBe(true);
    expect(artifacts.sourcesByKey.get("deck:root")?.rootCount).toBe(1);
    expect(artifacts.graphsBySourceKey.get("deck:root")?.graph).toBe(compile.graph);
    expect(project.ok).toBe(true);
    expect(artifacts.projection?.projection).toBe(project.projection);
    expect(artifacts.projection?.partsById.size).toBe(project.projection?.parts.length);
  });

  test("Source invalidation exposes a single projection reuse snapshot until the next projection materializes", async () => {
    let title = "before";
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();

    deck.slide({ name: "Snapshot" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>{title}</p>
    ));

    const first = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const firstGraph = artifacts.graph;
    const firstProjection = artifacts.projection;

    title = "after";
    const invalidated = artifacts.invalidateForSourceChange({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    const snapshot = artifacts.incrementalProjectionReuseSnapshot;

    expect(first.ok).toBe(true);
    expect(invalidated).toBe(true);
    expect(snapshot).toEqual(
      expect.objectContaining({
        graph: firstGraph,
        projection: firstProjection,
        options: deck.options,
        staleAssetEntityIds: expect.any(Set),
      }),
    );

    const second = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });

    expect(second.ok).toBe(true);
    expect(artifacts.incrementalProjectionReuseSnapshot).toBeUndefined();
  });

  test("byte asset cache keys distinguish equal-length byte sources by content", () => {
    const first = H.assetSourceCacheKey({
      kind: "bytes",
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/png",
      extension: "png",
    });
    const second = H.assetSourceCacheKey({
      kind: "bytes",
      bytes: new Uint8Array([1, 2, 4]),
      mediaType: "image/png",
      extension: "png",
    });

    expect(first).not.toBe(second);
  });

  test("asset cache keys distinguish source fields handled by the same resolver", () => {
    const source = { kind: "path", path: "./shared.asset" } as const;
    const media = H.assetSourceCacheKey(source, "test:shared-loader", undefined, "src");
    const font = H.assetSourceCacheKey(source, "test:shared-loader", undefined, "font");

    expect(media).not.toBe(font);
  });

  test("projection artifacts expose stable slide package part fingerprints", async () => {
    async function projectDeck(firstSlideText: string) {
      const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
      const artifacts = new H.PipelineArtifactCollection();

      deck.slide({ name: "Edited" }, () => (
        <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
          {firstSlideText}
        </p>
      ));
      deck.slide({ name: "Stable" }, () => (
        <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>unchanged</p>
      ));

      const project = await H.projectSource({
        source: deck,
        options: deck.options,
        projectOptions: { inspection: "none" },
        artifacts,
      });

      return { artifacts, project };
    }

    const first = await projectDeck("before");
    const second = await projectDeck("after");
    const firstEditedSlide = first.project.projection?.slides.find(
      (slide) => slide.payload.name === "Edited",
    );
    const firstStableSlide = first.project.projection?.slides.find(
      (slide) => slide.payload.name === "Stable",
    );
    const secondEditedSlide = second.project.projection?.slides.find(
      (slide) => slide.payload.name === "Edited",
    );
    const secondStableSlide = second.project.projection?.slides.find(
      (slide) => slide.payload.name === "Stable",
    );

    const firstEditedFingerprint = first.artifacts.projection?.slidePackagePartFingerprints.get(
      firstEditedSlide!.id,
    );
    const firstStableFingerprint = first.artifacts.projection?.slidePackagePartFingerprints.get(
      firstStableSlide!.id,
    );
    const secondEditedFingerprint = second.artifacts.projection?.slidePackagePartFingerprints.get(
      secondEditedSlide!.id,
    );
    const secondStableFingerprint = second.artifacts.projection?.slidePackagePartFingerprints.get(
      secondStableSlide!.id,
    );

    expect(firstEditedFingerprint).toEqual(
      expect.objectContaining({
        slidePartId: firstEditedSlide?.id,
        fingerprint: expect.stringMatching(/^fnv1a32:/),
      }),
    );
    expect(firstStableFingerprint?.fingerprint).toBe(secondStableFingerprint?.fingerprint);
    expect(firstEditedFingerprint?.fingerprint).not.toBe(secondEditedFingerprint?.fingerprint);
  });

  test("incremental projection artifacts expose slide projection fingerprints for reuse", async () => {
    let editedText = "before";
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();

    deck.slide({ name: "Edited" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>{editedText}</p>
    ));
    deck.slide({ name: "Stable" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>unchanged</p>
    ));

    const first = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    editedText = "after";
    artifacts.invalidateForSourceChange({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    const second = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const secondEditedSlide = second.projection?.slides.find(
      (slide) => slide.payload.name === "Edited",
    );
    const secondStableSlide = second.projection?.slides.find(
      (slide) => slide.payload.name === "Stable",
    );
    const secondEditedSlideNodeId = secondEditedSlide?.origin?.graphNodeIds?.[0];
    const secondStableSlideNodeId = secondStableSlide?.origin?.graphNodeIds?.[0];

    const editedFingerprint = artifacts.projection?.slideProjectionFingerprints.get(
      secondEditedSlideNodeId!,
    );
    const stableFingerprint = artifacts.projection?.slideProjectionFingerprints.get(
      secondStableSlideNodeId!,
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(editedFingerprint).toEqual(
      expect.objectContaining({
        fingerprint: expect.stringMatching(/^fnv1a32:/),
        slideNodeId: secondEditedSlideNodeId,
      }),
    );
    expect(stableFingerprint).toEqual(
      expect.objectContaining({
        fingerprint: expect.stringMatching(/^fnv1a32:/),
        slideNodeId: secondStableSlideNodeId,
      }),
    );
  });

  test("project can retain slide projection fingerprints before the first invalidation", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();

    deck.slide({ name: "Initial incremental" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>initial</p>
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
      retainSlideProjectionFingerprints: true,
    });
    const slide = project.projection?.slides[0];
    const slideNodeId = slide?.origin?.graphNodeIds?.[0];
    const fingerprint = artifacts.projection?.slideProjectionFingerprints.get(slideNodeId!);

    expect(project.ok).toBe(true);
    expect(fingerprint).toEqual(
      expect.objectContaining({
        fingerprint: expect.stringMatching(/^fnv1a32:/),
        slideNodeId,
      }),
    );
  });

  test("Incremental projection reuses unchanged slide package parts from the stale projection", async () => {
    let editedText = "before";
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();

    deck.slide({ name: "Edited" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>{editedText}</p>
    ));
    deck.slide({ name: "Stable" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>unchanged</p>
    ));

    const first = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const firstEditedSlide = first.projection?.slides.find(
      (slide) => slide.payload.name === "Edited",
    );
    const firstStableSlide = first.projection?.slides.find(
      (slide) => slide.payload.name === "Stable",
    );
    const firstStableSlideRelationships = first.projection?.parts.find(
      (part) =>
        part.kind === "relationships" &&
        firstStableSlide?.origin?.graphNodeIds?.some((id) =>
          part.origin?.graphNodeIds?.includes(id),
        ),
    );

    editedText = "after";
    artifacts.invalidateForSourceChange({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    const second = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const secondEditedSlide = second.projection?.slides.find(
      (slide) => slide.payload.name === "Edited",
    );
    const secondStableSlide = second.projection?.slides.find(
      (slide) => slide.payload.name === "Stable",
    );
    const secondStableSlideRelationships = second.projection?.parts.find(
      (part) =>
        part.kind === "relationships" &&
        secondStableSlide?.origin?.graphNodeIds?.some((id) =>
          part.origin?.graphNodeIds?.includes(id),
        ),
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(firstStableSlideRelationships).toBeDefined();
    expect(secondStableSlideRelationships).toBeDefined();
    expect(secondEditedSlide).not.toBe(firstEditedSlide);
    expect(secondStableSlide).toBe(firstStableSlide);
    expect(secondStableSlideRelationships).toBe(firstStableSlideRelationships);
  });

  test("Incremental projection recomputes a slide when deck layout changes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();

    deck.slide({ name: "Layout sensitive" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>
        unchanged graph
      </p>
    ));

    const first = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const firstSlide = first.projection?.slides[0];

    artifacts.invalidateForSourceChange({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    const second = await H.projectSource({
      source: deck,
      options: { ...deck.options, layout: { width: 12, height: 6.75, unit: "in" } },
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const secondSlide = second.projection?.slides[0];

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(firstSlide).toBeDefined();
    expect(secondSlide).toBeDefined();
    expect(secondSlide).not.toBe(firstSlide);
  });

  test("Incremental projection reuses unchanged slide media package parts from the stale projection", async () => {
    let editedText = "before";
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();

    deck.slide({ name: "Edited" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>{editedText}</p>
    ));
    deck.slide({ name: "Stable media" }, () => (
      <img
        data={H.SAMPLE_SVG_DATA_URI}
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const first = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const firstStableMedia = first.projection?.parts.find((part) => part.kind === "media");

    editedText = "after";
    artifacts.invalidateForSourceChange({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    const second = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const secondStableMedia = second.projection?.parts.find(
      (part) => part.id === firstStableMedia?.id,
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(firstStableMedia).toBeDefined();
    expect(secondStableMedia).toBe(firstStableMedia);
  });

  test("Incremental projection keeps media reuse scoped to unchanged slide units", async () => {
    let editedText = "before";
    const stableImage =
      "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%2300ff00%22%2F%3E%3C%2Fsvg%3E";
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();

    deck.slide({ name: "Edited media" }, () => (
      <>
        <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>{editedText}</p>
        <img
          data={H.SAMPLE_SVG_DATA_URI}
          style={{ position: "absolute", left: 1, top: 2, width: 1, height: 1 }}
        />
      </>
    ));
    deck.slide({ name: "Stable media" }, () => (
      <img
        data={stableImage}
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const first = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const firstEditedMedia = first.projection?.parts.find(
      (part) => part.kind === "media" && part.path === "ppt/media/media1.svg",
    );
    const firstStableMedia = first.projection?.parts.find(
      (part) => part.kind === "media" && part.path === "ppt/media/media2.svg",
    );

    editedText = "after";
    artifacts.invalidateForSourceChange({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    const second = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const secondEditedMedia = second.projection?.parts.find(
      (part) => part.id === firstEditedMedia?.id,
    );
    const secondStableMedia = second.projection?.parts.find(
      (part) => part.id === firstStableMedia?.id,
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(firstEditedMedia).toBeDefined();
    expect(firstStableMedia).toBeDefined();
    expect(secondEditedMedia).not.toBe(firstEditedMedia);
    expect(secondStableMedia).toBe(firstStableMedia);
  });

  test("Incremental render reports reused patch plan parts for unchanged slide projection units", async () => {
    let editedText = "before";
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();

    deck.slide({ name: "Edited" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>{editedText}</p>
    ));
    deck.slide({ name: "Stable" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 3, height: 0.5 }}>unchanged</p>
    ));

    const firstProject = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const firstRender = await H.renderPptxPackage(
      firstProject.projection!,
      { inspection: "none" },
      {
        pptxBuildArtifactsByPartId: artifacts.pptxBuildArtifactsByPartId,
      },
    );
    artifacts.materializePptxBuildArtifacts(firstRender.buildArtifacts ?? []);
    const firstStableSlide = firstProject.projection?.slides.find(
      (slide) => slide.payload.name === "Stable",
    );
    const firstStableSlideRelationships = firstProject.projection?.parts.find(
      (part) =>
        part.kind === "relationships" &&
        firstStableSlide?.origin?.graphNodeIds?.some((id) =>
          part.origin?.graphNodeIds?.includes(id),
        ),
    );

    editedText = "after";
    artifacts.invalidateForSourceChange({
      changedSourceIds: ["/project/src/deck.tsx"],
    });
    const secondProject = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "none" },
      artifacts,
    });
    const secondRender = await H.renderPptxPackage(
      secondProject.projection!,
      { inspection: "none" },
      {
        pptxBuildArtifactsByPartId: artifacts.pptxBuildArtifactsByPartId,
      },
    );
    const secondStableSlide = secondProject.projection?.slides.find(
      (slide) => slide.payload.name === "Stable",
    );
    const secondStableSlideRelationships = secondProject.projection?.parts.find(
      (part) =>
        part.kind === "relationships" &&
        secondStableSlide?.origin?.graphNodeIds?.some((id) =>
          part.origin?.graphNodeIds?.includes(id),
        ),
    );
    const stableSlidePatchPart = secondRender.patchPlan?.parts.find(
      (part) => part.packagePartId === firstStableSlide?.id,
    );
    const stableRelationshipsPatchPart = secondRender.patchPlan?.parts.find(
      (part) => part.packagePartId === firstStableSlideRelationships?.id,
    );
    const stableSlideAssemblyEntry = secondRender.summary?.assembly?.entries.find(
      (entry) => entry.path === firstStableSlide?.path,
    );
    const stableRelationshipsAssemblyEntry = secondRender.summary?.assembly?.entries.find(
      (entry) => entry.path === firstStableSlideRelationships?.path,
    );

    expect(firstProject.ok).toBe(true);
    expect(firstRender.artifact).toBeDefined();
    expect(secondProject.ok).toBe(true);
    expect(secondRender.artifact).toBeDefined();
    expect(secondStableSlide).toBe(firstStableSlide);
    expect(secondStableSlideRelationships).toBe(firstStableSlideRelationships);
    expect(stableSlidePatchPart).toEqual(
      expect.objectContaining({
        buildStatus: "reused",
        buildReason: "buildArtifactFingerprintMatched",
      }),
    );
    expect(stableRelationshipsPatchPart).toEqual(
      expect.objectContaining({
        buildStatus: "reused",
        buildReason: "buildArtifactFingerprintMatched",
      }),
    );
    expect(stableSlideAssemblyEntry).toEqual(
      expect.objectContaining({
        status: "reused",
        reason: "buildArtifactFingerprintMatched",
      }),
    );
    expect(stableRelationshipsAssemblyEntry).toEqual(
      expect.objectContaining({
        status: "reused",
        reason: "buildArtifactFingerprintMatched",
      }),
    );
  });

  test("stage artifacts keep mounted source and package part indexes", async () => {
    const parent = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const child = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();

    parent.slide({ name: "Root" }, () => <></>);
    child.slide({ name: "Child" }, () => (
      <>
        <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>
          Mounted source
        </p>
      </>
    ));
    parent.mount("child", child);

    const compile = H.compileSource(parent, artifacts);
    const project = await H.projectSource({
      source: parent,
      options: parent.options,
      definedGraph: artifacts.graph,
      artifacts,
    });

    expect(compile.ok).toBe(true);
    expect(artifacts.sourcesByKey.get("deck:root")?.rootCount).toBe(1);
    expect(artifacts.sourcesByKey.get("child")?.rootCount).toBe(1);
    expect(artifacts.graphsBySourceKey.get("deck:root")?.graphNodeIds.length).toBeGreaterThan(0);
    expect(artifacts.graphsBySourceKey.get("child")?.graphNodeIds.length).toBeGreaterThan(0);
    expect(artifacts.graphsBySourceKey.get("child")?.graphSlice.nodes.size).toBe(
      artifacts.graphsBySourceKey.get("child")?.graphNodeIds.length,
    );
    expect(
      [...(artifacts.graphsBySourceKey.get("child")?.graphSlice.nodes.values() ?? [])].every(
        (node) => node.origin.source?.kind === "mounted",
      ),
    ).toBe(true);
    expect(project.ok).toBe(true);
    expect(artifacts.projection?.partsBySourceKey.get("child")?.length).toBeGreaterThan(0);
  });

  test("root Deck projection does not reuse stale artifacts after a mounted child Deck changes", async () => {
    const parent = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const child = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    child.slide(() => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>before</p>
    ));
    parent.mount("child", child);

    const before = await parent.project();
    expect(before.projection?.slides).toHaveLength(1);
    expect(before.projection?.slides[0]?.payload.drawing.children[0]).toMatchObject({
      kind: "text",
      content: { text: "before" },
    });

    child.slide(() => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>after</p>
    ));

    const after = await parent.project();
    expect(after.projection?.slides).toHaveLength(2);
    expect(
      after.projection?.slides.map((slide) =>
        slide.payload.drawing.children[0]?.kind === "text"
          ? slide.payload.drawing.children[0].content.text
          : "",
      ),
    ).toEqual(["before", "after"]);
  });

  test("root Deck projection does not reuse stale artifacts after a mounted BoundSource Deck changes", async () => {
    const parent = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const child = new H.Deck<{ label: string }>({
      layout: { width: 10, height: 5.625, unit: "in" },
    });

    child.slide(({ context }) => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>
        {context.label}:before
      </p>
    ));
    parent.mount("child", child.withSource({ label: "bound" }));

    const before = await parent.project();
    expect(before.projection?.slides).toHaveLength(1);

    child.slide(({ context }) => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 4, height: 0.5 }}>
        {context.label}:after
      </p>
    ));

    const after = await parent.project();
    expect(after.projection?.slides).toHaveLength(2);
    expect(
      after.projection?.slides.map((slide) =>
        slide.payload.drawing.children[0]?.kind === "text"
          ? slide.payload.drawing.children[0].content.text
          : "",
      ),
    ).toEqual(["bound:before", "bound:after"]);
  });

  test("projection artifacts expose package dependency snapshots", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new H.PipelineArtifactCollection();
    deck.slide({ name: "Package dependencies" }, () => (
      <img
        data={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
        style={{ position: "absolute", left: 1, top: 1, width: 2, height: 1, objectFit: "fill" }}
      />
    ));

    const project = await H.projectSource({
      source: deck,
      options: deck.options,
      projectOptions: { inspection: "details" },
      artifacts,
    });
    const slide = project.projection?.slides[0];
    const contentTypes = project.projection?.parts.find(
      (part) => part.path === "[Content_Types].xml",
    );
    const presentation = project.projection?.parts.find((part) => part.kind === "presentation");
    const presentationRels = project.projection?.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    );
    const slideRels = project.projection?.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    );
    const mediaPart = project.projection?.parts.find((part) => part.kind === "media");
    const dependencyDetails = project.summary?.details?.packageDependencyInvalidation.entries ?? [];
    const detailEntryFor = (id: H.PackagePartId | undefined) =>
      dependencyDetails.find((entry) => entry.partId === id);

    expect(project.ok).toBe(true);
    expect(slide).toBeDefined();
    expect(contentTypes).toBeDefined();
    expect(presentation).toBeDefined();
    expect(presentationRels).toBeDefined();
    expect(slideRels).toBeDefined();
    expect(mediaPart).toBeDefined();
    expect(
      artifacts.projection?.packageDependencies.dependenciesByPartId.get(presentationRels!.id),
    ).toContain(slide!.id);
    expect(artifacts.projection?.packageDependencies.dependentsByPartId.get(slide!.id)).toContain(
      presentationRels!.id,
    );
    expect(
      artifacts.projection?.packageDependencies.dependenciesByPartId.get(contentTypes!.id),
    ).toContain(slide!.id);
    expect(artifacts.projection?.packageDependencies.dependentsByPartId.get(slide!.id)).toContain(
      contentTypes!.id,
    );
    expect(
      artifacts.projection?.packageDependencies.dependenciesByPartId.get(presentation!.id),
    ).toContain(presentationRels!.id);
    expect(
      artifacts.projection?.packageDependencies.dependentsByPartId.get(presentationRels!.id),
    ).toContain(presentation!.id);
    expect(
      artifacts.projection?.packageDependencies.dependenciesByPartId.get(slideRels!.id),
    ).toContain(mediaPart!.id);
    expect(
      artifacts.projection?.packageDependencies.dependentsByPartId.get(mediaPart!.id),
    ).toContain(slideRels!.id);
    expect(
      artifacts.projection?.packageDependencies.dependenciesByPartId.get(mediaPart!.id),
    ).toContain(slideRels!.id);
    expect(
      artifacts.projection?.packageDependencies.dependentsByPartId.get(slideRels!.id),
    ).toContain(mediaPart!.id);
    expect(artifacts.projection?.packageDependencies.edges).toContainEqual(
      expect.objectContaining({
        ownerPartId: presentationRels!.id,
        targetPartId: slide!.id,
        reason: "relationshipTarget",
        relationshipType: "slide",
      }),
    );
    expect(artifacts.projection?.packageDependencies.edges).toContainEqual(
      expect.objectContaining({
        ownerPartId: contentTypes!.id,
        targetPartId: slide!.id,
        reason: "contentTypeOverride",
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
      }),
    );
    expect(artifacts.projection?.packageDependencies.edges).toContainEqual(
      expect.objectContaining({
        ownerPartId: presentation!.id,
        targetPartId: presentationRels!.id,
        reason: "dependencyFingerprint",
        fingerprint: expect.stringMatching(/^fnv1a32:/),
      }),
    );
    expect(artifacts.projection?.packageDependencies.edges).toContainEqual(
      expect.objectContaining({
        ownerPartId: mediaPart!.id,
        targetPartId: slideRels!.id,
        reason: "requirementDependency",
        requirementStatus: "conditional",
        requirementCondition: "referencedByRelationship",
      }),
    );
    expect(artifacts.projection?.packageDependencies.edges).toEqual(
      project.summary?.packageDependencies,
    );
    expect(dependencyDetails.length).toBe(project.projection?.parts.length);
    expect(detailEntryFor(presentation!.id)).toEqual(
      expect.objectContaining({
        path: "ppt/presentation.xml",
        kind: "presentation",
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            ownerPartId: presentation!.id,
            targetPartId: presentationRels!.id,
            reason: "dependencyFingerprint",
          }),
        ]),
        dependencyReasons: expect.arrayContaining(["dependencyFingerprint"]),
      }),
    );
    expect(detailEntryFor(slideRels!.id)).toEqual(
      expect.objectContaining({
        path: "ppt/slides/_rels/slide1.xml.rels",
        kind: "relationships",
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            ownerPartId: slideRels!.id,
            targetPartId: mediaPart!.id,
            reason: "relationshipTarget",
          }),
        ]),
        dependents: expect.arrayContaining([
          expect.objectContaining({
            ownerPartId: mediaPart!.id,
            targetPartId: slideRels!.id,
            reason: "requirementDependency",
          }),
        ]),
        dependencyReasons: expect.arrayContaining(["relationshipTarget"]),
        dependentReasons: expect.arrayContaining(["requirementDependency"]),
      }),
    );
    expect(detailEntryFor(slide!.id)).toEqual(
      expect.objectContaining({
        path: "ppt/slides/slide1.xml",
        kind: "slide",
        dependents: expect.arrayContaining([
          expect.objectContaining({
            ownerPartId: contentTypes!.id,
            targetPartId: slide!.id,
            reason: "contentTypeOverride",
          }),
          expect.objectContaining({
            ownerPartId: presentationRels!.id,
            targetPartId: slide!.id,
            reason: "relationshipTarget",
          }),
        ]),
        dependentReasons: expect.arrayContaining(["contentTypeOverride", "relationshipTarget"]),
      }),
    );
  });
});

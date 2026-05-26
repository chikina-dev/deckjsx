import { describe, expect, test } from "vite-plus/test";
import { pptxgenjs, type WriterAdapter } from "../src/adapter.ts";
import { createDiagnostics } from "../src/diagnostics/index.ts";
import { Deck, Image, StyleSheet, Text, View } from "../src/index.ts";
import { PipelineArtifactCollection } from "../src/pipeline-artifacts.ts";
import { compileSource, projectSource } from "../src/pipeline-runner.ts";
import type { GraphNodeId, PptxPackageModel, SemanticAuthorGraph } from "../src/inspect.ts";

function textNodeIdByText(graph: SemanticAuthorGraph, text: string): GraphNodeId | undefined {
  for (const node of graph.nodes.values()) {
    if (node.kind !== "text") {
      continue;
    }

    const nodeText = node.inlineChildren
      .map((childId) => graph.nodes.get(childId))
      .filter((child) => child?.kind === "textRun")
      .map((child) => child.text)
      .join("");

    if (nodeText === text) {
      return node.id;
    }
  }

  return undefined;
}

describe("project/render pipeline", () => {
  test("compile, project, and render return result-first stage shapes", async () => {
    const deck = new Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      output: { format: "pptx" },
    });

    deck.slide({ name: "Pipeline" }, () => (
      <>
        <View style={{ x: 1, y: 1, width: 4, height: 2 }}>
          <Text style={{ width: "100%", height: 0.5, fontSize: 24 }}>Hello pipeline</Text>
        </View>
      </>
    ));

    const compile = deck.compile();
    expect(compile.ok).toBe(true);
    expect(compile.graph).toBeDefined();
    expect(compile.stages.compile.artifact).toBe("available");

    const project = deck.project();
    expect(project.ok).toBe(true);
    expect(project.format).toBe("pptx");
    expect(project.projection?.format).toBe("pptx");
    expect(project.summary?.pptx.packageParts.length).toBeGreaterThan(0);
    expect(project.stages.compile.artifact).toBe("available");
    expect(project.stages.project.artifact).toBe("available");

    const parts = project.projection?.parts ?? [];
    expect(parts.some((part) => part.path === "[Content_Types].xml")).toBe(true);
    expect(parts.some((part) => part.path === "ppt/presentation.xml")).toBe(true);
    expect(parts.some((part) => part.path === "ppt/slides/slide1.xml")).toBe(true);
    expect(new Set(parts.map((part) => part.category))).toEqual(
      new Set(["authored-content", "manifest", "support"]),
    );

    const firstElement = project.projection?.slides[0]?.payload.elements[0];
    const firstSlide = project.projection?.slides[0];
    expect(firstSlide?.id).not.toBe(firstSlide?.path);
    expect(firstElement?.id).not.toContain("ppt/slides/slide1");
    expect(firstElement?.serialized.shapeObjectId).toBe("1");
    expect(firstElement?.measurement?.frame).toEqual(firstElement?.frame);

    const render = await deck.render();
    expect(render.ok).toBe(true);
    expect(render.artifact?.format).toBe("pptx");
    expect(render.artifact?.mediaType).toContain("presentationml.presentation");
    expect(render.artifact?.extension).toBe("pptx");
    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
    expect(render.stages.render.artifact).toBe("available");
  });

  test("explicit pptxgenjs adapter renders the current projection", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Adapter" }, () => <></>);

    const result = await deck.render(pptxgenjs());

    expect(result.ok).toBe(true);
    expect(result.artifact?.format).toBe("pptx");
  });

  test("defineProjection supplies the next project/render source", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Original" }, () => <></>);

    const projection = deck.project().projection!;
    const renamedProjection = {
      ...projection,
      slides: projection.slides.map((slide) => ({
        ...slide,
        payload: {
          ...slide.payload,
          name: "Defined projection",
        },
      })),
    };

    deck.defineProjection(renamedProjection);

    const project = deck.project();
    expect(project.projection?.slides[0]?.payload.name).toBe("Defined projection");
    expect(project.stages.project.artifact).toBe("available");
  });

  test("defineGraph supplies a graph-resolved package skeleton", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Graph source" }, () => <></>);

    const graph = deck.compile().graph!;
    deck.defineGraph(graph);

    const project = deck.project();
    expect(project.ok).toBe(true);
    expect(project.projection?.slides).toHaveLength(1);
    expect(project.projection?.parts.some((part) => part.path === "ppt/slides/slide1.xml")).toBe(
      true,
    );
  });

  test("projected package identities remain distinct from package paths", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Identity" }, () => (
      <>
        <Text>Stable</Text>
      </>
    ));

    const project = deck.project();
    const slide = project.projection?.slides[0];
    const text = slide?.payload.elements[0];

    expect(project.ok).toBe(true);
    expect(slide?.id).toMatch(/^pptx:slide:/);
    expect(slide?.id).not.toBe(slide?.path);
    expect(text?.id).toMatch(/^pptx:slide:.*:element:graph%3A/);
    expect(text?.id).not.toContain("slide1.xml");
  });

  test("projected media parts are connected through slide relationships", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Media" }, () => (
      <>
        <Image
          data="data:image/png;base64,iVBORw0KGgo="
          style={{ x: 1, y: 1, width: 2, height: 1 }}
        />
      </>
    ));

    const project = deck.project();
    const slide = project.projection?.slides[0];
    const image = slide?.payload.elements[0];
    const mediaRelationship = slide?.relationships?.find(
      (relationship) => relationship.type === "image",
    );

    expect(project.ok).toBe(true);
    expect(image?.kind).toBe("image");
    expect(image?.kind === "image" ? image.mediaPartId : undefined).toBeDefined();
    expect(mediaRelationship?.targetPartId).toBe(
      image?.kind === "image" ? image.mediaPartId : undefined,
    );
    expect(mediaRelationship?.id).toBe(image?.serialized.relationshipId);
    expect(
      project.projection?.parts.some(
        (part) => part.kind === "media" && part.id === mediaRelationship?.targetPartId,
      ),
    ).toBe(true);
    expect(project.summary?.pptx.relationshipCount).toBeGreaterThan(1);
    expect(project.summary?.media[0]?.partId).toBe(mediaRelationship?.targetPartId);
  });

  test("projected package manifest carries content types and root relationships", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Manifest" }, () => <></>);

    const project = deck.project();
    const parts = project.projection?.parts ?? [];
    const contentTypes = parts.find((part) => part.kind === "content-types");
    const rootRelationships = parts.find((part) => part.path === "_rels/.rels");
    const presentationRelationships = parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    );
    const slide = project.projection?.slides[0];

    expect(project.ok).toBe(true);
    expect(contentTypes?.payload).toEqual(
      expect.objectContaining({
        defaults: expect.arrayContaining([expect.objectContaining({ extension: "rels" })]),
        overrides: expect.arrayContaining([
          expect.objectContaining({ partName: "/ppt/presentation.xml" }),
          expect.objectContaining({ partName: "/ppt/slides/slide1.xml" }),
        ]),
      }),
    );
    expect(rootRelationships?.relationships).toContainEqual(
      expect.objectContaining({
        targetPath: "ppt/presentation.xml",
        type: "officeDocument",
      }),
    );
    expect(presentationRelationships?.relationships).toContainEqual(
      expect.objectContaining({
        targetPartId: slide?.id,
        type: "slide",
      }),
    );
    expect(parts.find((part) => part.kind === "presentation")?.payload).toEqual(
      expect.objectContaining({
        kind: "presentation",
        slidePartIds: expect.arrayContaining([slide?.id]),
      }),
    );
    expect(parts.find((part) => part.kind === "theme")?.payload).toEqual(
      expect.objectContaining({ kind: "theme", status: "placeholder", editable: true }),
    );
    expect(project.summary?.parts.find((part) => part.kind === "content-types")).toEqual(
      expect.objectContaining({ contentTypeCount: expect.any(Number) }),
    );
    expect(project.summary?.parts.find((part) => part.path === "_rels/.rels")).toEqual(
      expect.objectContaining({ relationshipCount: 2 }),
    );
  });

  test("defineGraph keeps the source stylesheet context for projection", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.useStyles(
      new StyleSheet({
        classes: {
          title: { target: "p.title", style: { color: "red", fontSize: 28 } },
        },
      }),
    );
    deck.slide({ name: "Styled graph" }, () => (
      <>
        <p className="title">Styled title</p>
      </>
    ));

    const graph = deck.compile().graph!;
    deck.defineGraph(graph);

    const project = deck.project();
    const text = project.projection?.slides[0]?.payload.elements[0];

    expect(project.ok).toBe(true);
    expect(text?.kind).toBe("text");
    expect(text?.kind === "text" ? text.style.color : undefined).toBe("FF0000");
    expect(text?.kind === "text" ? text.style.fontSizePt : undefined).toBe(28);
  });

  test("defineProjection reports lightweight shape diagnostics", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Projection shape" }, () => <></>);

    const projection = deck.project().projection!;
    deck.defineProjection({ ...projection, version: "0.5" as never });

    const project = deck.project();

    expect(project.ok).toBe(false);
    expect(project.projection).toBeDefined();
    expect(project.stages.project.artifact).toBe("partial");
    expect(project.summary?.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_VERSION" }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_VERSION" }),
    );
  });

  test("defineProjection keeps invalid projection shapes as diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid projection shape" }, () => <></>);

    deck.defineProjection({
      version: "0.6",
      format: "pptx",
      size: { widthEmu: 1, heightEmu: 1 },
      parts: undefined,
      slides: undefined,
    } as unknown as PptxPackageModel);

    const project = deck.project();
    const render = deck.render();

    expect(project.ok).toBe(false);
    expect(project.projection).toBeDefined();
    expect(project.summary).toBeUndefined();
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_PARTS" }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_DEFINE_PROJECTION_SLIDES" }),
    );
    const renderResult = await render;
    expect(renderResult.ok).toBe(false);
    expect(renderResult.artifact).toBeUndefined();
  });

  test("project validates defined projection package consistency before render", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken package" }, () => <></>);

    const projection = deck.project().projection!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.filter((part) => part.path !== "ppt/presentation.xml"),
    });

    const project = deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.projection).toBeDefined();
    expect(project.stages.project.artifact).toBe("partial");
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_MISSING_REQUIRED_PART" }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_BROKEN_RELATIONSHIP" }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates duplicate package paths and relationship target path mismatches", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken package paths" }, () => <></>);

    const projection = deck.project().projection!;
    const firstPart = projection.parts[0]!;
    const rootRelationships = projection.parts.find((part) => part.path === "_rels/.rels")!;
    deck.defineProjection({
      ...projection,
      parts: [
        ...projection.parts.map((part) =>
          part.id === rootRelationships.id
            ? {
                ...part,
                relationships: part.relationships?.map((relationship, index) =>
                  index === 0
                    ? { ...relationship, targetPath: "ppt/incorrect-presentation.xml" }
                    : relationship,
                ),
              }
            : part,
        ),
        { ...firstPart, id: `${firstPart.id}:duplicate-path` as never },
      ],
    });

    const project = deck.project();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_DUPLICATE_PART_PATH" }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_RELATIONSHIP_TARGET_PATH_MISMATCH" }),
    );
  });

  test("project summary exposes default adapter limitations", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Adapter limitations" }, () => <></>);

    const project = deck.project();

    expect(project.ok).toBe(true);
    expect(project.summary?.adapterLimitations).toContainEqual(
      expect.objectContaining({
        adapter: "pptxgenjs",
        code: "W_PPTXGENJS_TEMPORARY_ADAPTER",
      }),
    );
  });

  test("pipeline artifact collection keeps keyed snapshots behind whole-artifact defines", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Artifacts" }, () => <></>);
    const graph = deck.compile().graph!;
    const projection = deck.project().projection!;
    const artifacts = new PipelineArtifactCollection();

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

  test("stage operations materialize source graph and package part snapshots", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Materialized" }, () => <></>);
    const artifacts = new PipelineArtifactCollection();

    const compile = compileSource(deck, artifacts);
    const project = projectSource({
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

  test("stage artifacts keep mounted source and package part indexes", () => {
    const parent = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const child = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new PipelineArtifactCollection();

    parent.slide({ name: "Root" }, () => <></>);
    child.slide({ name: "Child" }, () => (
      <>
        <Text>Mounted source</Text>
      </>
    ));
    parent.mount("child", child);

    const compile = compileSource(parent, artifacts);
    const project = projectSource({
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

  test("projection artifacts expose package dependency snapshots", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    const artifacts = new PipelineArtifactCollection();
    deck.slide({ name: "Package dependencies" }, () => <></>);

    const project = projectSource({
      source: deck,
      options: deck.options,
      artifacts,
    });
    const slide = project.projection?.slides[0];
    const contentTypes = project.projection?.parts.find(
      (part) => part.path === "[Content_Types].xml",
    );
    const presentationRels = project.projection?.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    );

    expect(project.ok).toBe(true);
    expect(slide).toBeDefined();
    expect(contentTypes).toBeDefined();
    expect(presentationRels).toBeDefined();
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
  });

  test("explicit writer adapter format mismatches are warnings", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Adapter mismatch" }, () => <></>);
    const adapter: WriterAdapter<PptxPackageModel, "pdf"> = {
      kind: "deckjsx.writerAdapter",
      name: "fake-pdf",
      projectionFormat: "pptx",
      format: "pdf",
      options: {},
      async render() {
        return {
          diagnostics: createDiagnostics(),
          artifact: {
            format: "pdf",
            mediaType: "application/pdf",
            extension: "pdf",
            bytes: new Uint8Array([1, 2, 3]),
          },
        };
      },
    };

    const result = await deck.render(adapter);

    expect(result.ok).toBe(true);
    expect(result.artifact?.extension).toBe("pdf");
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "W_RENDER_ADAPTER_FORMAT_MISMATCH", severity: "warning" }),
    );
  });

  test("adapter-like invalid writer values are render-blocking errors", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid adapter" }, () => <></>);
    const invalidAdapter = {
      kind: "deckjsx.writerAdapter",
      name: "missing-projection-format",
      format: "pptx",
      options: {},
      async render() {
        throw new Error("invalid adapter should not render");
      },
    } as unknown as WriterAdapter<PptxPackageModel>;

    const result = await deck.render(invalidAdapter);

    expect(result.ok).toBe(false);
    expect(result.artifact).toBeUndefined();
    expect(result.stages.compile.artifact).toBe("missing");
    expect(result.stages.project.artifact).toBe("missing");
    expect(result.stages.render.artifact).toBe("missing");
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_INVALID_WRITER_ADAPTER",
        severity: "error",
      }),
    );
  });

  test("render blocks artifacts when project has error diagnostics", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid" }, () => (
      <>
        <View style={{ x: "1qu" as never, y: 1, width: 2, height: 1 }} />
      </>
    ));

    const project = deck.project();
    expect(project.ok).toBe(false);
    expect(project.projection).toBeDefined();
    expect(project.stages.project.artifact).toBe("partial");

    const render = await deck.render();
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
    expect(render.stages.render.artifact).toBe("missing");
  });

  test("partial projection keeps computable elements for inspection", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Partially invalid" }, () => (
      <>
        <Text style={{ x: 1, y: 1, width: 2, height: 1 }}>Kept</Text>
        <View style={{ x: "1qu" as never, y: 1, width: 2, height: 1 }} />
      </>
    ));

    const project = deck.project();

    expect(project.ok).toBe(false);
    expect(project.stages.project.artifact).toBe("partial");
    expect(project.projection?.slides[0]?.payload.elements).toHaveLength(1);
    expect(project.summary?.slides[0]?.elements[0]?.textPreview).toBe("Kept");
    expect(project.summary?.slides[0]?.elements[0]?.resolvedValues?.frame).toBeDefined();
  });

  test("projected element origins survive layout filtering and paint ordering", () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Origin stability" }, () => (
      <>
        <Text style={{ display: "none", x: 1, y: 1, width: 2, height: 1 }}>Hidden</Text>
        <Text style={{ zIndex: 10, x: 1, y: 1, width: 2, height: 1 }}>First</Text>
        <Text style={{ zIndex: 0, x: 1, y: 2, width: 2, height: 1 }}>Second</Text>
      </>
    ));

    const compile = deck.compile();
    const hiddenId = textNodeIdByText(compile.graph!, "Hidden");
    const firstId = textNodeIdByText(compile.graph!, "First");
    const secondId = textNodeIdByText(compile.graph!, "Second");
    const project = deck.project();
    const elements = project.projection?.slides[0]?.payload.elements ?? [];

    expect(project.ok).toBe(true);
    expect(
      elements.map((element) => (element.kind === "text" ? element.content.text : "")),
    ).toEqual(["Second", "First"]);
    expect(elements[0]?.origin.graphNodeIds).toContain(secondId);
    expect(elements[0]?.origin.graphNodeIds).not.toContain(firstId);
    expect(elements[0]?.origin.graphNodeIds).not.toContain(hiddenId);
    expect(elements[1]?.origin.graphNodeIds).toContain(firstId);
  });
});

import { describe, expect, test } from "vite-plus/test";
import * as H from "../../helpers.tsx";

describe("project/render validation package model indexes", () => {
  test("project validates duplicate package paths and relationship target path mismatches", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken package paths" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const firstPart = projection.parts[0]!;
    const rootRelationships = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    deck.defineProjection({
      ...projection,
      parts: [
        ...projection.parts.map((part) =>
          part.id === rootRelationships.id
            ? {
                ...part,
                relationships: (
                  part.relationships ??
                  (part.payload as H.PptxRelationshipsPayload | undefined)?.relationships ??
                  []
                ).map((relationship, index) =>
                  index === 0
                    ? { ...relationship, targetPath: "ppt/incorrect-presentation.xml" }
                    : relationship,
                ),
                payload: {
                  relationships: (
                    (part.payload as H.PptxRelationshipsPayload | undefined)?.relationships ??
                    part.relationships ??
                    []
                  ).map((relationship, index) =>
                    index === 0
                      ? { ...relationship, targetPath: "ppt/incorrect-presentation.xml" }
                      : relationship,
                  ),
                } satisfies H.PptxRelationshipsPayload,
              }
            : part,
        ),
        { ...firstPart, id: `${firstPart.id}:duplicate-path` as never },
      ],
    });

    const project = await deck.project();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_DUPLICATE_PART_PATH" }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({ code: "E_PPTX_PACKAGE_RELATIONSHIP_TARGET_PATH_MISMATCH" }),
    );
  });

  test("project validates package model size and slides index before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken package model" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Package model</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    deck.defineProjection({
      ...projection,
      size: { widthEmu: Number.NaN, heightEmu: -1 },
      slides: [
        {
          ...slidePart,
          path: "ppt/slides/not-slide1.xml",
          fingerprint: "test:stale-slide-index",
          payload: { ...slidePart.payload, name: "Slides index only edit" },
        },
      ],
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MODEL_SIZE",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: "projection.size.widthEmu" }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MODEL_SIZE",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: "projection.size.heightEmu" }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDES_INDEX",
          labels: expect.arrayContaining([
            expect.objectContaining({ path: "projection.slides.0" }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project rejects duplicate package model slide index entries before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate slide index" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Slide index</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    deck.defineProjection({ ...projection, slides: [slidePart, slidePart] });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SLIDES_INDEX",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: "projection.slides.1.id",
            message: expect.stringContaining("duplicate slide part"),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

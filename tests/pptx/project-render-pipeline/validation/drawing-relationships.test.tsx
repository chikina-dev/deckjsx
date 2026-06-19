import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation drawing relationships", () => {
  test("project validates relationship types are known tokens or relationship URIs", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid relationship type" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const payload = rootRelationships.payload;
    const relationships = [
      ...(payload.relationships ?? []),
      {
        id: "rIdInvalidType" as H.PptxRelationship["id"],
        type: "not a relationship uri",
        target: "https://example.test/target",
        targetMode: "external",
        targetPath: "https://example.test/target",
      },
    ] satisfies H.PptxRelationshipsPayload["relationships"];
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationships.id
            ? {
                ...part,
                relationships,
                payload: { relationships } satisfies H.PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".payload.relationships"),
              message: "invalid relationship type",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships"),
              message: "invalid relationship type",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates relationships part owners before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Orphan relationships" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const orphanRelationshipsPath = "ppt/orphan/_rels/missing.xml.rels";
    const orphanRelationshipsPart = {
      id: "pptx:test:orphan-relationships" as H.PackagePartId,
      category: "manifest",
      kind: "relationships",
      path: orphanRelationshipsPath,
      orderKey: {
        group: "other",
        groupOrder: 999,
        sequence: 999,
        path: orphanRelationshipsPath,
        value: `999:000999:${orphanRelationshipsPath}`,
      },
      fingerprint: "test:orphan-relationships",
      requirement: {
        status: "optional",
        required: false,
        reason: "orphan relationship part topology test",
      },
      payload: { relationships: [] } satisfies H.PptxRelationshipsPayload,
    } satisfies H.PptxPackageModel["parts"][number];
    deck.defineProjection({ ...projection, parts: [...projection.parts, orphanRelationshipsPart] });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_ORPHAN_RELATIONSHIPS_PART",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${orphanRelationshipsPart.id}.path`,
            message: "missing relationship owner ppt/orphan/missing.xml",
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates image drawing relationships before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken image relationships" }, () => (
      <>
        <img
          data={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 1, height: 1, objectFit: "stretch" }}
        />
        <img
          data={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
          style={{ x: 2, y: 1, width: 1, height: 1 }}
        />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element, index) => {
            if (element.kind !== "image") {
              return element;
            }
            if (index === 0) {
              return {
                ...element,
                serialized: { ...element.serialized, relationshipId: "rIdMissing" },
              };
            }
            return { ...element, mediaPartId: slidePart.id };
          }),
        },
      },
    } as H.PptxSlidePart;

    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.0.serialized.relationshipId"),
              message: "missing image relationship rIdMissing",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.1.mediaPartId"),
              message: expect.stringContaining("does not match relationship"),
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.1.mediaPartId"),
              message: "image media part id targets slide",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates background image relationships before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken background image relationship" }, () => (
      <div
        style={{
          x: 1,
          y: 1,
          width: 2,
          height: 1,
          background: "url(data:image/png;base64,iVBORw0KGgo=)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 100%",
        }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const malformedSlide = {
      ...slidePart,
      relationships: slidePart.relationships?.filter(
        (relationship) => relationship.type !== "image",
      ),
    } satisfies H.PptxSlidePart;

    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".backgroundLayers.0.source"),
            message: expect.stringContaining("missing background image relationship"),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates drawing hyperlink relationships before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken hyperlink relationships" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5, href: "https://example.test/one" }}>One</p>
        <p style={{ x: 1, y: 2, width: 2, height: 0.5, href: "https://example.test/two" }}>Two</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const second = slidePart.payload.drawing.children[1];
    const secondRelationshipId =
      second?.kind === "text" ? second.serialized.hyperlinkRelationshipId : undefined;
    const malformedSlide = {
      ...slidePart,
      relationships: slidePart.relationships?.map((relationship) =>
        relationship.id === secondRelationshipId
          ? { ...relationship, targetPath: "https://example.test/wrong" }
          : relationship,
      ),
      payload: {
        ...slidePart.payload,
        drawing: {
          ...slidePart.payload.drawing,
          children: slidePart.payload.drawing.children.map((element, index) => {
            if (element.kind !== "text" || index !== 0) {
              return element;
            }
            return {
              ...element,
              serialized: { ...element.serialized, hyperlinkRelationshipId: "rIdMissing" },
            };
          }),
        },
      },
    } as H.PptxSlidePart;

    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? malformedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(
                ".drawing.children.0.serialized.hyperlinkRelationshipId",
              ),
              message: "missing hyperlink relationship rIdMissing",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_SLIDE_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".drawing.children.1.hyperlink.url"),
              message: expect.stringContaining("does not match relationship"),
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

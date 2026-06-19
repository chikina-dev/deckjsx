import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation package topology relationships", () => {
  test("project validates video poster image relationships before render", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Broken video poster relationship" }, () => (
      <>
        <video
          data={H.dataUriFromBytes("video/mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))}
          posterData={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
          style={{ x: 1, y: 1, width: 4, height: 2.25 }}
        />
      </>
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
            path: expect.stringContaining(".drawing.children.0.posterMediaPartId"),
            message: expect.stringContaining("missing video poster image relationship"),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates support XML relationship ids required from relationship payloads", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing support relationship" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const presentationRelationships = projection.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    )!;
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.id === presentationRelationships.id
          ? {
              ...part,
              payload: {
                relationships: (
                  (part.payload as H.PptxRelationshipsPayload | undefined)?.relationships ?? []
                ).filter((relationship) => relationship.type !== "slideMaster"),
              } satisfies H.PptxRelationshipsPayload,
            }
          : part,
      ),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Presentation XML requires a projected slideMaster relationship id.",
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates presentation support relationships required by package topology", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing presentation support relationships" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>support</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = H.expectPptxPart(projection.parts, "presentation");
    const presentationRelationships = projection.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    )!;
    const strippedRelationships = (
      (presentationRelationships.payload as H.PptxRelationshipsPayload | undefined)
        ?.relationships ?? []
    ).filter(
      (relationship) =>
        relationship.type !== "theme" &&
        relationship.type !== "viewProperties" &&
        relationship.type !== "presentationProperties",
    );
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === presentationRelationships.id
            ? {
                ...part,
                relationships: strippedRelationships,
                payload: {
                  relationships: strippedRelationships,
                } satisfies H.PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Presentation relationships require projected theme relationship ids.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${presentationPart.id}.relationships`,
            message: expect.stringContaining("missing theme relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Presentation relationships require a projected viewProperties relationship id.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${presentationPart.id}.relationships`,
            message: expect.stringContaining("missing viewProperties relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message:
          "Presentation relationships require a projected presentationProperties relationship id.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${presentationPart.id}.relationships`,
            message: expect.stringContaining("missing presentationProperties relationship to "),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates slide master and layout support relationships required by package topology", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing master layout relationships" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>support</p>
    ));

    const projection = (await deck.project()).projection!;
    const slideMaster = H.expectPptxPart(projection.parts, "slide-master");
    const slideLayout = H.expectPptxPart(projection.parts, "slide-layout");
    const slideMasterRelationships = projection.parts.find(
      (part) => part.path === "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    )!;
    const slideLayoutRelationships = projection.parts.find(
      (part) => part.path === "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    )!;
    const stripRelationships = (
      part: H.PptxPackageModel["parts"][number],
      types: readonly string[],
    ): H.PptxPackageModel["parts"][number] => {
      const relationships = (
        (part.payload as H.PptxRelationshipsPayload | undefined)?.relationships ?? []
      ).filter((relationship) => !types.includes(relationship.type));
      return {
        ...part,
        relationships,
        payload: { relationships } satisfies H.PptxRelationshipsPayload,
      };
    };

    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id === slideMasterRelationships.id) {
            return stripRelationships(part, ["slideLayout", "theme"]);
          }
          if (part.id === slideLayoutRelationships.id) {
            return stripRelationships(part, ["slideMaster"]);
          }
          return part;
        }),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Slide master XML requires projected slideLayout relationship ids.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${slideMaster.id}.relationships`,
            message: expect.stringContaining("missing slideLayout relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Slide master XML requires a projected theme relationship id.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${slideMaster.id}.relationships`,
            message: expect.stringContaining("missing theme relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Slide layout XML requires a projected slideMaster relationship id.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${slideLayout.id}.relationships`,
            message: expect.stringContaining("missing slideMaster relationship to "),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates root package relationships required to open the PPTX package", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing root relationships" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>root</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const strippedRelationships = (rootRelationships.payload.relationships ?? []).filter(
      (relationship) =>
        relationship.type !== "officeDocument" &&
        relationship.type !== "coreProperties" &&
        relationship.type !== "extendedProperties",
    );
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationships.id
            ? {
                ...part,
                relationships: strippedRelationships,
                payload: {
                  relationships: strippedRelationships,
                } satisfies H.PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Root relationships require a projected officeDocument relationship.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.relationships`,
            message: expect.stringContaining("missing officeDocument relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Root relationships require a projected coreProperties relationship.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.relationships`,
            message: expect.stringContaining("missing coreProperties relationship to "),
          }),
        ]),
      }),
    );
    expect(project.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_PPTX_PACKAGE_MISSING_REQUIRED_RELATIONSHIP",
        message: "Root relationships require a projected extendedProperties relationship.",
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.relationships`,
            message: expect.stringContaining("missing extendedProperties relationship to "),
          }),
        ]),
      }),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project rejects known package relationships marked as external", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "External package relationship" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const externalOfficeDocument = (rootRelationships.payload.relationships ?? []).map(
      (relationship, index) =>
        index === 0
          ? { ...relationship, targetMode: "external", targetPartId: undefined }
          : relationship,
    ) as H.PptxRelationship[];
    deck.defineProjection({
      ...projection,
      parts: projection.parts.map((part) =>
        part.id === rootRelationships.id
          ? {
              ...part,
              relationships: externalOfficeDocument,
              payload: {
                relationships: externalOfficeDocument,
              } satisfies H.PptxRelationshipsPayload,
            }
          : part,
      ),
    });

    const project = await deck.project();
    const render = await deck.render();

    expect(project.ok).toBe(false);
    expect(project.diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships.0.targetMode"),
              message: "officeDocument relationships must target package parts",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships.0.targetMode"),
              message: "officeDocument relationships must target package parts",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });

  test("project validates external relationship targets use supported URL schemes", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "External target URL" }, () => (
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
        id: "rIdInvalidExternal" as H.PptxRelationship["id"],
        type: "https://deckjsx.dev/relationships/external-test",
        target: "javascript:alert(1)",
        targetMode: "external",
        targetPath: "javascript:alert(1)",
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
              message: "invalid relationship target path",
            }),
          ]),
        }),
        expect.objectContaining({
          code: "E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP",
          labels: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining(".relationships"),
              message: "invalid relationship target path",
            }),
          ]),
        }),
      ]),
    );
    expect(render.ok).toBe(false);
    expect(render.artifact).toBeUndefined();
  });
});

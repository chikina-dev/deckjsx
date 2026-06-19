import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render validation direct writer relationships", () => {
  test("direct writer validates package part relationship metadata shape", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid part relationships" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const slideLayoutPartId =
      projection.parts.find((part) => part.kind === "slide-layout")?.id ?? projection.parts[0]!.id;
    const malformedSlide: H.PptxSlidePart = {
      ...slidePart,
      relationships: [
        null,
        { id: "", type: "", targetPath: "", targetMode: "internal" },
        {
          id: "bad id" as H.PptxRelationship["id"],
          type: "slideLayout",
          targetPath: "ppt/slideLayouts/slideLayout1.xml",
          targetPartId: slideLayoutPartId,
        },
        {
          id: "rIdDuplicate" as H.PptxRelationship["id"],
          type: "slideLayout",
          targetPath: "ppt/slideLayouts/slideLayout1.xml",
          targetPartId: slideLayoutPartId,
        },
        {
          id: "rIdDuplicate" as H.PptxRelationship["id"],
          type: "slideLayout",
          targetPath: "ppt/slideLayouts/slideLayout1.xml",
          targetPartId: slideLayoutPartId,
        },
      ] as never,
    };
    const result = await H.renderPptxPackage({
      ...projection,
      slides: projection.slides.map((slide) =>
        slide.id === slidePart.id ? malformedSlide : slide,
      ),
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlide : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringContaining(".relationships.0") }),
          expect.objectContaining({ path: expect.stringContaining(".relationships.1.id") }),
          expect.objectContaining({ path: expect.stringContaining(".relationships.1.type") }),
          expect.objectContaining({ path: expect.stringContaining(".relationships.1.targetPath") }),
          expect.objectContaining({ path: expect.stringContaining(".relationships.1.targetMode") }),
          expect.objectContaining({
            path: expect.stringContaining(".relationships.1.targetPartId"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".relationships.2.id"),
            message: "invalid relationship id",
          }),
          expect.objectContaining({ path: expect.stringContaining(".relationships.4.id") }),
        ]),
      }),
    );
  });

  test("direct writer validates internal relationship target paths are canonical package paths", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid relationship target path" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>target path</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationshipsPart = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const brokenRelationships = (rootRelationshipsPart.payload.relationships ?? []).map(
      (relationship) =>
        relationship.type === "officeDocument"
          ? { ...relationship, targetPath: "/ppt/presentation.xml" }
          : relationship,
    );
    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationshipsPart.id
            ? {
                ...part,
                relationships: brokenRelationships,
                payload: {
                  relationships: brokenRelationships,
                } satisfies H.PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD"),
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.payload.relationships.0.targetPath`,
            message: "invalid relationship target path",
          }),
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.relationships.0.targetPath`,
            message: "invalid relationship target path",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates projected relationship targets match target paths", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Mismatched relationship target" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>target</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationshipsPart = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const brokenRelationships = (rootRelationshipsPart.payload.relationships ?? []).map(
      (relationship) =>
        relationship.type === "officeDocument"
          ? { ...relationship, target: "ppt/not-presentation.xml" }
          : relationship,
    );
    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationshipsPart.id
            ? {
                ...part,
                relationships: brokenRelationships,
                payload: {
                  relationships: brokenRelationships,
                } satisfies H.PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD"),
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.payload.relationships.0.target`,
            message: "relationship target must match projected relationship target path",
          }),
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.relationships.0.target`,
            message: "relationship target must match projected relationship target path",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates relationship target part identities stay in the pptx namespace", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid relationship target identity" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>target id</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationshipsPart = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const brokenRelationships = (rootRelationshipsPart.payload.relationships ?? []).map(
      (relationship) =>
        relationship.type === "officeDocument"
          ? { ...relationship, targetPartId: "ppt/presentation.xml" as H.PackagePartId }
          : relationship,
    );
    const brokenRelationshipIndex = brokenRelationships.findIndex(
      (relationship) => relationship.type === "officeDocument",
    );
    expect(brokenRelationshipIndex).toBeGreaterThanOrEqual(0);
    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationshipsPart.id
            ? {
                ...part,
                relationships: brokenRelationships,
                payload: {
                  relationships: brokenRelationships,
                } satisfies H.PptxRelationshipsPayload,
              }
            : part,
        ),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD"),
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.payload.relationships.${brokenRelationshipIndex}.targetPartId`,
            message: "invalid relationship target part id",
          }),
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.relationships.${brokenRelationshipIndex}.targetPartId`,
            message: "invalid relationship target part id",
          }),
        ]),
      }),
    );
    const validationDiagnostic = result.diagnostics.items.find(
      (item) => item.code === "E_RENDER_PACKAGE_VALIDATION_FAILED",
    );
    expect(validationDiagnostic?.notes ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("code=E_PPTX_PACKAGE_BROKEN_RELATIONSHIP")]),
    );
  });

  test("direct writer validates package relationship type targets", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid relationship targets" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>targets</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const slideLayoutPart = H.expectPptxPart(projection.parts, "slide-layout");
    const slideMasterPart = H.expectPptxPart(projection.parts, "slide-master");
    const viewPropertiesPart = projection.parts.find((part) => part.kind === "view-properties")!;
    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id === rootRelationships.id) {
            const relationships = (
              (part.payload as H.PptxRelationshipsPayload | undefined)?.relationships ?? []
            )
              .map((relationship) =>
                relationship.type === "officeDocument"
                  ? {
                      ...relationship,
                      target: slidePart.path,
                      targetPartId: slidePart.id,
                      targetPath: slidePart.path,
                    }
                  : relationship,
              )
              .concat({
                id: "rIdInvalidRootOwner" as H.PptxRelationship["id"],
                type: "viewProperties",
                target: viewPropertiesPart.path,
                targetPartId: viewPropertiesPart.id,
                targetPath: viewPropertiesPart.path,
              });
            return {
              ...part,
              relationships,
              payload: { relationships } satisfies H.PptxRelationshipsPayload,
            };
          }

          if (part.id === slidePart.id) {
            return {
              ...part,
              relationships: [
                ...(part.relationships ?? []),
                {
                  id: "rIdInvalidTarget" as H.PptxRelationship["id"],
                  type: "officeDocument",
                  target: "../slideLayouts/slideLayout1.xml",
                  targetPartId: slideLayoutPart.id,
                  targetPath: slideLayoutPart.path,
                },
                {
                  id: "rIdInvalidSlideOwner" as H.PptxRelationship["id"],
                  type: "slideMaster",
                  target: "../slideMasters/slideMaster1.xml",
                  targetPartId: slideMasterPart.id,
                  targetPath: slideMasterPart.path,
                },
                {
                  id: "rIdUnsupportedInternal" as H.PptxRelationship["id"],
                  type: "https://deckjsx.dev/relationships/internal-test",
                  target: "../slideLayouts/slideLayout1.xml",
                  targetPartId: slideLayoutPart.id,
                  targetPath: slideLayoutPart.path,
                },
              ],
            };
          }

          return part;
        }),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_MANIFEST_PAYLOAD"),
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_RELATIONSHIP"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".payload.relationships"),
            message: "officeDocument relationship cannot target slide",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".relationships"),
            message: "officeDocument relationship cannot target slide-layout",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".payload.relationships"),
            message: "viewProperties relationship is not valid for root relationship owner",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".relationships"),
            message: "slideMaster relationship is not valid for slide relationship owner",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".relationships"),
            message:
              "unsupported internal relationship type https://deckjsx.dev/relationships/internal-test",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates relationship metadata and payload stay synchronized", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Relationship payload mismatch" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>mismatch</p>
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const payload = rootRelationships.payload;
    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) =>
          part.id === rootRelationships.id
            ? {
                ...part,
                relationships: payload.relationships.map((relationship) =>
                  relationship.type === "officeDocument"
                    ? { ...relationship, id: "rIdMetadataOnly" as H.PptxRelationship["id"] }
                    : relationship,
                ),
                payload,
              }
            : part,
        ),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_RELATIONSHIP_PAYLOAD_MISMATCH"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.relationships`,
          }),
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.payload.relationships`,
          }),
        ]),
      }),
    );
  });

  test("direct writer validates owner relationships and relationship parts stay synchronized", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Owner relationship mismatch" }, () => (
      <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const relationshipPart = projection.parts.find(
      (part) => part.kind === "relationships" && part.path === "ppt/slides/_rels/slide1.xml.rels",
    )!;
    const changedSlide = {
      ...slidePart,
      relationships: slidePart.relationships?.map((relationship) =>
        relationship.type === "image"
          ? { ...relationship, id: "rIdOwnerOnly" as H.PptxRelationship["id"] }
          : relationship,
      ),
    } satisfies H.PptxSlidePart;

    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? changedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? changedSlide : part)),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_OWNER_RELATIONSHIP_MISMATCH"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: `projection.parts.${slidePart.id}.relationships` }),
          expect.objectContaining({
            path: `projection.parts.${relationshipPart.id}.payload.relationships`,
          }),
        ]),
      }),
    );
  });

  test("direct writer rejects missing owner relationship metadata when a relationship part exists", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing owner relationships" }, () => (
      <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.slides[0]!;
    const relationshipPart = projection.parts.find(
      (part) => part.kind === "relationships" && part.path === "ppt/slides/_rels/slide1.xml.rels",
    )!;
    const changedSlide = { ...slidePart, relationships: undefined } as H.PptxSlidePart;

    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) =>
          slide.id === slidePart.id ? changedSlide : slide,
        ),
        parts: projection.parts.map((part) => (part.id === slidePart.id ? changedSlide : part)),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_OWNER_RELATIONSHIP_MISMATCH"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${slidePart.id}.relationships`,
            message: "owner relationship metadata is missing",
          }),
          expect.objectContaining({
            path: `projection.parts.${relationshipPart.id}.payload.relationships`,
          }),
        ]),
      }),
    );
  });

  test("direct writer validates relationship part categories match their owner family", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Relationship categories" }, () => (
      <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const rootRelationships = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const presentationRelationships = projection.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    )!;
    const slideRelationships = projection.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    )!;
    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id === rootRelationships.id || part.id === presentationRelationships.id) {
            return { ...part, category: "authored-content" };
          }
          if (part.id === slideRelationships.id) {
            return { ...part, category: "manifest" };
          }
          return part;
        }),
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_RELATIONSHIPS_PART_CATEGORY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${rootRelationships.id}.category`,
            message: "expected manifest for _rels/.rels",
          }),
          expect.objectContaining({
            path: `projection.parts.${presentationRelationships.id}.category`,
            message: "expected manifest for ppt/_rels/presentation.xml.rels",
          }),
          expect.objectContaining({
            path: `projection.parts.${slideRelationships.id}.category`,
            message: "expected authored-content for ppt/slides/_rels/slide1.xml.rels",
          }),
        ]),
      }),
    );
  });
});

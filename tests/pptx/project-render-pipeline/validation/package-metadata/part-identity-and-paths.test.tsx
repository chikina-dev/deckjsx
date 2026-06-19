import { describe, expect, test } from "vite-plus/test";
import * as H from "../../helpers.tsx";

describe("project/render validation package part identity and paths", () => {
  test("direct writer validates package part base metadata shape", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid part base" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const result = await H.renderPptxPackage({
      ...projection,
      parts: [
        ...projection.parts,
        { id: "", category: "runtime", kind: "legacy-slide", path: "" } as never,
      ],
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringMatching(/^projection\.parts\.\d+\.id$/) }),
          expect.objectContaining({
            path: expect.stringMatching(/^projection\.parts\.\d+\.category$/),
          }),
          expect.objectContaining({
            path: expect.stringMatching(/^projection\.parts\.\d+\.kind$/),
          }),
          expect.objectContaining({
            path: expect.stringMatching(/^projection\.parts\.\d+\.path$/),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part category-kind compatibility", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid part category" }, () => (
      <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1, width: 1, height: 1 }} />
    ));

    const projection = (await deck.project()).projection!;
    const result = await H.renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind === "content-types") {
          return { ...part, category: "support" };
        }
        if (part.kind === "media") {
          return { ...part, category: "manifest" };
        }
        return part;
      }),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: "projection.parts.pptx:manifest:content-types.category",
            message: "category support is not compatible with content-types",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".category"),
            message: "category manifest is not compatible with media",
          }),
        ]),
      }),
    );
  });

  test("direct writer rejects self-referential package dependencies", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Self dependencies" }, () => (
      <img
        data={H.dataUriFromBytes("image/png", H.pngHeaderBytes(2, 1))}
        style={{ x: 1, y: 1, width: 1, height: 1, objectFit: "stretch" }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const contentTypesPart = H.expectPptxPart(projection.parts, "content-types");
    const presentationPart = H.expectPptxPart(projection.parts, "presentation");
    const slideMasterPart = H.expectPptxPart(projection.parts, "slide-master");
    const mediaPart = H.expectPptxPart(projection.parts, "media");
    const result = await H.renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.id === contentTypesPart.id) {
          return {
            ...part,
            payload: {
              ...(part.payload as H.PptxContentTypesPayload),
              overrides: [
                ...(part.payload as H.PptxContentTypesPayload).overrides,
                { partName: "/[Content_Types].xml", contentType: "application/xml" },
              ],
            },
          };
        }

        if (part.id === presentationPart.id) {
          return {
            ...part,
            dependencyFingerprints: [
              ...(part.dependencyFingerprints ?? []),
              { packagePartId: part.id, fingerprint: part.fingerprint ?? "test:self" },
            ],
          };
        }

        if (part.id === slideMasterPart.id) {
          return {
            ...part,
            relationships: [
              ...(part.relationships ?? []),
              {
                id: "rIdSelf" as H.PptxRelationship["id"],
                type: "slideMaster",
                target: part.path,
                targetPath: part.path,
                targetPartId: part.id,
              },
            ],
          };
        }

        if (part.id === mediaPart.id) {
          return { ...part, requirement: { ...part.requirement!, dependencies: [part.id] } };
        }

        return part;
      }),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PACKAGE_DEPENDENCY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(
              `projection.parts.${contentTypesPart.id}.payload.overrides.`,
            ),
            message: expect.stringContaining("contentTypeOverride cannot reference"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(
              `projection.parts.${presentationPart.id}.dependencyFingerprints.`,
            ),
            message: expect.stringContaining("dependencyFingerprint cannot reference"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(`projection.parts.${slideMasterPart.id}.relationships.`),
            message: expect.stringContaining("relationshipTarget cannot reference"),
          }),
          expect.objectContaining({
            path: `projection.parts.${mediaPart.id}.requirement.dependencies.0`,
            message: expect.stringContaining("requirementDependency cannot reference"),
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part paths match their OOXML kind family", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Path families" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>paths</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = H.expectPptxPart(projection.parts, "presentation");
    const themePart = H.expectPptxPart(projection.parts, "theme");
    const slideRelationships = projection.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    )!;
    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id === presentationPart.id) {
            return { ...part, path: "ppt/slides/presentation.xml" };
          }
          if (part.id === themePart.id) {
            return { ...part, path: "ppt/not-theme/theme1.xml" };
          }
          if (part.id === slideRelationships.id) {
            return { ...part, path: "ppt/relationships/slide1.xml.rels" };
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
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_PATH_FAMILY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${presentationPart.id}.path`,
            message: "expected ppt/presentation.xml, received ppt/slides/presentation.xml",
          }),
          expect.objectContaining({
            path: `projection.parts.${themePart.id}.path`,
            message: "expected ppt/theme/themeN.xml, received ppt/not-theme/theme1.xml",
          }),
          expect.objectContaining({
            path: `projection.parts.${slideRelationships.id}.path`,
            message:
              "expected _rels/.rels or known ppt/*/_rels/*.xml.rels, received ppt/relationships/slide1.xml.rels",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part identities stay in the pptx namespace", async () => {
    const result = await H.renderPptxPackage({
      format: "pptx",
      size: { widthEmu: 10, heightEmu: 10 },
      slides: [],
      parts: [
        {
          id: "ppt/presentation.xml" as H.PackagePartId,
          category: "support",
          kind: "presentation",
          path: "ppt/presentation.xml",
          payload: {
            kind: "presentation",
            size: { widthEmu: 10, heightEmu: 10 },
            slideMasterIds: [],
            slidePartIds: [],
          },
        },
        {
          id: "pptx:bad identity" as H.PackagePartId,
          category: "manifest",
          kind: "relationships",
          path: "_rels/.rels",
          payload: { relationships: [] } satisfies H.PptxRelationshipsPayload,
        },
      ],
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: "projection.parts.ppt/presentation.xml.id",
            message: "invalid package part id",
          }),
          expect.objectContaining({
            path: "projection.parts.pptx:bad identity.id",
            message: "invalid package part id",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part paths are canonical zip entry paths", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid package paths" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>paths</p>
    ));

    const projection = (await deck.project()).projection!;
    const contentTypesPart = H.expectPptxPart(projection.parts, "content-types");
    const presentationPart = H.expectPptxPart(projection.parts, "presentation");
    const rootRelationshipsPart = H.expectPptxPartByPath(
      projection.parts,
      "relationships",
      "_rels/.rels",
    );
    const result = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.id === contentTypesPart.id) {
            return { ...part, path: "/[Content_Types].xml" };
          }
          if (part.id === presentationPart.id) {
            return { ...part, path: "ppt\\presentation.xml" };
          }
          if (part.id === rootRelationshipsPart.id) {
            return { ...part, path: "_rels/../.rels" };
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
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${contentTypesPart.id}.path`,
            message: "invalid package part path",
          }),
          expect.objectContaining({
            path: `projection.parts.${presentationPart.id}.path`,
            message: "invalid package part path",
          }),
          expect.objectContaining({
            path: `projection.parts.${rootRelationshipsPart.id}.path`,
            message: "invalid package part path",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part origin metadata shape", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid part origin" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>origin</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide: H.PptxSlidePart = {
      ...slidePart,
      origin: {
        graphNodeIds: ["", "graph:test:duplicate-part-origin", "graph:test:duplicate-part-origin"],
        source: { kind: "mounted", sourceKey: "", sourceIdentity: "" },
      } as never,
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
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_ORIGIN"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringContaining(".origin.graphNodeIds.0") }),
          expect.objectContaining({
            path: expect.stringContaining(".origin.graphNodeIds.2"),
            message: expect.stringContaining("duplicate graph node ids entry"),
          }),
          expect.objectContaining({ path: expect.stringContaining(".origin.source.sourceKey") }),
          expect.objectContaining({
            path: expect.stringContaining(".origin.source.sourceIdentity"),
          }),
        ]),
      }),
    );
  });
});

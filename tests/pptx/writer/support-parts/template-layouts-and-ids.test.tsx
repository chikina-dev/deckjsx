import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer template layouts and ids", () => {
  test("output emits template-derived slide layout topology", async () => {
    const deck = new H.Deck({
      layout: { width: 10, height: 5.625, unit: "in" },
      templates: {
        report: {
          areas: {
            title: { kind: "title", frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } },
            body: { frame: { x: 0.7, y: 1.6, width: 8, height: 3.5 } },
          },
        },
      },
    });

    deck.slide({ name: "Template topology", template: "report" }, ({ template }) => (
      <>
        <h1 area={template.title}>Quarterly Review</h1>
        <section area={template.body}>
          <p style={{ width: "100%", height: 0.5 }}>Performance highlights</p>
        </section>
      </>
    ));

    const project = await deck.project();
    const render = await deck.render();
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const templateLayout = project.projection?.parts.find(
      (part) =>
        part.kind === "slide-layout" &&
        (part.payload as { template?: { name?: string } } | undefined)?.template?.name === "report",
    );
    const contentTypesXml = H.zipEntry(zip, "[Content_Types].xml");
    const masterXml = H.zipEntry(zip, "ppt/slideMasters/slideMaster1.xml");
    const masterRelsXml = H.zipEntry(zip, "ppt/slideMasters/_rels/slideMaster1.xml.rels");
    const slideRelsXml = H.zipEntry(zip, "ppt/slides/_rels/slide1.xml.rels");
    const templateLayoutXml = H.zipEntry(zip, templateLayout?.path ?? "");
    const templateLayoutRelsPath = templateLayout?.path.replace(
      "ppt/slideLayouts/",
      "ppt/slideLayouts/_rels/",
    );
    const templateLayoutRelsXml = H.zipEntry(
      zip,
      templateLayoutRelsPath ? `${templateLayoutRelsPath}.rels` : "",
    );

    expect(project.ok).toBe(true);
    expect(render.ok).toBe(true);
    expect(templateLayout).toMatchObject({
      path: "ppt/slideLayouts/slideLayout2.xml",
      payload: expect.objectContaining({
        name: "report",
        layoutAnchors: expect.arrayContaining([
          expect.objectContaining({ area: "title", kind: "title" }),
          expect.objectContaining({ area: "body", kind: "generic" }),
        ]),
      }),
    });

    expect(H.packagePaths(zip)).toEqual(
      expect.arrayContaining([
        "ppt/slideLayouts/slideLayout1.xml",
        "ppt/slideLayouts/slideLayout2.xml",
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
        "ppt/slideLayouts/_rels/slideLayout2.xml.rels",
      ]),
    );
    expect(contentTypesXml).toContain(
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    );
    expect(contentTypesXml).toContain(
      '<Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    );
    expect(masterXml).toContain('<p:sldLayoutId id="2147483649" r:id="rId1"/>');
    expect(masterXml).toContain('<p:sldLayoutId id="2147483650" r:id="rId2"/>');
    expect(masterRelsXml).toContain('Target="../slideLayouts/slideLayout1.xml"');
    expect(masterRelsXml).toContain('Target="../slideLayouts/slideLayout2.xml"');
    expect(slideRelsXml).toContain('Target="../slideLayouts/slideLayout2.xml"');
    expect(slideRelsXml).not.toContain('Target="../slideLayouts/slideLayout1.xml"');
    expect(templateLayoutRelsXml).toContain('Target="../slideMasters/slideMaster1.xml"');
    expect(templateLayoutXml).toContain(
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">',
    );
    expect(templateLayoutXml).toContain('<p:cSld name="report">');
  });

  test("support XML consumes projected ids instead of inventing support ids", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Relationship ids" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const remapRelationship = (relationship: H.PptxRelationship): H.PptxRelationship => {
      if (relationship.type === "slideMaster") {
        return { ...relationship, id: "rIdModelMaster" as H.PptxRelationship["id"] };
      }
      if (relationship.type === "slide") {
        return { ...relationship, id: "rIdModelSlide" as H.PptxRelationship["id"] };
      }
      if (relationship.type === "slideLayout") {
        return { ...relationship, id: "rIdModelLayout" as H.PptxRelationship["id"] };
      }
      return relationship;
    };
    const remapPartRelationships = <T extends H.PptxPackagePart>(part: T): T => {
      if (!part.relationships) {
        return part;
      }
      return { ...part, relationships: part.relationships.map(remapRelationship) };
    };

    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        slides: projection.slides.map((slide) => remapPartRelationships(slide) as H.PptxSlidePart),
        parts: projection.parts.map((part) => {
          const partWithRelationships = remapPartRelationships(part);
          if (partWithRelationships.kind === "presentation") {
            return {
              ...partWithRelationships,
              payload: {
                ...(partWithRelationships.payload as Extract<
                  H.PptxSupportPartPayload,
                  { readonly kind: "presentation" }
                >),
                slideMasterIds: [
                  {
                    slideMasterPartId: projection.parts.find(
                      (candidate) => candidate.kind === "slide-master",
                    )!.id,
                    id: "2147483700",
                  },
                ],
              } satisfies H.PptxSupportPartPayload,
            };
          }

          if (partWithRelationships.kind === "slide-master") {
            return {
              ...partWithRelationships,
              payload: {
                ...(partWithRelationships.payload as H.PptxSlideMasterPartPayload),
                slideLayoutIds: (
                  partWithRelationships.payload as H.PptxSlideMasterPartPayload
                ).slideLayoutIds.map((slideLayoutId) => ({ ...slideLayoutId, id: "2147483701" })),
              } satisfies H.PptxSupportPartPayload,
            };
          }

          if (partWithRelationships.kind !== "relationships") {
            return partWithRelationships;
          }

          const relationships = H.relationshipsFor(partWithRelationships).map(remapRelationship);
          return {
            ...partWithRelationships,
            relationships,
            payload: { relationships } satisfies H.PptxRelationshipsPayload,
          };
        }),
      }),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const presentationXml = H.zipEntry(zip, "ppt/presentation.xml");
    const presentationRelsXml = H.zipEntry(zip, "ppt/_rels/presentation.xml.rels");
    const masterXml = H.zipEntry(zip, "ppt/slideMasters/slideMaster1.xml");
    const masterRelsXml = H.zipEntry(zip, "ppt/slideMasters/_rels/slideMaster1.xml.rels");

    expect(presentationXml).toContain('<p:sldMasterId id="2147483700" r:id="rIdModelMaster"/>');
    expect(presentationXml).toContain('<p:sldId id="256" r:id="rIdModelSlide"/>');
    expect(presentationRelsXml).toContain('Id="rIdModelMaster"');
    expect(presentationRelsXml).toContain('Id="rIdModelSlide"');
    expect(masterXml).toContain('<p:sldLayoutId id="2147483701" r:id="rIdModelLayout"/>');
    expect(masterRelsXml).toContain('Id="rIdModelLayout"');
  });

  test("support XML emitters reject missing projected relationship ids", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Missing relationship ids" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Relationships</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = projection.parts.find((part) => part.path === "ppt/presentation.xml");
    const slideMasterPart = projection.parts.find(
      (part) => part.path === "ppt/slideMasters/slideMaster1.xml",
    );
    const withoutOwnerRelationships = (
      ownerPath: string,
      predicate: (relationship: H.PptxRelationship) => boolean,
    ): H.PptxPackageModel => ({
      ...projection,
      parts: projection.parts.map((part) => {
        if (part.kind !== "relationships" || H.relationshipOwnerPath(part.path) !== ownerPath) {
          return part;
        }

        const relationships = H.relationshipsFor(part).filter(
          (relationship) => !predicate(relationship),
        );
        return {
          ...part,
          relationships,
          payload: { relationships } satisfies H.PptxRelationshipsPayload,
        };
      }),
    });

    expect(presentationPart).toBeDefined();
    expect(slideMasterPart).toBeDefined();

    expect(() =>
      H.emitPartBytes(
        presentationPart!,
        withoutOwnerRelationships(
          "ppt/presentation.xml",
          (relationship) => relationship.type === "slideMaster",
        ),
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow(
      "Presentation support XML must reference projected relationship id for pptx:support:slide-master-default from ppt/presentation.xml.",
    );

    expect(() =>
      H.emitPartBytes(
        {
          ...presentationPart!,
          payload: {
            ...(presentationPart!.payload as Extract<
              H.PptxSupportPartPayload,
              { readonly kind: "presentation" }
            >),
            slideMasterIds: [{ slideMasterPartId: slideMasterPart!.id, id: "1" }],
          } satisfies H.PptxSupportPartPayload,
        },
        projection,
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow("Presentation support XML requires projected numeric slideMasterIds.0.id.");

    expect(() =>
      H.emitPartBytes(
        presentationPart!,
        withoutOwnerRelationships(
          "ppt/presentation.xml",
          (relationship) => relationship.type === "slide",
        ),
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow(
      `Presentation support XML must reference projected relationship id for ${projection.slides[0]?.id} from ppt/presentation.xml.`,
    );

    expect(() =>
      H.emitPartBytes(
        slideMasterPart!,
        withoutOwnerRelationships(
          "ppt/slideMasters/slideMaster1.xml",
          (relationship) => relationship.type === "slideLayout",
        ),
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow(
      "Slide master support XML must reference projected relationship id for pptx:support:slide-layout-default from ppt/slideMasters/slideMaster1.xml.",
    );

    expect(() =>
      H.emitPartBytes(
        {
          ...slideMasterPart!,
          payload: {
            ...(slideMasterPart!.payload as H.PptxSlideMasterPartPayload),
            slideLayoutIds: (
              slideMasterPart!.payload as H.PptxSlideMasterPartPayload
            ).slideLayoutIds.map((slideLayoutId) => ({ ...slideLayoutId, id: "1" })),
          } satisfies H.PptxSupportPartPayload,
        },
        projection,
        { slideBytes: () => new Uint8Array() },
      ),
    ).toThrow("Slide master support XML requires projected numeric slideLayoutIds.0.id.");
  });

  test("support XML emitters reject missing projected owner paths", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Missing owner paths" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Owner paths</p>
    ));

    const projection = (await deck.project()).projection!;
    const presentationPart = projection.parts.find((part) => part.path === "ppt/presentation.xml");
    const slideMasterPart = projection.parts.find(
      (part) => part.path === "ppt/slideMasters/slideMaster1.xml",
    );

    expect(presentationPart).toBeDefined();
    expect(slideMasterPart).toBeDefined();

    expect(() =>
      H.emitPartBytes({ ...presentationPart!, path: undefined as never }, projection, {
        slideBytes: () => new Uint8Array(),
      }),
    ).toThrow("Presentation support XML requires projected package part path.");

    expect(() =>
      H.emitPartBytes({ ...slideMasterPart!, path: "" } as H.PptxPackagePart, projection, {
        slideBytes: () => new Uint8Array(),
      }),
    ).toThrow("Slide master support XML requires projected package part path.");
  });
});

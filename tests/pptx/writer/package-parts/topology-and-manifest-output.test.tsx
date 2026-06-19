import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("direct pptx writer topology and manifest output", () => {
  test("build and assembly helpers require projected package metadata", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Build metadata validation" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Metadata</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide");
    expect(slidePart).toBeDefined();

    expect(() =>
      H.buildArtifactForPart({
        part: { ...slidePart!, orderKey: undefined } as H.PptxPackagePart,
        bytes: new Uint8Array([1, 2, 3]),
        reason: "missingArtifact",
      }),
    ).toThrow(`Package part ${slidePart?.id} must carry a deterministic order key.`);

    expect(() =>
      H.buildArtifactForPart({
        part: { ...slidePart!, fingerprint: undefined } as H.PptxPackagePart,
        bytes: new Uint8Array([1, 2, 3]),
        reason: "missingArtifact",
      }),
    ).toThrow(`Package part ${slidePart?.id} must carry a projected package part fingerprint.`);

    expect(() =>
      H.expectedAssemblyEntryForPart({
        ...slidePart!,
        requirement: undefined,
      } as H.PptxPackagePart),
    ).toThrow(`Package part ${slidePart?.id} must carry projected requirement metadata.`);
  });

  test("output package topology matches projected package parts and relationships", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Topology 1" }, () => (
      <>
        <p style={{ x: 0.7, y: 0.6, width: 3, height: 0.5, href: "https://example.com/docs" }}>
          Docs
        </p>
        <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 1, y: 1.4, width: 1, height: 1 }} />
        <img data={H.SAMPLE_SVG_DATA_URI} style={{ x: 2.3, y: 1.4, width: 1, height: 1 }} />
      </>
    ));
    deck.slide({ name: "Topology 2" }, () => (
      <shape
        shape="rect"
        style={{ x: 1, y: 1, width: 2, height: 1, fill: "#2563EB", stroke: "#F97316" }}
      />
    ));

    const project = await deck.project();
    const projection = project.projection!;
    const render = await deck.render();
    const zip = H.unzipSync(render.artifact?.bytes ?? new Uint8Array());
    const contentTypes = projection.parts.find((part) => part.kind === "content-types")?.payload as
      | H.PptxContentTypesPayload
      | undefined;
    const contentTypesXml = H.zipEntry(zip, "[Content_Types].xml");
    const assemblyEntries = render.summary?.assembly?.entries ?? [];
    const emittedEntries = assemblyEntries.filter(
      (entry) => entry.final.status === "rebuilt" || entry.final.status === "reused",
    );
    const partsByPath = new Map(projection.parts.map((part) => [part.path, part]));

    expect(project.ok).toBe(true);
    expect(render.ok).toBe(true);
    expect(H.packagePaths(zip)).toEqual(
      [...emittedEntries.map((entry) => entry.path), "ppt/deckjsx/patch-manifest.json"].sort(
        (left, right) => left.localeCompare(right),
      ),
    );
    expect(zip["ppt/deckjsx/patch-manifest.json"]).toBeDefined();
    expect(emittedEntries).toHaveLength(projection.parts.length);

    for (const entry of emittedEntries) {
      const part = partsByPath.get(entry.path);

      expect(part).toBeDefined();
      expect(zip[entry.path]).toBeDefined();
      expect(entry.expected).toMatchObject({
        path: part?.path,
        packagePartId: part?.id,
        orderKey: part?.orderKey?.value,
        requirement: part?.requirement?.status,
        required: part?.requirement?.required,
      });
      expect(entry.final.status).toBe("rebuilt");
      expect(entry.final.byteLength).toBe(zip[entry.path]?.byteLength);
    }

    for (const item of contentTypes?.defaults ?? []) {
      expect(contentTypesXml).toContain(
        `<Default Extension="${item.extension}" ContentType="${item.contentType}"/>`,
      );
    }

    for (const item of contentTypes?.overrides ?? []) {
      expect(contentTypesXml).toContain(
        `<Override PartName="${item.partName}" ContentType="${item.contentType}"/>`,
      );
    }

    for (const part of projection.parts.filter((item) => item.kind === "relationships")) {
      const relsXml = H.zipEntry(zip, part.path);

      expect(relsXml).toBeDefined();
      for (const relationship of H.relationshipsFor(part)) {
        expect(relsXml).toContain(`Id="${relationship.id}"`);
        expect(relsXml).toContain(`Target="${relationship.target}"`);
        if (relationship.targetMode === "external") {
          expect(relsXml).toContain('TargetMode="External"');
        }
      }
    }

    const mediaParts = projection.parts.filter((part) => part.kind === "media");
    const slide1Rels = projection.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    );
    const imageRelationships = H.relationshipsFor(slide1Rels!).filter(
      (relationship) => relationship.type === "image",
    );
    const hyperlinkRelationships = H.relationshipsFor(slide1Rels!).filter(
      (relationship) => relationship.type === "hyperlink",
    );
    const slideXml = H.zipEntry(zip, "ppt/slides/slide1.xml");
    const repeatedImageEmbedCount =
      slideXml?.match(new RegExp(`r:embed="${imageRelationships[0]?.id}"`, "g"))?.length ?? 0;

    expect(mediaParts).toHaveLength(1);
    expect(zip[mediaParts[0]!.path]).toBeDefined();
    expect(imageRelationships).toHaveLength(1);
    expect(hyperlinkRelationships).toHaveLength(1);
    expect(repeatedImageEmbedCount).toBe(2);
  });

  test("output serializes structured manifest payloads from a defined projection", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Manifest payloads" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Manifest payloads</p>
    ));

    const projection = (await deck.project()).projection!;
    deck.defineProjection(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: projection.parts.map((part) => {
          if (part.kind === "content-types") {
            const payload = part.payload as H.PptxContentTypesPayload;
            return {
              ...part,
              payload: {
                defaults: [
                  ...payload.defaults,
                  { extension: "deckjsx", contentType: "application/vnd.deckjsx.manifest-test" },
                ],
                overrides: payload.overrides,
              } satisfies H.PptxContentTypesPayload,
            };
          }

          if (part.path === "_rels/.rels") {
            const payload = part.payload as H.PptxRelationshipsPayload;
            const relationships = [
              ...payload.relationships,
              {
                id: "rIdManifestPayload" as H.PptxRelationship["id"],
                type: "https://deckjsx.dev/relationships/manifest-test",
                target: "https://deckjsx.dev/manifest",
                targetMode: "external",
                targetPath: "https://deckjsx.dev/manifest",
              },
            ] satisfies H.PptxRelationshipsPayload["relationships"];
            return {
              ...part,
              relationships,
              payload: { relationships } satisfies H.PptxRelationshipsPayload,
            };
          }

          return part;
        }),
      }),
    );

    const content = await H.renderDeckBytes(deck);

    const zip = H.unzipSync(content);
    const contentTypesXml = H.zipEntry(zip, "[Content_Types].xml");
    const rootRelsXml = H.zipEntry(zip, "_rels/.rels");

    expect(contentTypesXml).toContain(
      '<Default Extension="deckjsx" ContentType="application/vnd.deckjsx.manifest-test"/>',
    );
    expect(contentTypesXml).toContain(
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    );
    expect(rootRelsXml).toContain('Id="rIdManifestPayload"');
    expect(rootRelsXml).toContain('Type="https://deckjsx.dev/relationships/manifest-test"');
    expect(rootRelsXml).toContain('Target="https://deckjsx.dev/manifest"');
    expect(rootRelsXml).toContain('TargetMode="External"');
  });

  test("manifest XML emitters reject malformed content type and relationship payloads", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

    deck.slide({ name: "Manifest payload validation" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>Manifest payloads</p>
    ));

    const projection = (await deck.project()).projection!;
    const manifestParts = [
      {
        kind: "content-types",
        message: "Content type package parts must carry a structured content-types payload.",
      },
      {
        kind: "relationships",
        message: "Relationship package parts must carry a structured relationships payload.",
      },
    ] as const;

    manifestParts.forEach(({ kind, message }) => {
      const part = projection.parts.find((candidate) => candidate.kind === kind);
      expect(part).toBeDefined();
      expect(() =>
        H.emitPartBytes(
          { ...part!, payload: { kind: "malformed-manifest-payload" } } as H.PptxPackagePart,
          projection,
          { slideBytes: () => new Uint8Array() },
        ),
      ).toThrow(message);
    });

    expect(() =>
      H.relationshipsBytes(
        [
          {
            id: "bad id" as H.PptxRelationship["id"],
            type: "officeDocument",
            target: "ppt/presentation.xml",
            targetPath: "ppt/presentation.xml",
            targetPartId: "pptx:presentation" as never,
          },
        ],
        "",
      ),
    ).toThrow("Relationship XML requires a valid relationship id.");

    expect(() =>
      H.relationshipsBytes(
        [
          {
            id: "rIdBadType" as H.PptxRelationship["id"],
            type: "not a relationship uri",
            target: "https://example.test/target",
            targetMode: "external",
            targetPath: "https://example.test/target",
          },
        ],
        "",
      ),
    ).toThrow("Relationship XML requires a valid relationship type.");

    expect(
      H.strFromU8(
        H.relationshipsBytes(
          [
            {
              id: "rIdProjectedTarget" as H.PptxRelationship["id"],
              type: "slide",
              target: "projected/target.xml",
              targetPath: "ppt/slides/slide9.xml",
              targetPartId: "pptx:slide:projected-target" as never,
            },
          ],
          "ppt/presentation.xml",
        ),
      ),
    ).toContain('Target="projected/target.xml"');
  });
});

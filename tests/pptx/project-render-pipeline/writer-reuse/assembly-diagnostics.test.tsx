import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render writer reuse assembly diagnostics", () => {
  test("direct writer reports missing required assembly entries from package requirements", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Missing media" }, () => (
      <>
        <img
          src="/public/missing.png"
          style={{ x: 1, y: 1, width: 2, height: 1, objectFit: "stretch" }}
        />
      </>
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = projection.parts.find((part) => part.kind === "media");
    const slideRelationshipPart = projection.parts.find(
      (part) => part.path === "ppt/slides/_rels/slide1.xml.rels",
    );

    expect(mediaPart?.requirement).toMatchObject({
      status: "conditional",
      required: true,
      condition: "referencedByRelationship",
      dependencies: [slideRelationshipPart?.id],
    });
    expect(slideRelationshipPart?.requirement).toMatchObject({
      status: "conditional",
      required: true,
      condition: "hasRelationships",
      dependencies: expect.arrayContaining([mediaPart?.id]),
    });

    const render = await H.renderPptxPackage(projection);
    const assemblyDiagnostic = render.diagnostics.items.find(
      (item) => item.code === "E_RENDER_PACKAGE_ASSEMBLY_FAILED",
    );
    const mediaDiagnostic = render.diagnostics.items.find(
      (item) => item.code === "E_RENDER_MEDIA_LOAD_FAILED",
    );

    expect(render.artifact).toBeUndefined();
    expect(mediaDiagnostic).toMatchObject({
      code: "E_RENDER_MEDIA_LOAD_FAILED",
      labels: [
        expect.objectContaining({ path: "ppt/media/media1.png", message: "/public/missing.png" }),
      ],
    });
    expect(assemblyDiagnostic).toMatchObject({ code: "E_RENDER_PACKAGE_ASSEMBLY_FAILED" });
    expect(assemblyDiagnostic?.labels).toContainEqual(
      expect.objectContaining({
        path: "ppt/media/media1.png",
        message: "conditional package entry is missing: mediaBytesMissing",
      }),
    );
    expect(
      assemblyDiagnostic?.notes?.some((note) => note.includes("packagePartId=pptx:media:")),
    ).toBe(true);
    expect(
      assemblyDiagnostic?.notes?.some(
        (note) =>
          note.includes("path=ppt/media/media1.png") &&
          note.includes("requirement=conditional") &&
          note.includes("required=true") &&
          note.includes(`requirementReason=${mediaPart?.requirement?.reason}`) &&
          note.includes("reason=mediaBytesMissing"),
      ),
    ).toBe(true);
    expect(
      assemblyDiagnostic?.help?.some((item) => item.includes("render.summary.assembly.entries")),
    ).toBe(true);
    expect(render.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: "ppt/media/media1.png",
        status: "missing",
        requirement: "conditional",
        required: true,
        requirementCondition: "referencedByRelationship",
        requirementDependencies: [slideRelationshipPart?.id],
        requirementReason: mediaPart?.requirement?.reason,
        reason: "mediaBytesMissing",
        expected: expect.objectContaining({
          path: "ppt/media/media1.png",
          requirement: "conditional",
          required: true,
          requirementReason: mediaPart?.requirement?.reason,
        }),
        reasonDetails: expect.objectContaining({ kind: "mediaBytesMissing" }),
        final: expect.objectContaining({
          status: "missing",
          reason: "mediaBytesMissing",
          reasonDetails: expect.objectContaining({ kind: "mediaBytesMissing" }),
        }),
      }),
    );
  });

  test("direct writer keeps missing optional assembly entries non-blocking", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Optional media" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>optional still renders</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const optionalMediaPartId = "pptx:test:optional-media" as H.PackagePartId;
    const optionalMediaPath = "ppt/media/optional.png";
    const render = await H.renderPptxPackage(
      H.withFreshPackageFingerprints({
        ...projection,
        parts: [
          ...projection.parts.map((part) =>
            part.kind === "content-types"
              ? {
                  ...part,
                  payload: {
                    ...(part.payload as H.PptxContentTypesPayload),
                    defaults: [
                      ...((part.payload as H.PptxContentTypesPayload).defaults ?? []),
                      { extension: "png", contentType: "image/png" },
                    ],
                  } satisfies H.PptxContentTypesPayload,
                }
              : part,
          ),
          {
            id: optionalMediaPartId,
            category: "authored-content",
            kind: "media",
            path: optionalMediaPath,
            orderKey: {
              group: "media",
              groupOrder: 90,
              sequence: 999,
              path: optionalMediaPath,
              value: `090:000999:${optionalMediaPath}`,
            },
            fingerprint: "test:optional-media",
            requirement: {
              status: "optional",
              required: false,
              reason: "optional media part is not referenced by any drawing relationship",
            },
            payload: {
              source: { kind: "path", path: "/public/optional-missing.png" },
              sources: [{ kind: "path", path: "/public/optional-missing.png" }],
            },
          },
        ],
      }),
    );

    expect(render.artifact?.bytes.byteLength).toBeGreaterThan(0);
    expect(render.diagnostics.hasErrors).toBe(false);
    expect(render.diagnostics.items).not.toContainEqual(
      expect.objectContaining({ code: "E_RENDER_PACKAGE_ASSEMBLY_FAILED" }),
    );
    expect(render.summary?.assembly).toMatchObject({ failedCount: 0, missingCount: 1 });
    expect(render.summary?.assembly?.entries).toContainEqual(
      expect.objectContaining({
        path: optionalMediaPath,
        packagePartId: optionalMediaPartId,
        status: "missing",
        requirement: "optional",
        required: false,
        reason: "mediaBytesMissing",
        expected: expect.objectContaining({
          path: optionalMediaPath,
          packagePartId: optionalMediaPartId,
          requirement: "optional",
          required: false,
        }),
        reasonDetails: expect.objectContaining({ kind: "mediaBytesMissing" }),
        final: expect.objectContaining({
          status: "missing",
          reason: "mediaBytesMissing",
          reasonDetails: expect.objectContaining({ kind: "mediaBytesMissing" }),
        }),
      }),
    );
    expect(render.buildArtifacts?.some((artifact) => artifact.path === optionalMediaPath)).toBe(
      false,
    );
    expect(
      H.unzipSync(render.artifact?.bytes ?? new Uint8Array())[optionalMediaPath],
    ).toBeUndefined();
  });
});

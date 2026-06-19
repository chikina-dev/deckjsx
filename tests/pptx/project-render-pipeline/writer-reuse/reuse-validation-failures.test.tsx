import { describe, expect, test } from "vite-plus/test";
import * as H from "../helpers.tsx";

describe("project/render writer reuse validation failures", () => {
  test("direct writer validates package part dependency fingerprint metadata shape", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid dependency fingerprints" }, () => (
      <p style={{ x: 1, y: 1, width: 4, height: 0.5 }}>dependency</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const dependencyPartId =
      projection.parts.find((part) => part.kind === "slide-layout")?.id ?? projection.parts[0]!.id;
    const result = await H.renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) =>
        part.id === slidePart.id
          ? {
              ...part,
              dependencyFingerprints: [
                { packagePartId: "pptx:test:missing" as H.PackagePartId, fingerprint: "" },
                { packagePartId: dependencyPartId, fingerprint: "valid" },
                { packagePartId: dependencyPartId, fingerprint: "duplicate" },
              ],
            }
          : part,
      ),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_DEPENDENCY_FINGERPRINT"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".dependencyFingerprints.0.packagePartId"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".dependencyFingerprints.0.fingerprint"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".dependencyFingerprints.1.fingerprint"),
            message: expect.stringContaining("expected fnv1a32:"),
          }),
          expect.objectContaining({
            path: expect.stringContaining(".dependencyFingerprints.2.packagePartId"),
          }),
        ]),
      }),
    );
  });

  test("direct writer reports ZIP source failures as package assembly diagnostics", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "ZIP source failure" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const tooLongPath = `ppt/media/${"a".repeat(70_000)}.png`;
    const result = await H.renderPptxPackage(
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
            id: "pptx:test:too-long-path" as H.PackagePartId,
            category: "authored-content",
            kind: "media",
            path: tooLongPath,
            orderKey: {
              group: "media",
              groupOrder: 90,
              sequence: 999,
              path: tooLongPath,
              value: `090:000999:${tooLongPath}`,
            },
            fingerprint: "test:too-long-path",
            requirement: { status: "required", required: true, reason: "zip filename length test" },
            payload: {
              source: {
                kind: "data",
                data: H.dataUriFromBytes("image/png", H.pngHeaderBytes(1, 1)),
              },
              sources: [
                { kind: "data", data: H.dataUriFromBytes("image/png", H.pngHeaderBytes(1, 1)) },
              ],
            } satisfies H.PptxMediaPartPayload,
          },
        ],
      }),
    );

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_ASSEMBLY_FAILED",
        labels: expect.arrayContaining([expect.objectContaining({ path: "render.assembly.zip" })]),
        notes: expect.arrayContaining([expect.stringContaining("reason=zipSourceFailed")]),
      }),
    );
  });

  test("direct writer rejects stale package fingerprints before warm artifact reuse", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Stale fingerprint" }, () => (
      <>
        <p style={{ x: 1, y: 1, width: 2, height: 0.5 }}>stale slide</p>
      </>
    ));

    const projection = (await deck.project()).projection!;
    const cold = await H.renderPptxPackage(projection);
    const slidePart = H.expectPptxPart(projection.parts, "slide");
    const malformedSlide = {
      ...slidePart,
      payload: {
        ...slidePart.payload,
        drawing: {
          children: slidePart.payload.drawing.children.map((element) =>
            element.kind === "text"
              ? { ...element, fill: { kind: "solid", color: Symbol("reuse skips emitter") } }
              : element,
          ),
        },
      },
    } as H.PptxSlidePart;
    const stale = await H.renderPptxPackage(
      {
        ...projection,
        slides: [malformedSlide],
        parts: projection.parts.map((part) => (part.kind === "slide" ? malformedSlide : part)),
      },
      {},
      {
        pptxBuildArtifactsByPartId: new Map(
          (cold.buildArtifacts ?? []).map((artifact) => [artifact.packagePartId, artifact]),
        ),
      },
    );

    expect(cold.artifact).toBeDefined();
    expect(stale.artifact).toBeUndefined();
    expect(stale.buildArtifacts).toBeUndefined();
    expect(stale.summary?.assembly).toMatchObject({
      entries: [],
      missingCount: 0,
      rebuiltCount: 0,
      reusedCount: 0,
    });
    expect(stale.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_STALE_PART_FINGERPRINT"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${slidePart.id}.fingerprint`,
            message: expect.stringContaining("expected fnv1a32:"),
          }),
        ]),
      }),
    );
  });

  test("render produces deterministic PPTX bytes for the same input", async () => {
    function buildDeck() {
      const deck = new H.Deck({
        layout: { width: 10, height: 5.625, unit: "in" },
        meta: { title: "Deterministic", author: "deckjsx" },
      });
      deck.slide({ name: "Deterministic bytes" }, () => (
        <>
          <div
            style={{
              x: 1,
              y: 1,
              width: 4,
              height: 2,
              backgroundColor: "#E0F2FE",
              border: "2pt solid #0369A1",
            }}
          >
            <p style={{ x: 0.25, y: 0.25, width: 3, height: 0.5, fontSize: 20 }}>Stable</p>
          </div>
        </>
      ));
      return deck;
    }

    const first = await buildDeck().render();
    const second = await buildDeck().render();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.artifact?.bytes).toEqual(second.artifact?.bytes);
  });
});

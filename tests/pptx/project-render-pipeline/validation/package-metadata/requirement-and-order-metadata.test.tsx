import { describe, expect, test } from "vite-plus/test";
import * as H from "@/tests/pptx/project-render-pipeline/helpers.tsx";

describe("project/render validation package requirement and order metadata", () => {
  test("direct writer validates package part requirement metadata shape", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid requirement" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const requiredPart = H.expectPptxPart(projection.parts, "presentation");
    const conditionalPart = projection.parts.find(
      (part) => part.path === "ppt/_rels/presentation.xml.rels",
    )!;
    const optionalPartId = "pptx:test:optional-requirement" as H.PackagePartId;
    const optionalPath = "ppt/optional/optional.xml";
    const result = await H.renderPptxPackage({
      ...projection,
      parts: [
        ...(projection.parts.map((part, index): H.PptxPackageModel["parts"][number] => {
          if (index === 0) {
            return {
              ...part,
              ...(part.kind === "content-types"
                ? {
                    payload: {
                      ...(part.payload as H.PptxContentTypesPayload),
                      overrides: [
                        ...((part.payload as H.PptxContentTypesPayload).overrides ?? []),
                        {
                          partName: `/${optionalPath}`,
                          contentType: "application/vnd.openxmlformats-package.core-properties+xml",
                        },
                      ],
                    } satisfies H.PptxContentTypesPayload,
                  }
                : {}),
              requirement: {
                status: "conditional",
                reason: "missing evaluated requirement metadata",
              } as never,
            };
          }
          if (part.id === requiredPart.id) {
            return { ...part, requirement: { ...part.requirement!, required: false } };
          }
          if (part.id === conditionalPart.id) {
            return {
              ...part,
              requirement: {
                ...part.requirement!,
                condition: "explicit" as const,
                dependencies: [],
              },
            };
          }
          if (part.kind === "content-types") {
            return {
              ...part,
              payload: {
                ...(part.payload as H.PptxContentTypesPayload),
                overrides: [
                  ...((part.payload as H.PptxContentTypesPayload).overrides ?? []),
                  {
                    partName: `/${optionalPath}`,
                    contentType: "application/vnd.openxmlformats-package.core-properties+xml",
                  },
                ],
              } satisfies H.PptxContentTypesPayload,
            };
          }
          return part;
        }) satisfies H.PptxPackageModel["parts"][number][]),
        {
          id: optionalPartId,
          category: "support",
          kind: "document-properties",
          path: optionalPath,
          orderKey: {
            group: "other",
            groupOrder: 900,
            sequence: 999,
            path: optionalPath,
            value: `900:000999:${optionalPath}`,
          },
          fingerprint: "test:optional-requirement",
          requirement: {
            status: "optional" as const,
            required: true,
            reason: "invalid optional requirement evaluation",
          },
          payload: {
            kind: "document-properties",
            propertyKind: "core",
            editable: true,
            source: "deckjsx-meta",
          },
        } satisfies H.PptxPackageModel["parts"][number],
      ],
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringContaining(".requirement.required") }),
          expect.objectContaining({ path: expect.stringContaining(".requirement.condition") }),
          expect.objectContaining({
            path: `projection.parts.${requiredPart.id}.requirement.required`,
            message: "required status must evaluate to true",
          }),
          expect.objectContaining({
            path: `projection.parts.${conditionalPart.id}.requirement.condition`,
            message: "conditional status cannot use explicit condition",
          }),
          expect.objectContaining({
            path: `projection.parts.${conditionalPart.id}.requirement.dependencies`,
            message: "missing conditional requirement dependencies",
          }),
          expect.objectContaining({
            path: `projection.parts.${optionalPartId}.requirement.required`,
            message: "optional status must evaluate to false",
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part requirement dependency uniqueness", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Duplicate requirement dependency" }, () => (
      <img
        data={H.SAMPLE_SVG_DATA_URI}
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = H.expectPptxPart(projection.parts, "media");
    const dependencies = mediaPart.requirement?.dependencies ?? [];
    expect(dependencies[0]).toBeDefined();
    const dependency = dependencies[0]!;
    const malformedMediaPart = {
      ...mediaPart,
      requirement: { ...mediaPart.requirement!, dependencies: [dependency, dependency] },
    } satisfies H.PptxPackageModel["parts"][number];
    const result = await H.renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) => (part.id === mediaPart.id ? malformedMediaPart : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_REQUIREMENT"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: `projection.parts.${mediaPart.id}.requirement.dependencies.1`,
            message: `duplicate dependency ${dependency}`,
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part order key metadata shape", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid order key" }, () => <></>);

    const projection = (await deck.project()).projection!;
    const result = await H.renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part, index) =>
        index === 0 ? { ...part, orderKey: "000:legacy-string-order-key" as never } : part,
      ),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({ path: expect.stringContaining(".orderKey") }),
        ]),
      }),
    );
  });

  test("direct writer validates package part order key semantic group", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid order key group" }, () => (
      <img
        data={H.SAMPLE_SVG_DATA_URI}
        style={{ position: "absolute", left: 1, top: 1, width: 1, height: 1 }}
      />
    ));

    const projection = (await deck.project()).projection!;
    const mediaPart = H.expectPptxPart(projection.parts, "media");
    const malformedMediaPart = {
      ...mediaPart,
      orderKey: {
        ...mediaPart.orderKey!,
        group: "contentTypes",
        groupOrder: 0,
        value: `000:000999:${mediaPart.path}`,
      },
    } satisfies H.PptxPackageModel["parts"][number];
    const result = await H.renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) => (part.id === mediaPart.id ? malformedMediaPart : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".orderKey.group"),
            message: "expected media",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".orderKey.groupOrder"),
            message: "expected 90",
          }),
          expect.objectContaining({
            path: expect.stringContaining(".orderKey.value"),
            message: `expected 090:${String(mediaPart.orderKey!.sequence).padStart(6, "0")}:${mediaPart.path}`,
          }),
        ]),
      }),
    );
  });

  test("direct writer validates package part order key encoded value", async () => {
    const deck = new H.Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Invalid order key value" }, () => (
      <p style={{ position: "absolute", left: 1, top: 1, width: 2, height: 0.5 }}>order</p>
    ));

    const projection = (await deck.project()).projection!;
    const slidePart = projection.parts.find((part) => part.kind === "slide")!;
    const malformedSlidePart = {
      ...slidePart,
      orderKey: {
        ...slidePart.orderKey!,
        value: `${String(slidePart.orderKey!.groupOrder).padStart(3, "0")}:999999:${slidePart.path}`,
      },
    } satisfies H.PptxPackageModel["parts"][number];
    const result = await H.renderPptxPackage({
      ...projection,
      parts: projection.parts.map((part) => (part.id === slidePart.id ? malformedSlidePart : part)),
    });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
        notes: expect.arrayContaining([
          expect.stringContaining("code=E_PPTX_PACKAGE_INVALID_PART_ORDER_KEY"),
        ]),
        labels: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining(".orderKey.value"),
            message: `expected ${String(slidePart.orderKey!.groupOrder).padStart(3, "0")}:${String(slidePart.orderKey!.sequence).padStart(6, "0")}:${slidePart.path}`,
          }),
        ]),
      }),
    );
  });
});

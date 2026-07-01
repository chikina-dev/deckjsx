# First-Class PDF Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-shaped PDF output path: public `pdf()` adapter, PDF projection model, minimal PDF writer, font asset registration, Node file writes, and verification fixtures.

**Architecture:** PDF becomes a sibling output projection to PPTX. The Semantic Author Graph and layout artifacts project into a deckjsx-owned PDF Page Model shaped around PDF document/page/resource/content-stream structure, then `pdf()` renders that model into PDF bytes through a replaceable writer boundary. Font programs enter through Deck Plugin integration and the existing Asset Loading Boundary; styles keep using CSS-like `fontFamily` strings.

**Tech Stack:** TypeScript, Vite+, Vitest via `vite-plus/test`, deckjsx pipeline/projection/writer modules, existing diagnostics/result contracts, `@deckjsx/node` write helper. Optional verification tooling may use local CLI tools such as `soffice` only in tests or fixture scripts, never in core rendering.

---

## Source Spec

- Design spec: `docs/superpowers/specs/2026-07-01-pdf-output-design.md`
- ADR: `docs/adr/0015-pdf-projection-and-runtime-boundary.md`
- ADR: `docs/adr/0016-font-assets-through-integration.md`
- Domain terms: `CONTEXT.md`

## File Structure

Create:

- `src/projection/pdf/model.ts`
  Owns read-only PDF Page Model types: document, pages, boxes, resource ids, font resources, image resources, content operations, metadata, warnings/fallback records.
- `src/projection/pdf/identity.ts`
  Creates stable PDF resource/page identifiers.
- `src/projection/pdf/profile.ts`
  Declares the initial PDF Specification Profile and constants such as emitted PDF version and supported operation families.
- `src/projection/pdf/project.ts`
  Projects graph/layout/style/asset artifacts into the PDF Page Model.
- `src/projection/pdf/validation.ts`
  Validates model structure before writer serialization.
- `src/projection/pdf/inspect.ts`
  Provides a lightweight project inspection summary compatible with existing project summary shape.
- `src/writers/pdf.ts`
  Render boundary entry point returning a `RenderedArtifact<"pdf">`.
- `src/writers/pdf/objects.ts`
  Low-level PDF object serialization helpers.
- `src/writers/pdf/content.ts`
  Serializes content stream operations.
- `src/writers/pdf/document.ts`
  Assembles catalog, pages, resources, streams, xref, trailer, and final bytes.
- `tests/pdf/public-surface.test.tsx`
  Public API and render path red tests.
- `tests/pdf/pdf-model.test.ts`
  Model/profile/validation red tests.
- `tests/pdf/pdf-writer.test.ts`
  Structure-level writer tests.
- `tests/pdf/font-assets.test.tsx`
  Font asset integration and fallback tests.

Modify:

- `src/pipeline/public.ts`
  Expand `ProjectionFormat` to `"pptx" | "pdf"`.
- `src/pipeline/contract.ts`
  Mirror public pipeline type expansion.
- `src/projection/registry.ts`
  Add PDF projection capability and widen `ProjectedDocumentModel`.
- `src/adapter/public.ts`
  Add PDF render options and widen writer option typing.
- `src/adapter/index.ts`
  Export `pdf()`.
- `src/adapter/registry.ts`
  Select `pdf()` as the default adapter for PDF projection format.
- `src/pipeline/runner.ts`
  Read `projectOptions.format`, `options.output.format`, and adapter projection format correctly; type render inputs against all projected models; avoid PPTX-only reuse for PDF.
- `src/authoring/options/public.ts`
  Allow deck-level `output.format` to include PDF for default projection/render preference.
- `src/authoring/options/validation.ts`
  Accept `"pdf"` in deck output validation while continuing to reject unknown output keys.
- `tests/authoring/deck.test.tsx`
  Update output validation expectations for the newly valid PDF format.
- `src/render-execution.ts`
  Widen writer adapter types from PPTX-only to projected document model.
- `src/assets.ts`
  Add font-related asset source field/type contracts where needed.
- `src/graph/types.ts`
  Add `font` to `AssetEntity["kind"]` only if registered font assets become graph assets in the chosen implementation; otherwise keep font registrations separate and document why.
- `src/integration-context.ts`
  Add `fontAssets` and merge behavior.
- `src/integration.ts`
  Export font asset integration types.
- `src/plugin.ts`
  Validate plugin `integration.fontAssets` and lifecycle context snapshots.
- `src/plugin-compile-runtime.ts`
  Mirror runtime plugin validation for compiled plugin inputs.
- `src/asset-loading.ts`
  Support resolving registered font asset sources through the same loader outcome path.
- `src/pipeline/artifacts.ts`
  Store font asset artifacts if they are materialized independently from graph media assets.
- `plugins/node/src/index.ts`
  Allow `write()` to write PDF artifacts as ordinary bytes.
- `plugins/node/tests/write.test.tsx`
  Update unsupported PDF test into PDF write support coverage.
- `plugins/node/tests/types/plugins-public-api.ts`
  Add type coverage for font asset registration and PDF writes.
- `src/index.ts`
  Export any root result types that need to mention the widened formats.
- `src/inspect.ts`
  Export PDF Page Model inspection types if public inspection requires them.

## Task 1: Public PDF Format And Adapter Red Tests

**Files:**

- Create: `tests/pdf/public-surface.test.tsx`
- Modify: `src/pipeline/public.ts`
- Modify: `src/pipeline/contract.ts`
- Modify: `src/authoring/options/public.ts`
- Modify: `src/authoring/options/validation.ts`
- Modify: `tests/authoring/deck.test.tsx`
- Modify: `src/adapter/public.ts`
- Modify: `src/adapter/index.ts`
- Modify: `src/adapter/registry.ts`
- Modify: `src/pipeline/runner.ts`
- Modify: `src/render-execution.ts`

- [ ] **Step 1: Write failing public-surface tests**

Add `tests/pdf/public-surface.test.tsx`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src";
import { pdf } from "@/src/adapter";

describe("pdf public surface", () => {
  test("exports a PDF writer adapter", () => {
    const adapter = pdf({ inspection: "none" });

    expect(adapter).toMatchObject({
      kind: "deckjsx.writerAdapter",
      name: "pdf",
      projectionFormat: "pdf",
      format: "pdf",
      options: { inspection: "none" },
    });
  });

  test("projects a deck with format pdf", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>PDF</p>);

    const result = await deck.project({ format: "pdf", inspection: "none" });

    expect(result.ok).toBe(true);
    expect(result.format).toBe("pdf");
    expect(result.projection?.format).toBe("pdf");
  });

  test("renders a deck through pdf adapter", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "PDF" }, () => <p style={{ x: 1, y: 1, width: 3, height: 0.5 }}>PDF</p>);

    const result = await deck.render(pdf({ inspection: "none" }));

    expect(result.ok).toBe(true);
    expect(result.format).toBe("pdf");
    expect(result.artifact).toMatchObject({
      format: "pdf",
      mediaType: "application/pdf",
      extension: "pdf",
    });
    expect(new TextDecoder().decode(result.artifact?.bytes.subarray(0, 8))).toBe("%PDF-1.");
  });
});
```

- [ ] **Step 2: Run the public-surface tests and verify they fail**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/public-surface.test.tsx
```

Expected: FAIL because `pdf` is not exported and `"pdf"` is not accepted as `ProjectionFormat`.

- [ ] **Step 3: Add PDF types and adapter shell**

Change both `src/pipeline/public.ts` and `src/pipeline/contract.ts`:

```ts
/** Document model format produced by `deck.project()`. */
export type ProjectionFormat = "pptx" | "pdf";

/** Runtime artifact format produced by `deck.render(...)`. */
export type OutputFormat = ProjectionFormat;
```

Change `ProjectOptions` in both files:

```ts
/** Options accepted by `deck.project(...)`. */
export type ProjectOptions = {
  /** Projected document format. Defaults to Deck output preference, then PPTX. */
  readonly format?: ProjectionFormat;
  /** Controls optional inspection summaries. Defaults to the normal summary level. */
  readonly inspection?: InspectionDetailLevel;
};
```

Change `src/authoring/options/public.ts`:

```ts
output?: {
  format?: "pptx" | "pdf";
};
```

Change `src/authoring/options/validation.ts`:

```ts
if (
  options.output.format !== undefined &&
  options.output.format !== "pptx" &&
  options.output.format !== "pdf"
) {
  diagnostics.push(
    deckOptionDiagnostic({
      code: "E_DECK_INVALID_OUTPUT",
      section: "output",
      path: "deck.options.output.format",
      message:
        'Deck output format must be "pptx" or "pdf" when provided in the public authoring API.',
    }),
  );
}
```

Update `tests/authoring/deck.test.tsx` so `output.format: "pdf"` is no longer expected to produce
an error, while unknown keys still do:

```ts
expect(result.diagnostics.items).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      code: "E_DECK_INVALID_OUTPUT",
      message: "Deck output target is not part of the public authoring API.",
    }),
  ]),
);
expect(result.diagnostics.items).not.toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      message: 'Deck output format must be "pptx" when provided in the public authoring API.',
    }),
  ]),
);
```

Change `src/adapter/public.ts`:

```ts
export type PdfRenderOptions = {
  /** Amount of inspection metadata included in the render result. */
  readonly inspection?: InspectionDetailLevel;
};

export type RenderOptions = PptxRenderOptions;

export type BuiltInRenderOptions = PptxRenderOptions | PdfRenderOptions;
```

Keep `WriterAdapter["options"]` as `RenderOptions` only if TypeScript forces a smaller first step.
If the adapter shell needs the wider type immediately, change it to:

```ts
readonly options: BuiltInRenderOptions;
```

Change `src/adapter/index.ts`:

```ts
import type { PdfPageModel } from "../projection/pdf/model";
import type { PdfRenderOptions, PptxRenderOptions, WriterAdapter } from "./public";
import { renderPdfPageModel } from "../writers/pdf";

export function pdf(options: PdfRenderOptions = {}): WriterAdapter<PdfPageModel, "pdf"> {
  return {
    kind: "deckjsx.writerAdapter",
    name: "pdf",
    projectionFormat: "pdf",
    format: "pdf",
    options,
    async render(projection) {
      return renderPdfPageModel(projection, options);
    },
  };
}
```

Create a temporary minimal `src/projection/pdf/model.ts` so the adapter can typecheck:

```ts
import type { ProjectionFormat } from "../../pipeline/contract";

export type PdfPageModel = {
  readonly format: Extract<ProjectionFormat, "pdf">;
  readonly version: "1.7";
  readonly pages: readonly [];
};
```

Create a temporary minimal `src/writers/pdf.ts`:

```ts
import { emptyDiagnostics } from "../diagnostics";
import type { WriterAdapterResult } from "../adapter/public";
import type { PdfRenderOptions } from "../adapter/public";
import type { PdfPageModel } from "../projection/pdf/model";

const textEncoder = new TextEncoder();

export async function renderPdfPageModel(
  _model: PdfPageModel,
  _options: PdfRenderOptions = {},
): Promise<WriterAdapterResult<"pdf">> {
  return {
    diagnostics: emptyDiagnostics(),
    artifact: {
      format: "pdf",
      mediaType: "application/pdf",
      extension: "pdf",
      bytes: textEncoder.encode("%PDF-1.7\n%%deckjsx\n"),
    },
  };
}
```

- [ ] **Step 4: Wire PDF format selection without full projection yet**

Change `projectionFormatFor` in `src/pipeline/runner.ts`:

```ts
function projectionFormatFor(options: unknown): ProjectionFormat {
  const output = isRecord(options) ? options.output : undefined;
  return isRecord(output) && output.format === "pdf" ? "pdf" : "pptx";
}
```

In `projectSource`, prefer explicit project options before Deck output defaults:

```ts
const projectionFormat =
  input.projectionFormat ?? input.projectOptions?.format ?? projectionFormatFor(input.options);
```

Change `src/adapter/registry.ts` so `defaultWriterAdapterFor("pdf")` returns `pdf(options)` after
importing `pdf`.

- [ ] **Step 5: Run the targeted tests**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/public-surface.test.tsx
```

Expected: still FAIL on `deck.project({ format: "pdf" })` until Task 2 adds projection
capability. Adapter export assertions may pass.

- [ ] **Step 6: Commit the red API plumbing**

Only commit if the repository typechecks or if this task is intentionally left red for Task 2 in the
same implementation batch. Preferred checkpoint after Task 2:

```bash
git add tests/pdf/public-surface.test.tsx tests/authoring/deck.test.tsx src/pipeline/public.ts src/pipeline/contract.ts src/authoring/options/public.ts src/authoring/options/validation.ts src/adapter/public.ts src/adapter/index.ts src/adapter/registry.ts src/pipeline/runner.ts src/render-execution.ts src/projection/pdf/model.ts src/writers/pdf.ts
git commit -m "feat: add pdf adapter surface"
```

## Task 2: PDF Specification Profile And Page Model

**Files:**

- Create: `src/projection/pdf/profile.ts`
- Create: `src/projection/pdf/identity.ts`
- Replace: `src/projection/pdf/model.ts`
- Create: `tests/pdf/pdf-model.test.ts`
- Modify: `src/projection/registry.ts`
- Create: `src/projection/pdf/project.ts`
- Create: `src/projection/pdf/inspect.ts`
- Create: `src/projection/pdf/validation.ts`

- [ ] **Step 1: Write failing model/profile tests**

Add `tests/pdf/pdf-model.test.ts`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { pdfDocumentId, pdfPageId, pdfResourceId } from "@/src/projection/pdf/identity";
import { PDF_SPECIFICATION_PROFILE } from "@/src/projection/pdf/profile";
import { validatePdfPageModel } from "@/src/projection/pdf/validation";
import type { PdfPageModel } from "@/src/projection/pdf/model";

describe("PDF Page Model", () => {
  test("declares the initial PDF specification profile", () => {
    expect(PDF_SPECIFICATION_PROFILE).toMatchObject({
      emittedVersion: "1.7",
      referenceVersion: "ISO 32000-2:2020",
      supports: {
        pages: true,
        contentStreams: true,
        resourceDictionaries: true,
        embeddedTrueTypeFonts: true,
        imageXObjects: true,
      },
    });
  });

  test("creates stable PDF identifiers", () => {
    expect(pdfDocumentId("deck:demo")).toBe("pdf:document:deck-demo");
    expect(pdfPageId("slide:1", 0)).toBe("pdf:page:slide-1:0");
    expect(pdfResourceId("font", "Inter Regular")).toBe("pdf:resource:font:inter-regular");
  });

  test("validates a minimal model", () => {
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [
        {
          id: pdfPageId("slide:1", 0),
          index: 0,
          mediaBox: { x: 0, y: 0, width: 720, height: 405 },
          resources: { fonts: [], images: [] },
          content: [],
        },
      ],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items).toEqual([]);
  });

  test("rejects duplicate page ids", () => {
    const page = {
      id: pdfPageId("slide:1", 0),
      index: 0,
      mediaBox: { x: 0, y: 0, width: 720, height: 405 },
      resources: { fonts: [], images: [] },
      content: [],
    } satisfies PdfPageModel["pages"][number];
    const model: PdfPageModel = {
      format: "pdf",
      version: "1.7",
      documentId: pdfDocumentId("deck:demo"),
      metadata: { producer: "deckjsx" },
      pages: [page, page],
      resources: { fonts: [], images: [] },
      fallbacks: [],
    };

    expect(validatePdfPageModel(model).items.map((item) => item.code)).toContain(
      "E_PDF_MODEL_DUPLICATE_PAGE_ID",
    );
  });
});
```

- [ ] **Step 2: Run model tests and verify they fail**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/pdf-model.test.ts
```

Expected: FAIL because the PDF model/profile modules do not exist or are incomplete.

- [ ] **Step 3: Implement the PDF Specification Profile**

Create `src/projection/pdf/profile.ts`:

```ts
export type PdfSpecificationProfile = {
  readonly emittedVersion: "1.7";
  readonly referenceVersion: "ISO 32000-2:2020";
  readonly compatibilityReference: "Adobe PDF 1.7";
  readonly supports: {
    readonly pages: true;
    readonly contentStreams: true;
    readonly resourceDictionaries: true;
    readonly embeddedTrueTypeFonts: true;
    readonly imageXObjects: true;
    readonly transparency: false;
    readonly taggedPdf: false;
    readonly incrementalUpdate: false;
  };
};

export const PDF_SPECIFICATION_PROFILE: PdfSpecificationProfile = {
  emittedVersion: "1.7",
  referenceVersion: "ISO 32000-2:2020",
  compatibilityReference: "Adobe PDF 1.7",
  supports: {
    pages: true,
    contentStreams: true,
    resourceDictionaries: true,
    embeddedTrueTypeFonts: true,
    imageXObjects: true,
    transparency: false,
    taggedPdf: false,
    incrementalUpdate: false,
  },
};
```

- [ ] **Step 4: Implement stable PDF identities**

Create `src/projection/pdf/identity.ts`:

```ts
function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type PdfDocumentId = `pdf:document:${string}`;
export type PdfPageId = `pdf:page:${string}:${number}`;
export type PdfResourceKind = "font" | "image" | "graphicsState";
export type PdfResourceId = `pdf:resource:${PdfResourceKind}:${string}`;

export function pdfDocumentId(material: string): PdfDocumentId {
  return `pdf:document:${slug(material)}` as PdfDocumentId;
}

export function pdfPageId(material: string, index: number): PdfPageId {
  return `pdf:page:${slug(material)}:${index}` as PdfPageId;
}

export function pdfResourceId(kind: PdfResourceKind, material: string): PdfResourceId {
  return `pdf:resource:${kind}:${slug(material)}` as PdfResourceId;
}
```

- [ ] **Step 5: Define the real initial PDF Page Model**

Replace `src/projection/pdf/model.ts`:

```ts
import type { AssetEntityId, GraphNodeId, StyleEntityId } from "../../graph";
import type { ProjectionFormat } from "../../pipeline/contract";
import type { PdfDocumentId, PdfPageId, PdfResourceId } from "./identity";

export type PdfLengthPt = number;

export type PdfRectangle = {
  readonly x: PdfLengthPt;
  readonly y: PdfLengthPt;
  readonly width: PdfLengthPt;
  readonly height: PdfLengthPt;
};

export type PdfOrigin = {
  readonly graphNodeIds?: readonly GraphNodeId[];
  readonly styleEntityIds?: readonly StyleEntityId[];
  readonly assetEntityIds?: readonly AssetEntityId[];
};

export type PdfFontResource = {
  readonly id: PdfResourceId;
  readonly resourceName: string;
  readonly family: string;
  readonly weight?: number;
  readonly style?: "normal" | "italic";
  readonly sourceAssetEntityId?: AssetEntityId;
  readonly fallback: boolean;
};

export type PdfImageResource = {
  readonly id: PdfResourceId;
  readonly resourceName: string;
  readonly sourceAssetEntityId: AssetEntityId;
  readonly mediaType: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
};

export type PdfPageResources = {
  readonly fonts: readonly PdfResourceId[];
  readonly images: readonly PdfResourceId[];
};

export type PdfSetFillColorOperation = {
  readonly op: "setFillColor";
  readonly color: string;
};

export type PdfTextOperation = {
  readonly op: "text";
  readonly frame: PdfRectangle;
  readonly text: string;
  readonly fontResourceId: PdfResourceId;
  readonly fontSizePt: number;
  readonly color?: string;
  readonly origin?: PdfOrigin;
};

export type PdfImageOperation = {
  readonly op: "image";
  readonly frame: PdfRectangle;
  readonly imageResourceId: PdfResourceId;
  readonly origin?: PdfOrigin;
};

export type PdfContentOperation = PdfSetFillColorOperation | PdfTextOperation | PdfImageOperation;

export type PdfPage = {
  readonly id: PdfPageId;
  readonly index: number;
  readonly mediaBox: PdfRectangle;
  readonly resources: PdfPageResources;
  readonly content: readonly PdfContentOperation[];
  readonly origin?: PdfOrigin;
};

export type PdfFallbackRecord = {
  readonly code: string;
  readonly message: string;
  readonly origin?: PdfOrigin;
};

export type PdfPageModel = {
  readonly format: Extract<ProjectionFormat, "pdf">;
  readonly version: "1.7";
  readonly documentId: PdfDocumentId;
  readonly metadata: {
    readonly title?: string;
    readonly producer: "deckjsx";
  };
  readonly pages: readonly PdfPage[];
  readonly resources: {
    readonly fonts: readonly PdfFontResource[];
    readonly images: readonly PdfImageResource[];
  };
  readonly fallbacks: readonly PdfFallbackRecord[];
};
```

- [ ] **Step 6: Implement model validation**

Create `src/projection/pdf/validation.ts`:

```ts
import { createDiagnostics, diagnostic, type Diagnostics } from "../../diagnostics";
import type { PdfPageModel } from "./model";

export function validatePdfPageModel(model: PdfPageModel): Diagnostics {
  const items = [];
  const pageIds = new Set<string>();
  const fontIds = new Set(model.resources.fonts.map((font) => font.id));
  const imageIds = new Set(model.resources.images.map((image) => image.id));

  for (const page of model.pages) {
    if (pageIds.has(page.id)) {
      items.push(
        diagnostic({
          severity: "error",
          code: "E_PDF_MODEL_DUPLICATE_PAGE_ID",
          title: "duplicate PDF page id",
          message: `PDF page id ${page.id} appears more than once.`,
          labels: [{ path: "projection.pages", message: page.id }],
        }),
      );
    }
    pageIds.add(page.id);

    if (page.mediaBox.width <= 0 || page.mediaBox.height <= 0) {
      items.push(
        diagnostic({
          severity: "error",
          code: "E_PDF_MODEL_INVALID_PAGE_BOX",
          title: "invalid PDF page box",
          message: "PDF page mediaBox width and height must be positive.",
          labels: [{ path: `projection.pages.${page.index}.mediaBox`, message: page.id }],
        }),
      );
    }

    for (const fontId of page.resources.fonts) {
      if (!fontIds.has(fontId)) {
        items.push(
          diagnostic({
            severity: "error",
            code: "E_PDF_MODEL_UNKNOWN_FONT_RESOURCE",
            title: "unknown PDF font resource",
            message: `PDF page references unknown font resource ${fontId}.`,
            labels: [{ path: `projection.pages.${page.index}.resources.fonts`, message: fontId }],
          }),
        );
      }
    }

    for (const imageId of page.resources.images) {
      if (!imageIds.has(imageId)) {
        items.push(
          diagnostic({
            severity: "error",
            code: "E_PDF_MODEL_UNKNOWN_IMAGE_RESOURCE",
            title: "unknown PDF image resource",
            message: `PDF page references unknown image resource ${imageId}.`,
            labels: [{ path: `projection.pages.${page.index}.resources.images`, message: imageId }],
          }),
        );
      }
    }
  }

  return createDiagnostics(items);
}
```

- [ ] **Step 7: Add minimal PDF projection capability**

Create `src/projection/pdf/project.ts`:

```ts
import type { DeckOptions } from "../../authoring/options";
import { createDiagnostics, type Diagnostics } from "../../diagnostics";
import type { AssetEntity, SemanticAuthorGraph } from "../../graph";
import type { ResolvedStyleMap } from "../../style/resolve";
import { pdfDocumentId, pdfPageId } from "./identity";
import type { PdfPageModel } from "./model";

export type PdfProjectionAssetArtifact = unknown;

export function projectGraphToPdfPageModel(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  diagnostics?: Diagnostics;
  assets?: ReadonlyMap<AssetEntity["id"], PdfProjectionAssetArtifact>;
}): PdfPageModel {
  const width = input.options.layout.width * 72;
  const height = input.options.layout.height * 72;

  return {
    format: "pdf",
    version: "1.7",
    documentId: pdfDocumentId(String(input.graph.documentId)),
    metadata: { producer: "deckjsx" },
    pages: [
      {
        id: pdfPageId(String(input.graph.documentId), 0),
        index: 0,
        mediaBox: { x: 0, y: 0, width, height },
        resources: { fonts: [], images: [] },
        content: [],
      },
    ],
    resources: { fonts: [], images: [] },
    fallbacks: [],
  };
}

export const projectGraphToPartialPdfPageModel = projectGraphToPdfPageModel;

export function collectPdfProjectionDiagnostics(): Diagnostics {
  return createDiagnostics();
}
```

Create `src/projection/pdf/inspect.ts`:

```ts
import type { ProjectInspectionSummary } from "../pptx/model";
import type { PdfPageModel } from "./model";

export function summarizePdfPageModel(model: PdfPageModel): ProjectInspectionSummary {
  return {
    format: "pdf",
    slides: model.pages.map((page) => ({
      index: page.index,
      name: `Page ${page.index + 1}`,
      drawingCount: page.content.length,
    })),
    adapterLimitations: [],
    assets: [],
    diagnostics: [],
  } as unknown as ProjectInspectionSummary;
}
```

Modify `src/projection/registry.ts`:

```ts
import { summarizePdfPageModel } from "./pdf/inspect";
import type { PdfPageModel } from "./pdf/model";
import {
  collectPdfProjectionDiagnostics,
  projectGraphToPartialPdfPageModel,
  projectGraphToPdfPageModel,
  type PdfProjectionAssetArtifact,
} from "./pdf/project";

export type ProjectedDocumentModel = PptxPackageModel | PdfPageModel;
```

Add a `pdfProjectionCapability` parallel to `pptxProjectionCapability`, then switch on both
`"pptx"` and `"pdf"`. If the common `assets` type conflicts, introduce a local alias:

```ts
type ProjectionAssetArtifact = PptxProjectionAssetArtifact | PdfProjectionAssetArtifact;
```

- [ ] **Step 8: Run model and public-surface tests**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/pdf-model.test.ts tests/pdf/public-surface.test.tsx
```

Expected: PASS for model/profile tests and project shape tests. Render may still be skeletal until
Task 4, but it must produce `%PDF-1.7` bytes.

- [ ] **Step 9: Commit**

```bash
git add src/projection/pdf src/projection/registry.ts tests/pdf/pdf-model.test.ts tests/pdf/public-surface.test.tsx
git commit -m "feat: add pdf page model"
```

## Task 3: Font Asset Registration Through Integration

**Files:**

- Create: `tests/pdf/font-assets.test.tsx`
- Modify: `src/assets.ts`
- Modify: `src/integration-context.ts`
- Modify: `src/integration.ts`
- Modify: `src/plugin.ts`
- Modify: `src/plugin-compile-runtime.ts`
- Modify: `src/render-execution.ts`
- Modify: `src/asset-loading.ts`
- Modify: `src/pipeline/artifacts.ts`
- Modify: `src/projection/pdf/model.ts`
- Modify: `src/projection/pdf/project.ts`

- [ ] **Step 1: Write failing font asset tests**

Add `tests/pdf/font-assets.test.tsx`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src";
import { pdf } from "@/src/adapter";
import { integrationContextId, type AssetLoader, type DeckPlugin } from "@/src/integration";

const fontBytes = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]);

describe("PDF font assets", () => {
  test("accepts font asset registrations through plugin integration", async () => {
    const loaderCalls: string[] = [];
    const loader: AssetLoader = {
      resolverIdentity: "test:font-loader",
      async probe(context) {
        loaderCalls.push(`probe:${context.sourceField}:${context.assetEntityId}`);
        return {
          ok: true,
          value: {
            mediaType: "font/ttf",
            byteLength: fontBytes.byteLength,
            hash: "font-hash",
          },
        };
      },
      async load(context) {
        loaderCalls.push(`load:${context.sourceField}:${context.assetEntityId}`);
        return {
          ok: true,
          value: {
            mediaType: "font/ttf",
            byteLength: fontBytes.byteLength,
            hash: "font-hash",
            bytes: fontBytes,
          },
        };
      },
    };
    const plugin = {
      kind: "deckjsx.plugin",
      id: "test:fonts",
      integration: {
        id: integrationContextId("test:fonts"),
        assetLoaders: [loader],
        fontAssets: [
          {
            key: "inter-regular",
            family: "Inter",
            weight: 400,
            style: "normal",
            source: { kind: "bytes", bytes: fontBytes, mediaType: "font/ttf" },
          },
        ],
      },
    } satisfies DeckPlugin;
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.plugin(plugin);
    deck.slide({ name: "Font" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5, fontFamily: "Inter", fontWeight: 400 }}>
        Hello
      </p>
    ));

    const result = await deck.render(pdf({ inspection: "none" }));

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).not.toContain("W_PDF_FONT_FALLBACK");
    expect(loaderCalls.some((call) => call.startsWith("load:font"))).toBe(true);
  });

  test("warns and falls back when a font family has no registered asset", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Fallback" }, () => (
      <p style={{ x: 1, y: 1, width: 3, height: 0.5, fontFamily: "Missing Sans" }}>
        fallback
      </p>
    ));

    const result = await deck.render(pdf({ inspection: "none" }));

    expect(result.ok).toBe(true);
    expect(result.diagnostics.items.map((item) => item.code)).toContain("W_PDF_FONT_FALLBACK");
    expect(result.artifact?.format).toBe("pdf");
  });
});
```

- [ ] **Step 2: Run font asset tests and verify they fail**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/font-assets.test.tsx
```

Expected: FAIL because `fontAssets` is rejected by plugin integration validation and font loading is
not connected.

- [ ] **Step 3: Add font asset public integration types**

Modify `src/assets.ts`:

```ts
export type AssetSourceField = "src" | "data" | "poster" | "posterData" | "font";
```

Modify `src/integration-context.ts`:

```ts
import type { AssetLoader, AssetSource } from "./assets";

export type FontAssetRegistration = {
  readonly key: string;
  readonly family: string;
  readonly weight?: number;
  readonly style?: "normal" | "italic";
  readonly unicodeRange?: readonly string[];
  readonly source: AssetSource;
};

export type DeckIntegrationContext = {
  readonly id: IntegrationContextId;
  readonly assetLoaders?: readonly AssetLoader[];
  readonly fontAssets?: readonly FontAssetRegistration[];
  readonly mediaSourceOrigin?: MediaSourceOrigin;
};
```

Update `mergeIntegrationContexts`:

```ts
const fontAssets = contexts.flatMap((context) => context.fontAssets ?? []);

return {
  id,
  ...(assetLoaders.length > 0 ? { assetLoaders } : {}),
  ...(fontAssets.length > 0 ? { fontAssets } : {}),
  ...(mediaSourceOrigin ? { mediaSourceOrigin } : {}),
};
```

Modify `src/integration.ts` exports:

```ts
import {
  integrationContextId,
  type DeckIntegrationContext,
  type FontAssetRegistration,
  type IntegrationContextId,
} from "./integration-context";

export type { DeckIntegrationContext, FontAssetRegistration, IntegrationContextId };
```

- [ ] **Step 4: Accept `fontAssets` in plugin validation**

Modify the allowed integration keys in `src/plugin.ts`, `src/plugin-compile-runtime.ts`, and
`src/render-execution.ts` from:

```ts
["id", "assetLoaders", "mediaSourceOrigin"];
```

to:

```ts
["id", "assetLoaders", "fontAssets", "mediaSourceOrigin"];
```

Add this validator in `src/plugin.ts` and mirror it in the other validation modules:

```ts
function isFontAssetRegistrationArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof (entry as { key?: unknown }).key === "string" &&
        typeof (entry as { family?: unknown }).family === "string" &&
        ((entry as { weight?: unknown }).weight === undefined ||
          typeof (entry as { weight?: unknown }).weight === "number") &&
        ((entry as { style?: unknown }).style === undefined ||
          (entry as { style?: unknown }).style === "normal" ||
          (entry as { style?: unknown }).style === "italic") &&
        isAssetSource((entry as { source?: unknown }).source),
    )
  );
}
```

Update integration validators:

```ts
if (integration.fontAssets !== undefined && !isFontAssetRegistrationArray(integration.fontAssets)) {
  return "Deck plugin integration.fontAssets must be an array of Font Asset registrations.";
}
```

- [ ] **Step 5: Materialize registered font assets through the Asset Loading Boundary**

Prefer a small helper in `src/asset-loading.ts`:

```ts
import type { FontAssetRegistration } from "./integration-context";

export type ResolvedFontAssetArtifact = {
  readonly key: string;
  readonly family: string;
  readonly weight?: number;
  readonly style?: "normal" | "italic";
  readonly source: AssetSource;
  readonly probe?: AssetProbeResult;
  readonly load?: AssetLoadResult;
};

export async function loadRegisteredFontAssets(input: {
  registrations: readonly FontAssetRegistration[] | undefined;
  loaders?: readonly AssetLoader[];
}): Promise<{
  readonly artifacts: readonly ResolvedFontAssetArtifact[];
  readonly diagnostics: Diagnostics;
}> {
  const artifacts: ResolvedFontAssetArtifact[] = [];
  const diagnostics = [];

  for (const registration of input.registrations ?? []) {
    const loaded = await loadAssetSourceForRegisteredFont(registration, input.loaders);
    diagnostics.push(...loaded.diagnostics.items);
    artifacts.push({
      key: registration.key,
      family: registration.family,
      ...(registration.weight !== undefined ? { weight: registration.weight } : {}),
      ...(registration.style ? { style: registration.style } : {}),
      source: registration.source,
      ...(loaded.value ? { load: loaded.value, probe: loaded.value } : {}),
    });
  }

  return { artifacts, diagnostics: createDiagnostics(diagnostics) };
}
```

Implement `loadAssetSourceForRegisteredFont` by reusing the existing loader/built-in source
resolution branches. Use `sourceField: "font"` and `assetEntityId: font:${registration.key}`.

- [ ] **Step 6: Pass font artifacts into PDF projection**

Add an optional `fontAssets` field to project/render execution state, then pass it into
`projectGraphToPdfPageModel`. In `src/projection/pdf/project.ts`, match text `fontFamily` values
against loaded font artifact metadata. Initial fallback behavior:

```ts
const fallbackFont = {
  id: pdfResourceId("font", "Helvetica"),
  resourceName: "F1",
  family: "Helvetica",
  fallback: true,
} satisfies PdfFontResource;
```

When a requested family is missing, add:

```ts
diagnostic({
  severity: "warning",
  code: "W_PDF_FONT_FALLBACK",
  title: "PDF font fallback was used",
  message: `No registered font asset matched ${fontFamily}; using Helvetica fallback.`,
  labels: [{ path: "projection.pdf.fonts", message: fontFamily }],
});
```

- [ ] **Step 7: Run font asset tests**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/font-assets.test.tsx
```

Expected: PASS. If the first test still warns, inspect whether style resolution carries `fontFamily`
into the PDF projection and whether `fontWeight` is normalized before matching.

- [ ] **Step 8: Commit**

```bash
git add tests/pdf/font-assets.test.tsx src/assets.ts src/integration-context.ts src/integration.ts src/plugin.ts src/plugin-compile-runtime.ts src/render-execution.ts src/asset-loading.ts src/pipeline/artifacts.ts src/projection/pdf/model.ts src/projection/pdf/project.ts
git commit -m "feat: register pdf font assets"
```

## Task 4: Minimal PDF Writer With Structure Tests

**Files:**

- Create: `tests/pdf/pdf-writer.test.ts`
- Replace: `src/writers/pdf.ts`
- Create: `src/writers/pdf/objects.ts`
- Create: `src/writers/pdf/content.ts`
- Create: `src/writers/pdf/document.ts`
- Modify: `src/projection/pdf/validation.ts`

- [ ] **Step 1: Write failing PDF writer tests**

Add `tests/pdf/pdf-writer.test.ts`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { renderPdfPageModel } from "@/src/writers/pdf";
import { pdfDocumentId, pdfPageId, pdfResourceId } from "@/src/projection/pdf/identity";
import type { PdfPageModel } from "@/src/projection/pdf/model";

const decoder = new TextDecoder();

function minimalModel(): PdfPageModel {
  const fontId = pdfResourceId("font", "Helvetica");
  return {
    format: "pdf",
    version: "1.7",
    documentId: pdfDocumentId("writer-test"),
    metadata: { title: "Writer Test", producer: "deckjsx" },
    resources: {
      fonts: [
        {
          id: fontId,
          resourceName: "F1",
          family: "Helvetica",
          fallback: true,
        },
      ],
      images: [],
    },
    pages: [
      {
        id: pdfPageId("writer-test", 0),
        index: 0,
        mediaBox: { x: 0, y: 0, width: 200, height: 100 },
        resources: { fonts: [fontId], images: [] },
        content: [
          {
            op: "text",
            frame: { x: 10, y: 20, width: 100, height: 20 },
            text: "Hello PDF",
            fontResourceId: fontId,
            fontSizePt: 12,
            color: "#111111",
          },
        ],
      },
    ],
    fallbacks: [],
  };
}

describe("PDF writer", () => {
  test("emits a parseable PDF skeleton with xref and trailer", async () => {
    const result = await renderPdfPageModel(minimalModel(), { inspection: "none" });
    const text = decoder.decode(result.artifact?.bytes);

    expect(result.diagnostics.items).toEqual([]);
    expect(text.startsWith("%PDF-1.7\n")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/Type /Pages");
    expect(text).toContain("/Type /Page");
    expect(text).toContain("xref");
    expect(text).toContain("trailer");
    expect(text).toContain("startxref");
    expect(text).toContain("%%EOF");
  });

  test("serializes text operations into a content stream", async () => {
    const result = await renderPdfPageModel(minimalModel(), { inspection: "none" });
    const text = decoder.decode(result.artifact?.bytes);

    expect(text).toContain("BT");
    expect(text).toContain("/F1 12 Tf");
    expect(text).toContain("(Hello PDF) Tj");
    expect(text).toContain("ET");
  });
});
```

- [ ] **Step 2: Run writer tests and verify they fail**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/pdf-writer.test.ts
```

Expected: FAIL because the current writer emits only placeholder bytes.

- [ ] **Step 3: Implement PDF object serialization helpers**

Create `src/writers/pdf/objects.ts`:

```ts
export type PdfObject = {
  readonly id: number;
  readonly body: string | Uint8Array;
};

const encoder = new TextEncoder();

export function pdfName(value: string): string {
  return `/${value.replace(/[^A-Za-z0-9_.-]/g, "")}`;
}

export function pdfString(value: string): string {
  return `(${value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

export function pdfDictionary(entries: readonly [string, string | undefined][]): string {
  const body = entries
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `/${key} ${value}`)
    .join("\n");
  return `<<\n${body}\n>>`;
}

export function pdfStream(dictionary: string, content: string): string {
  const bytes = encoder.encode(content);
  return `${dictionary.replace(">>", `/Length ${bytes.byteLength}\n>>`)}\nstream\n${content}\nendstream`;
}
```

- [ ] **Step 4: Implement content stream serialization**

Create `src/writers/pdf/content.ts`:

```ts
import type { PdfContentOperation, PdfPageModel } from "../../projection/pdf/model";
import { pdfString } from "./objects";

function hexColorToRgb(color: string): readonly [number, number, number] {
  const normalized = color.startsWith("#") ? color.slice(1) : color;
  const value = Number.parseInt(normalized, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function serializeOperation(operation: PdfContentOperation, pageHeight: number): string {
  switch (operation.op) {
    case "setFillColor": {
      const [r, g, b] = hexColorToRgb(operation.color);
      return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} rg`;
    }
    case "text": {
      const [r, g, b] = hexColorToRgb(operation.color ?? "#000000");
      const x = operation.frame.x;
      const y = pageHeight - operation.frame.y - operation.fontSizePt;
      return [
        "BT",
        `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} rg`,
        `/${operation.fontResourceId.split(":").at(-1) === "helvetica" ? "F1" : "F1"} ${operation.fontSizePt} Tf`,
        `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
        `${pdfString(operation.text)} Tj`,
        "ET",
      ].join("\n");
    }
    case "image":
      return "";
  }
}

export function serializePdfPageContent(page: PdfPageModel["pages"][number]): string {
  return page.content
    .map((operation) => serializeOperation(operation, page.mediaBox.height))
    .filter((line) => line.length > 0)
    .join("\n");
}
```

Before committing, replace the hardcoded `F1` expression with a lookup from page/model resources if
multiple fonts are already in scope.

- [ ] **Step 5: Implement document assembly**

Create `src/writers/pdf/document.ts`:

```ts
import type { PdfPageModel } from "../../projection/pdf/model";
import { pdfDictionary, pdfStream, type PdfObject } from "./objects";
import { serializePdfPageContent } from "./content";

const encoder = new TextEncoder();

function joinBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function renderPdfDocument(model: PdfPageModel): Uint8Array {
  const objects: PdfObject[] = [];
  const catalogId = 1;
  const pagesId = 2;
  const infoId = 3;
  let nextId = 4;
  const pageObjectIds = model.pages.map(() => nextId++);
  const contentObjectIds = model.pages.map(() => nextId++);

  objects.push({
    id: catalogId,
    body: pdfDictionary([
      ["Type", "/Catalog"],
      ["Pages", `${pagesId} 0 R`],
    ]),
  });
  objects.push({
    id: pagesId,
    body: pdfDictionary([
      ["Type", "/Pages"],
      ["Count", String(model.pages.length)],
      ["Kids", `[${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}]`],
    ]),
  });
  objects.push({
    id: infoId,
    body: pdfDictionary([
      ["Producer", "(deckjsx)"],
      ["Title", model.metadata.title ? `(${model.metadata.title})` : undefined],
    ]),
  });

  model.pages.forEach((page, index) => {
    const contentId = contentObjectIds[index]!;
    objects.push({
      id: pageObjectIds[index]!,
      body: pdfDictionary([
        ["Type", "/Page"],
        ["Parent", `${pagesId} 0 R`],
        [
          "MediaBox",
          `[${page.mediaBox.x} ${page.mediaBox.y} ${page.mediaBox.width} ${page.mediaBox.height}]`,
        ],
        [
          "Resources",
          "<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>",
        ],
        ["Contents", `${contentId} 0 R`],
      ]),
    });
    objects.push({
      id: contentId,
      body: pdfStream("<<\n>>", serializePdfPageContent(page)),
    });
  });

  const chunks: Uint8Array[] = [encoder.encode(`%PDF-${model.version}\n`)];
  const offsets = [0];
  for (const object of objects.sort((a, b) => a.id - b.id)) {
    offsets[object.id] = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    chunks.push(encoder.encode(`${object.id} 0 obj\n`));
    chunks.push(typeof object.body === "string" ? encoder.encode(object.body) : object.body);
    chunks.push(encoder.encode("\nendobj\n"));
  }
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const maxObjectId = Math.max(...objects.map((object) => object.id));
  const xrefRows = ["0000000000 65535 f "];
  for (let id = 1; id <= maxObjectId; id += 1) {
    xrefRows.push(`${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n `);
  }
  chunks.push(
    encoder.encode(
      [
        "xref",
        `0 ${maxObjectId + 1}`,
        ...xrefRows,
        "trailer",
        pdfDictionary([
          ["Size", String(maxObjectId + 1)],
          ["Root", `${catalogId} 0 R`],
          ["Info", `${infoId} 0 R`],
        ]),
        "startxref",
        String(xrefOffset),
        "%%EOF",
        "",
      ].join("\n"),
    ),
  );

  return joinBytes(chunks);
}
```

- [ ] **Step 6: Replace the writer entry point**

Replace `src/writers/pdf.ts`:

```ts
import { combineDiagnostics, emptyDiagnostics } from "../diagnostics";
import type { PdfRenderOptions, WriterAdapterResult } from "../adapter/public";
import type { PdfPageModel } from "../projection/pdf/model";
import { validatePdfPageModel } from "../projection/pdf/validation";
import { renderPdfDocument } from "./pdf/document";

export async function renderPdfPageModel(
  model: PdfPageModel,
  _options: PdfRenderOptions = {},
): Promise<WriterAdapterResult<"pdf">> {
  const validation = validatePdfPageModel(model);
  if (validation.hasErrors) {
    return { diagnostics: validation };
  }

  return {
    diagnostics: combineDiagnostics(validation, emptyDiagnostics()),
    artifact: {
      format: "pdf",
      mediaType: "application/pdf",
      extension: "pdf",
      bytes: renderPdfDocument(model),
    },
  };
}
```

If `combineDiagnostics` does not exist, use the local project helper that merges diagnostics; if none
exists, return `validation` directly.

- [ ] **Step 7: Run writer tests**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/pdf-writer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run all PDF tests**

Run:

```bash
./node_modules/.bin/vp test tests/pdf
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add tests/pdf/pdf-writer.test.ts src/writers/pdf.ts src/writers/pdf src/projection/pdf/validation.ts
git commit -m "feat: emit minimal pdf documents"
```

## Task 5: PDF Projection From Layout Text

**Files:**

- Modify: `tests/pdf/public-surface.test.tsx`
- Modify: `src/projection/pdf/project.ts`
- Modify: `src/projection/pdf/model.ts`
- Modify: `src/projection/pdf/validation.ts`
- Modify: `src/writers/pdf/content.ts`

- [ ] **Step 1: Add failing text projection assertion**

Extend the render test in `tests/pdf/public-surface.test.tsx`:

```ts
const text = new TextDecoder().decode(result.artifact?.bytes);
expect(text).toContain("(PDF) Tj");
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/public-surface.test.tsx
```

Expected: FAIL because the current PDF projection creates empty page content.

- [ ] **Step 3: Project text nodes into PDF operations**

In `src/projection/pdf/project.ts`, use the same layout input/projection helpers consumed by PPTX
projection where possible. If the PPTX projection does not expose a reusable function, add a narrow
private helper inside PDF projection for the first slice:

```ts
function textOperationForLayoutNode(input: {
  node: ProjectedLayoutTextNode;
  fontResourceId: PdfResourceId;
}): PdfTextOperation {
  return {
    op: "text",
    frame: {
      x: input.node.frame.xEmu / 12700,
      y: input.node.frame.yEmu / 12700,
      width: input.node.frame.widthEmu / 12700,
      height: input.node.frame.heightEmu / 12700,
    },
    text: input.node.content.text,
    fontResourceId: input.fontResourceId,
    fontSizePt: input.node.style.fontSizePt ?? 12,
    ...(input.node.style.color ? { color: input.node.style.color } : {}),
    origin: input.node.origin,
  };
}
```

Use a fallback Helvetica resource when no registered font is matched:

```ts
const fallbackFontId = pdfResourceId("font", "Helvetica");
const fallbackFont: PdfFontResource = {
  id: fallbackFontId,
  resourceName: "F1",
  family: "Helvetica",
  fallback: true,
};
```

Make the first page include:

```ts
resources: { fonts: [fallbackFontId], images: [] },
content: textOperations,
```

- [ ] **Step 4: Preserve deterministic font resource names**

Add a helper:

```ts
function resourceNameForIndex(prefix: "F" | "Im", index: number): string {
  return `${prefix}${index + 1}`;
}
```

Use resource names from `PdfFontResource.resourceName` in `src/writers/pdf/content.ts` instead of
hardcoding `/F1`.

- [ ] **Step 5: Run public-surface and writer tests**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/public-surface.test.tsx tests/pdf/pdf-writer.test.ts
```

Expected: PASS with actual text serialized into the PDF content stream.

- [ ] **Step 6: Commit**

```bash
git add tests/pdf/public-surface.test.tsx src/projection/pdf/project.ts src/projection/pdf/model.ts src/projection/pdf/validation.ts src/writers/pdf/content.ts
git commit -m "feat: project pdf text content"
```

## Task 6: Node Write Support For PDF Artifacts

**Files:**

- Modify: `plugins/node/tests/write.test.tsx`
- Modify: `plugins/node/tests/types/plugins-public-api.ts`
- Modify: `plugins/node/src/index.ts`

- [ ] **Step 1: Convert unsupported PDF test into write support test**

In `plugins/node/tests/write.test.tsx`, replace the unsupported artifact expectation with:

```ts
test("writes pdf artifacts as ordinary files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "deckjsx-node-write-pdf-"));
  const outputPath = path.join(directory, "out.pdf");
  const render = await renderUnsupportedArtifact();

  const result = await write(render, outputPath);

  expect(result).toMatchObject({
    ok: true,
    path: outputPath,
    status: "written",
    strategy: "write-file",
    patchedParts: [],
    diagnostics: [],
  });
  expect(await readFile(outputPath, "utf8")).toBe("%PDF-1.7\n");
});
```

Rename `renderUnsupportedArtifact` to `renderPdfArtifact` if that improves readability.

- [ ] **Step 2: Run the targeted Node write test and verify failure**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/write.test.tsx -t "writes pdf artifacts as ordinary files"
```

Expected: FAIL with `deckjsx.node.write.unsupportedFormat`.

- [ ] **Step 3: Allow PDF ordinary writes**

In `plugins/node/src/index.ts`, replace:

```ts
if (artifact.format !== "pptx") {
  return finishWrite({
    path: outputPath,
    status: "failed",
    strategy: "write-file",
    bytesWritten: 0,
    patchedParts: [],
    diagnostics: [
      {
        code: "deckjsx.node.write.unsupportedFormat",
        message: `@deckjsx/node write() can only write pptx artifacts, got ${artifact.format}.`,
        path: outputPath,
      },
    ],
  });
}
```

with:

```ts
if (artifact.format !== "pptx" && artifact.format !== "pdf") {
  return finishWrite({
    path: outputPath,
    status: "failed",
    strategy: "write-file",
    bytesWritten: 0,
    patchedParts: [],
    diagnostics: [
      {
        code: "deckjsx.node.write.unsupportedFormat",
        message: `@deckjsx/node write() can only write pptx or pdf artifacts, got ${artifact.format}.`,
        path: outputPath,
      },
    ],
  });
}
```

Before any patch-plan inspection branch, add:

```ts
if (artifact.format === "pdf") {
  const written = await writeArtifactBytes(outputPath, artifact.bytes);
  return finishWrite({
    path: outputPath,
    status: "written",
    strategy: "write-file",
    bytesWritten: written.bytesWritten,
    patchedParts: [],
    diagnostics: [],
  });
}
```

Use the existing helper that performs ordinary whole-file writes; if it is not named
`writeArtifactBytes`, extract one from the existing whole-archive fallback path.

- [ ] **Step 4: Add public plugin type coverage**

In `plugins/node/tests/types/plugins-public-api.ts`, add:

```ts
declare const pdfRenderResult: import("deckjsx").RenderResult;
const pdfWritePromise = write(pdfRenderResult, "/project/out.pdf");
pdfWritePromise satisfies Promise<import("@deckjsx/node").WriteResult>;
```

- [ ] **Step 5: Run Node write tests**

Run:

```bash
./node_modules/.bin/vp test plugins/node/tests/write.test.tsx plugins/node/tests/types/plugins-public-api.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/node/tests/write.test.tsx plugins/node/tests/types/plugins-public-api.ts plugins/node/src/index.ts
git commit -m "feat: write pdf artifacts from node"
```

## Task 7: Verification Harness And Fixture Growth

**Files:**

- Create: `tests/pdf/verification.test.tsx`
- Create: `tests/pdf/fixtures/simple-static.tsx`
- Modify: `package.json` only if adding a named script is justified

- [ ] **Step 1: Add structure and text verification tests**

Create `tests/pdf/verification.test.tsx`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { Deck } from "@/src";
import { pdf } from "@/src/adapter";

const decoder = new TextDecoder();

describe("PDF verification harness", () => {
  test("checks emitted PDF structure without relying on byte equality", async () => {
    const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
    deck.slide({ name: "Verify" }, () => (
      <main style={{ x: 1, y: 1, width: 4, height: 2 }}>
        <p style={{ width: 3, height: 0.5, fontSize: 18 }}>Verification text</p>
      </main>
    ));

    const result = await deck.render(pdf({ inspection: "none" }));
    const text = decoder.decode(result.artifact?.bytes);

    expect(result.ok).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/Type /Pages");
    expect(text).toContain("/Type /Page");
    expect(text).toContain("(Verification text) Tj");
    expect(text).toMatch(/xref\n0 \d+/);
    expect(text).toMatch(/startxref\n\d+/);
  });
});
```

- [ ] **Step 2: Run verification tests**

Run:

```bash
./node_modules/.bin/vp test tests/pdf/verification.test.tsx
```

Expected: PASS after Tasks 1-6.

- [ ] **Step 3: Add an optional LibreOffice raster oracle note, not core dependency**

Do not add core code for LibreOffice. If adding a future fixture script, keep it outside core render
and make the test opt-in:

```ts
const runLibreOfficeOracle = process.env.DECKJSX_PDF_LIBREOFFICE_ORACLE === "1";
test.skipIf(!runLibreOfficeOracle)("matches LibreOffice raster baseline", async () => {
  // Future work: render PPTX, convert with soffice, rasterize, compare pixels.
});
```

- [ ] **Step 4: Commit**

```bash
git add tests/pdf/verification.test.tsx tests/pdf/fixtures/simple-static.tsx package.json
git commit -m "test: add pdf verification harness"
```

Only include `package.json` in the commit if a real script was added.

## Task 8: Final Checks And Documentation Alignment

**Files:**

- Modify: `docs/superpowers/specs/2026-07-01-pdf-output-design.md`
- Modify: `CONTEXT.md` only if implementation changed terms
- Modify: `docs/adr/0015-pdf-projection-and-runtime-boundary.md` only if model/writer boundary changed
- Modify: `docs/adr/0016-font-assets-through-integration.md` only if font asset flow changed

- [ ] **Step 1: Run full project verification**

Run:

```bash
./node_modules/.bin/vp check
```

Expected: PASS with no formatting, lint, or type errors.

Run:

```bash
./node_modules/.bin/vp test
```

Expected: PASS all tests.

- [ ] **Step 2: Build package artifacts**

Run:

```bash
./node_modules/.bin/vp build
```

Expected: PASS and generated dist types include `pdf()` and `"pdf"` format typings.

- [ ] **Step 3: Review implementation against the spec**

Checklist:

- `pdf()` exists in `deckjsx/adapter`.
- `deck.project({ format: "pdf" })` returns a PDF Page Model.
- `deck.render(pdf())` returns `RenderedArtifact<"pdf">`.
- PDF Page Model is deckjsx-owned and close to PDF page/resource/content-stream structure.
- PDF writer does not call LibreOffice or Node-only process APIs.
- Font assets enter through Deck Plugin integration, not styles.
- Missing font emits stable warning fallback.
- `@deckjsx/node write()` writes PDF artifacts as ordinary files.
- Structure/text verification tests exist.

- [ ] **Step 4: Update docs if implementation diverged**

Keep the public call shape aligned with the design: `deck.project({ format: "pdf" })` for explicit
projection and `new Deck({ output: { format: "pdf" } })` for deck-level default output preference.
Do not document `deck.project({ output: { format: "pdf" } })`; `output` belongs to Deck options, not
Project options.

- [ ] **Step 5: Commit final documentation alignment**

```bash
git add docs/superpowers/specs/2026-07-01-pdf-output-design.md CONTEXT.md docs/adr/0015-pdf-projection-and-runtime-boundary.md docs/adr/0016-font-assets-through-integration.md
git commit -m "docs: align pdf implementation notes"
```

Skip the commit if there are no documentation changes.

## Self-Review

- Spec coverage: public `pdf()`, PDF projection, PDF Page Model, writer boundary, font assets, Node
  write, LibreOffice-as-verification-only, and TDD-style tests all have tasks.
- Known gap: raster comparison against LibreOffice is planned as opt-in harness scaffolding, not
  fully implemented in this first plan. That matches the goal of getting the model and first writer
  slice solid before visual fixture expansion.
- Type consistency: the plan uses `PdfPageModel`, `PdfSpecificationProfile`,
  `FontAssetRegistration`, and `RenderedArtifact<"pdf">` consistently.
- Placeholder scan: no placeholder markers or open-ended "add tests later" steps are intended. If
  execution finds an existing helper name differs, adapt locally and keep the same behavior.

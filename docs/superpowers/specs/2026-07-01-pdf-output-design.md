# PDF Output Design

## Status

Draft for review. This document captures the agreed direction for first-class PDF generation in
deckjsx. It is a design/specification artifact only; implementation should wait until this spec is
reviewed.

## Goals

- Add PDF as a first-class `ProjectionFormat` and `WriterAdapter` target through `format: "pdf"` and
  `pdf()` from `deckjsx/adapter`.
- Project the same Semantic Author Graph into a PDF-specific Projected Document Model, not through
  PPTX conversion and not through a shared Presentation IR.
- Produce PDF bytes in runtime-neutral environments when all required assets are supplied as
  runtime-neutral data, preserving the long-term Edge-runtime direction.
- Make static PDF fidelity a serious target: layout, text, fonts, fills, strokes, images,
  backgrounds, tables, clipping, transforms, opacity, z-order, and non-interactive visual effects.
- Treat LibreOffice-generated PDF from deckjsx PPTX as a verification oracle only.
- Route font programs through the existing Deck Plugin integration and Asset Loading Boundary while
  keeping style authoring CSS-like through `fontFamily` strings.

## Non-Goals

- No runtime LibreOffice dependency.
- No PPTX-to-PDF conversion as the production PDF path.
- No shared format-neutral drawing/model layer for writers.
- No Node-only filesystem font lookup in core.
- No video thumbnail generation from video bytes in core.
- No editable PowerPoint semantics in PDF output.
- No live sandbox UI in the first slice.

## Primary References

The PDF model phase should consult primary references before shaping concrete model fields:

- ISO 32000-2:2020 / PDF 2.0, available through ISO's PDF standard page:
  https://www.iso.org/standard/75839.html
- PDF Association's PDF specification index and no-cost ISO 32000-2 access notes:
  https://pdfa.org/resource/pdf-specification-index/
- Adobe PDF 1.7 reference material for compatibility-era object/content-stream structure:
  https://opensource.adobe.com/dc-acrobat-sdk-docs/
- OpenType specification for font metadata, tables, and embedding-related details:
  https://learn.microsoft.com/en-us/typography/opentype/spec/
- CSS Fonts Module Level 4 for CSS-like family, weight, style, and fallback matching semantics:
  https://www.w3.org/TR/css-fonts-4/

These references should drive the deckjsx-owned PDF Specification Profile, not the public API of a
temporary writer library.

## Architecture

The intended pipeline is:

```text
Deck authoring
  -> Compile: Semantic Author Graph
  -> Asset boundary: media assets + font assets
  -> Project(format: "pdf"): PDF Page Model
  -> Render(pdf()): RenderedArtifact<"pdf">
  -> @deckjsx/node write(): out.pdf
```

PDF should be parallel to PPTX at the Projected Document Model layer:

- PPTX projection produces a Pptx Package Model.
- PDF projection produces a PDF Page Model.
- Both consume graph, style, layout, and asset artifacts.
- Neither is the source of truth for the other.

The PDF Page Model should be close to PDF physical structure for writer speed and clarity:

- document catalog and metadata
- pages and page boxes
- page resource dictionaries
- reusable resource identities
- font resources and embedded font program references
- image XObjects
- content stream operations
- cross-reference/trailer serialization requirements at the writer boundary

Sandbox-style explanations, such as why text wrapped at a line or which fallback was chosen, should
be derived inspection views over graph/layout/projection artifacts. They should not become the PDF
writer's input model.

## Public Surface

The public-facing shape should be small:

```ts
import { pdf } from "deckjsx/adapter";

const project = await deck.project({ format: "pdf" });
const artifact = await deck.render(pdf());
await write(artifact, "out.pdf");
```

Required surface changes:

- Extend `ProjectionFormat` to include `"pdf"`.
- Export `pdf()` from `deckjsx/adapter`.
- Allow `deck.project({ format: "pdf" })` to return a Project Result with the PDF Page Model.
- Allow `@deckjsx/node write()` to write rendered PDF artifacts as ordinary artifact bytes.
- Keep PPTX patch plans and in-place patch behavior PPTX-only.

## Font Assets

Font bytes should enter through Deck-owned integration data, extending the current asset flow:

```ts
deck.plugin({
  kind: "deckjsx.plugin",
  id: "example:font-assets",
  name: "example:font-assets",
  integration: {
    id: integrationContextId("example:font-assets"),
    assetLoaders: [publicAssets],
    fontAssets: [
      {
        key: "inter-regular",
        family: "Inter",
        weight: 400,
        style: "normal",
        source: {
          kind: "bytes",
          bytes: interRegularBytes,
          mediaType: "font/ttf",
        },
      },
    ],
  },
} satisfies DeckPlugin);
```

The registration key is stable asset identity. Text style matching should use declared family,
weight, style, and range metadata rather than treating the key as the authored family name.

Style remains CSS-like:

```tsx
<p style={{ fontFamily: "Inter", fontWeight: 400 }}>Hello</p>
```

Core should not resolve CSS `url(...)`, open filesystem paths, or read system fonts. If a font
family reference cannot be matched to a registered usable Font Asset, PDF projection/render should
emit a stable warning and use a standard PDF fallback font initially. Verification and CI can treat
that warning as a failure without adding a dedicated `fontPolicy` option.

## Model Research Phase

Model creation needs its own implementation phase before broad visual coverage. The phase should
produce:

- A PDF Specification Profile documenting which PDF version/features deckjsx initially emits.
- Typed model shapes for pages, boxes, resources, content operations, text objects, graphics state,
  paths, images, fonts, metadata, and fallback records.
- Validation rules that reject structurally invalid PDF Page Models before Render.
- Fixture PDFs or fixture model snapshots for minimal pages, multi-page documents, text, embedded
  fonts, images, transparency, clipping, and table-like geometry.
- Tests that parse or inspect emitted PDF structure rather than only smoke-testing bytes.

The model should optimize for direct writer emission. It may use a low-level Edge-safe PDF library
inside the first writer, but the deckjsx projection model must remain deckjsx-owned so the writer can
be replaced later.

## Error Handling

Blocking errors:

- Invalid PDF Page Model structure before Render.
- Missing required loaded asset bytes when an image or font cannot be embedded and no valid fallback
  exists.
- Writer inability to serialize a valid projected PDF field.

Nonblocking warnings:

- Missing font match with standard PDF font fallback.
- Video without authored poster image, with a static fallback.
- Static visual semantics preserved in projection but approximated in current PDF output.
- Unsupported output detail that has a declared Projected Fallback Strategy.

Warnings should not make `ok` false by default. Strict verification workflows can fail selected
warning codes.

## Verification Strategy

The implementation should keep a TDD-like rhythm with red tests before each slice:

- Public API red tests for `pdf()`, `format: "pdf"`, Project Result shape, and Rendered Artifact
  format.
- Font asset registration tests through `DeckIntegrationContext`, including matching and fallback
  diagnostics.
- PDF structure tests for page count, page boxes, resources, content streams, metadata, embedded
  fonts, and image XObjects.
- Text extraction or document semantic checks where reliable enough to catch missing text/font
  regressions.
- Raster visual comparison against LibreOffice-produced PDF from deckjsx PPTX for fidelity fixtures.
- Warning policy tests so known approximations are stable and strict CI can elevate them.

LibreOffice is only part of verification tooling. The core PDF Project/Render path must not call it
or depend on process execution.

## Implementation Phases

1. Public API and projection format plumbing:
   Add `"pdf"` format plumbing, `pdf()` adapter export, and red tests around project/render/write
   surface behavior.

2. Font asset integration:
   Extend `DeckIntegrationContext` with font asset registration, route font sources through the
   existing Asset Loading Boundary, and add matching/fallback diagnostics tests.

3. PDF Specification Profile and PDF Page Model:
   Research official PDF/font/CSS references, define the initial emitted PDF profile, create the
   deckjsx-owned model, validation rules, and structure-level tests.

4. Minimal writer vertical slice:
   Emit valid PDF bytes for pages, metadata, text with registered fonts or fallback fonts, and simple
   graphics operations from the PDF Page Model.

5. Node write support:
   Allow `@deckjsx/node write()` to write PDF artifacts as normal bytes while preserving PPTX patch
   behavior only for PPTX.

6. Verification harness:
   Add structure inspection, text/font checks, metadata checks, and LibreOffice raster oracle
   fixtures.

7. Static surface expansion:
   Expand visual coverage fixture by fixture: images, backgrounds, strokes/fills, clipping,
   transforms, opacity, z-order, tables, and visual fallbacks.

## Open Design Risks

- PDF text shaping and line-breaking fidelity may require a stronger text layout subsystem than the
  first PDF writer can provide. The model should preserve Text Layout Decisions so sandbox and
  verification can expose gaps instead of hiding them.
- Font subsetting and embedding can affect both file size and text extraction behavior. The initial
  writer can embed conservatively, but the model should not make subsetting impossible later.
- Some PPTX visual behavior may not map exactly to PDF operations. Projection should preserve
  authored values and fallback records instead of silently flattening unsupported semantics.
- The first low-level PDF library may influence emission details. The PDF Page Model must stay
  library-independent enough to replace that writer.

## Self-Review

- The design keeps PDF independent from PPTX conversion and from a shared Presentation IR.
- The model phase is explicit and specification-led, with primary references listed.
- Font assets follow existing Deck Plugin integration and asset loading direction.
- The implementation plan starts with public red tests and model/structure tests before visual
  expansion.
- LibreOffice is confined to verification.

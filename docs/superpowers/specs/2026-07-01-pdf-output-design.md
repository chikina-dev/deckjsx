# PDF Output Design

## Status

Implemented as a production-shaped PDF path that is still expanding toward full static fidelity. The
current implementation covers the public `pdf()` adapter, `deck.project({ format: "pdf" })`, a
deckjsx-owned PDF Page Model, visual projection, a direct PDF writer, byte-backed font asset
registration, ordinary `@deckjsx/node write()` PDF artifact writes, inspection summaries, and
structure/text verification tests.

This is not yet a complete static-fidelity PDF renderer. The current path proves the runtime-neutral
format boundary and a deckjsx-owned writer for the main static surface; broad visual parity with
PPTX/LibreOffice PDF output remains future work, while representative raster-oracle coverage is now
part of verification.

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
family reference cannot be matched to a registered usable Font Asset, ASCII/WinAnsi text can use a
standard PDF fallback font with a stable warning. Text containing glyphs outside that encoding must
produce `E_PDF_UNRESOLVED_FONT_GLYPH` and no rendered artifact; callers must register an embeddable
Font Asset with the necessary glyph coverage. This makes missing Unicode coverage explicit without
adding a dedicated `fontPolicy` option.

The current font integration accepts runtime-neutral byte font sources directly in `fontAssets` and
routes non-byte sources through the Asset Loading Boundary. Core never opens filesystem paths or
looks up system fonts itself. Node applications can register local path-backed assets with
`nodeFontAssets()` from `@deckjsx/node`; its Node loader resolves relative paths from a configured
root and constrains them to that root. URL and CSS `url(...)` font sources remain future work.

Registered font bytes are embedded when the font data is usable and the requested glyphs can be
mapped. PDF projection emits a stable `W_PDF_FONT_FALLBACK` warning and uses a standard Helvetica
fallback resource when compatible WinAnsi text has no exact registered match. It emits
`E_PDF_UNRESOLVED_FONT_GLYPH` instead when no registered Unicode font can map a required glyph, so
non-ASCII text is never silently substituted or dropped.

OpenType shaping and bidirectional analysis are isolated behind deckjsx-owned `ShapedText`,
`ShapedTextGlyph`, and visual-run boundaries. The current implementation uses `fontkit` for shaping
and `bidi-js` for UAX #9 analysis, but no external `Font`, `GlyphRun`, or bidi-analysis object crosses
into layout or the PDF Page Model. Engine failures are returned as `W_FONT_SHAPING_FALLBACK` or
`W_TEXT_BIDI_FALLBACK` diagnostics; the existing deterministic TrueType metrics path remains
available when shaping is unavailable. This keeps both engines replaceable without changing public
or writer-facing model types. Supported shaped output includes LTR substitutions, mark positioning,
mixed RTL/LTR runs with number and bracket reordering, and visual-run script segmentation for Latin,
Greek, Cyrillic, Armenian, Georgian, Hebrew, Arabic, major Indic scripts, Thai, Lao, Myanmar, and
Khmer. When visual glyph order differs, logical source text is retained as PDF `ActualText` for copy
and extraction.

## Current Initial-Slice Limitations

The current implementation intentionally stops short of full static visual fidelity:

- PDF projection now covers the main static visual surface, but it still records structured fallback
  semantics for authored CSS-like behavior that PDF projection cannot faithfully reproduce.
- The writer emits a direct PDF object graph for pages, resource dictionaries, fonts, images,
  gradients, content streams, annotations, xref, trailer, and metadata.
- Registered font assets can be embedded when usable data is available. Missing or unusable font
  requests use fallback resources only for WinAnsi-compatible text; unresolved Unicode glyphs fail
  PDF projection with `E_PDF_UNRESOLVED_FONT_GLYPH` and do not produce an artifact.
- Registered non-ASCII text is projected through Identity-H Unicode font resources and ToUnicode maps
  where the model provides the required font/encoding contract. Direct model writes still reject
  unsupported text unless callers declare `textEncoding: "utf16be"` with an Identity-H font resource.
- Registered TrueType font glyph widths drive shared layout and PDF text measurement for wrapping,
  word breaking, shrink-to-fit, justification, and tab alignment, including following inline runs.
  Legacy TrueType
  kern pairs and OpenType GPOS `kern` pair-adjustment lookups (simple and class-based) drive
  matching PDF TJ text output. OpenType substitutions, x/y-positioned marks, UAX #9 visual-order bidi
  runs, and selected script-specific segmentation can now be emitted as deckjsx glyph runs with
  CID/ToUnicode mappings. Full shaping remains incomplete for scripts outside the supported
  segmentation map and other GPOS lookups;
  scrolling/ellipsis overflow modes, rich text run positioning, and
  sandbox-explainable text layout decisions remain future work. Text inherited from an
  overflow-hidden parent retains its source coordinates and is clipped to the parent frame; self
  overflow-hidden text is clipped to its own frame in PDF output, including underline and strike
  decorations. Overflow clip frames remain
  axis-aligned and are applied before text or decoration transforms; clipped text hyperlink
  annotations are restricted to the visible intersection.
- Fills, strokes, backgrounds, clipping, transforms, opacity, blend modes, gradients, image XObjects,
  z-order, links, and table geometry are implemented for the supported subset, with remaining gaps
  surfaced through diagnostics and inspection summaries.
- The LibreOffice-derived verification path is a direction and fixture strategy, not proof of broad
  visual parity in this initial slice.

These limitations should be visible as diagnostics where authored content would otherwise be lost or
rendered misleadingly. Strict workflows can fail on the warning/error codes while the PDF surface is
expanded fixture by fixture.

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

4. Direct writer vertical slice:
   Emit valid PDF bytes for pages, metadata, text with registered fonts or fallback fonts, images,
   shapes, gradients, annotations, and visual operations from the PDF Page Model.

5. Node write support:
   Allow `@deckjsx/node write()` to write PDF artifacts as normal bytes while preserving PPTX patch
   behavior only for PPTX.

6. Verification harness:
   Add structure inspection, text/font checks, metadata checks, and LibreOffice raster oracle
   fixtures.

7. Static surface expansion:
   Expand visual coverage fixture by fixture: images, backgrounds, strokes/fills, clipping,
   transforms, opacity, z-order, tables, and visual fallbacks.

Current implementation status:

- Completed: public PDF plumbing, PDF Specification Profile and Page Model, direct writer,
  byte-backed font asset registration, text/images/shapes/fills/strokes/backgrounds/tables/static
  video poster projection, links, opacity/blend mode support, inspection summaries, Node PDF writes,
  and structure/text verification.
- Deferred: complete PowerPoint visual parity, full text shaping, exhaustive measured line breaking,
  richer raster comparison, and the sandbox UI.

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

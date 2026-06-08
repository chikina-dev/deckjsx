# Public interface seams

## Status

Accepted

## Context

deckjsx's package root had grown into a broad public surface that exposed authoring elements, style and theme authoring, diagnostics, graph internals, resolved style inspection types, legacy Presentation IR types, and the then-current pptxgenjs adapter from the same import path.

That made the package root look like every public type was ordinary authoring vocabulary. This conflicted with the project language:

- The Semantic Author Graph is canonical, but it is still an output-agnostic internal model raised from authoring.
- The Resolved Style Inspection View is for inspection, not the main authored style payload.
- Presentation IR is a legacy projection and should not appear to be the required step for future output projection.
- The Authoring Interface should help users write decks, not teach them graph internals or legacy output machinery first.

## Decision

Split the public package surface into three seams:

- `deckjsx` is the Authoring Interface. It exposes Deck, JSX authoring elements, Theme, StyleSheet, diagnostics, compile result contracts that authoring code handles, and authoring type helpers.
- `deckjsx/inspect` is the Inspection Interface. It exposes Semantic Author Graph types, graph entity types, graph identity types, and resolved style inspection types.
- `deckjsx/adapter` is the Adapter Interface. At the time of this ADR it exposed Writer Adapters
  such as the temporary pptxgenjs adapter. ADR-0004 supersedes that concrete adapter for v0.8.0:
  core exposes `pptx()` for the direct PPTX writer, and any future pptxgenjs bridge belongs outside
  the core package.

`CompileInspectResult` may remain reachable from the Authoring Interface because it is part of the `Deck.compile({ mode: "inspect" })` result contract. The detailed graph and resolved-style vocabulary belongs to the Inspection Interface.

ADR-0003 supersedes this compile-result detail for v0.6: compile becomes result-first and no longer changes top-level return shape through inspect mode.

ADR-0003 also supersedes the Legacy Interface portion of this decision for v0.6: the package no longer exports `deckjsx/legacy` as a public seam.

Theme and StyleSheet remain authoring concepts. Concrete authoring style types such as ViewStyle, TextStyle, TextRunStyle, ImageStyle, ShapeStyle, SlideStyle, className types, and CSS-like helper types may remain in the Authoring Interface. Implementation-helper types such as ThemeInstance and StyleSheet inference internals should not be ordinary package-root exports.

Author Tree node types and direct AuthorNode inspection helpers are not part of the Authoring Interface. JSX authoring result and intrinsic element types may remain where needed for authoring.

For v0.8.0 and later, the seam split is also enforced at the package boundary. The export map should
be an allowlist of intentional public entry files, not a convenience path into the built directory.
Wildcard subpaths, generated chunks, direct writer modules, projection helper modules, runtime output
modules, ZIP/sink modules, XML emitters, and package-build storage are not public seams simply
because they exist in `dist`.

Generated declaration files must also respect the seams. A public type may describe authoring,
adapter selection, inspection data, diagnostics, stage results, and semantic adapter options, but it
should not import or name internal writer storage, Build Artifacts, Asset Artifacts, XML chunks,
fflate configuration, sink handles, or Assembly Plan implementation types.

## Consequences

- Root autocomplete should emphasize deck authoring instead of graph or legacy output machinery.
- Inspect users get an explicit import path for graph and resolved style inspection.
- Writer Adapter users get an explicit import path that keeps render-time adapter selection out of ordinary authoring vocabulary.
- Type tests should be split by public seam so each test file documents one user-facing interface.
- Public-surface tests should check export-map subpaths, export-map targets, public declaration
  output, and dependency drift, not only TypeScript source barrels.
- This is a breaking public import change, accepted while the library is still pre-HMR and breaking changes are allowed.

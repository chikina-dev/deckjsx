# Public interface seams

## Status

Accepted

## Context

deckjsx's package root had grown into a broad public surface that exposed authoring elements, style and theme authoring, diagnostics, graph internals, resolved style inspection types, legacy Presentation IR types, and the current pptxgenjs adapter from the same import path.

That made the package root look like every public type was ordinary authoring vocabulary. This conflicted with the project language:

- The Semantic Author Graph is canonical, but it is still an output-agnostic internal model raised from authoring.
- The Resolved Style Inspection View is for inspection, not the main authored style payload.
- Presentation IR is a legacy projection and should not appear to be the required step for future output projection.
- The Authoring Interface should help users write decks, not teach them graph internals or legacy output machinery first.

## Decision

Split the public package surface into three seams:

- `deckjsx` is the Authoring Interface. It exposes Deck, JSX authoring elements, Theme, StyleSheet, diagnostics, compile result contracts that authoring code handles, and authoring type helpers.
- `deckjsx/inspect` is the Inspection Interface. It exposes Semantic Author Graph types, graph entity types, graph identity types, and resolved style inspection types.
- `deckjsx/legacy` is the Legacy Interface. It exposes Presentation IR types and current legacy rendering/output adapters such as the pptxgenjs backend.

`CompileInspectResult` may remain reachable from the Authoring Interface because it is part of the `Deck.compile({ mode: "inspect" })` result contract. The detailed graph and resolved-style vocabulary belongs to the Inspection Interface.

Theme and StyleSheet remain authoring concepts. Concrete authoring style types such as ViewStyle, TextStyle, TextRunStyle, ImageStyle, ShapeStyle, SlideStyle, className types, and CSS-like helper types may remain in the Authoring Interface. Implementation-helper types such as ThemeInstance and StyleSheet inference internals should not be ordinary package-root exports.

Author Tree node types and direct AuthorNode inspection helpers are not part of the Authoring Interface. JSX authoring result and intrinsic element types may remain where needed for authoring.

## Consequences

- Root autocomplete should emphasize deck authoring instead of graph or legacy output machinery.
- Inspect users get an explicit import path for graph and resolved style inspection.
- Legacy output users get an explicit import path that marks Presentation IR and pptxgenjs backend support as legacy.
- Type tests should be split by public seam so each test file documents one user-facing interface.
- This is a breaking public import change, accepted while the library is still pre-HMR and breaking changes are allowed.

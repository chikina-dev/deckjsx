# Diagnostics-first dependency boundaries

deckjsx should make PDF, PPTX, and similar generated outputs feel as approachable to author as web UI, so expected generation problems should surface through Diagnostics and stage results rather than through deckjsx-thrown errors that users must catch. Users may still wrap their own programs in `try`/`catch`, but deckjsx's generation contract should guide them through Diagnostics.

While deckjsx still depends on document, runtime, or rendering libraries with exception-shaped failure behavior, those failures should be isolated inside explicit Dependency Boundaries and translated into Diagnostics before they reach the Authoring Interface. Integration Boundaries such as plugins, asset loaders, writer adapters, and runtime services should prefer Diagnostics or Result-like outcomes for expected failures so dependency exception vocabulary does not become the long-term deckjsx programming model.

This accepts extra boundary code in the short term, but keeps that code local to dependency isolation while the project moves toward fewer library-owned failure modes and more deckjsx-owned validation, projection, and writer behavior.

## Boundary classification

Remaining exception-shaped code should be interpreted by boundary type:

- Expected authoring, style, asset, projection, or render problems should become Diagnostics, failed stage results, or unsupported semantic metadata.
- Dependency Boundaries may catch foreign library failures while deckjsx still depends on exception-shaped libraries, but the catch should stay local and translate into deckjsx vocabulary immediately.
- Integration Boundaries may catch plugin, asset loader, adapter, or runtime-service failures when the foreign code can throw, but the public stage result should still expose Diagnostics instead of requiring deckjsx users to catch.
- Writer and model invariant failures may still throw when a lower layer receives an impossible projected model. These are internal contract violations, not the author-facing generation contract. When an invariant can be reached from ordinary author input, validation should move earlier so the user sees Diagnostics instead.

Existing CSS-like parser functions that throw for unsupported syntax are legacy internal APIs. Callers that handle expected syntax gaps should convert those results into unsupported semantic metadata through a narrow Result-like helper; the long-term direction is to make these parsers return explicit result values so parser failure does not need exception flow at all.

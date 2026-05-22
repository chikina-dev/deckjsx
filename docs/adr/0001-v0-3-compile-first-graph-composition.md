# v0.3 compile-first graph composition

v0.3 will introduce graph composition as a compile-first feature: Deck sources are composed into source-aware author roots, then raised into the Semantic Author Graph, while legacy `render()` and `output()` do not receive a separate composed-output path. This keeps Source Context, Composition Context, Source Identity, Source Slots, and Bound Source behavior aligned around the canonical graph model instead of extending the legacy rendering bridge.

## Consequences

- `compile()` is the first supported surface for composed decks.
- Mounted sources in legacy `render()` or `output()` should throw rather than silently omit content.
- `Deck<TSourceContext = void>`, `mount()`, `withSource()`, and `BoundSource` become the public composition vocabulary.
- Source Context Mappers are synchronous and derive child Source Context only from parent Source Context; deckjsx-owned composition values stay separate.
- Output support for composed decks belongs to the later build/project/write pipeline rather than to the legacy render path.

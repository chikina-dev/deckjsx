# Font assets through integration

Font programs for PDF embedding and text layout should follow deckjsx's existing asset flow instead
of becoming StyleSheet-owned bytes or a process-global font registry. Text styles remain CSS-like by
using `fontFamily` string references, while Deck Plugin integration can register Font Assets with a
stable asset key, family/weight/style/range metadata, and an AssetSource consumed by the Asset
Loading Boundary. Missing font matches should initially produce stable nonblocking PDF font fallback
diagnostics so strict fidelity workflows can fail on those warnings without adding a dedicated
`fontPolicy` option.

## Consequences

- `DeckIntegrationContext` can grow a font asset registration field alongside `assetLoaders`.
- The registration key identifies the font asset or variant; style matching uses font metadata, not
  the key as the authored family name.
- StyleSheet declarations should not carry font bytes, paths, asset handles, or CSS `url(...)`
  sources.

# Output Formats Design

## Status

Approved design for implementation planning. This spec refines Deck output configuration after PDF
became a first-class output target.

## Problem

`output.format` currently acts as a single implicit projection/render target. That worked when PPTX
was the only practical writer, but it does not describe a deck that intentionally supports both PPTX
and PDF from the same Semantic Author Graph. It also makes `deck.render(pdf())` look mismatched when
the deck's single configured format is PPTX, even though explicit writer adapters are the right API
for producing a specific artifact.

## Public Shape

Deck output configuration should use `formats` as the output target set:

```ts
const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  output: {
    formats: ["pptx", "pdf"],
  },
});
```

`formats` means the list of artifact formats this deck is expected to produce. It is not a
format-neutral drawing layer and does not imply a multi-artifact render API.

## Removed Shape

The public `output.format` option should be removed or rejected. It is easy to read as a default,
but the intended output concept is a set of supported artifact formats. Existing code that used
`output: { format: "pdf" }` should move to `output: { formats: ["pdf"] }`.

## Render Semantics

Explicit adapter rendering remains the primary way to request a concrete artifact:

```ts
await deck.render(pptx());
await deck.render(pdf());
```

When an explicit writer adapter is passed, its `projectionFormat` chooses the projection. The adapter
format is valid when it appears in `output.formats`. A missing adapter format should produce a stable
nonblocking warning, not prevent rendering.

No `renderAll()` or `renderMany()` API should be added. Multiple artifact generation stays ordinary
userland control flow with repeated explicit `deck.render(adapter)` calls.

## Implicit Render And Project

`deck.render()` and `deck.project()` without an explicit format need a single target because their
result types describe one artifact or one projected document model.

For `output.formats`:

- Empty or missing `formats` behaves as `["pptx"]` for backward-compatible defaults.
- A single format uses that format with no warning.
- Multiple formats use index `0` as the implicit target and emit a stable nonblocking warning that
  the call chose the first configured format from a multi-format deck.

Example:

```ts
const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  output: { formats: ["pptx", "pdf"] },
});

await deck.render(); // renders pptx and warns that formats[0] was used
```

This keeps `deck.render()` convenient while making the ambiguity visible.

## Diagnostics

Add or adjust diagnostics around output formats:

- Invalid `output.formats` values are blocking Deck option errors.
- Duplicate formats should be rejected or normalized consistently; reject duplicates first because
  the public configuration should be unambiguous.
- `deck.render()` and `deck.project()` with multiple configured formats and no explicit format should
  warn that `output.formats[0]` was used.
- Explicit adapter render should warn only when the adapter's format is not included in
  `output.formats`.

## Testing

Tests should cover:

- Type-level public API acceptance for `output.formats`.
- Runtime option validation for invalid, empty, duplicate, and unsupported format arrays.
- `deck.project()` and `deck.render()` no-arg behavior for missing, single, and multiple formats.
- Explicit `deck.render(pptx())` and `deck.render(pdf())` on `formats: ["pptx", "pdf"]` without
  mismatch warnings.
- Explicit adapter warning when the adapter format is outside the configured output format set.

## Migration Note

The implementation can either remove `output.format` from the public type immediately or leave a
temporary runtime diagnostic that tells users to use `output.formats`. The target public model is
`formats` only.

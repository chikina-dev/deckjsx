# Interactive Dev Session Plan

## Summary

Add an experimental `deckjsx dev --interactive` mode for inspecting and explaining generated artifact state from the resident Node dev compiler. The first slice should prove the internal session boundary, component provenance, cascade explanation, history diffing, and measurement story without stabilizing an external protocol.

For v0.9.3, the CLI contract is intentionally experimental JSON-lines: each input line is parsed as a shorthand command or an internal JSON command, and each response is a single JSON object. A richer human-readable text mode is deferred until the command vocabulary has more usage.

## Implementation Shape

- Add an internal `InteractiveDevSession` layer above `DeckjsxDevCompiler`; the compiler remains unaware of interactive mode beyond dev compiler options that enable instrumentation.
- Keep internal command methods domain-scoped, such as `session.status`, `session.timings`, `diagnostics.list`, `diagnostics.explain`, `component.stack`, `style.explain`, `projection.inspect`, `history.changes`, and `selection.resolve`.
- Add a CLI `--interactive` switch that chooses an interactive host instead of the existing diagnostic-only dev compiler host.
- Add a closed-vocabulary Authoring Metadata Carrier in the Integration Interface and migrate the existing media source origin transport toward it without changing author-facing prop values.
- Add dev-gated component provenance metadata through that carrier, with frames shaped around component name, source span, module id, and key; do not retain full props in this slice.
- Add interactive cascade traces that explain default, inherited, theme, class, and inline style decisions, including specificity, rule order, winner, and selector mismatch where available.
- Track previous successful state for `history.changes`, and report skipped failed attempts between successful artifact updates.
- Support `$0`, `$1`, `$2`, and `$$` selection handles inside the interactive session.

## Implemented Slice

- `deckjsx dev --interactive` now creates an internal session, runs a CLI line loop, and dispatches shorthand or JSON command lines as JSON responses.
- Shorthand commands: `help`, `status`, `timings`, `diagnostics`, `diagnostic <index>`, `history changes`, `changes`, `style <nodeId> [property]`, `component <nodeId>`, `projection [slideIndex] [elementIndex]`, `$0`, `$1`, `$2`, `$$`, `exit`, `quit`, and `.exit`.
- Internal commands currently implemented: `session.help`, `session.status`, `session.timings`, `diagnostics.list`, `diagnostics.explain`, `history.changes`, `selection.resolve`, `style.explain`, `component.stack`, and `projection.inspect`.
- The Node dev host shares the retained `IncrementalArtifactSession` with the interactive session so style/component queries can inspect retained artifact graph snapshots when available.
- `IncrementalArtifactSession.inspectArtifacts()` exposes a narrow retained artifact inspection view while keeping write tokens and Pipeline Artifact collections opaque.
- Component provenance is transported through the Authoring Metadata Carrier and propagated into graph, layout, and PPTX projection origins.
- Style resolution records `propertyTraces` with ordered candidates and the applied winner for cascade explanation.
- `plugins/node/tests/interactive-cli-smoke.test.ts` verifies a real dev compilation plus interactive `help`, `status`, and `projection` commands.
- `scripts/benchmark-interactive-dev.mjs` and `npm run benchmark:interactive` measure a minimal cold interactive dev run, projection command latency, output size, and retained projection slide count.

## Post-v0.9.3 Follow-Up

- Extend measurement beyond cold minimal dev to warm source change and warm asset change fixtures.
- Grow the `IncrementalArtifactInspection` view only through concrete interactive needs, keeping retained Pipeline Artifact collections private.

## Measurement

- Capture phase timings for bundle/source snapshot, entry execution, artifact cycle, project/render, write/patch, inspection/indexing, and interactive command latency.
- Benchmark normal dev versus interactive dev for cold run, warm source change, warm asset change, and `style.explain` response time.
- Track snapshot/index size for component-heavy and cascade-heavy fixtures.

## Test Plan

- CLI parsing accepts `--interactive` only for `dev`.
- Interactive session dispatch returns structured success and error responses without depending on terminal I/O.
- REPL parsing updates `$0`, `$1`, `$2`, and `$$` handles predictably.
- Component provenance survives function component calls and reaches graph/projection inspection targets in interactive mode.
- Cascade explanation includes winner and non-winning candidates for representative default, inherited, theme, class, inline, and selector mismatch cases.
- History changes default to the previous successful artifact update and include skipped failed attempt counts.
- Existing non-interactive dev tests continue to pass without component provenance or cascade trace overhead.

## Deferred

- Stable public JSON protocol exports.
- Rich TUI, input syntax highlighting, and advanced tree navigation.
- Full props inspection and props diffing.
- PDF-specific projection explanations.

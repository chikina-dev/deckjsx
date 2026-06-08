# Required PPTX generation regression oracle

## Status

Accepted

## Context

v0.8.0 removes `pptxgenjs` from the core package, but small PPTX generation regressions can create
large user-facing output problems. Direct writer correctness needs more than unit tests for a few XML
strings because package topology, relationships, geometry, z-order, media handling, document
properties, and raster output can all fail independently.

## Decision

GitHub Actions should run required PPTX generation regression checks. A pinned `pptxgenjs`
dependency installed in an isolated workflow-local package can be one regression oracle because it
represents the previous output path and is easy to wire into CI for concrete migration cases.

The goal is not to preserve `pptxgenjs` compatibility as a product surface. The goal is to verify
that deckjsx's direct writer produces the intended PPTX package, geometry, visual output, and
migration behavior while replacing the previous runtime writer.

Treat PPTX generation validation as a multi-oracle strategy:

- direct OOXML fixtures for deterministic package and XML details;
- semantic package assertions for content types, relationships, ids, part requirements, and drawing
  order;
- template/layout package topology assertions for default and template-derived slide layout parts,
  slide master layout relationships, slide-to-layout relationships, and slide layout relationship
  parts;
- rendered raster comparisons for visual placement, z-order, colors, text, and images;
- pinned `pptxgenjs` comparisons for migration scenarios that are easiest to author against the old
  path.

Do not compare direct writer output to `pptxgenjs` output by raw byte equality. The direct writer has
its own deterministic byte tests; `pptxgenjs` oracle checks should compare semantic package behavior
or rendered output because XML ordering, ids, support parts, and compression details may legitimately
differ.

## Consequences

- The published package remains free of the `pptxgenjs` runtime dependency.
- CI may contain an isolated helper package, such as `.github/compat/pptxgenjs/`, with its own
  dependency install.
- The initial implementation uses `.github/workflows/pptx-generation-regression.yml` and
  `.github/compat/pptxgenjs/` to build the direct deckjsx package, install a pinned `pptxgenjs`
  oracle dependency, generate both decks, compare semantic package signals, and upload generated PPTX
  artifacts plus a JSON report.
- Regression failures should upload artifacts so package/XML/raster differences can be inspected.
- Public documentation and type tests should continue to describe the direct writer as the built-in
  path; `pptxgenjs` appears only as an isolated regression oracle or possible future external
  compatibility package.
- Public-surface tests should additionally guard the root package export map, root runtime
  dependencies, and core source imports so the isolated oracle package cannot accidentally normalize
  `pptxgenjs` as a product dependency again.

## Coverage Expectations

The v0.8.0 regression matrix should keep growing beyond the first compatibility fixture. Required
coverage should include direct OOXML fixtures, semantic package assertions, deterministic direct
writer byte checks, and rendered-raster checks where CI tooling is available.

Template/layout fixtures are required because Template Areas are both authoring semantics and PPTX
package topology. Regression checks should verify that Template Area Kind and frame data reach the
Pptx Package Model as layout anchors, while generated PPTX packages contain the expected slide
layout parts and relationships. They should not require visible placeholder prompts when the current
projection uses `placeholderStrategy: "none"`.

Unsupported CSS-like semantic fixtures should verify both warning behavior and projected fallback
metadata. The important regression signal is that values such as opacity, transform-created stacking
contexts, transformed clipping, filters, blend modes, and isolation are not flattened away during
projection; unsupported behavior should surface as structured fallback records and nonblocking
diagnostics unless the package payload itself is structurally invalid.

Pinned `pptxgenjs` checks are useful for migration scenarios, but they are not the source of truth
for deckjsx internals. They should compare semantic signals such as slide count, package topology,
relationship targets, geometry, fills, media relationships, external hyperlinks, and rendered output
where practical. They should not assert byte-for-byte equality against deckjsx's direct writer.

Regression jobs should upload generated PPTX files, extracted package summaries, JSON comparison
reports, and render artifacts for failures. This keeps small writer regressions inspectable without
making CI logs the only debugging surface.

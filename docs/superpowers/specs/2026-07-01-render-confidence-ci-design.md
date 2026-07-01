# Render Confidence CI Design

## Goal

PR CI should primarily protect the user-facing rendering experience: decks should render close to
what authors expect, remain compatible with presentation tools, keep dev-loop feedback usable, and
avoid performance regressions that make authoring feel slow. Release CI should remain the final npm
publication gate, but it should not be the first place where rendering regressions are discovered.

The design favors a PR quality gate around render confidence, with release and nightly jobs covering
the broader and slower compatibility matrix.

## Non-Goals

- Do not use `sample/` as the primary render regression fixture. `sample/` is a public example and
  should stay shaped for users rather than CI coverage.
- Do not make every PR run every visual fixture page. The PR gate should be meaningful and
  parallelized, not a monolithic release simulation.
- Do not replace unit and package-structure tests. Render confidence complements existing
  projection, writer, public surface, and package smoke tests.

## Test Asset Layout

Render confidence fixtures should live under `tests/render-confidence/`.

Proposed structure:

```text
tests/render-confidence/
  fixtures/
    feature/
      text.tsx
      layout.tsx
      shapes.tsx
      images.tsx
      tables.tsx
      theme-style.tsx
      templates.tsx
    scenario/
      business-report.tsx
      sales-deck.tsx
      product-roadmap.tsx
      technical-diagram.tsx
      image-heavy.tsx
      table-heavy.tsx
      mixed-dashboard.tsx
  manifest.ts
  README.md
```

`.github/render/` should stay focused on CI runtime concerns: Dockerfile, rendering tools, artifact
collection, and workflow entrypoints. Fixture authorship belongs with tests, not workflow plumbing.

## Fixture Strategy

Use both feature and user-scenario fixtures, with user scenarios slightly heavier in PR coverage.

Feature fixtures are small and diagnostic. They answer "which rendering capability regressed?"
Examples:

- text: font size, color, runs, paragraph alignment, bullets, text body insets
- layout: absolute positioning, padding, gap-like layout, z-order
- shapes: fill, stroke, opacity, radius, transforms
- images: fit, crop, aspect ratio, media relationships
- tables: borders, spans, header/body style
- theme-style: style sheets, theme tokens, inheritance
- templates: slide layouts, masters, placeholders

Scenario fixtures are realistic and user-facing. They answer "would an author be surprised by this
deck?"

- business report
- sales deck
- product roadmap
- technical diagram
- image-heavy deck
- table-heavy deck
- mixed dashboard

Scenario fixtures should use ordinary authoring APIs and intentionally avoid testing-only helpers
inside the deck source. They can be composed from shared local data and assets, but they should read
like examples a real user might write.

## PR Render Confidence Gate

PR CI should include a render confidence lane when changes can affect rendering:

- `src/projection/pptx/**`
- `src/writers/pptx/**`
- `src/layout/**`
- `src/style/**`
- `src/graph/**` when graph output feeds layout/projection
- `src/adapter/**`
- `tests/render-confidence/**`
- `.github/render/**`
- `package.json`, `bun.lock`, `tsconfig.json`, `vite.config.ts`

The PR render confidence lane should do all of the following for selected fixtures:

1. Build `deckjsx`.
2. Render each fixture to PPTX.
3. Validate PPTX package structure and fixture-specific semantic/package assertions.
4. Convert PPTX to PDF using the render toolchain.
5. Convert selected pages to PNG.
6. Compare selected PNGs against committed or artifact-provided baselines with category-specific
   tolerances.
7. Upload PPTX, PDF, PNG, diff images, and a manifest on every run.

PR should not use `sample/` as a main render fixture. A separate lightweight public example smoke can
continue to prove that the user-facing sample starts and writes a deck.

## Parallelization

Render confidence should be split by fixture group, not run as one serial job.

Initial matrix groups:

- `feature-text-layout`: text, layout, theme-style
- `feature-media-table`: images, shapes, tables, templates
- `scenario-business`: business-report, sales-deck, product-roadmap
- `scenario-technical`: technical-diagram, mixed-dashboard
- `scenario-heavy`: image-heavy, table-heavy

Each matrix job should use the same verifier and receive a fixture group argument. Heavy scenario
jobs can have looser timeouts or be split further without changing the verifier contract.

Failed jobs must upload artifacts even when rendering, conversion, or comparison fails. The artifact
manifest should make it obvious which fixture, page, assertion, and tool failed.

## Baselines And Noise Control

PR-required image comparisons should start small:

- compare only representative pages per fixture
- use category-specific thresholds for geometry, text, image crop, color fill, shadow/effect, and
  complex layout
- treat missing baselines as a failure for PR-required fixtures once baselines are established
- keep baseline updates explicit and reviewable

Nightly and release jobs can compare more pages and stricter fixture sets. They may also retain
larger artifact bundles to help inspect slow-moving visual drift.

## Existing CI Responsibilities

Keep the current checks, but clarify their contracts:

- Core check and test: API, projection model, writer model, unit/integration behavior, type
  performance, and public surface.
- Node check and test: `@deckjsx/node` APIs, CLI/dev loop, sample smoke, node runtime benchmark, and
  tarball smoke.
- Direct PPTX writer benchmark: writer/project performance and artifact reuse budgets.
- Render confidence: generated PPTX/PDF/PNG correctness and user-visible rendering confidence.
- Release: version validation, final full verification, tarball packaging, npm publish.

The tarball smoke should stay important, but it should not be the primary signal for visual output.
It answers "does the published package install and run?" Render confidence answers "does the deck
look right?"

## Performance And UX Signals

Render confidence should not only check correctness. It should expose timing in the manifest:

- project/render time per fixture
- PPTX write time
- PDF conversion time
- PNG conversion time
- diff comparison time
- output file sizes

Strict performance budgets should remain in focused benchmark jobs. The render confidence manifest
should provide trendable evidence and make sudden slowdowns visible.

For CLI/dev-loop experience, keep dedicated `@deckjsx/node` checks:

- first render from TSX
- source edit updates output without restarting
- failed edit preserves previous good output
- recovered edit writes a new output
- interactive commands return expected responses
- human UI stays on stderr
- CLI diagnostics include actionable file and phase context

## Rollout Plan

1. Introduce the `tests/render-confidence/` fixture registry and one small verifier path that can
   select fixture groups.
2. Move or adapt existing render fixtures into the registry without changing their expected output
   semantics.
3. Add PR matrix jobs for a small feature group and one scenario group.
4. Establish artifact manifests and baseline update workflow.
5. Expand scenario coverage until PR render confidence gives useful "this feels wrong" detection.
6. Move broad all-fixture/all-page image comparison to release or nightly.

## First Implementation Slice

The first implementation slice establishes the fixture registry, fixture-group selection, and
parallel PR matrix. It intentionally keeps committed PNG baseline policy as an open follow-up. The
first gate still produces PPTX, PDF, PNG, and manifest artifacts; baseline enforcement becomes
mandatory after representative baselines are reviewed and committed or otherwise pinned.

## Open Decisions

- Exact PNG baseline storage: committed files, release artifact baseline, or a hybrid.
- Whether nightly jobs should run on `main` only or also on release branches.
- Whether render confidence should run on documentation-only PRs that update public examples.
- How strict PR image thresholds should be for text rendering across environments.

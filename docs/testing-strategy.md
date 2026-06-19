# Testing Strategy

deckjsx tests should make product intent visible before implementation detail.

## Layers

- Specification regression tests live under `tests/spec/`. They translate accepted ADRs and public
  product contracts into end-to-end scenarios. Prefer one scenario per user-visible guarantee, and
  assert stable semantic signals such as projected package parts, relationships, diagnostics, and
  render artifact metadata.
- Integration tests live under domain directories such as `tests/pptx/`, `tests/integration/`, and
  `plugins/node/tests/`. They verify boundaries between authoring, graph, layout, projection,
  runtime integration, and writing.
- Unit tests live beside the smallest stable internal boundary, such as `tests/style/`,
  `tests/layout/`, `tests/graph/`, or focused CI/tooling tests. They should be derived from the same
  behavior named by the specification regression test, not from incidental implementation shape.
- Type tests live under `tests/types/` and guard the public authoring, adapter, inspection, and
  integration surfaces.
- Large domains should use a folder with focused files instead of one catch-all test file. For
  example, PPTX writer tests live under `tests/pptx/writer/`, while project/render behavior lives
  under `tests/pptx/project-render-pipeline/` with validation split one level deeper.

## Adding Coverage From A Spec

1. Start from an accepted ADR, review note, or public contract and write a `tests/spec/` scenario
   that would fail if the product guarantee regressed.
2. Add narrower integration tests for the pipeline boundary that owns the behavior.
3. Add unit tests for parsing, normalization, validation, projection, or writer helpers only when
   the scenario reveals important branching or edge cases.
4. Keep generated package checks semantic. Avoid raw PPTX byte equality unless the writer contract is
   specifically deterministic bytes for that unit.

## Test Readability

Prefer tests that name the behavior a reader should care about. Avoid tests whose only purpose is
checking that an implementation detail, file import, generated symbol, or workflow string is absent.
When a guard still matters, restate it as a positive contract: for example, assert the package export
map, the rendered artifact shape, or the projected model payload that authors and integrations rely
on.

## CI Scope

The main CI workflow always runs a lightweight change-classification job. Heavy jobs run only when
their owned surface changes:

- core check/build/test: root source, tests, scripts, package metadata, and toolchain config;
- `@deckjsx/node`: plugin sources or root public-surface inputs that can affect the built package;
- direct PPTX writer benchmark: PPTX writer/projection/pipeline paths and benchmark tooling.

Markdown-only changes should stay on the lightweight path plus whitespace validation.

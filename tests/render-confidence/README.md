# Render Confidence Fixtures

These fixtures are CI-owned decks for catching user-visible rendering regressions. They are separate
from `sample/`, which remains a public example for users.

Feature fixtures are small and diagnostic. Scenario fixtures are more realistic and should look like
decks a user might write.

Each fixture declares:

- a stable fixture name
- a matrix group
- expected PPTX package assertions
- selected raster pages and tolerance categories
- a deck factory using ordinary authoring APIs

PR CI runs fixture groups in parallel. Release and nightly jobs may run all fixtures and more pages.

## Baselines

The first render-confidence slice produces raster artifacts but does not require committed PNG
baselines for every fixture. When baselines are introduced, updates must be explicit review changes
and should include the manifest plus the affected PNGs or the pinned artifact reference.

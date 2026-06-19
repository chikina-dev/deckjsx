# Node Incremental Artifact Runtime replaces Vite HMR integration

## Decision

v0.9 should remove `@deckjsx/vite` and the HMR-oriented project integration vocabulary, because the development loop is about updating generated artifacts such as PPTX files rather than notifying a browser viewer. Core should own the Incremental Artifact Session that assigns Render Slots, carries Source Invalidation, and retains graph, projection, and package artifacts for tracked slots; `@deckjsx/node` should own the Node CLI, Rolldown entry execution, file watching, filesystem writes, and observed output-path filtering. Untracked `write(...)` calls still run as ordinary output side effects, while `deckjsx`, `deckjsx/*`, `@deckjsx/node`, `@deckjsx/node/*`, and `node:*` remain external to the entry bundle so the runtime and entry share the same integration hooks.

`deckjsx dev` should stay resident after failures and rerun on source changes. Its default failure output should be detailed diagnostics with source-oriented labels, notes, and help; `--short`/`-s` should switch to a compact summary that lists only diagnostic codes.

The dev command should require at least one `--out` path, normalize tracked output paths and observed `write(...)` paths with `path.resolve(process.cwd(), ...)`, and compare the absolute paths while logging cwd-relative paths. Rolldown should be used as a retained watch/incremental entry executor rather than rebuilt from scratch every cycle; its changed module ids become the runtime's source invalidation input for the next execution.

Source invalidation should use a runtime-neutral shape of `{ changedSourceIds }`, populated with absolute source paths from Rolldown. The old `HmrInvalidation` vocabulary, including importer-specific fields and `invalidateForHmr` names, should be renamed without compatibility aliases.

Only the JSX media-source origin annotation behavior should survive from the old Vite transform. The render-call wrapping, Vite virtual module, and hot-update handling should be deleted; Rolldown entry execution should annotate local media props with `mediaSourceOrigins(...)` and absolute importer paths, while core Incremental Artifact Sessions handle render-slot reuse without source-level render-call rewrites.

The dev watcher should include both Rolldown's module graph and local asset files observed through Node asset loading, because authored media paths are not JavaScript imports. Output files written through `write(...)`, their lock files, and temporary write files should be ignored so artifact updates do not retrigger the dev loop.

`deckjsx dev` should not automatically install `nodeAssets()` or any other asset loader. Dev execution must preserve the same authoring/runtime requirements as ordinary execution: users who need Node local file asset resolution should register `nodeAssets()` explicitly, and missing loader diagnostics should flow through the normal Asset Loading Boundary rather than a dev-only helper.

## Node Dev Compiler Shape

`@deckjsx/node` should implement the dev loop as a compiler-style resident runtime rather than as a thin bundler wrapper:

- `DeckjsxDevCompiler` owns lifecycle, source and asset invalidation scheduling, event emission, the last successful dev graph snapshot, and successful graph commits.
- `DeckjsxDevCompilation` owns one source-snapshot-to-artifact attempt. Its public result should expose named statuses so callers do not infer phase from object shape: `artifactUpdated`, `bundleFailed`, `entryFailed`, and `outputBlocked`.
- `DevSourceProvider` is the compiler-facing source snapshot seam. The default adapter is `RolldownWatchAdapter`, and the seam contract should be executable in tests: `start()` is idempotent, `nextSourceSnapshot()` returns queued or future snapshots, diagnostic snapshots do not throw through the compiler host, and `close()` releases provider-owned resources.
- `EntryExecutionHost` owns generated ESM module writing, cache-busting dynamic imports, cwd switching, and temporary module cleanup so author code sees the project cwd.
- `TrackedOutputCoordinator` owns output path normalization, tracked versus untracked write classification, Dev Artifact Update Plan creation, retained slot selection, and output/lock/temp ignore paths.
- `ArtifactPlanApplier` owns the final command/effect boundary for applying a Dev Artifact Update Plan to an Incremental Artifact Session. A ready plan retains exactly its planned Render Slots; a blocked plan retains nothing.
- `DevModuleGraph` combines Rolldown module/watch files with local asset files observed through explicit `nodeAssets()` loading, then filters output files, lock files, temp write files, and `.deckjsx/dev` bundles.
- `DevDiagnostics` owns the structured dev diagnostic shape and converts foreign failures, such as Rolldown errors, entry exceptions, tracked-output misses, write failures, and CLI usage errors, before diagnostics reach compiler events or CLI rendering. `phase` and `compilation` are dev-run context annotations, not information guessed by the formatter.

## Consequences

- The active dev integration package is `@deckjsx/node`; `@deckjsx/vite` and Vite/HMR runtime vocabulary are removed without compatibility aliases.
- Vite+ may remain the repository toolchain, but it is not a deckjsx runtime or dev integration dependency.
- `deckjsx dev <entry> --out <path> [extra output paths...]` is a resident Node command. Extra output paths may be written as ordinary side effects, but only the primary `--out` path retains Incremental Artifact Session state.
- The Node dev compiler can update PPTX today and can later support other generated artifact types without adding browser viewer notification semantics.
- Public dev APIs expose compiler concepts, source snapshots, artifact plans, named result statuses, and diagnostics; they do not expose Rolldown result objects or private Pipeline Artifact collections.

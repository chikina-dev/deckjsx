# Node Incremental Artifact Runtime replaces Vite HMR integration

The host-input and CLI-option details in this ADR are superseded by ADR 0020. The runtime ownership, resident compiler, source invalidation, and artifact-session decisions remain in force.

## Decision

v0.9 should remove `@deckjsx/vite` and the HMR-oriented project integration vocabulary, because the development loop is about updating generated artifacts such as PPTX files rather than notifying a browser viewer. Core should own the Incremental Artifact Session that assigns Render Slots, carries Source Invalidation, and retains graph, projection, and package artifacts for tracked slots; `@deckjsx/node` should own the Node CLI, Rolldown entry execution, file watching, filesystem writes, and observed output-path filtering. Untracked `write(...)` calls still run as ordinary output side effects, while `deckjsx`, `deckjsx/*`, `@deckjsx/node`, `@deckjsx/node/*`, and `node:*` remain external to the entry bundle so the runtime and entry share the same integration hooks.

`deckjsx dev` should stay resident after failures and rerun on source changes. Its failure output should be detailed diagnostics with source-oriented labels, notes, and help. ADR 0014 supersedes the earlier `--short`/`-s` compact-summary idea; compact or machine-oriented summaries belong to a separate non-resident surface rather than the human-first dev console.

The dev command should require at least one `--out` path, normalize tracked output paths and observed `write(...)` paths with `path.resolve(process.cwd(), ...)`, and compare the absolute paths while logging cwd-relative paths. The default production source provider should use Rolldown's in-memory bundler API (`rolldown().generate(...)`) to produce executable entry code, then retain the returned `watchFiles` as the source watch set. Rolldown's watcher API remains an optional event source for injected adapters, but it should not be the normal path for executable code because the watcher event result is primarily a lifecycle/cleanup object.

Source invalidation should use a runtime-neutral shape of `{ changedSourceIds }`, populated with absolute source paths from Rolldown. The old `HmrInvalidation` vocabulary, including importer-specific fields and `invalidateForHmr` names, should be renamed without compatibility aliases.

Only the JSX media-source origin annotation behavior should survive from the old Vite transform. The render-call wrapping, Vite virtual module, and hot-update handling should be deleted; Rolldown entry execution should annotate local media props with `mediaSourceOrigins(...)` and absolute importer paths, while core Incremental Artifact Sessions handle render-slot reuse without source-level render-call rewrites.

The dev watcher should include both Rolldown's module graph and local asset files observed through Node asset loading, because authored media paths are not JavaScript imports. Output files written through `write(...)` and their lock/staging files should be ignored so artifact updates do not retrigger the dev loop. `write(...)` uses `.deckjsx-lock` as the default lock/staging file, and falls back to `.${basename}.deckjsx-lock` only when the default lock is already held for a different output in the same directory.

`deckjsx dev` should not automatically install `nodeAssets()` or any other asset loader. Dev execution must preserve the same authoring/runtime requirements as ordinary execution: users who need Node local file asset resolution should register `nodeAssets()` explicitly, and missing loader diagnostics should flow through the normal Asset Loading Boundary rather than a dev-only helper.

## Node Dev Compiler Shape

`@deckjsx/node` should implement the dev loop as a compiler-style resident runtime rather than as a thin bundler wrapper:

- `DeckjsxDevCompiler` owns lifecycle, source and asset invalidation scheduling, event emission, the last successful dev graph snapshot, and successful graph commits.
- `DeckjsxDevCompilation` owns one source-snapshot-to-artifact attempt. Its public result should expose named statuses so callers do not infer phase from object shape: `artifactUpdated`, `bundleFailed`, `entryFailed`, and `outputBlocked`.
- `DevSourceProvider` is the compiler-facing source snapshot seam. The default adapter is a Rolldown rebuild provider backed by `rolldown().generate(...)` and `watchFiles`; injected watcher adapters may use Rolldown's `change`/`event` stream as an invalidation source. The seam contract should be executable in tests: `start()` is idempotent, `nextSourceSnapshot()` returns queued or future snapshots, diagnostic snapshots do not throw through the compiler host, and `close()` releases provider-owned resources.
- An executable source snapshot may carry the immutable Host Execution snapshot and non-fatal Host resolution diagnostics captured for the same generation. The compiler uses this paired snapshot rather than rereading mutable Host Session state after awaiting source acquisition. Config/entry warnings therefore remain associated with the generation they describe, while a later Host Session cannot redirect an older source artifact to newer entries, outputs, or Plugins.
- `EntryExecutionHost` owns generated ESM module preparation, cache-busting dynamic imports, cwd switching, and execution cleanup so author code sees the project cwd. The current implementation uses fileless `data:` modules for dev execution and must not create workspace or temp entry files as part of the normal path.
- `TrackedOutputCoordinator` owns output path normalization, tracked versus untracked write classification, Dev Artifact Update Plan creation, retained slot selection, and output/lock/staging ignore paths.
- `ArtifactPlanApplier` owns the final command/effect boundary for applying a Dev Artifact Update Plan to an Incremental Artifact Session. A ready plan retains exactly its planned Render Slots; a blocked plan retains nothing.
- `DevModuleGraph` combines Rolldown module/watch files with local asset files observed through explicit `nodeAssets()` loading, then filters output files and lock/staging files.
- `DevDiagnostics` owns the structured dev diagnostic shape and converts foreign failures, such as Rolldown errors, entry exceptions, tracked-output misses, write failures, and CLI usage errors, before diagnostics reach compiler events or CLI rendering. `phase` and `compilation` are dev-run context annotations, not information guessed by the formatter.

## Consequences

- The active dev integration package is `@deckjsx/node`; `@deckjsx/vite` and Vite/HMR runtime vocabulary are removed without compatibility aliases.
- Vite+ may remain the repository toolchain, but it is not a deckjsx runtime or dev integration dependency.
- `deckjsx dev` is a resident, config-driven Node command. Entry and required output hints come from `deckjsx.config.ts` or configuration-transparent discovery; every explicitly listed output participates in Incremental Artifact Session validation. The former positional entry and `--out` contract is superseded by ADR 0020.
- Residency begins once the Host Package Boundary is known, not only after the first valid config and entry resolution. Initial config or entry diagnostics are emitted as diagnostic source snapshots; config, discovery, and package watch evidence remains active so the same process can construct its first executable Host Session after the author fixes the project.
- The Node dev compiler can update PPTX today and can later support other generated artifact types without adding browser viewer notification semantics.
- Public dev APIs expose compiler concepts, source snapshots, artifact plans, named result statuses, and diagnostics; they do not expose Rolldown result objects or private Pipeline Artifact collections.

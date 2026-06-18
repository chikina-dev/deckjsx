# Node Dev Compiler Design

## Goal

Build a thicker `@deckjsx/node` dev implementation around a long-lived `DeckjsxDevCompiler`, modeled after familiar compiler/watch systems such as Rollup watch, Vite dev plugins, and webpack-style Compiler/Compilation separation.

The compiler owns the dev operation from source change detection to generated artifact update. The CLI hosts it, but does not contain it.

## Background

The current `deckjsx dev` slice proves that Vite can be removed and that Node can run a bundled entry inside an Incremental Artifact Session. The review found that the current loop is still shallow:

- `plugins/node/src/cli.ts` owns scheduling, temporary bundle writing, entry import, watch installation, changed source collection, tracked output matching, diagnostics, and session retention.
- `plugins/node/src/dev-executor.ts` creates a Rolldown build, generates one bundle, then closes it each cycle.
- Asset file changes observed through `nodeAssets()` are not part of the dev watch graph.
- Diagnostics are currently compact compared with the detailed source-oriented diagnostics expected for dev operation.

This design deepens the dev operation into a compiler-like Module while preserving the core decision that `@deckjsx/node` owns runtime filesystem capabilities and core owns Incremental Artifact Session state.

## Public Shape

`@deckjsx/node` keeps its package-level public surface small:

```ts
export type DeckjsxDevCompilerOptions = {
  readonly entry: string;
  readonly cwd?: string;
  readonly out: string;
  readonly outputs?: readonly string[];
};

export type DeckjsxDevCompilerEvent =
  | DeckjsxDevCompilerStartedEvent
  | DeckjsxDevCompilationStartedEvent
  | DeckjsxDevCompilationFinishedEvent
  | DeckjsxDevCompilerDiagnosticEvent
  | DeckjsxDevCompilerClosedEvent;

export function createDeckjsxDevCompiler(
  options: DeckjsxDevCompilerOptions,
): DeckjsxDevCompiler;
```

The CLI remains a thin host:

```txt
parse args
  -> createDeckjsxDevCompiler(...)
  -> subscribe to compiler events
  -> print details or short output
  -> await compiler.start()
```

The CLI does not own cycle policy, Rolldown resource lifetime, entry execution, output retention, or asset observation.

## Compiler Concepts

### DeckjsxDevCompiler

`DeckjsxDevCompiler` is the long-lived dev Module. It owns:

- retained Rolldown watch lifecycle
- source invalidation queue
- current compiler state
- last successful compilation snapshot
- compilation scheduling and coalescing
- observed module and asset watch graph
- tracked output policy
- Incremental Artifact Session lifetime
- compiler event emission
- graceful failure recovery

The compiler exposes snapshots and events. It does not expose mutable internal state.

### DeckjsxDevCompilation

`DeckjsxDevCompilation` is one source-change-to-artifact-update attempt. It owns:

- compilation number
- changed source ids consumed by this attempt
- generated bundle code and module ids
- entry execution result
- observed write records
- tracked output classification
- retained Render Slot command
- diagnostics
- watch graph snapshot after the attempt

`DeckjsxDevCompilation` is not persistent state. Its result may be stored by `DeckjsxDevCompiler` as the last successful snapshot.

### RolldownWatchAdapter

`RolldownWatchAdapter` adapts Rolldown's watch event model to compiler events.

It uses Rolldown's public `watch(...)` API with watch mode rather than recreating `rolldown(...)` each cycle. The adapter:

- uses `watch.skipWrite` so deckjsx can generate an in-memory executable bundle
- handles `BUNDLE_END` by calling `event.result.generate(...)`
- calls `event.result.close()` after deckjsx is done with that result
- collects changed source ids through an adapter-owned Rolldown plugin `watchChange` hook
- reports bundle errors as compiler diagnostics without terminating the compiler
- closes the Rolldown watcher when the compiler closes

### EntryExecutionHost

`EntryExecutionHost` executes the generated bundle for one compilation.

It owns:

- `.deckjsx/dev` temporary module location
- cache-busting import URLs
- `cwd` switching during entry execution
- execution failure capture
- temporary module cleanup policy

The host must not change author code expectations. Relative `write(..., "output.pptx")` calls resolve as they would when the entry is run from the project cwd.

### TrackedOutputCoordinator

`TrackedOutputCoordinator` owns Tracked Output Path policy.

It consumes:

- compiler cwd
- primary `--out`
- extra output paths passed to the dev command
- observed write records from the current compilation

It produces:

- normalized write records
- tracked versus untracked write classification
- retained Render Slot command
- missing tracked output diagnostics
- output and lock file ignore paths for the watch graph

Only the primary `--out` path is retained for incremental artifact state. Extra output paths are allowed side effects and are ignored for watch retriggers, but they do not retain Render Slots.

### DevModuleGraph

`DevModuleGraph` is the compiler's dev-only dependency snapshot. It contains:

- Rolldown module ids
- Rolldown watch files
- local asset files observed through Node asset loading
- output files and lock files to ignore
- temporary compiler files to ignore

The graph exists to decide which changes trigger another compilation and which changed source ids are passed into Source Invalidation.

### Observed Asset Files

Dev must not automatically install `nodeAssets()`. That would make dev behavior different from ordinary Node execution.

Instead, Node asset loading is observable when the user explicitly installs `nodeAssets()`. The local file AssetLoader reports successfully resolved file paths into the current dev compilation through a render-execution scoped observer. The compiler then adds those files to the `DevModuleGraph`.

Missing loader diagnostics still flow through the normal Asset Loading Boundary.

### Diagnostics

Compiler diagnostics are structured enough for both detailed and short output.

Detailed output supports:

- severity
- code
- message
- optional file, line, column
- labels
- notes
- help
- phase or compilation id when useful

Short output is a compact cycle status plus diagnostic codes.

The compiler emits diagnostics for expected dev failures instead of throwing through the CLI host.

## Data Flow

```txt
Rolldown watch event
  -> RolldownWatchAdapter
  -> DeckjsxDevCompiler invalidation queue
  -> DeckjsxDevCompilation
  -> EntryExecutionHost imports generated bundle
  -> deck.render(...) claims Render Slot
  -> write(...) records output through artifact write token
  -> TrackedOutputCoordinator classifies writes
  -> DeckjsxDevCompiler retains tracked slots in Incremental Artifact Session
  -> DevModuleGraph updates watched module and asset files
  -> compiler emits compilation result event
```

The compiler coalesces changes that arrive while a compilation is running. It finishes the active compilation, then starts one more compilation with the accumulated changed source ids.

## Failure Behavior

Bundle failures:

- emit compiler diagnostics
- preserve the previous successful Incremental Artifact Session state
- keep the compiler resident
- continue watching known files

Entry execution failures:

- emit compiler diagnostics
- preserve the previous successful Incremental Artifact Session state
- keep the compiler resident
- continue watching known files

Missing tracked output:

- emit `deckjsx.node.dev.missingTrackedOutput`
- do not retain new slots for that compilation
- keep previous successful state available for the next successful compilation

Output write failures:

- flow through `write(...)` result diagnostics
- appear in compilation write records
- do not crash the compiler

## Testing Strategy

Tests are written before implementation.

Primary tests:

- `DeckjsxDevCompiler` creates a retained watcher adapter and does not call one-shot `rolldown()` per compilation.
- `BUNDLE_END` produces one `DeckjsxDevCompilation` with generated code, module ids, watch files, and consumed changed source ids.
- changed source ids coalesce while a compilation is running.
- failed bundle and failed entry execution leave the compiler resident.
- tracked output classification retains only the primary `--out` Render Slot.
- extra output paths are allowed writes but do not retain Render Slots.
- output files, lock files, and temporary compiler files are ignored by the dev graph.
- observed asset file paths are added to the dev graph only when `nodeAssets()` is explicitly installed.
- CLI prints detailed diagnostics by default and short cycle status with `--short`.

Focused smoke test:

- pack `@deckjsx/node`
- run one `DeckjsxDevCompiler` compilation against a temporary project
- verify `output.pptx` is written, tracked, and has a ZIP header

## Non-Goals

- Do not restore `@deckjsx/vite`.
- Do not reintroduce render-call wrapping.
- Do not auto-install `nodeAssets()` in dev.
- Do not expose private Pipeline Artifact collections.
- Do not make extra output paths retain Render Slots.
- Do not implement a browser viewer notification layer.

## Implementation Choices

The first implementation uses Rolldown's public `watch(...)` API plus an adapter-owned Rolldown plugin that records `watchChange` ids. `DeckjsxDevCompiler` only receives the adapter's normalized changed-source snapshot.

The first implementation keeps the syntax-aware transform question separate. `media-source-transform.ts` remains the existing transform Module unless compiler tests reveal transform correctness issues.

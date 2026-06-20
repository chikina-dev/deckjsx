# @deckjsx/node v0.1.4 Human-First Dev Console Design

## Summary

`@deckjsx/node` v0.1.4 should turn `deckjsx dev` into a human-first development console and make `deckjsx dev --interactive` an inline inspector layered on top of that same console.

The goal is not to publish a stable external protocol, preserve JSON as the default output, or introduce a fullscreen TUI. The goal is to make development readable, explainable, and pleasant in the terminal. Normal `dev` output should be as intentionally formatted as Vite-style dev logs, and `--interactive` should add an inspector prompt without becoming a separate mode or visual surface.

Both normal `deckjsx dev` and `deckjsx dev --interactive` must use the same console coordinator and renderer primitives. Interactive mode adds inspector input and results; it does not switch the dev command onto a separate rendering path.

## Goals

- Make normal `deckjsx dev` logs readable, colored, aligned, and event-oriented.
- Make `deckjsx dev --interactive` use the same console language plus an inline inspector REPL.
- Treat terminal output as human-facing UI, not machine logs.
- Keep internal command/result boundaries structured so the implementation stays testable and extensible.
- Deepen inspector features: live input highlighting, completions, selections, component tree/search/filter/inspect, props inspect/diff, cascade trace, subtree diff, render impact, diagnostics, projection, and history changes.
- Keep renderer primitives, inspector DTOs, and domain inspectors separate from Node plugin process management so the design can be reused by future hosts.

## Non-Goals

- No fullscreen TUI.
- No separate `--interactive=tui` or alternate interaction mode.
- No stable public JSON-RPC, WebDriver BiDi, or external protocol contract.
- No JSON default output for interactive commands.
- No machine-log compatibility as a primary constraint for `--interactive`.
- No `--short`/`-s` compact dev mode; `deckjsx dev` is a human-first resident console.

## User Experience

### Normal Dev Console

Normal `deckjsx dev` should render compiler lifecycle and artifact status as a concise development log:

```text
2:11:19 PM [deckjsx] dev started    src/main.tsx
2:11:20 PM [deckjsx] rebuild        src/main.tsx (x2)
2:11:20 PM [deckjsx] render         sample/output.pptx    84ms
2:11:20 PM [deckjsx] ready          1 output              3 slides
```

Errors should be formatted as terminal diagnostics with color, source locations, snippets, labels, notes, and help:

```text
2:12:03 PM [deckjsx] error          bundle
  src/slides/main.tsx:42:13

  42 | <Slide title={theme.hero}>
     |              ^^^^^^^^^^ unknown value

  code    deckjsx.node.dev.bundleFailed
  help    Fix the bundling error and save again.
```

Use tabs or stable column spacing for scanability. The console should make rebuild cause, phase, status, duration, output path, and relevant counts visible without requiring `--interactive`.

Diagnostics are displayed by the shared dev console exactly once. `--interactive` does not replace or duplicate that diagnostic stream; it lets the user inspect the latest diagnostic snapshot after the fact with `diagnostics` and `diagnostic <index>`.

`diagnostic <index>` should include related inspection context when available: source, component, graph, projection, output, inspection boundary, and a suggested impact command. When a failure occurs before later stages exist, the diagnostic view should say which boundary made those relationships unavailable.

Successful dev logs should stay concise: show rebuild cause, ready summary, duration, relevant counts, and changed outputs. Do not print every internal stage on every successful rebuild; detailed phase information belongs in inspector commands such as `status` and `timings`.

`timings` remains an inspector command rather than normal dev log output. Normal dev may show total duration, but phase timings are shown when the user asks for them through `timings` or when benchmark scripts collect them.

### Inline Inspector

`deckjsx dev --interactive` should preserve the normal dev console and add an inline prompt:

```text
2:11:20 PM [deckjsx] ready          sample/output.pptx    84ms

deckjsx> component search Header
$0 component Header
   source  src/slides/main.tsx:12:1
   nodes   g:slide-1-title, g:slide-2-title
   impact  2 slides, 2 projection elements
```

When dev events arrive while the prompt is active, the console should redraw cleanly instead of corrupting the input line. The user should feel they are in a single development console with an inspector prompt, not a separate protocol shell.

The console must have a single terminal-writing owner. Compiler events, diagnostics, inspector results, prompt rendering, input highlighting, completion lists, and redraws should flow through the same console coordinator instead of calling `console.log`, `console.error`, or prompt writes from independent branches.

The dev console writes to stderr. Normal dev logs, diagnostics, prompt rendering, and inspector results all share that same stream so the console coordinator owns one terminal surface. `deckjsx dev` should not write human console UI to stdout.

## Command Vocabulary

The v0.1.4 inspector must support:

```text
help
status
timings
diagnostics
diagnostic 0

style $0
style $0 color

component tree
component inspect $0
component search Header
component filter source:slides.tsx
component diff
component impact $0

props inspect $0
props diff $0

projection
projection 0
projection 0 2

history changes
selection
$0
$1
$2
$$
exit
quit
.exit
```

Unknown commands should render suggestions. Parse errors should show the problematic span in the input, not only a generic error.

Broad interactive command reference belongs outside the interactive prompt through a `deckjsx dev --interactive-help` CLI option. Keep it separate from `deckjsx dev --help`: `--help` documents dev command startup options, while `--interactive-help` documents prompt commands. `--interactive-help` should print the command reference and exit without requiring `--interactive`, an entry, or `--out`; it does not need to be useful in combination with `--interactive`. Inside the prompt, `help` should be minimal: point to Tab completion and the external reference instead of printing a long command manual. Discovery inside the prompt should primarily come from contextual completion, unknown-command suggestions, and next-action hints in command output.

`--interactive-help` should use the same renderer primitives and restrained styling as the Human-First Dev Console, but it does not need to start the resident console coordinator because it prints static reference text and exits.

`deckjsx dev --help` should also use the shared renderer primitives, but it should document only startup usage and options such as entry, `--out`, `--interactive`, and `--interactive-help`. It should not include the full prompt command reference.

CLI parse errors, missing required arguments, and unknown options should use the same diagnostic renderer primitives as dev diagnostics. Startup diagnostics should include a concise usage hint and point to `deckjsx dev --help`.

Unknown CLI options should be strict errors with suggestions when possible. Do not silently treat unknown `--flag` values as extra output paths; this prevents typos such as `--interacitve` from starting dev with an unintended argument.

Keep positional extra output paths from the existing `deckjsx dev <entry> --out <path> [extra output paths...]` contract. Strict option parsing applies to unknown `--flag` tokens, not to positional output paths.

## Architecture

The implementation should split the current interactive responsibilities into small layers:

```text
terminal input
  -> command parser
  -> command dispatcher
  -> inspector model
  -> structured result
  -> human renderer
  -> selection/session state
```

Normal dev output should use a shared console renderer:

```text
DeckjsxDevCompilerEvent
  -> DevConsoleEvent
  -> ConsoleCoordinator
  -> DevConsoleRenderer
       -> diagnostic renderer
       -> lifecycle renderer
       -> artifact/write renderer
       -> table/tree primitives
       -> color/theme primitives

Interactive REPL
  -> command parser/dispatcher
  -> inspector result
  -> ConsoleCoordinator
  -> same renderer primitives
```

### Dev Console Renderer

Introduce a renderer boundary for compiler lifecycle and diagnostics. It should consume normalized console events rather than raw compiler events directly. This keeps formatting separate from compilation behavior.

Expected event families:

- `dev.started`
- `dev.rebuild`
- `dev.ready`
- `dev.blocked`
- `dev.closed`
- `diagnostic`
- `artifact.write`
- `artifact.summary`
- `inspector.prompt`
- `inspector.result`
- `inspector.error`

The renderer should own color, alignment, timestamps, labels, source snippets, and table/tree primitives. The compiler should not own presentation rules.

### Console Coordinator

The console coordinator owns terminal write sequencing. It is the only layer allowed to mutate the terminal, including normal lines, prompt lines, input redraw, completion menus, and inspector output. Compiler listeners and command handlers should enqueue console events or inspector results; they should not write to stdout or stderr directly.

This is a design requirement, not a fallback for broken output. The console is interactive and event-driven, so terminal ownership must be centralized from the start.

The coordinator is used for both ordinary dev and interactive dev. In ordinary dev it renders lifecycle, diagnostics, artifact writes, and summaries. In interactive dev it renders those same events plus prompt, input editing, completions, and inspector results.

The coordinator writes the console UI to stderr only. stdout is intentionally unused by `deckjsx dev` so a future non-resident export or print command can define stdout semantics without being constrained by the development console.

### Interactive Input

The inline REPL should use a small terminal input layer rather than plain JSON line printing. It should support:

- live syntax highlighting while typing;
- history navigation;
- cursor movement and editing;
- Tab completion;
- contextual command suggestions;
- parse-error span rendering;
- clean redraw when dev events arrive during input.

If standard `readline` cannot support clean highlighting/redraw, use TTY keypress events and raw mode behind the same input interface. Keep non-TTY test hooks possible through deterministic line input.

Syntax highlighting should be command-grammar based, not TypeScript expression highlighting. Highlight command verbs, subcommands, selection handles, ids/targets, props paths, style properties, filter fields, unknown tokens, and parse-error spans.

Color should be fixed and restrained. The console should color only meaningful anchors such as severity, status, selection handles, command verbs, changed values, applied cascade winners, overridden candidates, and parse errors. Avoid making the entire interface colorful; spacing, alignment, and labels should carry most of the readability.

Completion is part of command discovery, not only text insertion. The completion UI should be grammar-aware and context-aware: it should suggest command verbs, subcommands, selection handles, component ids/names, style properties, diagnostic indexes, projection indexes, and filters when the current input position expects them. Suggestions should include short descriptions when space allows so users can learn what is possible without leaving the console.

Completion candidates should include descriptions. For example, after `component <Tab>`, the console should show choices such as `tree`, `inspect`, `search`, `filter`, `diff`, and `impact` with one-line explanations. Completion answers "what can I do here?"; `help` can remain the broader command reference.

Completion should also suggest live data from the current inspection state. Providers may read the Node Dev Inspection Store and Incremental Artifact Session to suggest selected handles, component names and ids, style properties with applied/overridden hints, diagnostic indexes, projection slide/element indexes, and filter fields. This completion provider layer should be separate from parsing so command grammar stays testable without live dev state.

### Dev Instrumentation Runtime

Props and component inspection should not make the core JSX runtime own inspector storage, redaction, indexing, or diff behavior. v0.1.4 should add a private development-only instrumentation boundary owned by `@deckjsx/node`.

The dev transform should supply capture-site metadata and arrange for evaluated props snapshots to be recorded while delegating actual Author Tree creation to the core JSX runtime. This may be implemented by routing JSX through private instrumentation helpers, by injecting authoring metadata and using render-execution observers, or by an equivalent generated helper. The core runtime remains responsible for authoring semantics, while the Node dev instrumentation runtime owns Component Inspection Snapshots, props sanitization, inspector indexes, and diff state.

This boundary is for dev inspection only. Ordinary authoring and render behavior should not gain props-inspection cost or public props-inspection API surface.

Do not add a new `deckjsx/integration` API for this feature. The instrumentation runtime is a private `@deckjsx/node` implementation detail because the capture behavior exists to support the Node dev console, not a general integration contract.

The concrete purpose is to make authoring execution inspectable without turning props inspection into a public authoring contract. During dev bundling, the transform may route JSX through a private `@deckjsx/node` instrumentation runtime, inject metadata consumed by a render-execution observer, or use an equivalent generated helper. That runtime path reads capture-site metadata, snapshots evaluated props, records the snapshot in the Node dev inspection store, and then delegates author tree creation to the real `deckjsx` JSX runtime. The implementation must not expose this as a stable public subpath or general integration API.

Inspector-only data belongs in a private Node Dev Inspection Store, not in the core Incremental Artifact Session. The Incremental Artifact Session retains core graph, projection, package, and render-slot artifacts. The Node Dev Inspection Store retains component snapshots, props snapshots, inspector indexes, selections, and diff metadata. Inspector models may join both stores when answering commands.

The Node Dev Inspection Store is attempt-scoped. A fresh current attempt store starts for each compilation attempt, records snapshots during entry execution, and is promoted when the compilation finishes. The store tracks:

- `latestAttempt`: the most recent attempt, successful or failed;
- `latestInspectable`: the most recent attempt with component/props inspection data;
- `previousInspectable`: the prior inspectable attempt used for component and props diffs.

This separates failure-time partial inspection from successful artifact history and prevents stale props or component nodes from leaking across attempts.

`component diff` and `props diff` compare `previousInspectable` to `latestInspectable` by default. They are inspection-history commands, not artifact-history commands. `history changes` keeps its existing meaning: compare previous successful artifact update to latest successful artifact update.

### Command And Result Boundary

Commands should still dispatch to structured internal results. That boundary is for implementation decoupling and tests, not for public protocol stability.

Internal result objects should carry a kind, title, selection candidates, and renderer-friendly data. The renderer should decide how to present them. Avoid making command handlers concatenate terminal strings directly.

### Inspector Model

Move domain-specific inspection out of the REPL/session shell:

- diagnostics inspector;
- style inspector with cascade trace;
- component inspector;
- props inspector;
- projection inspector;
- history/diff inspector;
- render-impact inspector.

The inspectors should operate on retained artifact/session snapshots and return compact DTOs. This keeps the Node CLI from becoming the owner of deckjsx domain reasoning.

Inspector models should read from both the Incremental Artifact Session and the Node Dev Inspection Store. Artifact inspection provides graph/projection/package state; the Node dev store provides dev-only component, props, selection, and diff state.

### Selection State

Selections are part of the inspector model:

- `$0`, `$1`, `$2` refer to recent primary selections.
- `$$` refers to the most recent result list.
- Commands that return inspectable entities should update selection state.
- `selection` should display current handles in human-readable form.

Selections should prefer stable inspector IDs over raw object references. Selection handles may live across attempts: they should store a resolvable inspector reference, resolve against `latestInspectable` when used, and report a clear "last seen" message when the target no longer exists.

This enables flows such as selecting a component, saving a file, and then running `props diff $0` against the latest inspectable attempt.

### Component And Props Snapshotting

Component provenance already exists through the authoring metadata carrier. v0.1.4 should keep Component Provenance narrow and build a separate Component Inspection Snapshot for React DevTools-like inspection.

Component identity should be stable enough for search, diff, and selection. Prefer identity derived from component name, module id/source span, key, and tree path. Document that IDs are inspector IDs, not public persistent IDs.

The Component Inspection Snapshot should contain:

- stable inspector id;
- Component Provenance;
- sanitized props snapshot;
- child component ids;
- related authoring, graph, layout, projection, diagnostic, and artifact references.
- snapshot status: `complete`, `partial`, or `unavailable`.

Snapshots are not limited to successful renders. Failed attempts should retain whatever component inspection state is available so diagnostics can be explored in context. When state is incomplete, commands should say which boundary failed, such as bundle, entry execution, graph construction, layout, projection, or output write.

Component inspection availability should carry both the dev compilation status and the inspector boundary. The dev status remains the runtime outcome, such as `artifactUpdated`, `bundleFailed`, `entryFailed`, or `outputBlocked`. The inspector boundary explains where inspection data is available or missing, using vocabulary such as source, bundle, entry, authoring, graph, style, layout, projection, and output.

Props should be retained as safe inspector snapshots:

- truncate large values;
- summarize functions, symbols, class instances, and circular structures;
- redact secret-like keys such as `token`, `secret`, `password`, `apiKey`, `authorization`, and `cookie`;
- preserve enough shape for `props inspect` and `props diff`.

There are two props snapshot families:

- Component Props Snapshot: sanitized props passed into a function component invocation.
- Authored Element Props Snapshot: sanitized props retained on an intrinsic authored element after component execution.

`props inspect <target>` should choose the right family from the target. Component targets show Component Props. Authoring, graph, layout, or projection targets resolve back to the related authored element and show Authored Element Props. `component inspect <target>` should summarize Component Props and link to related authored element props when available.

`props inspect <target> [path]` supports focused path lookup. `props inspect <target>` shows a bounded props view; `props inspect <target> items` or `props inspect <target> theme.colors.primary` shows one path. Completion for props paths is limited to top-level props keys in v0.1.4. Nested path completion is intentionally excluded so completion stays fast and predictable.

`props diff <target> [path]` follows the same path rules. Without a path it shows a bounded summary diff for the target props. With a path it compares only that props subtree or value. Completion remains limited to top-level props keys.

`component inspect <target>` is a hub view. It should show identity, source, selection handle, props summary, children, related diagnostics, and impact hints. It should explicitly point users to `props inspect <target>` for full props details and `component impact <target>` for render impact.

Props snapshots are captured by the Dev Instrumentation Runtime, not by turning the core JSX runtime into an inspector store. The dev transform supplies capture-site metadata such as module id, source span, component name, and prop source hints; the instrumentation runtime path sees evaluated props through private helpers or render-execution observers, sanitizes them, records snapshots, and leaves Author Tree creation with the core JSX runtime.

This is not optional polish. Props inspection is part of making component-level debugging comparable to React Developer Tools.

### Search And Filter

`component search <query>` searches across `latestInspectable`, updates `$$` with the result list, and sets `$0` to the first result when available. `component filter <query>` narrows the current `$$` result list, then updates `$$` and `$0` using the filtered result. Search is global within the latest inspectable attempt; filter is local to the current result list.

Filter/search predicates should support component name, source/module, props paths, diagnostic relationships, and impact relationships as the inspection index can provide them.

The v0.1.4 query language should stay small:

- `Header`: fuzzy text search over name, source, and props summary;
- `source:slides`: source/module match;
- `props.title:Roadmap`: props path match;
- `props.title~Road`: explicit contains match;
- `has:diagnostic`: related diagnostics exist;
- `impact:slide`: related projection impact exists.

Do not add AND/OR groups, parentheses, negation, or regular expression syntax in v0.1.4. Multiple tokens may be treated as an implicit conjunction.

### Cascade And Render Impact

Cascade trace should explain why a style property won:

- applied candidate;
- overridden candidates;
- source kind such as default, inherited, theme, class, inline;
- specificity and order when those inputs participate in resolution;
- mismatch, unsupported, or unavailable reason when a trace cannot provide a normal cascade input.

Cascade trace is part of the `style` command family, not a separate `cascade` command. `style <target>` shows a resolved style summary and explicitly points users to `style <target> <property>` for details. `style <target> <property>` is the detailed view and should show the property result plus cascade details, including applied and overridden candidates. Do not require an additional trace/details option for cascade detail.

Render impact should connect component-level concepts to output-level artifacts:

```text
component
  -> author node
  -> graph node
  -> layout/style entity
  -> projection slide/element
  -> diagnostics
```

`component impact $0` should be the command that answers "what output did this component affect?" v0.1.4 should render impact as CLI-readable summary, chain, and tree views. It should not implement a browser-style node graph or fullscreen graph UI.

Impact should accept major inspector targets as roots, including component, props, graph, projection, and diagnostic targets. Component roots explain downstream effects. Graph roots explain projection and diagnostic effects. Projection roots explain which component, authoring, graph, and style inputs produced an output element. Diagnostic roots explain the related source, component, graph, projection, or output context.

## Relationship To v0.9.3 / v0.1.3

The existing v0.9.3 / `@deckjsx/node` v0.1.3 implementation proved:

- resident dev compiler host;
- experimental interactive session boundary;
- JSON-line responses;
- component provenance propagation;
- style property traces;
- projection inspection;
- history changes;
- selection handles.

v0.1.4 should replace the JSON-first interactive experience with a human-first console while preserving the useful internal boundaries. `docs/interactive-dev-session-plan.md` remains a record of the first slice; this spec supersedes its deferred UX items for the next implementation.

v0.1.4 also supersedes the ADR 0012 `--short`/`-s` compact-summary behavior. The dev console should not carry a machine-log shortcut; future compact diagnostics should be designed as a separate non-resident command or export surface if they become necessary.

## Testing Strategy

Add tests at the layer boundaries:

- dev console event normalization from compiler events;
- renderer snapshots for normal dev lifecycle, rebuild, ready, blocked, and diagnostics;
- diagnostic rendering with snippets, labels, notes, help, and phase/compilation metadata;
- input parser tests for the expanded command vocabulary;
- interactive input tests for highlight tokens, completion candidates, parse errors, and selection handles;
- inspector model tests for component tree/search/filter/inspect;
- props snapshot tests for truncation, circular values, functions, and redaction;
- diff tests for component subtree and props changes;
- render-impact tests linking components to graph/projection elements;
- integration smoke tests for `deckjsx dev` and `deckjsx dev --interactive`.

Performance tests should measure normal dev and interactive dev separately:

- cold startup;
- warm source rebuild;
- warm asset rebuild;
- inspector command latency;
- snapshot/index memory size for component-heavy decks;
- cascade-heavy style inspection.

## Release Criteria

v0.1.4 is release-ready when:

- normal `deckjsx dev` output is visibly improved and event-oriented;
- `--short`/`-s` is removed from `deckjsx dev`;
- `--interactive` uses human-readable output by default;
- live input highlighting and completion work in the terminal;
- component, props, style cascade detail, diff, projection, diagnostics, history, selection, and impact commands are implemented;
- prompt redraw remains readable while compiler events arrive;
- tests cover parser, renderer, inspector models, props safety, diffs, and integration smoke paths;
- non-interactive dev behavior still compiles and updates outputs correctly;
- no stable external protocol is documented or implied.

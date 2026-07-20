# Host Configuration is the canonical command input

Status: accepted

Host startup and execution options belong in the consuming project's `deckjsx.config.ts`, loaded by the active host such as `@deckjsx/node`. The CLI remains a command and interaction surface, but ordinary entry, output, dev, test, and host integration settings should not be duplicated as CLI options.

`@deckjsx/node` owns and exports the shared config loading facilities. Other Node-based Config Consumers may depend on those facilities while keeping independent execution routes. In particular, a future `@deckjsx/test` reads the same config to determine what to execute and how to judge results, but runs through its own API or runner. The dependency is one-way: test depends on Node; Node does not depend on test and does not add a `deckjsx test` route.

The reusable public boundary is functional rather than a public Project runtime. `resolveConfig({ cwd, environment })` resolves the Host Package Boundary, config and extends graph, normalized Environment Context, entry/output hints, preserved Plugin values, diagnostics, and config watch inputs. `resolveEntries(resolvedConfig)` separately validates explicit entries or performs dynamic discovery and returns resolved entry roots, discovery watch inputs, and diagnostics. A Config Consumer may stop after configuration or reuse entry resolution before continuing through its own runner.

Both resolver functions return discriminated results with structured diagnostics. Expected failures such as config syntax or evaluation errors, extends cycles, invalid shape, package/config placement errors, missing or ambiguous entries, and explicit hint mismatches produce `ok: false` rather than throw. Successful results may retain warning diagnostics. Unexpected internal invariant violations and caller programming errors may still throw. This lets the Node CLI and independent consumers render the same evidence through different interfaces.

Resolver results use the shared Core `Diagnostic` structure rather than a parallel Node-only container. Config and discovery concerns define their own diagnostic codes, messages, file labels, and notes within that common vocabulary. Node CLI, test reporters, and editor integrations remain responsible for presentation.

The shared top-level config schema does not add a `test` field or another consumer-specific section. A consumer package contributes its settings through its Plugin factory in the common `plugins` list. The config loader preserves arbitrary valid Plugins; each runner consumes the capabilities it owns and does not require unrelated consumer packages.

Preservation means retaining the original valid Plugin object and its additional properties. The loader may validate common required fields, but it does not project Plugins into a closed Node-owned DTO. The representation used for package-specific capability data is intentionally deferred to the package that needs it.

The configuration file is optional. When absent, the host behaves as though `entry` and `output` were both `null` and no config Plugins or additional host settings were supplied. This preserves a slower but usable configuration-transparent path in which an author can run ordinary deck source without first creating a parallel project manifest.

When present, `deckjsx.config.ts` must be a sibling of the `package.json` that defines the Host Package Boundary. A discovered configuration without a sibling package manifest is a configuration error; the host does not silently attach it to a package manifest in another directory. This keeps config-relative paths, dependency resolution, source discovery, and watch scope anchored to the same package.

The Host Package Boundary is resolved from the invocation working directory supplied to the Host, using `process.cwd()` for ordinary CLI execution and an explicit `cwd` for embedded Host APIs. The installed bin path or `@deckjsx/node` package location is used only to resolve Host-owned code and resources; it must not select the consuming project. Starting at the invocation directory, the Host may walk upward to the nearest package manifest. Running at a monorepo root selects that root package and does not implicitly execute every workspace package; callers select a child package by invoking there or by supplying explicit root-package entries.

Package-manager hoisting does not change this selection. A bin may resolve from an ancestor `node_modules` while the nearest package manifest under the invocation `cwd` remains the consuming Host Package Boundary. Each workspace package may own a sibling `deckjsx.config.ts` and package-local entry hints while sharing one installed Node Host binary.

The Host Configuration `entry` and `output` fields each accept `null`, a single string, or an array of strings. An explicit `entry` string or array is the recommended path because it gives the host deterministic and fast startup. For the Node host, `entry: null` is a supported dynamic-discovery mode: the host recursively traverses the `deckjsx.config.ts` directory and its descendants, excluding `node_modules`, and inspects a broader source set to find entry candidates associated with the host's `write(...)` output boundary.

`entry` and `output` are Execution Index Hints whose primary purpose is performance. They let the host reduce filesystem traversal, source inspection, bundling, output association, and watch scope. `null` preserves a usable but slower path by asking the host to derive the missing information dynamically.

`output` is a discovery and execution selector rather than a second owner of the destination path; the authoring source's `write(render, outputPath)` call remains the actual write instruction. With `entry: null`, `output: null` asks the host to find entry candidates containing a relevant `write(...)` boundary without narrowing by destination. A string or string array narrows discovery to `write(...)` boundaries associated with the specified outputs. Output strings are paths resolved relative to the Host Configuration file unless absolute. An implementation may use the basename as a cheap initial source-search filter, but final association uses the normalized path so equal filenames in different directories remain distinguishable. Explicit outputs can therefore reduce how much candidate source must be inspected and disambiguate projects with multiple writes.

Entry ambiguity and output multiplicity are separate. Dynamic discovery still requires one surviving Entry Execution Root, but that entry may perform any number of writes. With `output: null`, every write observed from the selected entry is tracked and a conditionally absent output is not missing. With explicit outputs, each specified output must be observed; additional writes remain allowed and are reported as untracked warnings.

Output-path static analysis is best effort. The Host may constant-fold literals and common path construction to narrow discovery, but a dynamically constructed path does not make otherwise valid authoring source invalid. When an explicit output cannot be associated statically, discovery falls back to broader write-boundary analysis and reports that the output hint could not provide its intended optimization. After execution, normalized observed write paths remain authoritative for required-output validation and untracked-output warnings.

The host may use Rolldown's scan/build hooks to parse the discovered candidates. Directory enumeration and recognition of the write boundary remain Host behavior. Zero candidates and multiple candidates are diagnostics; the host must not silently select an arbitrary file or execute arbitrary candidates as a probe. Discovery results live in a process-local memory cache and are invalidated when the traversed source set changes.

Dynamic discovery distinguishes a write helper from an Entry Execution Root. Cheap text and output-filename searches may reduce the candidate set, but final recognition follows the import provenance of `write` from `@deckjsx/node`, including aliases and re-exports, and uses the local Rolldown module graph to trace reachable write boundaries back to package-local execution roots. A helper that merely defines or exports a function containing `write(...)` is not selected as the entry when another root imports and invokes that flow.

An Entry Execution Root must have a top-level execution path that can reach the write boundary in the tree-shaken graph. An exported but otherwise unused function is not an entry; a top-level await, direct top-level call, or top-level call through a local `main()` flow may be. Static discovery treats a write behind a runtime condition as reachable when the graph cannot eliminate it, but does not claim the condition will be true. Candidate modules are never executed to answer discovery. More than one surviving execution root remains an ambiguity diagnostic.

Dynamic traversal does not follow directory symlinks. A file symlink is resolved to its real path, included once only when that path remains inside the Host Package Boundary, and excluded when it resolves through `node_modules` or outside the boundary. An explicitly configured entry may resolve outside the boundary because it represents deliberate author intent, but the Host reports that escape as a warning and includes the external real path in its watch graph.

Dynamic traversal also stops when a descendant directory contains another `package.json`. A root package therefore does not discover entry roots owned by workspace child packages. Running from the child selects that child boundary and its local config; shared settings remain explicit through `extends`. A root config may name a child-package entry explicitly, but that deliberate package-boundary escape is warning-level and never inferred by `entry: null`.

Directory enumeration may cover the package boundary broadly, but content inspection for entry discovery is limited to executable JavaScript and TypeScript source extensions: `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.mjsx`, `.mts`, `.cjs`, `.cjsx`, and `.cts`. Declaration files, `deckjsx.config.ts` and its extends graph, JSON, Markdown, media, and generated document formats are not entry candidates. Explicit entries may use another format only when the active Rolldown/plugin loader can process it.

Dynamic discovery applies project-authored `.gitignore` rules so generated bundles, coverage, and other ignored sources do not become duplicate entry candidates. While resolving `cwd` and the Host Package Boundary upward, the Host may identify the containing Git worktree and read `.gitignore` files on the known path from that worktree root to the package. During the ordinary downward package traversal, it reads nested `.gitignore` files as they are encountered and applies their scoped rules. This is integrated into existing traversal rather than implemented as a separate ignore-file scan.

Project ignore files and compiled matchers are cached with discovery state; changing one invalidates the affected discovery scope. User-global Git ignore configuration and `.git/info/exclude` are not applied because they would make discovery vary across machines without project-visible configuration. An explicit entry may target an ignored file, but produces an ignored-entry warning. The `.git` directory itself is always excluded. Outside a Git worktree, package-root and nested `.gitignore` files still act as project-authored discovery rules.

Explicit hints are authoritative for narrowing work and are validated. A missing explicit entry or an explicit output not observed from the selected execution is a diagnostic; the host does not conceal stale configuration by silently falling back to broad discovery. A `write(...)` observed outside the explicit output set remains allowed because output hints are tracked-output selectors, not a write permission list, but the host reports it as an untracked-output warning.

Entry and output arrays are independent execution-wide sets, not positionally paired lists. The association between an entry and the outputs it produces remains expressed by executable source and its `write(...)` calls. Host Configuration does not add a parallel target mapping contract because keeping that mapping synchronized would weaken Configuration Transparency and developer experience. If more association information is needed for optimization, the host should derive and cache it from source rather than require authors to duplicate it.

This is a host concern. Core does not load `deckjsx.config.ts`, inspect the filesystem, or define the dynamic-discovery algorithm. The host resolves configuration and entry selection before creating the execution-scoped Deck Plugin Set and invoking the core pipeline. Config Plugins remain arbitrary normalized Plugins, and root Deck `deck.plugin(...)` registrations retain their warning-level same-id override at execution-set formation.

After loading configuration, the host executes each selected entry inside a Host Execution Scope carrying config Plugin contributions. This makes authoring and compile behavior available to `deck.render(...)` before `write(...)` runs. The Node host owns asynchronous scope isolation; file writing is not a Plugin injection boundary.

Configuration is evaluated once per Host Session. The resulting Plugin values are reused across selected entries and incremental executions. When the config module changes, the host discards the old scope, reevaluates configuration, assigns a new Plugin Set identity, invalidates dependent graph and projection caches, and reruns selected entries as a new session.

For a resident host, an initial expected config or entry-resolution failure does not prevent residency once the Host Package Boundary has been resolved. The host exposes that failed generation as structured diagnostics, retains the resolver's file and directory watch evidence, and retries resolution after relevant changes. A successful retry constructs the first executable Host Session without restarting the process. Successful resolution warnings are retained alongside the source generation they describe.

Each executable source generation is paired atomically with the Host Execution snapshot derived from the same resolved config and entry set. That snapshot contains the selected entries, output hints, Environment Context-derived Plugin Set, and other execution inputs needed by the compiler. A consumer must not await source generation and then independently reread mutable Host Session state, because a concurrent config rebuild could otherwise combine source from one generation with outputs or Plugins from another.

The only supported default-export form is a value created by `defineConfig(...)`. The helper accepts either a static config object or a synchronous or asynchronous callback that receives the Host Session Environment Context and returns that object. The callback is evaluated once when the session begins. The Host awaits it fully before normalizing hints, constructing the Plugin Set, starting discovery, or evaluating entries. Its `environment` field is an open string derived from the surrounding ecosystem's `NODE_ENV` when present; hosts may supply a conventional default such as `development`, `test`, or `production` when it is absent. deckjsx does not add a separate `DECKJSX_ENV`. The normalized value participates in Host Session identity. Requiring the helper gives hosts a recognizable config contract while keeping static configuration concise.

A Config Definition may declare `extends` as one imported Config Definition or an array. Definitions resolve left to right and the child resolves last. `entry` and `output` replace inherited values when present. `plugins` concatenate base to child, with a later same-id Plugin replacing the earlier config contribution in its slot. All callbacks receive the same Environment Context and may resolve asynchronously before the Host Session begins. The extends module graph participates in config watching and session invalidation.

Config inheritance treats same-id Plugin replacement as an intentional override and emits no warning. The first slot allocated to an id is retained, so replacing a shared Plugin changes its value without moving it relative to unrelated Plugins. A later Deck-local same-id contribution follows the same slot-preserving replacement rule but emits the execution-set conflict warning defined by the Deck Plugin Set contract.

Shared definitions do not establish another Host Package Boundary. Entry and output strings in the fully merged result, including inherited strings, are interpreted relative to the final package's `deckjsx.config.ts`.

The Host does not automatically inherit `deckjsx.config.ts` from ancestor packages. It selects the nearest package from `cwd` and loads only that package's sibling config. If none exists, that package uses the configuration-transparent `entry: null` and `output: null` behavior. Reuse of a root or shared definition is explicit through `extends`, making inheritance part of the watched import graph rather than an ambient workspace rule.

For the Node host, `defineConfig` is exported from the `@deckjsx/node` package root rather than a longer config-only subpath. Configuration remains a Node Host concern; the shorter root import is an authoring convenience and does not move config loading into Core.

`defineConfig(...)` marks its object or callback as the canonical authored form without replacing the returned config shape or Plugin values. The marker may use a shared non-enumerable symbol so a bundled config and loader can recognize it without relying on one package instance. A structurally valid unmarked default export remains loadable but produces one warning. Invalid resolved configuration remains an error regardless of whether it was marked. The marker therefore supports guidance, not correctness or security.

The Node loader compiles the config and its relative local module graph with Rolldown and executes the generated module from an in-memory artifact. Bare package imports remain external so config and entry execution resolve the same installed `deckjsx`, Node, and Plugin package instances. Relative local config dependencies participate in the config watch graph; changing any of them rebuilds the config and starts a new Host Session. The loader does not require a persistent generated config file.

Process-local discovery cache identity includes the Host Package Boundary, resolved config identity, normalized environment, entry/output hints, and project ignore state. Config or extends changes rebuild the Host Session immediately. Source, traversed-directory, ignore-file, nested-package-manifest, and relevant symlink changes are debounced, invalidate only affected discovery indexes, and trigger lazy rediscovery on the next execution request. Explicit entries primarily watch their Rolldown module graphs; `entry: null` additionally watches the traversed directory set so new, removed, or renamed execution roots can be discovered.

The Host reads `NODE_ENV` but does not assign or overwrite `process.env.NODE_ENV`. When it is absent, the Host supplies a context-local default: `development` for the dev and general fallback paths and `test` for the test host. Callers that require the surrounding process and other libraries to observe another value set `NODE_ENV` before invocation. This avoids process-global mutation and conflicting concurrent Host Sessions.

## Consequences

- Config-file loading and dynamic entry discovery belong to Runtime Integration Packages or other hosts, not core.
- Node-based Config Consumers may reuse the shared config through a one-way dependency while retaining independent runners.
- `@deckjsx/node` exposes separate config and entry resolver functions instead of a public Project/session object.
- Config and entry resolution report expected failures through discriminated diagnostic results rather than exceptions.
- Resolver failures and warnings use the shared Core Diagnostic vocabulary; consumers own rendering.
- Consumer-specific judgment and behavior are configured through Plugin values rather than top-level Host fields.
- Valid Plugin object identity and package-owned properties survive config loading.
- Config Plugins are installed in a Host Execution Scope before entry evaluation and render compilation.
- Configuration changes rebuild the Host Session rather than mutating Plugin values in place.
- Host Configuration uses `export default defineConfig(objectOrCallback)`; a synchronous or asynchronous environment callback runs once per Host Session and resolves before session construction.
- Node config authors import `defineConfig` from `@deckjsx/node`.
- A valid config that bypasses `defineConfig(...)` loads with a warning; marking does not replace ordinary shape validation.
- Rolldown bundles and watches the local config graph while preserving bare package imports as runtime externals.
- Explicit entries watch their module graphs; dynamic discovery also watches traversed directories and lazily rebuilds invalidated process-local indexes.
- Environment follows `NODE_ENV`; Host defaults remain context-local and do not mutate process globals.
- A project does not need a Host Configuration file merely to execute ordinary deck source; absence selects dynamic entry and output discovery.
- A present Host Configuration and its package manifest occupy the same directory; a detached config is invalid.
- Consuming-project discovery starts from the Host invocation `cwd`, independently of where the installed bin resolves.
- A monorepo root invocation selects the root package rather than implicitly traversing workspace package boundaries.
- Hoisted bin resolution does not replace `cwd`-based selection of the consuming package.
- Config Definitions may explicitly extend shared definitions; entry/output override, Plugins compose base-to-child, and paths remain final-package-relative.
- Ancestor package configs are never inherited implicitly; a package opts into shared configuration through `extends`.
- Plugin overrides preserve the first slot; config inheritance is warning-free while Deck-over-config remains warning-level.
- CLI option parsing should shrink to command selection, help, and the interaction controls that cannot reasonably be expressed as project configuration.
- Hosts must define deterministic behavior and diagnostics for dynamic discovery, including missing and ambiguous candidates.
- Dynamic discovery selects execution roots that reach the Node write boundary, not helper modules merely containing `write(...)`.
- Entry recognition uses static top-level reachability and never executes candidates as discovery probes.
- Dynamic discovery does not follow directory symlinks or escape the Host Package Boundary; explicit external entries remain possible with a warning.
- Descendant package manifests stop dynamic traversal; workspace package entries require child-package invocation or explicit cross-package entry hints.
- Dynamic content inspection is limited to executable JS/TS-family sources; broad directory traversal does not imply reading every asset or output file.
- Dynamic discovery follows project-authored hierarchical `.gitignore` rules through the existing walk, but excludes machine-local and `.git/info` rules.
- Host Configuration output selection must agree with the outputs observed from `write(...)`; it does not silently replace the destination supplied by authoring source.
- Explicit entry and output values are intended to reduce startup and incremental work; `null` trades additional discovery cost for optional configuration.
- Stale explicit hints fail validation instead of silently degrading to broad discovery.
- Writes outside an explicit output set remain executable but are reported as untracked outputs.
- One entry may produce multiple outputs; only explicit output hints create required-output expectations.
- Dynamic output expressions may reduce discovery optimization but remain valid; runtime write observation performs final output validation.
- Entry and output arrays are not zipped or otherwise positionally associated.
- Host Configuration does not require a separate entry-to-output target map; source remains the owner of that relationship.
- Dynamic discovery is a host concern: source scanning and recognition of the host output boundary do not belong in Core.
- A Node Host may use Rolldown's scan/build hooks and cache discovery results, invalidating them when the relevant source set changes; this is an implementation choice behind the Host boundary.
- The initial cache is process-local memory only; persistent cache files are not part of this contract.
- Existing CLI contracts that require positional entry or `--out` are transitional and must be migrated when the Host Configuration loader is implemented.

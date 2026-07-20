# Deck owns Plugin registration and authoring lowering

Status: accepted

`Deck` remains deckjsx's top-level rendering object and owns the root Deck Plugin Set. `deck.plugin(...)` is the explicit registration API for Deck-local Plugin contributions, while `deckjsx.config.ts` is the canonical Host Configuration channel for Node, test, dev, and entry-time integration; it does not introduce a public Project object above Deck. Ordinary host options should be specified in the config file rather than duplicated as CLI flags. Its `entry` accepts `null`, a string, or a string array; explicit entries are recommended, while `null` enables host-owned dynamic discovery with a small startup cost.

Host Configuration may contribute any Plugin, not only Host Plugins. A host such as `@deckjsx/node` loads the configuration and merges its Plugin contributions with the root Deck's `deck.plugin(...)` registrations into one execution-scoped Deck Plugin Set.

Because authoring and compile Plugins must be active before `write(...)` observes a completed render, a host runs the entry module inside a Host Execution Scope carrying its config Plugin contributions. A root Deck render consumes that execution context before compilation and merges it with Deck-local registrations. The generic execution-context and merge contract belongs to Core, while asynchronous isolation and config loading belong to the host. Direct Core execution in an Edge environment does not require a Node ambient mechanism and can use Deck-local registration or an explicit render context.

A host evaluates configuration once per Host Session and reuses the resulting stable Plugin values across its entry and watch executions. Plugins should place per-entry, per-render, and per-stage mutable state in lifecycle context rather than mutate shared Plugin objects. A configuration change constructs a new Host Session and Plugin Set identity, invalidating graph and projection reuse derived from the previous set.

Packages may depend on Runtime Integration Packages without becoming commands of those packages. A future `@deckjsx/test` depends on `@deckjsx/node` for Node execution and shared config facilities, reads the same `deckjsx.config.ts`, and retains its own public entry and execution flow. `@deckjsx/node` does not depend on `@deckjsx/test`. The shared Plugin contract allows each Config Consumer to use the capabilities relevant to its execution without coupling independently distributed packages through a shared runner or command vocabulary.

Consumer-specific options live on the Plugin value produced by that consumer package rather than in the shared config's top-level Node schema. For example, `plugins: [test({ ...judgmentOptions })]` lets the test runner recognize its own capability while the Node runner remains unaware of test-specific types and execution. This same separation allows authoring and other packages to contribute their own capabilities through the unified Plugin contract.

The shared config loader preserves each valid Plugin object's identity and additional own properties rather than cloning only Core-known fields. Core and Node consume the standard fields they understand. This ADR does not prescribe symbols, property names, WeakMaps, or another representation for future consumer-specific capabilities; that decision belongs to the package that introduces one.

A Plugin that provides no Core-standard integration, authoring, or lifecycle hook remains valid when it has the common Plugin kind and stable id. Core does not emit a no-op warning because another Config Consumer may own package-specific behavior on that value. That consumer validates its own additional contract.

Authoring packages may produce an opaque Authoring Extension Value, such as the value returned by a tagged `mermaid\`...\`` template. An active Deck Plugin owns Authoring Lowering for that value and must turn it into core-standard AuthorTree or authoring elements before Semantic Author Graph construction. Core owns only the generic carrier, resolver boundary, and diagnostics; it does not learn package-specific syntax or semantic nodes.

The value's `pluginId` is the resolver routing key. Only the active Plugin with the matching stable identity is invoked; other Plugins cannot claim the value by returning a result.

Authoring Lowering may return one core `AuthorTreeChild` or an ordered list of core children. This allows an extension value to expand into ordinary deckjsx content such as a rendered diagram and caption without introducing an extension-specific graph node.

Initial Authoring Lowering is synchronous and runs during the Compile composition/tree phase. Asynchronous work belongs to Asset Loading, Runtime Integration, host preprocessing, or a separately designed async authoring boundary; Plugin lowering must not silently turn the current synchronous slide factory contract into an async one.

This keeps the core Edge-compatible: an Edge-safe Plugin can be bundled and registered on a Deck without Node configuration, while Node-only rendering or host services remain optional Runtime Integration Package behavior. A custom value without its Plugin is unresolved and becomes a compile diagnostic rather than entering graph, projection, or render as an unknown core object.

This decision defines the Plugin foundation and its host boundary; it does not implement `@deckjsx/mermaid`, Mermaid parsing or rendering, `@deckjsx/test`, a Playwright-like runner, or any new package-specific intrinsic or Semantic Node. Those packages are future consumers that should be testable against the generic contracts established here.

## Consequences

- `Plugin`, `Deck Plugin Set`, `Authoring Extension Value`, and `Authoring Lowering` are the domain terms; `Project Plugin Set` and a public `Project` runtime are not.
- `Deck` plugin registration and host-supplied execution contributions must normalize through one Plugin contract and deterministic execution path. A root Deck Plugin overrides a same-id Host Configuration Plugin, emits one warning while the execution set is formed, and preserves one Plugin slot rather than executing both.
- Same-id replacement preserves the first allocated Plugin slot. Shared-to-child config overrides are warning-free; a Deck-local override of config remains warning-level.
- Repeated same-id registration on one Deck replaces in place and records one Deck diagnostic warning for that registration conflict instead of calling `console.warn()`.
- Host Plugin contributions enter before compile through a Host Execution Scope, not through the later file-writing boundary.
- Node-specific asynchronous context isolation remains outside the Edge-compatible Core contract.
- `@deckjsx/test` may depend on Node and consume shared config while preserving an independent runner; Node has no reverse dependency on test.
- Consumer-specific settings belong to consumer-produced Plugin values, not top-level Node config fields.
- Config loading preserves Plugin values without defining a Core registry or storage mechanism for future consumer-specific capabilities.
- Core accepts identity-only Plugins and leaves consumer-specific capability validation to the owning package.
- Plugin Set identity participates in graph and projection cache reuse; an execution with a different Plugin object or contribution must not reuse a graph lowered under another set.
- `@deckjsx/mermaid` can expose a tagged authoring syntax plus a Deck Plugin resolver without adding Mermaid-specific JSX tags or graph nodes to core.
- A Plugin that requires Node-only or browser-only services is not automatically Edge-compatible; its runtime requirements remain explicit in the host integration boundary.
- Async rendering or external computation must enter through an explicit asset/runtime or host contract rather than through the initial synchronous Authoring Lowering contract.

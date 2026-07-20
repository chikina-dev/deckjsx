# Project Plugin Set owns plugin composition

Status: superseded by [ADR 0019](./0019-deck-owned-plugin-authoring-lowering.md)

The project should load `deckjsx.config.ts` as the canonical composition root for an ordered Project Plugin Set, and `Deck` should own authored content rather than plugin registration. The former `deck.plugin(...)` API is retired because it makes project integration look like Deck-local authoring state and creates a second registration path beside render-context and dev instrumentation paths.

One Plugin may contribute to multiple execution surfaces, including authoring or source transforms, core lifecycle stages, runtime services, authoring observation, and dev/test host behavior. Dev/runtime is an activation and lifecycle distinction inside a unified Plugin, not separate user-facing plugin registries; `@deckjsx/node`, `@deckjsx/test`, and future packages such as `@deckjsx/mermaid` participate through the same Project Plugin Set.

## Consequences

- Core must provide one normalized Project Plugin Set / execution environment to compile, project, render, dev, and test paths.
- `deckjsx.config.ts` loading belongs to a host such as `@deckjsx/node` or `@deckjsx/test`; core stays runtime-neutral.
- Plugin configuration and lifecycle identity must participate in cache and invalidation decisions.
- `DeckPlugin`, `DeckPluginInput`, `Deck#plugin`, and child-source plugin registration become migration targets and should not be extended.

The plugin-registration portions of [ADR 0009](./0009-vite-plugin-owned-local-asset-loading.md) are superseded by this decision; its runtime-neutral asset-loading boundary remains applicable.

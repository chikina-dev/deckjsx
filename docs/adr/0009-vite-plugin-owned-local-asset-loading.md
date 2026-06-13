# Vite plugin owns project-local asset loading

deckjsx core keeps the Asset Loading Boundary runtime-neutral: built-in handling may cover inline bytes, data sources, and fetchable absolute URLs, but relative paths and local file sources require an explicit AssetLoader. Project-local default asset loading will live in integration packages, starting with a monorepo plugin package shaped like `plugins/vite` and published as `@deckjsx/vite`, so Node filesystem access, project-root resolution, and bundler module-graph behavior do not become dependencies or hidden assumptions of the core authoring, Project, or Render pipeline.

Filesystem-like paths remain valid core Authored Media Sources. The restriction is that core preserves and validates those sources but does not resolve them; a Project Integration Package or Runtime Integration Package supplies the AssetLoader that interprets the path.

The target package boundary is that the core `deckjsx` package does not import `node:*` modules. The current thin Node output runtime boundary can be moved into an integration package or optional runtime package as the monorepo split matures, while core continues to expose runtime-neutral artifacts and loader contracts.

This separation is specifically about runtime compatibility, not only dependency tidiness: `node:fs` and related Node APIs do not exist in Edge runtimes and similar non-Node environments, so core should not make them unavoidable for users who only need to author, Project, Render to bytes, or supply their own runtime-safe asset loaders.

The package split should distinguish project-toolchain integration from runtime integration. A Vite package, shaped like `@deckjsx/vite`, owns Vite project graph behavior and Vite-aware default asset loading. A Node runtime package, shaped like `@deckjsx/node` or `@deckjsx/runtime-node`, owns path output and reusable local file AssetLoader primitives. The Vite package may use the Node runtime package when running in Node, but Node filesystem behavior should not be defined as Vite-specific behavior.

This decision also sets the target direction for core Render: core should render to runtime-neutral artifact bytes, while path output moves to the Node runtime integration package when that package exists. Because this project is pre-1.0, preserving a deprecated core `output: string` compatibility path is not required when the split is made.

Relative media path resolution needs an origin-bearing loader context. The core AssetLoader contract should be able to pass Media Source Origin, such as a source identity and importer/module id, to loaders. This origin is integration-supplied metadata, not an everyday `deck.slide()` authoring option users are expected to write by hand. Core provides this origin as data; `@deckjsx/vite` interprets it with the Vite module graph and project root, while core remains unaware of Vite and Node filesystem APIs.

The user-facing authoring shape stays `src`/`data` media props. Extra information needed to interpret a relative `src` is attached internally by the integration or source registration plumbing, then passed to the AssetLoader context; it should not appear as a second public media prop or required slide option.

The initial integration can attach Media Source Origin at source or slide-factory granularity. The internal model should still allow node-level origin override so JSX fragments or components imported from another module can resolve their own relative media references against the module that authored them instead of the module that happened to render them.

For component-authored literal media references, the component's defining module is the Media Source Origin. For example, `<img src="./logo.png" />` inside `components/Logo.tsx` resolves relative to `components/Logo.tsx`, even when `<Logo />` is rendered by `slides/Intro.tsx`.

For prop-authored media references, the module that authored the prop value remains the Media Source Origin. For example, `<Logo src="./customer-logo.png" />` inside `slides/Intro.tsx` resolves relative to `slides/Intro.tsx` even if `Logo` forwards that prop to `<img src={props.src} />` from `components/Logo.tsx`.

The origin transport should use internal hidden-symbol metadata on Author Tree nodes rather than changing the public `src` value shape or relying on an external WeakMap. This keeps media props serializable authoring strings while letting composition and graph construction carry per-prop Media Source Origin, such as `src` or `poster`, to the AssetLoader context.

The initial metadata scope is limited to authoring media source props that become Asset Entities: `img.src`, `video.src`, and `video.poster`. Inline media data props such as `data` and `posterData` do not need Media Source Origin, and style-owned assets should wait until they are formally connected to the Asset Loading Boundary.

The Vite default AssetLoader should resolve relative/path sources with Media Source Origin, then return core AssetLoader results: `probe()` returns media type, extension, dimensions when needed, byte length, and content hash when available; `load()` returns `Uint8Array` bytes. It should not only rewrite media references to public URLs, because PPTX output needs embedded media bytes and core should reuse those bytes through Asset Artifacts rather than re-fetching them later.

Within `@deckjsx/vite`, path semantics should follow Vite expectations rather than deckjsx-specific rules. Relative media paths resolve from Media Source Origin through Vite's resolver and module graph. Root-absolute paths such as `/logo.png` should be interpreted through the Vite project model, including public-directory behavior where appropriate, because slide authors are likely to use Vite's `public` asset convention.

Specifically, `@deckjsx/vite` treats `/asset.png` as a Vite public-root asset and returns embedded-media bytes through the AssetLoader. Core `deckjsx` does not special-case a leading slash; outside an integration package it remains an authored path source that requires a loader.

`@deckjsx/vite` should use loader diagnostics for resolver, public-directory, media-type, dimension, and file-read failures so those failures appear in Project Result or Render Result diagnostics. Returning `undefined` from a loader should mean "this loader does not handle this source"; handled-but-failed sources should be represented as Asset Loading Boundary diagnostics rather than silently falling through to a generic missing-loader failure.

Future loader result typing should model this as an async outcome returned by both `probe()` and `load()`, not as a custom Promise extension. The Promise resolves to either a successful result, a handled failure with diagnostics, or `undefined` for not-handled, allowing integration loaders to report rich failures without throwing for expected project-asset problems.

The Vite loader should also provide a stable resolver identity for Asset Artifact cache scope. A scope based only on loader display name or registration index is not enough for project integration because the same authored path can resolve differently under different Vite roots, aliases, public directories, or plugin graphs. The resolver identity is integration-owned metadata, not an authoring option.

For `@deckjsx/vite`, resolver identity should be scoped to the Vite project instance plus resolver-affecting configuration fingerprint. At minimum it should distinguish project root, public directory, base, relevant resolve aliases, and the plugin/resolver graph that can affect asset resolution. An initial stable scope string can be shaped like `@deckjsx/vite:{root}:{configFingerprint}` as long as the fingerprint changes when asset resolution assumptions change.

Asset loader results should also be able to carry runtime-neutral Asset Resolution Provenance. `@deckjsx/vite` can use provenance kinds such as file, public asset, or generated asset to explain whether bytes came from an ordinary resolved file, Vite public-directory lookup, or plugin-generated asset. Core should store and expose that provenance for diagnostics, inspection, cache explanation, and future HMR without depending on Vite module graph objects or Node file handles.

Asset Resolution Provenance belongs in inspection and explanation surfaces, such as `deckjsx/inspect`, not in the everyday root Authoring Interface. Authors keep writing `src` and `data`; tools can inspect provenance when debugging asset resolution or HMR behavior.

The initial provenance kind vocabulary is closed and core-owned: `inline`, `fetch`, `file`, `publicAsset`, and `generatedAsset`. `@deckjsx/vite` should map Vite-specific behavior into those kinds and attach resolver details separately, rather than introducing plugin-defined provenance kinds.

Provenance should use strongly typed scalar fields, such as resolver scope, resolved id, importer, and hash source. It should not include an open `details` bag or plugin-defined objects. If future integrations need more provenance data, the core provenance vocabulary should grow deliberately.

Asset Resolution Provenance should normally be produced by `probe()` so Project Result can explain asset resolution before Render. `load()` may preserve or refine that provenance when byte-level explanation is only available after reading bytes.

The canonical content hash remains `AssetProbeResult.hash`, because existing media allocation and cache behavior can already use it. Provenance may record how the hash was obtained, but should not carry a second hash value that could drift from `AssetProbeResult.hash`.

The initial provenance hash source vocabulary is `loader` or `bytes`. Metadata-derived hashes, such as mtime-like file metadata, should not be placed in `AssetProbeResult.hash` or provenance hash source until deckjsx gives them explicit semantics, because media allocation should prefer content-equivalent hashes.

The intended release phasing is to use v0.8.5 to prepare the core connection points and data flow: Media Source Origin transport, asset loader outcome typing, resolver identity, Asset Resolution Provenance, and inspection exposure. v0.8.4 remains available for separate table-tag and PowerPoint compatibility work. The v0.9.0 line can then introduce the monorepo `plugins/vite` package and its Vite-aware default AssetLoader on top of the v0.8.5 core seams.

The v0.8.5 core work should be testable without the Vite plugin. Core tests should be able to attach Media Source Origin to `img.src`, `video.src`, and `video.poster`, pass that origin to a custom AssetLoader, surface handled-failure diagnostics in Project Result or Render Result, and preserve Asset Resolution Provenance for inspection. This keeps v0.9.0 focused on Vite resolver behavior rather than unresolved core pipeline mechanics.

The v0.8.5 core seam is best implemented as one cohesive slice rather than split into a pure-type propagation PR and a later hidden-metadata PR. The slice should include the hidden-symbol Media Source Origin transport, loader outcome typing, AssetLoader context origin, resolver identity, provenance propagation, diagnostics, and inspection tests together so the connection can be validated end to end before the Vite plugin exists.

The public surface for v0.8.5 should stay narrow. Root `deckjsx` may expose the AssetLoader contract changes needed by loader authors, including context origin and outcome typing. Hidden-symbol metadata helpers and detailed provenance inspection models should remain internal or under `deckjsx/inspect`; they should not become ordinary root authoring vocabulary.

v0.8.5 is complete when the core seam satisfies these checks:

- core `deckjsx` does not add new `node:*` imports
- `src` and `poster` remain authoring-facing strings
- hidden-symbol metadata can carry Media Source Origin for `img.src`, `video.src`, and `video.poster`
- prop-passed media paths retain the module origin that authored the path value
- `AssetLoaderContext` carries source, origin, and resolver identity or scope
- `probe()` and `load()` distinguish success, handled failure, and not-handled outcomes
- handled-failure diagnostics surface through Project Result or Render Result
- Asset Resolution Provenance is available from Project-time inspection
- provenance kind is limited to `inline`, `fetch`, `file`, `publicAsset`, and `generatedAsset`
- `AssetProbeResult.hash` remains the canonical content hash, while provenance records only `hashSource` as `loader` or `bytes`

The hidden-symbol Media Source Origin writer should remain internal or plugin-facing rather than becoming a root public authoring helper. v0.8.5 core tests may use internal helpers to validate transport, and v0.9.0 can expose an appropriate integration-facing path for `@deckjsx/vite`, but ordinary users should not need to call a `withMediaOrigin`-style API.

The initial `@deckjsx/vite` public surface should be a Vite plugin factory, shaped like `deckjsx()`, for use in Vite config. The plugin owns transform setup and default AssetLoader registration. Lower-level loader factories or sub-entries, such as a hypothetical `@deckjsx/vite/loader`, should stay internal until a concrete external use case needs them.

The Vite integration should automatically provide its default AssetLoader instead of asking authors to call `deck.useAssets(...)`. Manual `useAssets`-style registration can remain as a low-level or legacy escape hatch, but ordinary Vite users should get project-local asset loading from the plugin. This revises the v0.8.0-era assumption that authors normally configure asset loading by calling `deck.useAssets(loader)`.

Automatic loader installation should be module-scoped rather than process-global. `@deckjsx/vite` should use transforms to inject or connect an integration context for deck modules; that context can provide the default AssetLoader and Media Source Origin writer to Deck/source registration without requiring user-authored `useAssets` calls. Avoid a global singleton registry because multiple Vite dev servers, tests, monorepos, and HMR sessions can coexist with different resolver assumptions.

The Vite plugin should let users configure transform targets with `include` and `exclude` patterns, such as `include: ["src/**/*.tsx"]`. The plugin can default to JSX/TSX-like modules while excluding dependency directories, but it should not rely only on detecting `Deck` usage. Transforming a matched module should still be cheap and no-op when no deckjsx media-origin work is needed.

The initial default transform target should include `**/*.{jsx,tsx}` and exclude dependency directories such as `node_modules/**`. Projects that want narrower behavior can configure `include`, for example `include: ["src/slides/**/*.tsx"]`.

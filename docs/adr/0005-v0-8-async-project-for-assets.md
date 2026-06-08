# v0.8 async Project for asset-aware projection

## Status

Accepted

## Context

PPTX projection needs media-dependent calculations before Render can safely serialize a package.
Image dimensions, media type, extension, byte length, and optional hashes can affect layout,
object-fit/object-position behavior, content types, relationship targets, media part metadata, and
package-part fingerprints.

Keeping Project synchronous would either force media metadata out of the Pptx Package Model, make
Render reinterpret projection, or require every runtime to provide synchronous file/image APIs.
Those options conflict with sandbox inspection, HMR-oriented artifact reuse, and multi-runtime
support.

## Decision

In v0.8.0, `project()` becomes asynchronous. Decks register asset loading through
`deck.useAssets(loader)`, not through Render options, because Project needs asset metadata and Render
needs the same boundary for media bytes.

Asset loading is split into two responsibilities:

- `probe(source)` obtains metadata needed by Project, such as media type, extension, dimensions,
  byte length, or hash.
- `load(source)` obtains bytes needed by Render for media parts.

Probe and load metadata fields are validated at the boundary. `mediaType`, `extension`, and `hash`
must be non-empty strings when present; `width` and `height` must be positive finite numbers;
`byteLength` must be finite and non-negative; and `load` must return `bytes: Uint8Array`. Invalid
probe results produce `E_PROJECT_ASSET_PROBE_INVALID`; invalid load results produce
`E_RENDER_ASSET_LOAD_INVALID`.

Project treats missing required probe metadata as asset data retrieval failure. Render should not
repair missing projection metadata later.

Asset probe/load results are materialized as Asset Artifacts in the Pipeline Artifact Collection.
The Pptx Package Model may reference media identity, relationship identity, package path, metadata,
and dependency fingerprints, but it should not store raw media bytes.

When multiple loaders can resolve the same source, registered loaders are evaluated before the
built-in multi-runtime boundary and in `deck.useAssets()` call order. The first successful Project
probe owns the Asset Artifact resolver scope, and Render loads bytes through that same scope so
metadata and bytes are not mixed across different runtime assumptions.

If that resolver scope cannot provide bytes for a media part during Render, the pipeline reports an
asset load diagnostic at the Asset Loading Boundary rather than letting the writer reinterpret the
source or fail later during package assembly.

PPTX Media Parts are allocated by a projected Media Allocation Key. Loader-provided content hashes
win when available, allowing different authored sources with the same bytes to share one package
part. Without a hash, the key falls back to resolver scope plus Authored Media Source. The package
path is then a deterministic first-use assembly name, and slide relationships point at the shared
media part.

## Public Surface Consequences

- `AssetLoader`, `AssetSource`, probe result, and load result types may be part of the Authoring
  Interface because authors configure them through `deck.useAssets(loader)`.
- Runtime-specific loaders for filesystem paths, framework-public URLs, authenticated URLs, and app
  media stores should be optional adapters or recipes outside the multi-runtime core.
- Adapter/render context types should avoid exposing internal Asset Artifact storage shapes as
  stable public contract unless a future adapter-authoring use case proves that shape is necessary.

## Performance Consequences

- Project should not load every media byte just to compute the Pptx Package Model.
- Render may reuse loaded bytes through Asset Artifacts, and package-part Build Artifacts may use
  media byte fingerprints where bytes affect emitted parts.
- Asset Artifacts give sandbox and future HMR workflows a shared cache for metadata and bytes without
  turning the Semantic Author Graph or Pptx Package Model into media caches.

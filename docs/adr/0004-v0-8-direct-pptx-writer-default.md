# v0.8 direct PPTX writer replaces pptxgenjs

## Status

Accepted

## Context

The previous core writer path depended on `pptxgenjs`. That made early PPTX output practical, but it
also made deckjsx depend on a whole-presentation generation library at the point where v0.8.0 needs
direct ownership of OOXML package structure, package-part identity, deterministic output, media
handling, and future HMR-oriented rebuilds.

The Pptx Package Model should be shaped by deckjsx projection semantics and PPTX/OOXML package
structure, not by the convenience shape expected by a specific writer library.

## Decision

In v0.8.0, `deck.render({ output })` uses deckjsx's direct PPTX writer by default. The default path
is internally equivalent to selecting the `pptx()` writer adapter from `deckjsx/adapter`.

`pptxgenjs` is removed as a runtime dependency instead of remaining as a core compatibility writer.
The public `pptxgenjs()` adapter export is also removed from the core package. Any future
compatibility adapter should live outside the core library.

The direct writer owns PPTX package assembly, XML emission, media part emission, deterministic ZIP
entry ordering, compression policy, and runtime output side effects. It may use small low-level
infrastructure dependencies, such as `fflate` for ZIP writing, when those dependencies work across
Node, web, and edge-like runtimes and do not become public writer policy.

## Public Surface Consequences

- `deckjsx` remains the Authoring Interface and should not export Pptx Package Model internals or
  writer implementation details.
- `deckjsx/adapter` exposes `pptx()` and writer-adapter option/result types. It should not expose
  XML emitters, ZIP adapters, fflate settings, sink implementations, Build Artifact managers, or
  Assembly Plan builders.
- `deckjsx/inspect` is the place for detailed Pptx Package Model and projection inspection types.
- Root stage-result types may expose byte-free summaries that are directly needed to read
  `ProjectResult` or `RenderResult`, such as render assembly/build explanation summaries. These are
  public result DTOs, not public writer internals. They may report stable ids, package paths,
  statuses, reasons, fingerprints, dependency fingerprint summaries, media-byte fingerprint source,
  and diagnostic codes, but not package-part bytes, media bytes, Asset Artifact storage, XML chunks,
  sink handles, fflate configuration, or emitter state.
- Pinned `pptxgenjs` usage is allowed in isolated CI/test helper code as a regression oracle, but
  not as a published runtime dependency or product surface.
- `WriterRenderContext` may remain public only as an opaque adapter context. Internal Asset
  Artifacts, package-part Build Artifacts, Assembly Plan construction, and sink topology are not part
  of the adapter-authoring contract unless a future external-writer use case proves they need a
  stable surface.
- `PptxPackageModel` is the inspection data model for PPTX projection. It should not become a public
  OOXML builder, an XML emission model, or a mutation-helper API in v0.8.0.
- Pptx Package Part payload types are part of the inspection vocabulary. They may be shaped by PPTX
  package structure, but they should remain projected structured data rather than raw XML, writer
  command options, or media byte storage.
- Public-surface regression coverage should protect this boundary by checking the published export
  map, root dependencies, and core source tree. `pptxgenjs` may appear in isolated CI/oracle fixtures,
  but not in the root runtime dependency graph or built-in adapter surface.
- Export-map regression coverage should check targets as well as subpath names. The published
  package must not expose wildcard subpaths, generated writer chunks, projection helper modules,
  runtime output modules, ZIP/sink modules, XML emitters, or package-build storage through accidental
  deep import paths.
- Generated declaration files are also public API. The direct writer may use private writer
  modules, fflate integration, chunk writers, Assembly Plans, Build Artifacts, Asset Artifacts, and
  sink topology internally, but those names and module paths should not leak through the public
  `deckjsx`, `deckjsx/adapter`, or `deckjsx/inspect` declarations. Public render options should stay
  semantic, for example a named compression mode rather than a concrete fflate configuration object.

## Performance Consequences

- XML emission should move toward PPTX-domain emitters over a byte/chunk writer rather than a DOM,
  XML IR, or whole-package string builder.
- ZIP writing should consume ordered assembly entries internally. Streaming-first ZIP is an
  implementation strategy, not a separate public output mode.
- The direct writer should feed ordered entries into the ZIP module rather than building an
  unordered whole-package entry map as writer state. Collecting chunks into final `Uint8Array` bytes
  is a sink behavior for the public Render Result.
- Build Artifact reuse should be keyed by Package Part Identity, package part fingerprints,
  writer/emitter fingerprints, and media byte fingerprints where needed.
- Public build/reuse explanations should be derived from those reuse decisions and stay byte-free.
  They should show enough current and previous fingerprint detail for sandbox/HMR invalidation
  debugging without making Pptx Package Build Artifact storage a public API.
- Node filesystem output should remain a runtime side effect behind an isolated runtime boundary so
  core projection and writer code stay multi-runtime safe.
- Compression policy belongs to package assembly, not to package-part byte generation. Changing
  compression can require ZIP reassembly without invalidating otherwise reusable part bytes.
- Per-entry Assembly Plan compression decisions should be honored by the ZIP module, for example
  storing media entries while compressing XML entries with the selected semantic compression mode.
- Expensive sandbox/HMR explanation views should be derived from Project and Render artifacts rather
  than eagerly embedded in the hot-path model. Default render paths should pay for diagnostics and
  required summaries, not every possible derived inspection view.
- ZIP sinks are internal writer implementation details. The public result remains a collected
  `Uint8Array` artifact, and path output remains a runtime side effect; neither streaming ZIP nor sink
  selection becomes a public output mode in v0.8.0.
- If a path output side effect fails after artifact bytes were produced, Render preserves the artifact,
  omits written output metadata, and reports `E_RENDER_OUTPUT_WRITE_FAILED`.
- If path output is requested in a runtime where the Node output boundary is unavailable, Render uses
  the same diagnostic family with `reason=runtimeOutputUnavailable`, preserves artifact bytes, and
  leaves `output` unset.
- Performance validation should cover cold generation and warm reuse separately: projection, asset
  probing/loading, XML emission, media copying, build artifact reuse, ZIP assembly, collecting sinks,
  path side effects, and derived inspection view generation have different bottlenecks.

## Review Gates

Public API review is a release gate for this decision. New exports must be classified as Authoring
Interface, Adapter Interface, or Inspection Interface before they are published. The direct writer
must not normalize writer internals, Assembly Plan construction, XML helpers, ZIP sinks, fflate
settings, or Build Artifact storage as ordinary user-facing concepts.
The stage result contract should also stay narrow: `ok` is derived from diagnostics, artifacts
describe byte availability, and output metadata describes side effects. Adding parallel public
success flags or output-state shortcuts would make the result surface harder to reason about and
needs a separate decision.

Performance review is also a release gate. The direct writer is not acceptable if it requires a
second XML model below PptxPackageModel, whole-package string assembly as the primary emission
strategy, media byte ownership inside PptxPackageModel, eager computation of every sandbox/debug
view, or a public streaming ZIP mode to be fast enough.
Warm-path performance review must check that unchanged package parts can reuse Build Artifacts by
package-part, dependency, writer/emitter, and media byte fingerprints rather than forcing a full
projection and part rebuild for every Render.

Projection fidelity review is part of the same gate. CSS-like values that v0.8.0 can observe but
cannot yet reproduce exactly, such as subtree opacity compositing or clipping combined with
transforms, should remain visible as projected metadata, Project warnings, or Project Inspection
Summary records. They should not become authoring errors, and they should block Render only when the
projected package would be structurally invalid or a concrete committed field cannot be serialized.
Unsupported-semantic fallback data is part of this projected metadata contract. A fallback record
should name the strategy, preserved values, and missing behavior in structured fields, and package
consistency validation should reject malformed fallback payloads before XML emission.

Required validation for this decision includes public-surface guards, deterministic direct-writer
byte tests, strict hot-path benchmarks, and generation regression checks. The pinned `pptxgenjs`
oracle may help validate migration behavior only from isolated CI/test tooling; it cannot become a
runtime dependency or public adapter again inside the core package.
The public-surface guards should cover the root dependency graph, exact package export-map targets,
absence of `pptxgenjs` from core source imports, and public declaration leak checks for internal
writer, ZIP, XML, sink, Build Artifact, and Asset Artifact vocabulary.
Those guards should treat generated declaration files and package export targets as part of the
published API, not merely as build artifacts. A public option may describe semantic behavior, such as
a named compression mode, but it should not reveal low-level ZIP library settings, chunk writers, sink
topology, XML emitters, or artifact storage.
Those generation checks should preserve text-body and paragraph layout semantics as graph-derived
PPTX meaning: direction, baseline, underline, bullets/numbering, tab stops, line and paragraph
spacing, character spacing, fit, vertical text-body alignment, body insets, and CSS paragraph
alignment values should be verified as semantic XML/package signals rather than treated as
incidental writer output.

Template-derived slide layout topology is part of direct-writer validation. A deck using Slide
Templates should produce the projected slide layout parts, content type overrides, slide master
layout relationships, slide-to-layout relationships, and slide-layout-to-master relationship parts
directly from the Pptx Package Model, without the writer inventing template/package policy.

Performance validation should also prove that faster generation does not come from moving bytes into
the wrong layer. Benchmarks and regression reports should keep cold Project, `inspection: "none"`
Project, asset probe/load, cold writer, ZIP assembly, path-output side effects, and warm writer reuse
separable enough to explain where time changed. Required package validation, unsupported-semantic
warnings, and fallback metadata remain part of the observed contract even when optimizing the writer
hot path.

## Trade-off

This accepts short-term migration risk and a larger v0.8.0 implementation in exchange for direct
control of PPTX package structure, runtime portability, smaller core dependencies, writer speed, and
future HMR-oriented part rebuilds.

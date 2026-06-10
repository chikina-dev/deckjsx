# Release Process

This package is designed to publish from GitHub Actions using npm Trusted Publishing.

## One-time npm setup

In the npm package settings for `deckjsx`, add a trusted publisher:

- Provider: GitHub Actions
- Organization or user: `chikina-dev`
- Repository: `deckjsx`
- Workflow filename: `release.yml`

Trusted Publishing uses GitHub Actions OIDC, so no `NPM_TOKEN` secret is needed.

## Manual release

1. Update `package.json` to the target version.
2. Run the local release checks:
   - `vp check`
   - `bun run build`
   - `npm ci --prefix sample`
   - `npm run --prefix sample smoke`
   - `vp test`
   - `bun run benchmark:pptx -- --iterations 1 --strict`
   - `bun run verify:render -- --skip-raster`
   - `bun run verify:render -- --skip-raster --baseline <previous-render-manifest.json>` when a
     release-candidate manifest exists
   - `npm run --prefix .github/compat/pptxgenjs compare`
   - `vp pack`
3. Push the change to `main`.
4. Run the `Release` workflow from GitHub Actions with a matching tag such as `v0.1.1`.

The workflow validates the package version, runs checks and tests, creates the GitHub release, and
publishes the package to npm.
`bun run build` intentionally runs before `vp test` in release gates because the public-surface tests
inspect generated declaration files in `dist`.
The sample dependency install intentionally runs after `bun run build` because `sample` depends on
the local package via `file:..`, exercising the built direct-writer package instead of an older npm
release.
For v0.8.0 and later, the release workflow also runs the strict direct PPTX writer benchmark,
render fixture verification, and the isolated pinned `pptxgenjs` generation-regression oracle before
packing or publishing.

For v0.8.0 and later, the published package should use deckjsx's direct PPTX writer by default and
must not publish `pptxgenjs` as a runtime dependency. The isolated `.github/compat/pptxgenjs/`
package is allowed only as generation-regression tooling.
The public sample package and its lockfile should also stay free of `pptxgenjs`; they should smoke
test `deck.render({ output })` through the local direct-writer package.

Before a v0.8.0 or later release, also confirm that public documentation describes the direct writer,
`deck.useAssets(loader)`, and the `deckjsx` / `deckjsx/adapter` / `deckjsx/inspect` surface split.
Writer internals, streaming ZIP controls, fflate settings, XML emitters, Assembly Plan builders, and
Build Artifact storage should not appear as public usage guidance.
The package export map should be reviewed as a concrete allowlist, not only as a list of names:
`deckjsx`, `deckjsx/adapter`, `deckjsx/inspect`, the JSX runtimes, and `package.json` should point at
their intended built entry files. Wildcard subpaths, deep internal writer paths, generated chunk
targets, projection helper paths, runtime output paths, ZIP/sink paths, and direct XML emitter paths
are release blockers.

Public API review for v0.8.0 should classify every exported name before release:

- Authoring Interface: `deckjsx` exports used to declare decks, themes, styles, assets, diagnostics,
  and stage commands.
- Adapter Interface: `deckjsx/adapter` exports for selecting `pptx()` and authoring external writer
  adapters without exposing direct-writer storage.
- Inspection Interface: `deckjsx/inspect` exports for reading Semantic Author Graph and
  PptxPackageModel snapshots, including projected package/drawing/media/theme/layout metadata.

Root stage-result summary types are allowed only when they are needed to type fields already present
on `ProjectResult` or `RenderResult`. They should be byte-free explanation DTOs, not public aliases
for internal writer/cache structures. A release review should reject summary types that expose
package-part bytes, media bytes, Asset Artifact storage, XML chunks, sink handles, fflate settings,
or emitter state.
Keep a short export classification note with the release review whenever exports changed. The note
should list each changed public name or subpath, its surface classification, and the reason it does
not expose writer storage, XML emission, ZIP/sink configuration, or Asset Artifact internals.
For the v0.8.0 direct writer migration, keep that note in
`docs/reviews/v0.8-public-surface.md`.
Do not export public constructors only to satisfy branded identity or template-ref types. Those
values are library-owned and should flow from Deck, graph, projection, compile, or inspect results;
public type tests should prove callers can read or narrow those values without `as` casts, not that
callers can manufacture internal ids. When broad model containers intentionally preserve invalid
shapes for diagnostics, expose type guards for narrowed valid part shapes instead of forcing callers
to cast package-part payloads.
Generated declaration files are part of this review. Reject a release if the public `.d.ts` output
for `deckjsx`, `deckjsx/adapter`, or `deckjsx/inspect` imports or names internal writer chunks,
Assembly Plan storage, Build Artifacts, Asset Artifacts, XML emitters, ZIP sinks, compression
settings, fflate settings, or runtime output handles. Public adapter options must not expose ZIP
compression mode or concrete ZIP-library configuration in v0.8.1.
The generated public declarations should also stay free of catch-all `unknown` payloads such as
`Record<string, unknown>` or `readonly unknown[]`. Broad inspection containers that preserve
malformed `defineProjection()` snapshots should expose structured candidate fields plus typed
package-part guards, while valid writer/project paths should narrow to exact payload-bearing part
types before serialization.

Do not publish a new entry point or type as a convenience export if it actually exposes direct writer
implementation state. XML emission helpers, Assembly Plan construction, ZIP sinks, fflate settings,
media byte artifacts, and Pptx Package Build Artifacts remain internal unless a later external-writer
use case creates a separate design decision.
Also avoid adding parallel public success flags or output-state shortcuts around the stage result
shape. Release-facing APIs should continue to use the existing result-first contract: `ok` is derived
from diagnostics, artifacts describe byte availability, and output metadata describes side effects.

Performance review for v0.8.0 should confirm that PptxPackageModel remains the Project-owned
projected document model rather than a byte store or XML-builder layer. Media bytes should stay in
Asset Artifacts, ZIP assembly should stay an internal ordered streaming implementation detail, and
the public Render result should remain a collected artifact plus optional runtime output side
effects. Cold and warm benchmark results should be reviewed separately so direct generation speed
and package-part artifact reuse are both protected.
Treat it as a release blocker if the default path adds a second XML-shaped model below
PptxPackageModel, eagerly computes every sandbox explanation view, rebuilds every package part on a
warm render with unchanged fingerprints, or makes streaming ZIP/sink selection part of the public
surface.
Benchmark review should preserve enough phase detail to explain regressions: fixture name, iteration
count, cold Project timing, `inspection: "none"` Project timing when measured, cold writer timing,
ZIP assembly timing when measured, warm writer timing, reused/rebuilt/missing/failed Assembly Plan
entry counts, asset probe/load counts, and path-output timing when exercised. A benchmark improvement
does not pass review if it comes from skipping required package validation, hiding unsupported
semantic records, disabling default diagnostics, or moving expensive work into an unmeasured public
API call.
When reviewing benchmark JSON or table output, inspect the warm Assembly Plan status counts as
release evidence rather than incidental debug data. Unchanged fixtures should explain their warm
path through reused and rebuilt entries; unexpected `missing` or `failed` entries are release
blockers unless the fixture intentionally covers that failure mode and the corresponding diagnostics
are asserted. The strict benchmark also fails when warm package assembly has missing/failed entries,
when no package entries are reused, when Project calls `load()` during metadata projection, when a
cached warm Project repeats probe/load work, or when path-output render does not report `written`.

Also confirm that unsupported CSS-like behavior is documented as an inspection/diagnostic contract:
observable values should project into structured unsupported-semantic records with fallback strategy
metadata when a valid PPTX fallback exists, and malformed projected fallback payloads should fail
package consistency validation before Render writes bytes.

For v0.8.0 and later, release checks should include a template/layout generation fixture. The fixture
should prove that Slide Templates project into Pptx Package Model layout anchors and generated PPTX
slide layout topology: content type overrides for all layouts, slide master relationships to those
layouts, slide relationships to the selected template-derived layout, and slide layout relationship
parts pointing back to the slide master. `bun run verify:render -- --skip-raster` exercises this
direct fixture without requiring LibreOffice or ImageMagick; the render-verification workflow runs
the same script with renderer tools available in its container.

Release checks should also keep paragraph/text-body semantics visible as projected authoring meaning,
not only writer implementation detail. The direct writer and pinned regression oracle should cover
RTL and vertical text direction, baseline variants, underline details, bullets/numbering, tab stops,
line spacing, paragraph spacing before/after, character spacing, text fit, vertical text-body
alignment, text-body inset/padding, and CSS `textAlign` values mapped to valid PPTX paragraph
alignment values.

When a previous release-candidate render manifest is available, run `verify:render` with
`--baseline <manifest>` as an additional release gate. The baseline comparison checks fixture names,
semantic package assertion names, raster expectation categories, raster tolerance contracts, raster
artifact presence, and PNG byte-length tolerance when PNGs exist. When both manifests point to
available PNGs, it also uses ImageMagick `compare -metric AE` with category-specific
different-pixel budgets and records diff PNGs in the current manifest.

## Publishing from an existing GitHub release

Publishing a GitHub release also runs the same workflow. The release tag must match the package
version in `package.json`.

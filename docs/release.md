# Release Process

The root package and integration packages are designed to publish from GitHub Actions using npm
Trusted Publishing:

- `deckjsx`
- `@deckjsx/node`

## One-time npm setup

In the npm package settings for `deckjsx` and `@deckjsx/node`, add a trusted publisher:

- Provider: GitHub Actions
- Organization or user: `chikina-dev`
- Repository: `deckjsx`
- Workflow filename: `release.yml`

Trusted Publishing uses GitHub Actions OIDC, so no `NPM_TOKEN` secret is needed.

## Manual release

1. Update the package manifest for the package being released:
   - `package.json` for `deckjsx`
   - `plugins/node/package.json` for `@deckjsx/node`
2. Run the local release checks:
   - `vp check`
   - `bun run build`
   - for `@deckjsx/node`: `(cd plugins/node && bun install && ../../node_modules/.bin/vp check && ../../node_modules/.bin/vp pack && ../../node_modules/.bin/vp test)`
   - `vp test`
   - `bun run benchmark:interactive -- --iterations 1`
   - `bun run benchmark:pptx -- --iterations 1 --strict`
   - `bun run verify:render -- --skip-raster`
   - `bun run verify:render -- --skip-raster --baseline <previous-render-manifest.json>` when a
     release-candidate manifest exists
   - `npm run --prefix .github/compat/pptxgenjs compare`
   - `vp pack`
   - for `@deckjsx/node`: `(cd plugins/node && npm pack)`
   - the temporary fresh-install smoke in [Pre-publish temporary install smoke](#pre-publish-temporary-install-smoke)
3. Push the change to `main`.
4. Run the `Release` workflow from GitHub Actions with the package selector and matching package version:
   - `deckjsx`: `v0.9.3`
   - `@deckjsx/node`: `v0.1.3`

The workflow validates that the selected package version matches the requested version, derives the
GitHub release tag for the selected package, checks and packs
the root package plus the Node integration package, runs the root smoke/render/oracle gates, creates the
GitHub release, and publishes only the selected npm package.
`bun run build` intentionally runs before `vp test` in release gates because the public-surface tests
inspect generated declaration files in `dist`.
For v0.8.0 and later, the release workflow also runs the strict direct PPTX writer benchmark,
render fixture verification, and the isolated pinned `pptxgenjs` generation-regression oracle before
publishing any selected package.

For v0.9.0 and later, the Node integration package releases separately from the root
package. The Node package should publish only built `dist` artifacts, declare `deckjsx` as a peer
dependency, and must not publish a `file:../..` dependency.

For v0.9.0 and later, the published root package should use deckjsx's direct PPTX writer through the
normal `deck.render(pptx())` path and must not publish `pptxgenjs` as a runtime dependency. The
isolated `.github/compat/pptxgenjs/` package is allowed only as generation-regression tooling.
The public sample package and its lockfile should also stay free of `pptxgenjs`. It is a minimal
Node dev project for checking the published `deckjsx` and `@deckjsx/node` packages together.

## Pre-publish temporary install smoke

Before publishing either `deckjsx` or `@deckjsx/node`, test the exact packed artifacts in a
throwaway project. This catches issues that local workspace tests can hide, such as broken package
metadata, missing built files, CLI bin entrypoint problems, resident `deckjsx dev` behavior, and
tarball-only peer dependency mistakes. For v0.9.3 and later, include `deckjsx dev --interactive`
commands such as `status`, `projection`, and `exit` in this smoke. Do not use
`npm install deckjsx @deckjsx/node` for this gate:
that verifies the registry after publishing, which is too late. Use `npm pack` output from the
release candidate.

Create a temporary project and install the packed packages:

```bash
vp run build
(cd plugins/node && ../../node_modules/.bin/vp pack)
SMOKE_DIR="$(mktemp -d /private/tmp/deckjsx-release-smoke.XXXXXX)"
npm pack --pack-destination "$SMOKE_DIR"
(cd plugins/node && npm pack --pack-destination "$SMOKE_DIR")
(cd "$SMOKE_DIR" && npm init -y)
(cd "$SMOKE_DIR" && npm install ./deckjsx-*.tgz ./deckjsx-node-*.tgz typescript@latest)
```

Create the TSX config in the temporary project:

```bash
cat > "$SMOKE_DIR/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "deckjsx",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["*.tsx"]
}
JSON
```

Create `deep-cli-smoke.mjs` in the temporary project:

```bash
cat > "$SMOKE_DIR/deep-cli-smoke.mjs" <<'JS'
import { spawn, spawnSync } from "node:child_process";
import { access, stat, unlink, writeFile } from "node:fs/promises";
import { inspectPatchablePptx } from "@deckjsx/node";

const runId = Date.now();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function unlinkIfExists(path) {
  await unlink(path).catch(() => undefined);
}

function validSource({ label, outputPath, secondOutputPath, secondLabel }) {
  const secondWrite = secondOutputPath
    ? `
const componentDeck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });
componentDeck.slide({ name: "Component" }, () => (
  <p style={{ x: 1, y: 1, width: 7, height: 0.8, fontSize: 24 }}>${secondLabel}</p>
));
await write(await componentDeck.render(pptx()), "${secondOutputPath}");
`
    : "";
  return `/** @jsxImportSource deckjsx */
import { write } from "@deckjsx/node";
import { Deck } from "deckjsx";
import { pptx } from "deckjsx/adapter";

const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

deck.slide({ name: "Deep TSX smoke" }, () => (
  <p style={{ x: 1, y: 1, width: 7, height: 0.8, fontSize: 28 }}>
    ${label}
  </p>
));

await write(await deck.render(pptx()), "${outputPath}");
${secondWrite}`;
}

function invalidSource(outputPath) {
  return `/** @jsxImportSource deckjsx */
import { write } from "@deckjsx/node";
import { Deck } from "deckjsx";
import { pptx } from "deckjsx/adapter";

const deck = new Deck({ layout: { width: 10, height: 5.625, unit: "in" } });

deck.slide({ name: "Broken" }, () => (
  <p style={{ x: 1, y: }}>
    BROKEN_TSX_${runId}
  </p>
));

await write(await deck.render(pptx()), "${outputPath}");
`;
}

function slideXml(outputPath) {
  const result = spawnSync("unzip", ["-p", outputPath, "ppt/slides/slide1.xml"], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout : "";
}

async function waitFor(label, read, timeoutMs = 20_000) {
  const startedAt = Date.now();
  let lastValue = "";
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await read();
    if (lastValue.includes(label)) {
      return lastValue;
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}; last value:\n${lastValue}`);
}

function startDev(args) {
  const child = spawn(process.execPath, ["./node_modules/.bin/deckjsx", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => {
    logs.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs.stderr += chunk;
  });
  return { child, logs };
}

async function stopDev(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGINT");
  await new Promise((resolve) => child.on("exit", resolve));
}

async function assertPatchable(outputPath) {
  const inspection = await inspectPatchablePptx(outputPath);
  if (!inspection.ok || !inspection.patchable || inspection.diagnostics.length > 0) {
    throw new Error(`${outputPath} is not cleanly patchable: ${JSON.stringify(inspection)}`);
  }
  return inspection;
}

async function scenarioLiveUpdateErrorRecovery() {
  const entry = "main.tsx";
  const output = "live-output.pptx";
  const first = `LIVE_FIRST_${runId}`;
  const second = `LIVE_SECOND_${runId}`;
  const recovered = `LIVE_RECOVERED_${runId}`;
  await unlinkIfExists(output);
  await writeFile(entry, validSource({ label: first, outputPath: output }));

  const { child, logs } = startDev(["dev", entry, "--out", output]);
  try {
    await waitFor(first, () => slideXml(output));
    const firstStat = await stat(output);
    await assertPatchable(output);

    await writeFile(entry, validSource({ label: second, outputPath: output }));
    const secondXml = await waitFor(second, () => slideXml(output));
    const secondStat = await stat(output);
    if (secondXml.includes(first)) {
      throw new Error("live update left the first label in slide XML");
    }
    if (secondStat.mtimeMs <= firstStat.mtimeMs) {
      throw new Error("live update did not advance output mtime");
    }
    await assertPatchable(output);

    await writeFile(entry, invalidSource(output));
    await waitFor("error[deckjsx.node.dev.bundleFailed]", () => logs.stderr);
    await waitFor(`${entry}:9:24`, () => logs.stderr);
    const errorXml = slideXml(output);
    if (!errorXml.includes(second) || errorXml.includes(`BROKEN_TSX_${runId}`)) {
      throw new Error("failed build should leave previous PPTX content intact");
    }

    await writeFile(entry, validSource({ label: recovered, outputPath: output }));
    await waitFor(recovered, () => slideXml(output));
    await assertPatchable(output);
    return logs.stderr.trim().split("\n").filter(Boolean).slice(-8);
  } finally {
    await stopDev(child);
  }
}

async function scenarioShortDiagnostics() {
  const entry = "short-broken.tsx";
  const output = "short-output.pptx";
  await unlinkIfExists(output);
  await writeFile(entry, invalidSource(output));
  const { child, logs } = startDev(["dev", entry, "--out", output, "--short"]);
  try {
    await waitFor("[\"deckjsx.node.dev.bundleFailed\"]", () => logs.stderr);
    let exists = true;
    await access(output).catch(() => {
      exists = false;
    });
    if (exists) {
      throw new Error("invalid initial build unexpectedly created short-output.pptx");
    }
    const stderr = logs.stderr.trim().split("\n").filter(Boolean);
    if (stderr.length !== 1) {
      throw new Error(`short diagnostics should emit only diagnostic codes: ${JSON.stringify(stderr)}`);
    }
    return stderr;
  } finally {
    await stopDev(child);
  }
}

async function scenarioMultipleOutputs() {
  const entry = "multi.tsx";
  const primary = "primary-output.pptx";
  const secondary = "components-output.pptx";
  const firstPrimary = `PRIMARY_FIRST_${runId}`;
  const firstSecondary = `COMPONENT_FIRST_${runId}`;
  const secondPrimary = `PRIMARY_SECOND_${runId}`;
  const secondSecondary = `COMPONENT_SECOND_${runId}`;
  await unlinkIfExists(primary);
  await unlinkIfExists(secondary);
  await writeFile(
    entry,
    validSource({
      label: firstPrimary,
      outputPath: primary,
      secondOutputPath: secondary,
      secondLabel: firstSecondary,
    }),
  );

  const { child, logs } = startDev(["dev", entry, "--out", primary, secondary]);
  try {
    await waitFor(firstPrimary, () => slideXml(primary));
    await waitFor(firstSecondary, () => slideXml(secondary));
    const firstPrimaryStat = await stat(primary);
    const firstSecondaryStat = await stat(secondary);
    await assertPatchable(primary);
    await assertPatchable(secondary);

    await writeFile(
      entry,
      validSource({
        label: secondPrimary,
        outputPath: primary,
        secondOutputPath: secondary,
        secondLabel: secondSecondary,
      }),
    );
    await waitFor(secondPrimary, () => slideXml(primary));
    await waitFor(secondSecondary, () => slideXml(secondary));
    const secondPrimaryStat = await stat(primary);
    const secondSecondaryStat = await stat(secondary);
    await assertPatchable(primary);
    await assertPatchable(secondary);

    if (secondPrimaryStat.mtimeMs <= firstPrimaryStat.mtimeMs) {
      throw new Error("primary output mtime did not advance");
    }
    if (secondSecondaryStat.mtimeMs <= firstSecondaryStat.mtimeMs) {
      throw new Error("secondary output mtime did not advance");
    }
    if (logs.stderr.trim()) {
      throw new Error(`multiple-output smoke emitted unexpected stderr: ${logs.stderr}`);
    }
    return { primaryUpdated: true, secondaryUpdated: true };
  } finally {
    await stopDev(child);
  }
}

const results = {
  packageVersions: {
    deckjsx: (await import("deckjsx/package.json", { with: { type: "json" } })).default.version,
    node: (await import("@deckjsx/node/package.json", { with: { type: "json" } })).default.version,
  },
  liveUpdateErrorRecovery: await scenarioLiveUpdateErrorRecovery(),
  shortDiagnostics: await scenarioShortDiagnostics(),
  multipleOutputs: await scenarioMultipleOutputs(),
};

console.log(JSON.stringify(results, null, 2));
JS
```

Run the smoke:

```bash
(cd "$SMOKE_DIR" && node deep-cli-smoke.mjs)
```

Then verify the generated PPTX files as ZIPs and, when LibreOffice is available, as readable
presentations:

```bash
(cd "$SMOKE_DIR" && unzip -t live-output.pptx)
(cd "$SMOKE_DIR" && unzip -t primary-output.pptx)
(cd "$SMOKE_DIR" && unzip -t components-output.pptx)
(cd "$SMOKE_DIR" && soffice --headless --convert-to pdf --outdir "$SMOKE_DIR" live-output.pptx primary-output.pptx components-output.pptx)
```

This smoke must prove all of the following before publishing:

- The installed package versions are the intended release candidates, not the registry's current
  `latest` versions.
- `deckjsx dev main.tsx --out live-output.pptx` starts from a TSX entry and creates a PPTX.
- Editing only the TSX source updates the existing PPTX in the same resident CLI process.
- The updated PPTX remains patchable according to `inspectPatchablePptx()`.
- A broken TSX edit emits detailed diagnostics with file, line, column, source line, caret, phase,
  compilation number, and help.
- A failed build does not corrupt or replace the previous good PPTX.
- Fixing the TSX source after a failed build updates the PPTX without restarting the CLI.
- `--short`/`-s` emits only the diagnostic code summary.
- `deckjsx dev <entry> --out primary-output.pptx components-output.pptx` creates and updates all
  declared output files while retaining the primary output as the tracked artifact.
- The generated PPTX files pass `unzip -t`; PDF conversion is a strong additional compatibility
  check when `soffice` is installed.

Any failure in this temporary install smoke is a release blocker. Fix the package, repack, reinstall
the tarballs into a fresh temporary directory, and rerun the smoke before publishing.

Before a v0.9.0 or later release, also confirm that public documentation describes the direct
writer, `@deckjsx/node` filesystem writes and dev CLI, and the `deckjsx` /
`deckjsx/adapter` / `deckjsx/inspect` / `deckjsx/integration` surface split. Writer internals,
streaming ZIP controls, fflate settings, XML emitters, Assembly Plan builders, and Build Artifact
storage should not appear as public usage guidance.
The package export maps should be reviewed as concrete allowlists, not only as lists of names:
`deckjsx`, `deckjsx/adapter`, `deckjsx/inspect`, `deckjsx/integration`, the JSX runtimes, and
`package.json` should point at their intended built entry files with matching `types` conditions.
`@deckjsx/node` should expose only its root entry, `./dev` compiler entry, CLI bin, and
`package.json`, also with matching `types` conditions. Wildcard subpaths, deep internal writer
paths, generated chunk targets, projection helper paths, runtime output paths, ZIP/sink paths, and
direct XML emitter paths are release blockers.

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

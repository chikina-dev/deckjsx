# deckjsx

`deckjsx` is a TypeScript library for generating presentation files from JSX through a compiler
pipeline.

The intended architecture is:

```text
JSX
  -> Author Tree
  -> Semantic Author Graph
  -> Output Projection
  -> Output Writer
```

This project is being designed as a compiler, not as a thin `PptxGenJS` wrapper.
The API uses a class-based compiler with callback-based `.slide()`, synchronous `.compile()`, async
`.project()`, and async `.render()`. Authoring uses typed JSX elements with CSS-like style and class
semantics.

The implementation preserves the compiler model with explicit module boundaries for authoring,
semantic graph construction, style resolution, output projection, writer adapters, and runtime
output.

## Install

```bash
npm install deckjsx
```

The package currently targets PPTX output through deckjsx's direct PPTX writer.

## Usage

```tsx
import { Deck } from "deckjsx";

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  meta: { title: "Quarterly Review", author: "deckjsx" },
});

deck.slide(
  { name: "Quarterly Review", style: { backgroundColor: "#F8FAFC" } },
  ({ composition }) => (
    <main
      style={{
        x: 0.7,
        y: 0.5,
        width: 11.9,
        height: 6.3,
        display: "grid",
        gridTemplateRows: ["0.9in", "1fr", "0.4in"],
        rowGap: 0.25,
      }}
    >
      <header>
        <h1 style={{ width: "100%", height: 0.6, fontSize: 28, fontWeight: 700, color: "#0F172A" }}>
          Quarterly Review
        </h1>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 0.35 }}>
        <p style={{ fontSize: 18, color: "#334155", fit: "shrink" }}>
          Author slides with typed JSX, inspect the projected document model, and render PPTX files.
        </p>
        <figure style={{ backgroundColor: "#E0F2FE", borderRadius: 0.15, padding: 0.25 }}>
          <img src="chart.png" style={{ width: "100%", height: "100%", fit: "contain" }} />
        </figure>
      </section>

      <footer>
        <p
          style={{
            width: "100%",
            height: 0.3,
            fontSize: 11,
            color: "#64748B",
            textAlign: "right",
          }}
        >
          {composition.slideIndex + 1} / {composition.totalSlides}
        </p>
      </footer>
    </main>
  ),
);

const project = await deck.project();
await deck.render({ output: "quarterly-review.pptx" });
```

Use `deck.compile()` for authoring semantics, `await deck.project()` for output-facing inspection,
and `await deck.render({ output })` when writing a PowerPoint file.

When a hot path only needs the projected model or rendered artifact, inspection summaries can be
skipped with `await deck.project({ inspection: "none" })` or
`await deck.render({ inspection: "none" })`.

The default render path uses deckjsx's built-in direct PPTX writer. If an explicit writer adapter is
needed, import `pptx()` from `deckjsx/adapter`; writer internals such as XML emitters, ZIP settings,
and sinks are intentionally not part of the public API.

```tsx
import { pptx } from "deckjsx/adapter";

await deck.render(pptx({ output: "quarterly-review.pptx" }));
```

## JSX elements

`deckjsx` exposes a typed HTML-like JSX authoring surface.

View-like lowercase elements compile to grouped layout containers:

```tsx
<main>
  <header />
  <section />
  <article />
  <aside />
  <nav />
  <footer />
  <figure />
</main>
```

Text-like lowercase elements compile to text boxes:

```tsx
<h1>Title</h1>
<h2>Section</h2>
<p>Body copy</p>
```

Image lowercase elements compile to images and require either `src` or `data`:

```tsx
<img src="diagram.png" style={{ width: 4, height: 2.5, fit: "contain" }} />
```

The lowercase `shape` element compiles to PPTX shapes:

```tsx
<shape shape="rect" style={{ width: 2, height: 1, fill: "#2563EB" }} />
```

## Slide Templates

Deck templates describe reusable slide structure without asking authors to write PowerPoint
placeholder ids. Define named Template Areas on the Deck, then place authored content through the
typed `template` handle passed to templated slide factories:

```tsx
const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  templates: {
    report: {
      areas: {
        title: { kind: "title", frame: { x: 0.7, y: 0.6, width: 8, height: 0.8 } },
        body: { frame: { x: 0.7, y: 1.6, width: 8, height: 4.8 } },
      },
    },
  },
});

deck.slide({ template: "report" }, ({ template }) => (
  <main>
    <h1 area={template.title}>Quarterly Review</h1>
    <section area={template.body}>Performance highlights</section>
  </main>
));
```

`TemplateArea.kind` is an authoring-level hint such as `"title"`, `"body"`, `"picture"`, or
`"generic"`. Missing kinds default to `"generic"` and are not inferred from area names. Project keeps
Template Area anchors visible in the Pptx Package Model inspection surface, while the writer decides
how to serialize the corresponding PPTX slide layout structure.

## Assets

Image sources are resolved through the asset loading boundary. The core package includes
multi-runtime handling for data/bytes and absolute URL-like sources, while filesystem paths,
framework-public assets, authenticated URLs, and app media stores should be provided with
`deck.useAssets(loader)`.
For built-in data, bytes, and absolute URL-like image sources, Project probes PNG, GIF, JPEG, and
SVG dimensions into media metadata without putting media bytes into the Pptx Package Model.

```tsx
import type { AssetLoader } from "deckjsx";

const publicAssets = {
  name: "public-assets",
  async probe({ source }) {
    if (source.kind !== "path") return undefined;
    return { mediaType: "image/png", extension: "png", width: 1200, height: 800 };
  },
  async load({ source }) {
    if (source.kind !== "path") return undefined;
    const bytes = await loadFromYourRuntime(source.path);
    return { bytes, mediaType: "image/png", extension: "png", width: 1200, height: 800 };
  },
} satisfies AssetLoader;

deck.useAssets(publicAssets);
```

Registered loaders run in registration order before the built-in fallback. Project uses `probe()` for
metadata needed by the Pptx Package Model, and Render uses the same winning resolver scope for
`load()` so media metadata and bytes come from the same runtime assumptions.
If a loader claims an image source but cannot provide dimensions, treat that as an asset data
retrieval failure and report it through Project diagnostics rather than waiting for the writer to
guess.

Primitive string and number children inside view-like elements are normalized to implicit text
nodes. Inline rich text uses `span` inside text-like elements:

```tsx
<p>
  Revenue grew <span style={{ color: "#16A34A", fontWeight: 700 }}>12%</span>.
</p>
```

## View-like Layout Semantics

View-like elements are containing blocks for their children. Child `x`, `y`, `left`, `top`, `right`,
`bottom`, `width`, and `height` values are resolved relative to the parent view-like element, not
the slide, so authors can build panels with local coordinates. Percentage lengths use
the parent frame as their reference.

```tsx
<div style={{ x: 1, y: 1, width: 6, height: 3 }}>
  <p style={{ x: "10%", y: "20%", width: "50%", height: "25%" }}>local percent frame</p>
  <p style={{ left: "55%", top: "10%", right: "10%", bottom: "60%" }}>inset frame</p>
</div>
```

For `display: "flex"` and `display: "grid"`, normal-flow children are laid out inside
the content frame after padding. `gap`, `flexGrow`, percentage widths, `fr` grid tracks,
and simple `gridColumn` / `gridRow` spans resolve to concrete slide coordinates during
rendering. Absolutely positioned children inside flex or grid containers also use the
container content frame, including padding, as their containing block.

Use direct slide children when you want slide-global absolute placement. Use children
inside a view-like element when you want a local, web-like layout region.

`overflow: "hidden"` is projected as clipping metadata rather than treated as an authoring error.
When CSS-like clipping, transform, opacity, or compositing behavior cannot be represented exactly in
PPTX yet, Project reports nonblocking warnings and preserves the observable projected values for
inspection.

Unsupported CSS-like meanings that can still produce a structurally valid PPTX are reported through
Project diagnostics and the inspection surface rather than treated as authoring errors. These records
include the unsupported feature, the projected value, and a fallback strategy describing which values
were preserved and which behavior is still missing. Malformed projected unsupported-semantic payloads
from custom projections fail before Render emits bytes.

## Development

```bash
vp install
vp check
bun run build
npm ci --prefix sample
npm run --prefix sample smoke
vp test
bun run benchmark:pptx -- --iterations 1 --strict
bun run verify:render -- --skip-raster
npm run --prefix .github/compat/pptxgenjs compare
```

For output or public-surface changes, keep the direct PPTX writer as the documented built-in path.
`pptxgenjs` should appear only in isolated regression tooling, not in runtime dependencies or public
adapter examples.

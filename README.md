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

This project is designed as a presentation compiler. The API uses a class-based compiler with
callback-based `.slide()`, synchronous `.compile()`, async `.project()`, and async `.render()`.
Authoring uses typed JSX elements with CSS-like style and class semantics.

The implementation preserves the compiler model with explicit module boundaries for authoring,
semantic graph construction, style resolution, output projection, writer adapters, and runtime
output.

## Install

```bash
npm install deckjsx
```

The package currently targets PPTX output through deckjsx's direct PPTX writer. The public authoring
surface is `deckjsx`; explicit writer selection lives in `deckjsx/adapter`; inspection helpers live
in `deckjsx/inspect`.

## Usage

```tsx
import { Deck, StyleSheet, Theme } from "deckjsx";

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  meta: { title: "Quarterly Review", author: "deckjsx" },
  templates: {
    report: {
      areas: {
        title: { kind: "title", frame: { x: 0.7, y: 0.5, width: 11.9, height: 0.8 } },
        body: { frame: { x: 0.7, y: 1.5, width: 11.9, height: 4.9 } },
        footer: { frame: { x: 0.7, y: 6.9, width: 11.9, height: 0.3 } },
      },
    },
  },
  theme: new Theme({
    defaults: {
      h1: { fontFamily: "Aptos Display", fontSize: 28, fontWeight: 700, color: "#0F172A" },
      p: { fontFamily: "Aptos", fontSize: 18, color: "#334155", fit: "shrink" },
    },
  }),
});

deck.useStyles(
  new StyleSheet({
    classes: {
      review: { backgroundColor: "#F8FAFC" },
      title: { target: "h1.title", style: { width: "100%", height: 0.6 } },
      contentGrid: {
        target: "section.contentGrid",
        style: { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 0.35 },
      },
      lead: { target: "p.lead", style: { lineHeight: 1.2 } },
      chartFrame: { backgroundColor: "#E0F2FE", borderRadius: 0.15, padding: 0.25 },
      chart: { width: "100%", height: "100%", fit: "contain" },
      footerText: {
        target: "p.footerText",
        style: { width: "100%", height: 0.3, fontSize: 11, color: "#64748B", textAlign: "right" },
      },
    },
  }),
);

deck.slide(
  { name: "Quarterly Review", template: "report", className: "review" },
  ({ composition, template }) => (
    <main>
      <h1 area={template.title} className="title">
        Quarterly Review
      </h1>

      <section area={template.body} className="contentGrid" style={{ columnGap: 0.45 }}>
        <p className="lead" style={{ color: "#1E293B" }}>
          Author slides with typed JSX, inspect the projected document model, and render PPTX files.
        </p>
        <figure className="chartFrame">
          <img src="chart.png" className="chart" />
        </figure>
      </section>

      <p area={template.footer} className="footerText">
        {composition.slideIndex + 1} / {composition.totalSlides}
      </p>
    </main>
  ),
);

const projected = await deck.project();
if (!projected.ok) {
  console.warn(projected.diagnostics.items);
}

const rendered = await deck.render({ output: "quarterly-review.pptx" });
if (!rendered.ok) {
  throw new Error("PPTX render failed");
}
```

Use `deck.compile()` for authoring semantics, `await deck.project()` for output-facing inspection,
and `await deck.render({ output })` when writing a PowerPoint file.

When a hot path only needs the projected model or rendered artifact, inspection summaries can be
skipped with `await deck.project({ inspection: "none" })` or
`await deck.render({ inspection: "none" })`.

The default render path uses deckjsx's built-in direct PPTX writer. If an explicit writer adapter is
needed, import `pptx()` from `deckjsx/adapter`. Writer internals such as XML emitters, ZIP assembly,
and output sinks are intentionally not part of the public API.

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
<img src="diagram.png" className="diagram" />
```

The lowercase `shape` element compiles to PPTX shapes:

```tsx
<shape shape="rect" className="accentBlock" />
```

## Layout, Style, And Templates

`deckjsx` keeps layout, style, and templates as separate authoring ideas even when they are written
through JSX and CSS-like objects.

- Layout describes where things are and how children flow: deck slide size, `x`, `y`, `width`,
  `height`, `left`, `top`, `right`, `bottom`, `display`, flex, grid, gaps, padding, and stacking
  order. Project resolves these values into concrete frames and paint order.
- Style describes how resolved boxes are drawn: fills, borders, shadows, opacity, rotation, text
  color, font, alignment, bullets, links, image fitting, and background layers.
- Templates describe reusable slide structure: named areas such as `title`, `body`, `media`, or
  `footer` that authored JSX can target without exposing PowerPoint placeholder ids.

Reusable layout and appearance should usually live in `StyleSheet` classes and `Theme` defaults.
Use the JSX `style` prop for slide-local variations, data-dependent overrides, or one-off values
that should stay close to the authored element. Direct style props exist in the current v0.8 surface,
but they are not the preferred HTML/CSS-like authoring form and are planned to be removed in v0.8.1.

Templates should be used when the same semantic slide regions repeat across slides; layout should be
used for per-slide geometry and flow; visual style should be used for appearance after the geometry
is known.

## Style Cascade

In deckjsx, cascade means the per-element process that turns defaults, theme defaults, stylesheet
classes, and inline authoring styles into one resolved style snapshot for Project. It is CSS-like,
but it is not a full browser CSS engine and does not mean every property automatically inherits from
parent elements.

For each style-capable element, values are resolved in this order:

1. Element defaults, such as default text box behavior.
2. `Theme` defaults for the authored tag, such as `p`, `h1`, `div`, `span`, or `img`.
3. Matching `StyleSheet` class rules registered with `deck.useStyles()`.
4. Authored inline style from the JSX `style` object.

Later layers replace earlier layers property by property. The v0.8 authoring surface still accepts
some direct style props, but new examples should prefer `style={{ ... }}` for inline values because
direct style props are planned for removal in v0.8.1.

```tsx
import { Deck, StyleSheet, Theme } from "deckjsx";

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  theme: new Theme({
    defaults: {
      p: { color: "#334155", fontSize: 18 },
    },
  }),
});

deck.useStyles(
  new StyleSheet({
    classes: {
      muted: { color: "#64748B" },
      title: { target: "p.title", style: { color: "#0F172A", fontSize: 28, fontWeight: 700 } },
    },
  }),
);

deck.slide(() => <p className="muted title">Revenue</p>);
```

In this example, `fontSize`, `fontWeight`, and `color` come from the matching `title` class, and the
theme default supplies any remaining `p` defaults. `className`
token order is preserved for inspection, but it is not the priority rule for conflicting class
styles. Class conflicts are resolved by selector specificity first, then stylesheet registration and
rule order. Supported selectors are intentionally small: class selectors, tag/class compounds, and
descendant selectors such as `.title`, `p.title`, or `.card .caption`.

Style cascade is source-local. A mounted child deck resolves its own theme and stylesheets against
its own slides, which keeps sandboxed and HMR-style composition predictable.

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
  Revenue grew <span className="positiveDelta">12%</span>.
</p>
```

## View-like Layout Semantics

View-like elements are containing blocks for their children. Child `x`, `y`, `left`, `top`, `right`,
`bottom`, `width`, and `height` values are resolved relative to the parent view-like element, not
the slide, so authors can build panels with local coordinates. Percentage lengths use
the parent frame as their reference.

```tsx
<div className="panel">
  <p className="localPercentFrame">local percent frame</p>
  <p className="insetFrame">inset frame</p>
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
vp build
vp test
bun run benchmark:pptx -- --iterations 1 --strict
bun run verify:render -- --skip-raster
```

For output or public-surface changes, keep the direct PPTX writer as the documented built-in path.
Use render verification and XML/package inspection to catch regressions in emitted PPTX structure.

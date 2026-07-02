# deckjsx

`deckjsx` is a TypeScript library for generating presentation files from JSX through a compiler
pipeline. The authoring model is intentionally web-like: use lowercase JSX tags, CSS-like `style`
objects, flex/grid/block flow, components, and data mapping instead of drawing PowerPoint objects by
coordinate.

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
Authoring uses typed JSX elements with CSS-like style and class semantics. It is not a browser DOM
or a complete CSS engine; deckjsx has a smaller typed tag contract and projects the result into
formats such as PPTX and PDF.

The implementation preserves the compiler model with explicit module boundaries for authoring,
semantic graph construction, style resolution, output projection, writer adapters, and runtime
output.

## Install

```bash
npm install deckjsx @deckjsx/node
```

The package currently targets PPTX output through deckjsx's direct PPTX writer. The public authoring
surface is `deckjsx`; explicit writer selection lives in `deckjsx/adapter`; inspection helpers live
in `deckjsx/inspect`; runtime filesystem writes live in `@deckjsx/node`.

For Node.js or Bun projects that write PPTX files or use the resident dev watcher, install both
packages:

```bash
bun install deckjsx @deckjsx/node
```

`deckjsx` owns authoring, compile/project/render, and writer adapters. `@deckjsx/node` owns
filesystem output, Node local asset loading, and the `deckjsx` CLI binary used for commands such as
`deckjsx dev`.

## Usage

```tsx
import { Deck, StyleSheet, Theme } from "deckjsx";
import { pptx } from "deckjsx/adapter";
import { write } from "@deckjsx/node";

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  meta: { title: "Quarterly Review", author: "deckjsx" },
  templates: {
    report: {
      style: {
        display: "grid",
        gridTemplateAreas: ['"title"', '"body"', '"footer"'],
        gridTemplateRows: ["0.8in", "1fr", "0.35in"],
        rowGap: 0.35,
        padding: 0.7,
      },
      areas: {
        title: { kind: "title", style: { gridArea: "title" } },
        body: { style: { gridArea: "body" } },
        footer: { kind: "footer", style: { gridArea: "footer" } },
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
      title: { target: "h1.title", style: { width: "100%", height: 0.6 } },
      contentGrid: {
        target: "section.contentGrid",
        style: { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 0.35 },
      },
      lead: { target: "p.lead", style: { lineHeight: 1.2 } },
      chartFrame: {
        target: "figure.chartFrame",
        style: { backgroundColor: "#E0F2FE", borderRadius: 0.15, padding: 0.25 },
      },
      chart: {
        target: "img.chart",
        style: { width: "100%", height: "100%", objectFit: "contain" },
      },
      footerText: {
        target: "p.footerText",
        style: { width: "100%", height: 0.3, fontSize: 11, color: "#64748B", textAlign: "right" },
      },
    },
  }),
);

deck.slide(
  { name: "Quarterly Review", template: "report", style: { backgroundColor: "#F8FAFC" } },
  ({ composition, template }) => (
    <>
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
    </>
  ),
);

const projected = await deck.project();
if (!projected.ok) {
  console.warn(projected.diagnostics.items);
}

const rendered = await deck.render(pptx());
if (!rendered.ok) {
  throw new Error("PPTX render failed");
}
const written = await write(rendered, "quarterly-review.pptx");
if (!written.ok) {
  throw new Error(written.diagnostics.map((item) => item.message).join("\n"));
}
```

Use `deck.compile()` for authoring semantics, `await deck.project()` for output-facing inspection,
and `await deck.render(pptx())` for runtime-neutral PPTX bytes and patch metadata. Use
`@deckjsx/node` when writing those rendered bytes to a filesystem path.

`deck.render(pptx())` does not write to disk. It produces a render result containing PPTX bytes,
diagnostics, and patch metadata. `write(rendered, path)` writes that artifact to disk and returns a
result with `ok`, `status`, `strategy`, `bytesWritten`, `patchedParts`, and `diagnostics`. Successful
statuses include `created`, `patched`, and `replaced`; check `written.ok` when you only need success
or failure.

When a hot path only needs the projected model or rendered artifact, inspection summaries can be
skipped with `await deck.project({ inspection: "none" })` or
`await deck.render(pptx({ inspection: "none" }))`.

The normal PPTX render path uses deckjsx's direct PPTX writer through the `pptx()` adapter. Writer
internals such as XML emitters, ZIP assembly, and output sinks are intentionally not part of the
public API.

```tsx
import { pptx } from "deckjsx/adapter";
import { write } from "@deckjsx/node";

await write(await deck.render(pptx()), "quarterly-review.pptx");
```

## Review Loop

Most deck authoring should feel close to writing web JSX: compose components, map over data, use
typed CSS-like layout, and let deckjsx project that structure into the output format. The review
loop is still presentation-specific because the final consumer is a slide file, not a browser
viewport.

Use `project()` first when adjusting a deck. The PPTX inspection summary exposes output-facing
frames, resolved text style, media placement, and non-blocking `visualChecks` for things that often
need human review, such as very small text, text that may shrink/overflow, and media that is tiny or
cropped:

```tsx
const projected = await deck.project({ inspection: "summary" });
const summary = projected.summary as import("deckjsx/inspect").ProjectInspectionSummary | undefined;
for (const slide of summary?.slides ?? []) {
  for (const check of slide.visualChecks) {
    console.warn(`${slide.name ?? slide.slideId}: ${check.code} ${check.message}`);
    if (check.metrics) {
      console.info(`${slide.name ?? slide.slideId}: review metrics`, check.metrics);
    }
  }
  // `slide.elements` summarizes top-level drawing nodes; nested group/table content may surface
  // through `visualChecks[].metrics` instead.
  for (const element of slide.elements) {
    if (element.textMetrics) {
      console.info(
        `${slide.name ?? slide.slideId}: ${element.id} text lines ${element.textMetrics.estimatedLineCount}/${element.textMetrics.estimatedLineCapacity}`,
      );
    }
    if (element.mediaMetrics) {
      console.info(
        `${slide.name ?? slide.slideId}: ${element.id} media ${element.mediaMetrics.fit}${element.mediaMetrics.cropped ? " cropped" : ""}`,
      );
    }
  }
}
```

The checks are review hints, not compile failures. A deck can be structurally valid and still need a
human pass for Japanese line wrapping, figure legibility, margins, and the balance between title,
body, and footer.

For fast visual review of text-heavy decks, the built-in PDF adapter can produce a simple PDF
artifact:

```tsx
import { pdf, pptx } from "deckjsx/adapter";
import { write } from "@deckjsx/node";

await write(await deck.render(pdf()), "quarterly-review.review.pdf");
await write(await deck.render(pptx()), "quarterly-review.pptx");
```

The PDF writer is intentionally minimal today: it is useful as a quick text/layout check, but it does
not replace reviewing the generated PPTX or a full PPTX-to-PDF/raster verification path for final
slides with images, shapes, tables, or precise PowerPoint text wrapping.

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
<shape shape="roundRect" style={{ width: "100%", height: 1, fill: "#DCFCE7" }} />
```

Supported shape values are `rect`, `roundRect`, `ellipse`, and `line`. You can also create a rounded
rectangle with `shape="rect"` plus `style.borderRadius` when you need to control the corner size.

## Layout, Style, And Templates

`deckjsx` keeps layout, style, and templates as separate authoring ideas even when they are written
through JSX and CSS-like objects.

- Layout describes where things are and how children flow: deck slide size, `width`, `height`,
  `left`, `top`, `right`, `bottom`, `inset`, `display`, flex, grid, gaps, padding, and stacking
  order. Project resolves these values into concrete frames and paint order. Element styles do not
  use `x` or `y`.
- Style describes how resolved boxes are drawn: fills, borders, shadows, opacity, transforms, text
  color, font, alignment, bullets, links, image fitting, and background layers.
- Templates describe reusable slide structure: named areas such as `title`, `body`, `media`, or
  `footer` that authored JSX can target without exposing PowerPoint placeholder ids.

Reusable layout and appearance should usually live in `StyleSheet` classes and `Theme` defaults.
Use the JSX `style` prop for slide-local variations, data-dependent overrides, or one-off values
that should stay close to the authored element. Direct style props such as `<p left={1}>` are not
part of the public authoring interface.

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

Later layers replace earlier layers property by property. Inline visual and layout values belong in
`style={{ ... }}`; structural props such as `className`, `area`, `src`, `data`, `shape`, `colspan`,
and `rowspan` remain regular JSX props.

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
      muted: { target: "p.muted", style: { color: "#64748B" } },
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
rule order. Supported typed selectors are intentionally small: tag/class compounds and descendant
selectors whose rightmost selector names an authored tag, such as `p.title`, `div.card p.caption`,
or `section.contentGrid p.lead`.

Inline `span` text runs inherit text-related parent values such as `color`, `fontFamily`,
`fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `direction`, and wrapping controls. The
inherited values are visible in resolved-style inspection; Project avoids duplicating inherited-only
run styles when the parent text box already carries the concrete PPTX text body style.

Style cascade is source-local. A mounted child deck resolves its own theme and stylesheets against
its own slides, which keeps sandboxed and source-incremental composition predictable.

## Slide Templates

Deck templates describe reusable slide structure without asking authors to write PowerPoint
placeholder ids. Define named Template Areas on the Deck, then place authored content through the
typed `template` handle passed to templated slide factories:

```tsx
const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  templates: {
    report: {
      style: {
        display: "grid",
        gridTemplateAreas: ['"title"', '"body"'],
        gridTemplateRows: ["0.8in", "1fr"],
        rowGap: 0.3,
        padding: 0.7,
      },
      areas: {
        title: { kind: "title", style: { gridArea: "title" } },
        body: { style: { gridArea: "body" } },
      },
    },
  },
});

deck.slide({ template: "report" }, ({ template }) => (
  <>
    <h1 area={template.title}>Quarterly Review</h1>
    <section area={template.body}>
      <p style={{ width: "100%", height: 0.5 }}>Performance highlights</p>
    </section>
  </>
));
```

`TemplateArea.kind` is an authoring-level hint such as `"title"`, `"body"`, `"picture"`, or
`"generic"`. Missing kinds default to `"generic"` and are not inferred from area names. Project keeps
Template Area anchors visible in the Pptx Package Model inspection surface, while the writer decides
how to serialize the corresponding PPTX slide layout structure.
Template Areas are authored through flow styles. Put reusable region layout on the template root with
grid or flex style, then give each area a public placement style such as `gridArea`. Fixed template
frames are not part of the public authoring API.

## Assets

Image sources are resolved through the asset loading boundary. The core package includes
multi-runtime handling for data/bytes and URL metadata inference, while remote fetching,
filesystem paths, framework-public assets, authenticated URLs, and app media stores should be
provided by integration packages through `deckjsx/integration`.
For built-in data and byte image sources, Project probes PNG, GIF, JPEG, and SVG dimensions into
media metadata without putting media bytes into the Pptx Package Model. Built-in absolute URL
sources preserve extension/media-type hints but do not fetch remote bytes; provide an explicit
AssetLoader for trusted remote media.

```tsx
import { pptx } from "deckjsx/adapter";
import { integrationContextId, type AssetLoader, type DeckPlugin } from "deckjsx/integration";

const publicAssets = {
  resolverIdentity: "example:public-assets",
  async probe({ source }) {
    if (source.kind !== "path") return undefined;
    return {
      ok: true,
      value: { mediaType: "image/png", extension: "png", width: 1200, height: 800 },
    };
  },
  async load({ source }) {
    if (source.kind !== "path") return undefined;
    const bytes = await loadFromYourRuntime(source.path);
    return {
      ok: true,
      value: { bytes, mediaType: "image/png", extension: "png", width: 1200, height: 800 },
    };
  },
} satisfies AssetLoader;

deck.plugin({
  kind: "deckjsx.plugin",
  id: "example:public-assets",
  name: "example:public-assets",
  integration: {
    id: integrationContextId("example:public-assets"),
    assetLoaders: [publicAssets],
  },
} satisfies DeckPlugin);

await deck.render(pptx());
```

Integration Context loaders belong to the root Deck Plugin stack for the current compile/project/render
execution, then built-in runtime-neutral handling may resolve inline data and URL metadata hints.
Project uses `probe()` for metadata needed by the Pptx Package Model, and Render uses the same winning
resolver identity for `load()` so media metadata and bytes come from the same runtime assumptions.
If a loader claims an image source but cannot provide dimensions, treat that as an asset data
retrieval failure and report it through Project diagnostics rather than waiting for the writer to
guess.

When an `img` has probed intrinsic `width` and `height`, layout uses that ratio if the author did
not provide `aspectRatio`. This means an image with only `width` can derive its projected height,
and an image with only `height` can derive its projected width. Author `aspectRatio` still wins for
intentional crops, logos, or placeholder boxes. `aspectRatio: "auto"` is accepted as the CSS-like
spelling for no authored ratio.

For foreground images, use `objectFit`, `objectPosition`, and `crop`. The public `objectFit`
values are `contain`, `cover`, and `fill`; `fill` uses the same projection behavior as a stretched
image. Values outside that public authoring set are type errors in TSX and compile diagnostics for
JavaScript or casted input.

```tsx
<section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", columnGap: 0.3 }}>
  <img src="hero.png" style={{ width: "100%", height: 2.4, objectFit: "cover" }} />
  <img
    src="portrait.png"
    style={{ width: "100%", height: 2.4, objectFit: "cover", objectPosition: "center top" }}
  />
</section>
<img src="map.png" style={{ width: "100%", height: 1.6, objectPosition: "right 25% bottom 10%" }} />
```

For decorative or underlay images inside a box, use background layers with `backgroundSize`,
`backgroundPosition`, `backgroundRepeat`, `backgroundClip`, and `backgroundOrigin`.

Primitive text belongs inside text-like elements such as `p` or `h1`; view-like elements contain
authored elements. This is a typed authoring contract so text boxes, typography, flow, and
diagnostics stay explicit in the projected slide model. Inline rich text uses `span` inside
text-like elements:

```tsx
<p>
  Revenue grew <span className="positiveDelta">12%</span>.
</p>
```

## Authoring Model

deckjsx authoring uses typed TSX elements, typed `style` objects, and typed StyleSheet/Theme
definitions. Each tag accepts the props, children, and style group that belongs to that authored
element. View tags accept view children, text tags accept text content, media and shape tags do not
accept children, and table tags accept table-structured children.

## Layout Flow

Unpositioned authored content participates in normal slide flow. View-like elements can use block,
flex, or grid layout to build local regions, and text boxes receive flow-friendly defaults for
available width and line-height based height. Numeric layout lengths are inches; font-size-like
numbers are points. CSS unit strings are accepted only where the public style type allows a CSS-like
length. For `display: "flex"` and `display: "grid"`, normal-flow children are laid out inside the
content frame after padding. Use string grid track lists for one or two tracks, and arrays such as
`gridTemplateColumns: ["1fr", "2in", "1fr"]` when a template has more tracks.

## Positioning

Absolute placement is explicit. Use `position: "absolute"` with `left`, `top`, `right`, `bottom`,
`inset`, `width`, and `height` when a slide element needs fixed geometry. The public authoring style
API does not include `x` or `y` style properties, and direct style props such as `<p left={1}>` are
not public props. Template Areas should usually be modeled with grid or flex style on the template
root and `gridArea` on named areas. View-like elements are containing blocks for absolute children,
so positioned descendants resolve offsets against their parent content frame rather than the slide
frame.

## Style Type Safety

Style groups are scoped to their elements. Text styles are separate from view layout styles, media
fit styles stay on media elements, and shape paint styles stay on shapes. StyleSheet classes with
style declarations use explicit targets such as `p.title`, `div.card`, or `div.card p.caption`,
allowing TypeScript to check the style against the authored tag selected by the target. Targetless
and class-only classes are reserved for class-name presence and selector participation, not for broad
style declarations.

deckjsx does not expose one public "all style keys" declaration type. Internal resolved-style maps
exist after validation, but authoring stays on tag-specific style types so invalid element/key pairs
fail before they reach layout or projection.

Style-focused modules can import the same public style contract from `deckjsx/style` without taking
a dependency on Deck authoring, projection, or writer APIs:

```ts
import { StyleSheet, Theme, type ViewStyle } from "deckjsx/style";
```

## Diagnostics

TypeScript is the first line of defense for authored code. Compile diagnostics back it up for
JavaScript or casted inputs: unknown props, style keys outside the public authoring API, style keys
on the wrong element, and malformed CSS-like values are reported as values that are not part of the
public authoring API. Projection diagnostics continue to describe supported PPTX fallback behavior
for representable CSS-like features such as clipping, transform, opacity, and compositing metadata.
Project inspection also includes visual review hints for output-facing layout concerns. Those hints
do not change `ok`; they exist to shorten the loop between web-like JSX authoring and the generated
slide file people will read.

## Development

```bash
vp install
vp check --no-fmt
vp pack
vp test
bun run perf:types
bun run benchmark:node
bun run benchmark:pptx -- --iterations 1 --strict
bun run verify:render -- --skip-raster
```

For output or public-surface changes, keep the direct PPTX writer as the documented built-in path.
Use render verification and XML/package inspection to catch regressions in emitted PPTX structure.

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
npm install deckjsx @deckjsx/node
```

The package currently targets PPTX output through deckjsx's direct PPTX writer. The public authoring
surface is `deckjsx`; explicit writer selection lives in `deckjsx/adapter`; inspection helpers live
in `deckjsx/inspect`; runtime filesystem writes live in `@deckjsx/node`.

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

const rendered = await deck.render(pptx());
if (!rendered.ok) {
  throw new Error("PPTX render failed");
}
await write(rendered, "quarterly-review.pptx");
```

Use `deck.compile()` for authoring semantics, `await deck.project()` for output-facing inspection,
and `await deck.render(pptx())` for runtime-neutral PPTX bytes and patch metadata. Use
`@deckjsx/node` when writing those rendered bytes to a filesystem path.

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

Inline `span` text runs inherit text-related parent values such as `color`, `fontFamily`,
`fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `direction`, and wrapping controls. The
inherited values are visible in resolved-style inspection; Project avoids duplicating inherited-only
run styles when the parent text box already carries the concrete PPTX text body style.

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
    <section area={template.body}>
      <p style={{ width: "100%", height: 0.5 }}>Performance highlights</p>
    </section>
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
framework-public assets, authenticated URLs, and app media stores should be provided by integration
packages through `deckjsx/integration`.
For built-in data, bytes, and absolute URL-like image sources, Project probes PNG, GIF, JPEG, and
SVG dimensions into media metadata without putting media bytes into the Pptx Package Model.

```tsx
import { withIntegrationContext, type AssetLoader } from "deckjsx/integration";
import { pptx } from "deckjsx/adapter";

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

await deck.render(withIntegrationContext(pptx(), { assetLoaders: [publicAssets] }));
```

Integration Context loaders run before the built-in fallback. Project uses `probe()` for metadata
needed by the Pptx Package Model, and Render uses the same winning resolver identity for `load()` so
media metadata and bytes come from the same runtime assumptions.
If a loader claims an image source but cannot provide dimensions, treat that as an asset data
retrieval failure and report it through Project diagnostics rather than waiting for the writer to
guess.

When an `img` has probed intrinsic `width` and `height`, layout uses that ratio if the author did
not provide `aspectRatio`. This means an image with only `width` can derive its projected height,
and an image with only `height` can derive its projected width. Author `aspectRatio` still wins for
intentional crops, logos, or placeholder boxes. `aspectRatio: "auto"` is accepted as the CSS-like
spelling for no authored ratio.

For foreground images, use `objectFit` / `fit`, `objectPosition`, and `crop`. `objectFit: "fill"`
uses the same projection as deckjsx's `stretch` fit; unsupported CSS values such as `"none"` and
`"scale-down"` are preserved as diagnostics and fall back to `contain`:

```tsx
<img src="hero.png" style={{ x: 1, y: 1, width: 4 }} />
<img src="portrait.png" style={{ x: 5.3, y: 1, width: 2, height: 2, objectFit: "cover" }} />
<img src="map.png" style={{ x: 1, y: 3.4, width: 4, height: 1.6, objectPosition: "right 25% bottom 10%" }} />
```

For decorative or underlay images inside a box, use background layers with `backgroundSize`,
`backgroundPosition`, `backgroundRepeat`, `backgroundClip`, and `backgroundOrigin`.

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

`display: "flex"` follows CSS-like defaults for the supported subset: row direction when
`flexDirection` is omitted, and cross-axis stretch when `alignItems` is omitted. The older
deck-specific `layout: "stack"` default remains vertical.

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

## CSS-like Defaults And Gotchas

deckjsx intentionally stays close to HTML/CSS naming, but the current v0.8 layout engine is a slide
layout solver, not a browser. These are the defaults most likely to surprise CSS authors:

| Area              | deckjsx v0.8 behavior                                                                                                                                               | Browser expectation                                            | Guidance                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Block views       | `display: "block"` creates a local containing block and vertically flows unpositioned children; explicit frame props still opt into local absolute placement.       | Block formatting creates vertical flow.                        | Use ordinary block flow for simple stacks; use flex/grid or explicit frames for decks. |
| Flex              | `display: "flex"` defaults to row and cross-axis stretch.                                                                                                           | Same for the supported subset.                                 | Prefer flex for simple rows/columns.                                                   |
| Sizing            | Block-flow text gets available width and a line-height based height; explicit/local absolute boxes still need size, insets, layout stretch, or image ratio.         | Many elements have intrinsic or content-based size.            | Use declared sizes for precise PPTX geometry; rely on block defaults for simple text.  |
| Text measurement  | Stack/grid do not measure wrapped text to push later siblings.                                                                                                      | Browser layout uses measured content.                          | Use declared heights or `fit: "shrink"` for text boxes.                                |
| Units             | Layout numbers are inches; font-size-like numbers are points. Strings support common CSS units including `cm`, `mm`, `Q`, `pc`, `vmin`, and `vmax`.                 | CSS unitless numbers are property-specific.                    | Use strings for CSS-like units when supported, or keep numeric domains explicit.       |
| CSS-wide keywords | `initial`, `inherit`, `unset`, `revert`, and `revert-layer` fall back to supported-subset defaults with diagnostics where full cascade/reset semantics are missing. | CSS has full cascade defaulting semantics.                     | Prefer ordinary omission for defaults; inspect diagnostics when using reset keywords.  |
| Text spacing      | `letterSpacing` accepts `normal` or point lengths; paragraph before/after spacing accepts point lengths.                                                            | CSS text spacing uses property-specific length rules.          | Prefer `px`, `pt`, `em`, or `rem` when porting CSS-like text spacing.                  |
| Style keys        | Unsupported CSS-like property names produce nonblocking compile warnings and remain visible in graph inspection.                                                    | Browsers ignore invalid declarations after parsing rules.      | Use supported style keys; expect warnings for `flex`, `flexFlow`, or logical aliases.  |
| Box sizing        | Containers, text, and shapes default to `border-box`.                                                                                                               | CSS initial is `content-box`.                                  | This is deliberate for slide geometry.                                                 |
| Border radius     | Single-value `borderRadius` supports percentages against the projected short side.                                                                                  | CSS supports richer per-corner radii.                          | `borderRadius: "50%"` works for capsule-like PPTX geometry.                            |
| Shadows           | One shadow layer projects offset/blur/color; spread radius is preserved as unsupported fallback metadata.                                                           | CSS box-shadow supports spread and multiple layers.            | Avoid relying on spread for exact PPTX output; Project diagnostics preserve it.        |
| Grid              | Missing tracks fill the available grid content frame.                                                                                                               | CSS implicit tracks default to `auto`.                         | Declare tracks for precise dashboards.                                                 |
| Images            | Foreground images default to contain/center and can use probed natural ratio.                                                                                       | `<img>` has intrinsic layout behavior in normal document flow. | Use one axis plus probed dimensions, or set both axes for a fixed box.                 |
| Shapes            | Shapes default to visible white fill with no stroke.                                                                                                                | CSS boxes are transparent unless styled.                       | Use `fill: "transparent"` or a `div` when you need a layout/debug box.                 |
| zIndex            | Simple projected paint-order number.                                                                                                                                | CSS stacking contexts and `auto`.                              | Use it for slide paint order, not browser compositing semantics.                       |

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

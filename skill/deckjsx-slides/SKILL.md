---
name: deckjsx-slides
description: Use this skill when creating, editing, or reviewing PowerPoint slide decks with the deckjsx library, especially html-like TSX/JSX slides that compile through Deck, semantic lowercase tags, Project inspection, and the direct PPTX writer. Emphasize clean data flow by separating the authored component graph from data graph inputs, layout/style/template concerns, asset loaders, and projected output snapshots.
---

# deckjsx Slides

Use `deckjsx` as a compiler for presentation documents. Prefer html-like TSX/JSX authoring:
`deck.slide()` declares each slide, while lowercase semantic tags describe slide content. Inspect
authoring semantics with `Deck#compile()`, inspect output-facing state with async `Deck#project()`,
and emit PowerPoint files with `Deck#render({ output })`.

Do not introduce capitalized slide primitives such as `Slide`, `View`, `Text`, `Image`, or `Shape`
in examples. The public authoring direction is `Deck` plus `deck.slide()` and lowercase JSX tags.

For Japanese guidance, read `SKILL-ja.md` in this skill folder. Keep both files aligned when updating examples or workflow.

## Data Flow First

Treat a deck as two dependency graphs feeding the compiler:

- Component Graph: the authored JSX structure, including `Deck`, `deck.slide()`, lowercase tags,
  hierarchy, templates, areas, composition slots, and source-local `className`/`style` declarations.
  This graph should be readable from the JSX and should express slide semantics, not runtime data
  retrieval.
- Data Graph: user or business data, framework/filesystem paths, authenticated asset records,
  metrics, async fetches, computed tables, and other values that exist before authoring. Normalize
  these into serializable snapshots before slide factories run, then pass them through Source Context,
  mounted sources, local constants, or explicit props. Register assets through `deck.useAssets()`.

Keep data graph decisions before authoring or at source boundaries. Avoid hiding data fetches,
mutation, global state reads, runtime file access, or asset byte loading inside JSX nodes. Slide JSX
should map `snapshot -> component graph -> layout/style declarations`.

Review the flow before coding:

```text
data snapshot -> slide factory/source context -> lowercase JSX component graph -> Semantic Author Graph -> Resolved Style -> Layout Input Snapshot -> Projected Layout Snapshot -> Pptx Package Model -> writer
```

Use `Deck#compile()` to inspect authored semantics, `Deck#project()` to inspect Layout Input,
Projected, and PPTX-facing models, and `Deck#render()` only when the writer side effect is needed.
If a deck has multiple independent domains, create named snapshot objects such as `metrics`,
`themeCopy`, or `chartAssets` instead of cross-reading data inside JSX.

## Core Workflow

1. Create a `Deck` with an explicit slide layout.
2. Normalize user/business data, asset references, and computed values into data snapshots before
   slide factories run.
3. Sketch the component graph separately from the data graph, then keep JSX as the mapping from
   snapshot values to authored slide structure.
4. Add slides with `deck.slide((context) => <main>...</main>)` or another view-like root.
5. Prefer html-like tags for authoring: `div`, `section`, `article`, `main`, `header`, `footer`, `aside`, `nav`, and `figure` are view-like containers; `p` and `h1`-`h6` are text-like; `img` is a leaf image element.
6. Put layout/container styles on view-like tags and typography styles on text-like tags. For example, put `fontSize` on `<h1>` or `<p>`, not on `<header>` or `<footer>`.
7. Use lowercase `<shape shape="rect" />`, `<shape shape="ellipse" />`, or `<shape shape="line" />` for simple shapes.
8. Keep component graph, data graph, layout, style, and templates conceptually separate even when layout and visual values are both written through the JSX `style` prop.
9. Register runtime-specific image loading with `deck.useAssets(loader)` when authored assets are paths, framework-public URLs, authenticated URLs, or app media records.
10. Use `await deck.project()` when inspecting, testing, or snapshotting output-facing computed state.
11. Use `await deck.render({ output: "deck.pptx" })` to write a `.pptx`.
12. Use `inspection: "none"` on Project or Render hot paths that do not need inspection summaries.
13. Treat unsupported CSS-like fidelity gaps, such as subtree opacity compositing or clipping with transforms, as Project warnings plus preserved projected metadata when a structurally valid PPTX fallback exists.
14. Validate library changes with `vp check` and `vp test`; for output-specific work, also run `bun run benchmark:pptx -- --iterations 1 --strict` and `bun run verify:render -- --skip-raster`, then inspect generated PPTX contents or render/open the result when possible.

## Minimal PPTX Output

```tsx
import { Deck } from "deckjsx";

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
});

deck.slide({ name: "File output" }, () => (
  <p style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Hello PPTX</p>
));

await deck.render({ output: "sample.pptx" });
```

This pattern is based on the PPTX writer coverage in `tests/pptx/writer.test.tsx`.

## Full Slide Pattern

```tsx
import { Deck } from "deckjsx";

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  meta: { title: "Quarterly Review", author: "deckjsx" },
});

deck.slide(
  { name: "Quarterly Review", style: { backgroundColor: "#F8FAFC" } },
  ({ composition }) => (
    <div style={{ x: 0, y: 0, width: 13.333, height: 7.5 }}>
      <header
        style={{
          x: 0.7,
          y: 0.5,
          width: 8.5,
          height: 0.6,
        }}
      >
        <h1
          style={{
            fontFamily: "Aptos Display",
            fontSize: 28,
            fontWeight: 700,
            color: "#0F172A",
          }}
        >
          Quarterly Review
        </h1>
      </header>
      <main
        style={{
          x: 0.7,
          y: 1.4,
          width: 11.9,
          height: 5.2,
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          columnGap: 0.35,
        }}
      >
        <p style={{ fontSize: 18, color: "#334155", fit: "shrink" }}>
          Keep each slide focused on one message. Use the layout primitives to make the hierarchy
          explicit.
        </p>
        <shape
          shape="rect"
          style={{
            fill: "#2563EB",
            borderRadius: 0.16,
            boxShadow: "3px 3px 8px rgba(15, 23, 42, 0.22)",
          }}
        />
      </main>
      <footer
        style={{
          x: 11.2,
          y: 7,
          width: 1.4,
          height: 0.25,
        }}
      >
        <p style={{ fontSize: 9, color: "#64748B", textAlign: "right" }}>
          {composition.slideIndex + 1} / {composition.totalSlides}
        </p>
      </footer>
    </div>
  ),
);

await deck.render({ output: "quarterly-review.pptx" });
```

## Layout, Style, And Templates

Use these terms deliberately:

- Layout: slide size, frames, local containing blocks, `x`, `y`, `width`, `height`, inset values,
  `display`, flex, grid, gaps, padding, ordering, and z-index-like paint order. These values decide
  where authored elements land in the projected PPTX model.
- Style: fills, borders, radius, shadows, opacity, transforms, text color, typography, alignment,
  bullets, links, background layers, and image fitting. These values decide how already-resolved
  boxes are drawn.
- Templates: reusable semantic regions declared on the deck and targeted from slide JSX through the
  typed `template` handle. Templates are for repeated structure, not for one-off visual decoration.

Because deckjsx is HTML/CSS-like, layout properties are authored through `style` too. Still, keep the
mental model separate: use templates for recurring slide regions, layout for geometry and flow, and
style for appearance.

## Style Cascade

When this skill says cascade, it means deckjsx's per-element style resolution, not a full browser CSS
engine. The resolved style for each element is built property by property in this order:

1. Element defaults.
2. `Theme` defaults for the authored tag, such as `p`, `h1`, `div`, `span`, or `img`.
3. Matching `StyleSheet` class rules registered with `deck.useStyles()`.
4. Inline authoring style from the JSX `style` object.

Later layers replace earlier layers for the same property. Avoid direct style props such as
`x={1}`, `color="red"`, or `display="grid"` in new examples. They are planned for removal in v0.8.1;
use `style={{ ... }}` for local inline values and `StyleSheet` classes for reusable layout/style.

For class rules, `className` token order is not the conflict priority. Selector specificity wins
first, then stylesheet registration/rule order. Use the supported selector subset: `.class`,
`tag.class`, compound class selectors, and descendant selectors such as `.card .caption`.

Cascade is source-local. Mounted decks keep their own theme and stylesheets, which is important for
sandboxed composition and HMR-like reuse. Do not describe cascade as generic parent-to-child CSS
inheritance unless a specific projected behavior actually implements that inheritance.

## Assets

Use `data` for data URIs or `src` for authored image references. Keep filesystem, framework, and
authenticated asset concerns outside JSX by registering an asset loader on the deck.

```tsx
import type { AssetLoader } from "deckjsx";

const appAssets = {
  name: "app-assets",
  async probe({ source }) {
    if (source.kind !== "path") return undefined;
    return { mediaType: "image/png", extension: "png", width: 1200, height: 800 };
  },
  async load({ source }) {
    if (source.kind !== "path") return undefined;
    return {
      bytes: await loadBytesFromYourRuntime(source.path),
      mediaType: "image/png",
      extension: "png",
      width: 1200,
      height: 800,
    };
  },
} satisfies AssetLoader;

deck.useAssets(appAssets);
```

Project uses `probe()` to put dimensions and media metadata into the projected model. Render uses
the same loader scope for `load()` so bytes, media type, and dimensions come from the same runtime
assumptions. If dimensions cannot be probed, treat that as an asset retrieval failure instead of
letting the writer guess.

When an `img` has probed intrinsic `width` and `height`, deckjsx derives the missing projected axis
from that natural ratio unless the author supplied `aspectRatio`. Good default patterns are
`style={{ width: 4 }}` for natural-aspect images, a fixed `width` / `height` plus
`objectFit: "cover"` for media boxes, and `style={{ width: 4, aspectRatio: "16 / 9" }}` for
non-image placeholders or deliberate overrides.

Use `objectFit` / `fit`, `objectPosition`, and `crop` for foreground `img` elements. Use
`background`, `backgroundSize`, `backgroundPosition`, `backgroundRepeat`, `backgroundClip`, and
`backgroundOrigin` for decorative or underlay images on view-like boxes. Do not mix the two
vocabularies in examples unless the comparison is intentional.

## Slide Templates

Use deck templates when repeated slide structure matters. Templates define named areas in deck
configuration; slide factories receive a typed `template` handle and place normal authored JSX into
those areas.

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

## CSS-like Defaults And Gotchas

deckjsx is HTML/CSS-like, but v0.8 is a slide layout solver rather than a browser engine.

- `display: "block"` is a local containing block in v0.8.x. It does not create browser-like
  vertical block flow, so unsized/unpositioned children can overlap. Use flex/grid with `gap`,
  templates, or explicit `x`/`y` for composition.
- `display: "flex"` defaults to CSS-like row direction and cross-axis stretch. The deck-specific
  `layout: "stack"` default remains vertical.
- Frames are zero-sized unless explicit `width` / `height`, insets, flex/grid stretch, or image
  intrinsic ratio supplies a size. Give text boxes a projected width and height unless a layout mode
  stretches them.
- Stack and grid use declared sizes and ratios; they do not measure wrapped text and push later
  siblings. Use declared heights and `fit: "shrink"` for text-heavy slides.
- Numeric layout lengths are inches. Font-size-like numbers are points. Numeric `lineHeight` is a
  multiplier, not points.
- `letterSpacing` accepts `normal`, numbers as points, and CSS-like point lengths such as `px`,
  `pt`, `em`, and `rem`.
- `paragraphSpacingBefore` and `paragraphSpacingAfter` accept numbers as points and CSS-like point
  lengths such as `px`, `pt`, `em`, and `rem`.
- Single-value `borderRadius` accepts percentages against the projected short side, so
  `borderRadius: "50%"` is the capsule-style spelling.
- Containers, text, and shapes default to `boxSizing: "border-box"` for slide geometry. Shapes are
  visible white-filled PPTX primitives unless styled.
- Grid defaults fill the available grid content frame rather than behaving like browser implicit
  `auto` tracks. Declare tracks for precise layouts.
- `zIndex` is projected paint order, not full CSS stacking-context behavior.

## Tested Sample Patterns

Use these patterns as reliable starting points because they mirror repository tests.

### Multiple Slides And Page Numbers

Based on `tests/authoring/deck.test.tsx`.

```tsx
const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  meta: { title: "Spec test", author: "deckjsx" },
});

deck.slide({ name: "Report slide" }, ({ composition }) => (
  <p style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>
    {composition.slideIndex + 1} / {composition.totalSlides}
  </p>
));
```

### Exact Absolute Layout

Use for polished PowerPoint composition where placement must be predictable.

```tsx
deck.slide({ name: "Absolute" }, () => (
  <main style={{ x: 0, y: 0, width: 10, height: 5.625 }}>
    <h1 style={{ x: 0.75, y: 0.6, width: 8, height: 0.55, fontSize: 26 }}>Executive Summary</h1>
    <section
      style={{
        x: 0.75,
        y: 1.4,
        width: 5.5,
        height: 4.5,
        backgroundColor: "#E0F2FE",
        borderRadius: 0.12,
      }}
    />
  </main>
));
```

### Stack Or Flex Layout

Based on `tests/layout/stack.test.tsx`.

```tsx
<section
  style={{
    x: 1,
    y: 1,
    width: 6,
    height: 3,
    display: "flex",
    flexDirection: "column",
    gap: 0.25,
    padding: 0.5,
  }}
>
  <p style={{ width: 2, height: 0.5, fontSize: 18, order: -1 }}>First</p>
  <p style={{ width: 2, height: 0.5, fontSize: 18 }}>Second</p>
  <p
    style={{
      position: "absolute",
      left: 1,
      top: 0.25,
      width: 1.5,
      height: 0.5,
      fontSize: 16,
    }}
  >
    Overlay
  </p>
</section>
```

### Grid Layout

Based on `tests/layout/grid.test.tsx`.

```tsx
<section
  style={{
    x: 1,
    y: 1,
    width: 8,
    height: 5,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: "1fr 1fr",
    columnGap: 0.5,
    rowGap: 0.5,
    padding: 0.5,
  }}
>
  <div style={{ gridColumn: "span 2", backgroundColor: "#D1D5DB" }} />
  <div style={{ placeSelf: "start center", width: 1, height: 0.5, backgroundColor: "#CBD5E1" }} />
</section>
```

### Image Fit, Crop, And Position

Based on `tests/style/image-values.test.tsx`.

```tsx
<img
  data={WIDE_SVG_DATA_URI}
  style={{
    x: 1,
    y: 1,
    width: 1,
    height: 2,
    objectFit: "cover",
    objectPosition: "right 25% bottom 10%",
  }}
/>
```

### Background Layers

Based on `tests/style/background-layers.test.tsx`.

```tsx
deck.slide(
  {
    name: "Background",
    style: {
      background:
        `url("${WIDE_SVG_DATA_URI}") no-repeat right bottom / contain, ` +
        "linear-gradient(180deg, #111111 0%, #333333 100%)",
    },
  },
  () => (
    <div
      style={{
        x: 1,
        y: 1,
        width: 2,
        height: 1,
        background: `url("${SAMPLE_SVG_DATA_URI}") repeat-x left top / contain`,
      }}
    />
  ),
);
```

### Gradients And Shadows

Based on `tests/style/gradient-values.test.tsx` and `tests/pptx/writer.test.tsx`.

```tsx
deck.slide(
  {
    name: "Effects",
    style: {
      backgroundImage:
        "radial-gradient(ellipse 20% 30% at 25% 75%, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)",
    },
  },
  () => (
    <shape
      shape="rect"
      style={{
        x: 1,
        y: 1,
        width: 2,
        height: 1,
        fill: "#F97316",
        boxShadow: "6px 6px 10px rgba(15, 23, 42, 0.35)",
        stroke: "dodgerblue",
        strokeWidth: "3pt",
        strokeDasharray: "1 4",
      }}
    />
  ),
);
```

### Typography, Links, And Lists

Based on `tests/style/typography-values.test.tsx` and `tests/style/values.test.tsx`.

```tsx
<p
  style={{
    x: 1,
    y: 1,
    width: 4,
    height: 0.75,
    fontSize: "2rem",
    color: "#0F172A",
    href: "https://example.com/docs",
    tooltip: "Open docs",
    listStyleType: "circle",
    listIndent: "3ch",
    fit: "shrink",
  }}
>
  Linked bullet text
</p>
```

## Design Rules For Decks

- Build the real slides first; avoid landing-page or explanatory scaffolding.
- Prefer 16:9 layouts with `{ width: 13.333, height: 7.5, unit: "in" }` unless the user specifies another size.
- Use absolute placement for presentation-critical layouts where exact alignment matters.
- Use `display: "flex"` or `layout: "stack"` for simple rows/columns and repeated content.
- Use `display: "grid"` for dashboards, comparisons, matrices, or dense analytic slides.
- Keep slide text short. Use hierarchy through size, weight, color, spacing, and alignment rather than long paragraphs.
- Place repeated furniture such as page numbers, section labels, or small metadata consistently.
- Use `fit: "shrink"` or controlled `height` for text boxes that may vary, then inspect the generated output.

## Using JSX-Like References Carefully

When composition or data flow feels unclear, borrow architectural ideas from React, Preact, MDX,
Remotion, and local JSX-oriented skills such as `vercel-react-best-practices` or
`building-components`. Useful references include readable component hierarchy, pushing data fetching
out of render/JSX, hoisting static structures, passing stable props or snapshots, and avoiding
inline component definitions when the same structure is repeated.

Do not copy browser or React runtime assumptions into deckjsx authoring. deckjsx JSX is compiler
input for PowerPoint output, not an interactive DOM. Avoid guidance based on hydration, lifecycle
hooks, event handlers, client/server component boundaries, or browser layout engines unless the
deckjsx implementation explicitly supports the behavior. Side effects belong in Source Context,
asset loaders, Project inspection, Render, or other explicit runtime boundaries.

## deckjsx API Notes

- Preferred authoring surface: `Deck`, `deck.slide()`, and lowercase html-like tags. View-like tags are `div`, `section`, `article`, `main`, `header`, `footer`, `aside`, `nav`, and `figure`; text-like tags are `p` and `h1`-`h6`; image tags are `img`.
- Do not use `<Slide>`, `<View>`, `<Text>`, `<Image>`, or `<Shape>` in deck examples or tests that are meant to demonstrate the public html-like authoring surface.
- `Deck#slide()` receives `{ composition }`; use `composition.slideIndex` and `composition.totalSlides`.
- Geometry numbers default to inches; font-size numbers default to points.
- View-like tags accept view/layout styles. Text styles belong on `p` or `h1`-`h6`.
- Use `span` inside text-like elements for rich inline text runs.
- Supported length strings include units such as `"in"`, `"pt"`, `"px"`, and `"%"`.
- Prefer CSS-like aliases where available: `left`, `top`, `display`, `flexDirection`, `objectFit`, `objectPosition`, `background`, `border`, `boxShadow`, `textDecoration`, and grid properties.
- `img` accepts `src` for paths and `data` for data URIs. It is a leaf element and does not accept children.
- `shape` currently supports `shape="rect"`, `"ellipse"`, or `"line"`.
- The implemented writer is the direct PPTX writer. Use `await deck.render({ output })` for the default path or `pptx()` from `deckjsx/adapter` when an explicit writer adapter is needed.
- Treat writer internals as private. XML emission, package assembly, ZIP details, and output sinks should not appear in deck authoring guidance.

## Visual Styling

- Use `backgroundColor`, `background`, or `backgroundImage` on slides and view-like tags.
- Use `border`, per-side borders, `borderRadius`, `outline`, `boxShadow`, `opacity`, `rotation`, `flipH`, and `flipV` when useful.
- For text, use `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`/`italic`, `color`, `textAlign`, `verticalAlign`, `lineHeight`, `letterSpacing`, `textTransform`, bullets through `listStyleType`, and links through `href`/`tooltip`.
- For images, set `objectFit: "cover"` or `"contain"` and refine with `objectPosition` or `crop`.
- Use PowerPoint-safe fonts unless the user has provided a target environment.

## Testing And Review

- Before implementing, identify whether the change belongs to the component graph, data graph, style
  resolution, layout snapshot, projection, writer, or runtime/source boundary.
- In reviews, trace `data snapshot -> JSX -> compile -> project -> render` and confirm downstream
  modules do not reach back into live data graph state.
- When changing compiler behavior, add or update tests that assert authoring semantics through
  `deck.compile()` or output-facing computed state through `await deck.project()`.
- When changing writer output, create a temporary `.pptx`, unzip/inspect XML when needed, and assert meaningful emitted markup.
- For render regressions, run `bun run verify:render -- --skip-raster`; use the Docker/GitHub render workflow when LibreOffice/raster verification matters.
- Keep Node-only file writing in output/runtime code, not core compiler normalization.
- If a generated deck looks wrong, check resolved frames in `await deck.project()` first; most visual bugs are layout or unit normalization issues before writer emission.

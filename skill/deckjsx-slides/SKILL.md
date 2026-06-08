---
name: deckjsx-slides
description: Use this skill when creating, editing, or reviewing PowerPoint slide decks with the deckjsx library, especially html-like TSX/JSX slides that compile to PPTX through Deck, semantic lowercase tags, and the direct PPTX writer.
---

# deckjsx Slides

Use `deckjsx` as a compiler for presentation documents, not as a thin writer wrapper. Prefer html-like TSX/JSX authoring: `deck.slide()` declares each slide, while lowercase semantic tags describe slide content. Inspect authoring semantics with `Deck#compile()`, inspect output-facing state with async `Deck#project()`, and emit PowerPoint files with `Deck#render({ output })`.

For Japanese guidance, read `SKILL-ja.md` in this skill folder. Keep both files aligned when updating examples or workflow.

## Core Workflow

1. Create a `Deck` with an explicit slide layout.
2. Add slides with `deck.slide((context) => <main>...</main>)` or another view-like root.
3. Prefer html-like tags for authoring: `div`, `section`, `article`, `main`, `header`, `footer`, `aside`, `nav`, and `figure` are view-like containers; `p` and `h1`-`h6` are text-like; `img` is a leaf image element.
4. Put layout/container styles on view-like tags and typography styles on text-like tags. For example, put `fontSize` on `<h1>` or `<p>`, not on `<header>` or `<footer>`.
5. Use lowercase `<shape shape="rect" />`, `<shape shape="ellipse" />`, or `<shape shape="line" />` for simple shapes.
6. Use `await deck.project()` when inspecting, testing, or snapshotting output-facing computed state.
7. Use `await deck.render({ output: "deck.pptx" })` to write a `.pptx`.
8. Use `inspection: "none"` on Project or Render hot paths that do not need inspection summaries.
9. Treat unsupported CSS-like fidelity gaps, such as subtree opacity compositing or clipping with transforms, as Project warnings plus preserved projected metadata when a structurally valid PPTX fallback exists.
10. Validate library changes with `vp check` and `vp test`; for output-specific work, also run the strict PPTX writer benchmark and the isolated generation oracle, then inspect generated PPTX contents or render/open the result when possible.

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

## deckjsx API Notes

- Preferred authoring surface: `deck.slide()` plus lowercase html-like tags. View-like tags are `div`, `section`, `article`, `main`, `header`, `footer`, `aside`, `nav`, and `figure`; text-like tags are `p` and `h1`-`h6`; image tags are `img`.
- `Deck#slide()` receives `{ composition }`; use `composition.slideIndex` and `composition.totalSlides`.
- Geometry numbers default to inches; font-size numbers default to points.
- View-like tags accept view/layout styles. Text styles belong on `p` or `h1`-`h6`.
- Use `span` inside text-like elements for rich inline text runs.
- Supported length strings include units such as `"in"`, `"pt"`, `"px"`, and `"%"`.
- Prefer CSS-like aliases where available: `left`, `top`, `display`, `flexDirection`, `objectFit`, `objectPosition`, `background`, `border`, `boxShadow`, `textDecoration`, and grid properties.
- `img` accepts `src` for paths and `data` for data URIs. It is a leaf element and does not accept children.
- `shape` currently supports `shape="rect"`, `"ellipse"`, or `"line"`.
- The implemented writer adapter is the direct PPTX writer. Use `await deck.render({ output })` for the default writer or `pptx()` from `deckjsx/adapter` when an explicit adapter is needed.
- Treat writer internals as private: XML emitters, ZIP settings, sinks, Assembly Plan builders, and Build Artifact storage should not appear in deck authoring guidance.

## Visual Styling

- Use `backgroundColor`, `background`, or `backgroundImage` on slides and view-like tags.
- Use `border`, per-side borders, `borderRadius`, `outline`, `boxShadow`, `opacity`, `rotation`, `flipH`, and `flipV` when useful.
- For text, use `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`/`italic`, `color`, `textAlign`, `verticalAlign`, `lineHeight`, `letterSpacing`, `textTransform`, bullets through `listStyleType`, and links through `href`/`tooltip`.
- For images, set `objectFit: "cover"` or `"contain"` and refine with `objectPosition` or `crop`.
- Use PowerPoint-safe fonts unless the user has provided a target environment.

## Testing And Review

- When changing compiler behavior, add or update tests that assert authoring semantics through
  `deck.compile()` or output-facing computed state through `await deck.project()`.
- When changing writer output, create a temporary `.pptx`, unzip/inspect XML when needed, and assert meaningful emitted markup.
- Keep Node-only file writing in output/runtime code, not core compiler normalization.
- If a generated deck looks wrong, check resolved frames in `await deck.project()` first; most visual bugs are layout or unit normalization issues before writer emission.

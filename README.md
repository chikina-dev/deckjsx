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
The API uses a class-based compiler with callback-based `.add()`, `.compile()`, `.project()`, and
`.render()`. Authoring uses typed JSX elements with CSS-like style and class semantics.

The implementation preserves the compiler model with explicit module boundaries for authoring,
semantic graph construction, style resolution, output projection, writer adapters, and runtime
output.

## Install

```bash
npm install deckjsx
```

The package currently targets PPTX output and ships a temporary `pptxgenjs` writer adapter.

## Usage

```tsx
import { Deck, Slide } from "deckjsx";

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  meta: { title: "Quarterly Review", author: "deckjsx" },
});

deck.add(({ composition }) => (
  <Slide name={`Slide ${composition.slideIndex + 1}`} style={{ backgroundColor: "#F8FAFC" }}>
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
          style={{ width: "100%", height: 0.3, fontSize: 11, color: "#64748B", textAlign: "right" }}
        >
          {composition.slideIndex + 1} / {composition.totalSlides}
        </p>
      </footer>
    </main>
  </Slide>
));

const project = deck.project();
await deck.render({ output: "quarterly-review.pptx" });
```

Use `deck.compile()` for authoring semantics, `deck.project()` for output-facing inspection, and
`deck.render({ output })` when writing a PowerPoint file.

## JSX elements

`deckjsx` supports both the original capitalized components and a typed HTML-like JSX surface.

View-like elements compile to grouped layout containers:

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

Text-like elements compile to text boxes:

```tsx
<h1>Title</h1>
<h2>Section</h2>
<p>Body copy</p>
```

Image elements compile to images and require either `src` or `data`:

```tsx
<img src="diagram.png" style={{ width: 4, height: 2.5, fit: "contain" }} />
```

Primitive string and number children inside view-like elements are normalized to implicit text
nodes. Inline rich text uses `span` inside text-like elements:

```tsx
<p>
  Revenue grew <span style={{ color: "#16A34A", fontWeight: 700 }}>12%</span>.
</p>
```

## View Layout Semantics

`View` is a containing block for its children. Child `x`, `y`, `left`, `top`, `right`,
`bottom`, `width`, and `height` values are resolved relative to the parent `View`, not
the slide, so authors can build panels with local coordinates. Percentage lengths use
the parent frame as their reference.

```tsx
<View style={{ x: 1, y: 1, width: 6, height: 3 }}>
  <Text style={{ x: "10%", y: "20%", width: "50%", height: "25%" }}>local percent frame</Text>
  <Text style={{ left: "55%", top: "10%", right: "10%", bottom: "60%" }}>inset frame</Text>
</View>
```

For `display: "flex"` and `display: "grid"`, normal-flow children are laid out inside
the content frame after padding. `gap`, `flexGrow`, percentage widths, `fr` grid tracks,
and simple `gridColumn` / `gridRow` spans resolve to concrete slide coordinates during
rendering. Absolutely positioned children inside flex or grid containers also use the
container content frame, including padding, as their containing block.

Use direct slide children when you want slide-global absolute placement. Use children
inside a `View` when you want a local, web-like layout region.

## Development

```bash
vp install
vp check
vp test
vp pack
```

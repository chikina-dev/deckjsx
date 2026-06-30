---
name: deckjsx-slides
description: Use this skill when creating, editing, converting, or reviewing PowerPoint decks with deckjsx. Favor idiomatic deckjsx authoring: Deck plus deck.slide(), lowercase HTML-like JSX tags, data snapshots, reusable components, Theme defaults, StyleSheet classes, templates, Project inspection, and the direct PPTX writer. Treat authored x/y positioning and coordinate-helper code as outside the public authoring API except for isolated low-level compatibility boundaries.
---

# deckjsx Slides

Use `deckjsx` as a presentation compiler, not as a PowerPoint coordinate drawing DSL.

The normal authored shape is:

```text
data snapshot -> component graph -> Semantic Author Graph -> Resolved Style -> Projected Layout -> Pptx Package Model -> writer
```

Author slides with `Deck`, `deck.slide()`, lowercase HTML-like tags, `Theme`, `StyleSheet`,
templates, and ordinary TypeScript components. Inspect authoring semantics with `deck.compile()`,
inspect output-facing state with `await deck.project()`, and write PPTX with
`await deck.render(...)`.

For Japanese guidance, read `SKILL-ja.md` in this folder. Keep both files aligned.

## Non-Negotiables

- Do not introduce capitalized slide primitives such as `Slide`, `View`, `Text`, `Image`, or
  `Shape`. Public authoring is `Deck` plus `deck.slide()` and lowercase JSX tags.
- Treat authored `x`/`y` positioning as outside the public authoring API. Do not use `x` or `y`
  style keys in slide JSX, reusable components, or StyleSheet classes.
- Do not pass `x`, `y`, `w`, `h`, `shapeId`, or PowerPoint object names through component props.
- Do not build helpers like `text(x, y, w, h, ...)`, `card(x, y, ...)`, or `table(x, y, ...)`.
  Those turn deckjsx into the wrong abstraction.
- Do not wrap slides in opaque helper calls such as `chrome(title, subtitle, body, children)` when
  that hides templates, component hierarchy, or layout semantics from the JSX.
- Do not spread arrays of coordinate-generated elements into slides, such as
  `...card(0.75, 1.38, ...)` or `...statement(0.75, 4.35, ...)`.
- Keep reusable layout and appearance in `StyleSheet` classes and `Theme` defaults. Use inline
  `style` only for slide-local values that are genuinely local.
- Use templates for repeated slide regions with flow layout. Template Areas use `style.gridArea`,
  `alignSelf`, and `justifySelf`; they do not accept numeric `frame` definitions.

## Project Shape

For anything beyond a tiny example, split the deck into files:

```text
src/
  deck.tsx
  theme.ts
  styles.ts
  templates.ts
  data/
    slides.ts
    assets.ts
  components/
    SlideShell.tsx
    TitleBlock.tsx
    CardGrid.tsx
    MetricCard.tsx
    SourceNote.tsx
  slides/
    title.tsx
    section.tsx
    evidence.tsx
```

Use fewer files only for a small sketch. Split when data needs a schema, a visual pattern repeats,
templates/styles get crowded, or a slide archetype deserves a name.

## Data Flow

Treat a deck as two dependency graphs feeding the compiler:

- Data Graph: user/business data, source text, metrics, table rows, citations, asset references,
  and computed values. Normalize these before slide factories run.
- Component Graph: authored JSX structure, components, lowercase tags, templates, areas,
  `className`, and local `style` declarations.

Slide JSX should map `snapshot -> component graph -> layout/style declarations`. Do not hide data
fetching, mutation, global state reads, runtime file access, or asset byte loading inside JSX nodes.

## Core Workflow

1. Create a `Deck` with explicit slide size and, for nontrivial decks, `Theme`, templates, and
   registered styles.
2. Normalize source data, assets, tables, metrics, and citations into typed snapshots.
3. Define `Theme` defaults for typography, ordinary text color, and baseline visual vocabulary.
4. Define `StyleSheet` classes for reusable layout and appearance.
5. Define templates for repeated semantic regions such as title, body, media, sidebar, footer, and
   source note.
6. Implement reusable components before writing most slide declarations.
7. Add slides with `deck.slide({ template: "..." }, ({ template }) => <main>...</main>)`.
8. Use `await deck.project()` while debugging layout, cascade, template placement, assets, and
   diagnostics.
9. Use `await deck.render(...)` only when writer output is needed.

## Authoring Surface

Use lowercase tags:

- View-like: `main`, `section`, `article`, `div`, `header`, `footer`, `aside`, `nav`, `figure`.
- Text-like: `h1`-`h6`, `p`, and inline `span`.
- Media: `img` and `video`.
- Editable simple shapes: lowercase `shape` with `shape="rect"`, `"roundRect"`, `"ellipse"`, or
  `"line"`.

Put layout/container styles on view-like tags. Put typography on text-like tags. Use `span` inside
text-like tags for rich inline runs.

## Layout Policy

Prefer layout constructs in this order:

1. Template areas for repeated page regions.
2. Normal block flow for simple vertical content.
3. Flex for rows, columns, strips, and repeated one-dimensional groups.
4. Grid for dashboards, card grids, matrices, comparisons, and table-like structure.
5. Inset-style placement (`left`, `top`, `right`, `bottom`) only when the supported deckjsx surface
   needs a local overlay.
6. Isolated absolute placement only for one-off compatibility or decorative exceptions.

Use `gap`, `padding`, `gridTemplateColumns`, `gridTemplateRows`, `flexDirection`, `alignItems`,
`justifyContent`, percentages, and `fr` tracks instead of hand-placing repeated children.

For dense decks, use explicit text heights, controlled `lineHeight`, readable padding, and
`fit: "shrink"` as a safety net. Do not solve density by hand-positioning every text box.

## Good Pattern

```tsx
import { Deck, StyleSheet, Theme } from "deckjsx";

const theme = new Theme({
  colors: {
    ink: "#111827",
    muted: "#64748B",
    paper: "#F8FAFC",
    accent: "#2563EB",
  },
  fonts: {
    display: "Aptos Display",
    body: "Aptos",
  },
  defaults: {
    h1: { fontFamily: "Aptos Display", fontSize: 30, fontWeight: 700, color: "#111827" },
    p: { fontFamily: "Aptos", fontSize: 15, color: "#334155", fit: "shrink" },
  },
});

const styles = new StyleSheet({
  classes: {
    slide: { target: "slide.slide", style: { backgroundColor: theme.colors.paper } },
    title: { target: "h1.title", style: { width: "100%", height: 0.55 } },
    cardGrid: {
      target: "section.cardGrid",
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 0.22,
      },
    },
    card: {
      target: "section.card",
      style: {
        backgroundColor: "#FFFFFF",
        borderRadius: 0.08,
        padding: 0.18,
        border: "1pt solid #E2E8F0",
      },
    },
    footer: {
      target: "p.footer",
      style: { fontSize: 8, color: theme.colors.muted, textAlign: "right" },
    },
  },
});

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  theme,
  templates: {
    report: {
      style: {
        display: "grid",
        gridTemplateAreas: ['"title"', '"body"', '"footer"'],
        gridTemplateRows: ["0.7in", "1fr", "0.3in"],
        rowGap: 0.24,
        padding: 0.55,
      },
      areas: {
        title: { kind: "title", style: { gridArea: "title" } },
        body: { kind: "body", style: { gridArea: "body" } },
        footer: { kind: "footer", style: { gridArea: "footer", justifySelf: "end" } },
      },
    },
  },
});

deck.useStyles(styles);

type Card = { title: string; body: string };

function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <section className="cardGrid">
      {cards.map((card) => (
        <section className="card" key={card.title}>
          <h2>{card.title}</h2>
          <p>{card.body}</p>
        </section>
      ))}
    </section>
  );
}

deck.slide(
  { name: "Findings", template: "report", className: "slide" },
  ({ template, composition }) => (
    <main>
      <h1 area={template.title} className="title">
        Findings
      </h1>
      <section area={template.body}>
        <CardGrid cards={findings.cards} />
      </section>
      <p area={template.footer} className="footer">
        {composition.slideIndex + 1}
      </p>
    </main>
  ),
);
```

This pattern keeps page-level placement in template definitions, repeated rhythm in classes, and
slide content in data/components.

## Anti-Pattern

Do not use the earlier coordinate-heavy pattern as a starting point. This code is an anti-pattern:

```tsx
type Frame = { left: number; top: number; width: number; height: number };

function placed(frame: Frame, children: JSX.Element) {
  return <div style={{ position: "absolute", ...frame }}>{children}</div>;
}

deck.slide({ name: "Quarterly Review" }, () =>
  placed(
    { left: 0, top: 0, width: 13.333, height: 7.5 },
    <>
      {placed({ left: 0.7, top: 0.5, width: 8.5, height: 0.6 }, <h1>Quarterly Review</h1>)}
      {placed({ left: 0.7, top: 1.4, width: 11.9, height: 5.2 }, <p>Summary text</p>)}
      {placed({ left: 11.2, top: 7, width: 1.4, height: 0.25 }, <p>1 / 8</p>)}
    </>,
  ),
);
```

Why it is wrong:

- It makes slide JSX a coordinate transcription instead of a component graph.
- It wraps meaningful slide regions in a generic positioning helper instead of naming them.
- Repeated regions such as title, body, and footer are not templates.
- Typography and recurring layout are not promoted into `Theme` or `StyleSheet`.
- The slide body cannot scale into a multi-file deck with reusable components.
- Future edits require touching raw positions across slides.

Refactor this shape into `templates.ts`, `theme.ts`, `styles.ts`, data snapshots, and named
components before adding more slides.

### Coordinate Helper Slide

Do not build slides like this:

```tsx
deck.slide(
  { name: "Three disputes" },
  chrome(
    "03 AI MODEL GEOPOLITICS",
    "Fable/Mythos停止は、技術・法制度・政治が分離されない危うさを示した",
    "安全性の事実認定、法的権限、政治的動機が分離されないまま、一つの停止措置に流れ込んだ",
    [
      ...card(0.75, 1.38, 2.65, 2.55, "技術", ["Fable固有の問題か"], "blue"),
      ...card(3.68, 1.38, 2.65, 2.55, "法制度", ["EARでAPI利用をどう扱うか"], "red"),
      ...card(6.6, 1.38, 2.65, 2.55, "政治", ["米中AI競争の文脈"], "amber"),
      ...statement(
        0.75,
        4.35,
        8.5,
        "この事案は、AI時代の輸出管理が企業の利用可否に直撃する",
        "navy",
      ),
    ],
  ),
);
```

Why it is wrong:

- `deck.slide()` receives an opaque helper result instead of readable lowercase JSX.
- `chrome(...)` hides the slide shell that should be a template or component.
- `card(x, y, w, h, ...)` encodes layout as arguments instead of component structure and CSS-like
  classes.
- Spreading arrays of generated nodes erases semantic ownership and makes Project/component
  inspection less useful.
- The actual data model is trapped inside a slide call instead of named arrays or typed records.

Use data and components instead:

```tsx
const disputes = [
  { lens: "技術", tone: "blue", points: ["Fable固有の問題か", "他モデルでも可能な能力か"] },
  { lens: "法制度", tone: "red", points: ["EARでAPI利用をどう扱うか", "透明で公平な手続きの有無"] },
  { lens: "政治", tone: "amber", points: ["米中AI競争の文脈", "同盟国アクセスの境界"] },
];

deck.slide({ name: "Three disputes", template: "report", className: "slide" }, ({ template }) => (
  <main>
    <TitleBlock
      area={template.title}
      kicker="03 AI MODEL GEOPOLITICS"
      title="Fable/Mythos停止は、技術・法制度・政治が分離されない危うさを示した"
      lead="安全性の事実認定、法的権限、政治的動機が分離されないまま、一つの停止措置に流れ込んだ"
    />
    <section area={template.body} className="disputeGrid">
      {disputes.map((item) => (
        <DisputeCard key={item.lens} dispute={item} />
      ))}
    </section>
    <Statement area={template.footer} tone="navy">
      この事案は、AI時代の輸出管理が企業の利用可否に直撃することを示した
    </Statement>
  </main>
));
```

The replacement keeps content in data, slide furniture in templates/components, and repeated card
layout in `StyleSheet` classes such as `.disputeGrid` and `.disputeCard`.

## Style Cascade

Resolved style is built property by property in this order:

1. Element defaults.
2. `Theme` defaults for authored tags such as `p`, `h1`, `div`, `span`, or `img`.
3. Matching `StyleSheet` class rules registered with `deck.useStyles()`.
4. Inline `style` from JSX.

Avoid direct style props such as `x={1}`, `color="red"`, or `display="grid"`. Use
`style={{ ... }}` for local values and `StyleSheet` classes for reusable layout/style. Class
conflicts follow selector specificity, then stylesheet registration/rule order.

## Assets

Use `data` for data URIs and `src` for authored image references. Keep filesystem, framework, and
authenticated asset concerns outside JSX by registering an asset loader or plugin.

Use `objectFit`, `objectPosition`, and `crop` for foreground images. Use `background`,
`backgroundSize`, `backgroundPosition`, `backgroundRepeat`, `backgroundClip`, and
`backgroundOrigin` for decorative or underlay images on view-like boxes.

## Authoring Model

Authoring starts from semantic slide structure: templates define repeated regions, components name
content patterns, `Theme` defines baseline typography and visual vocabulary, and `StyleSheet`
classes define reusable layout and appearance. Slide-local inline `style` is for one-off values,
not a replacement for component structure.

## Layout Flow

View-like elements participate in normal flow by default. Use block, flex, and grid layout to create
rhythm inside a region. Declare tracks, gaps, padding, and alignment in `StyleSheet` classes when a
pattern repeats.

## Positioning

Absolute placement is explicit: use `position: "absolute"` with `left`, `top`, `right`, `bottom`,
`width`, `height`, or `inset` only when an element genuinely needs local fixed placement. Prefer
template areas for repeated slide-level regions.

## Style Type Safety

Use only public style keys accepted by the authored tag. Text styles belong on `p`, headings, table
cells, and `span`; media fitting belongs on `img` and `video`; shape paint belongs on `shape`.
`x` and `y` are not public authoring style keys.

## Diagnostics

Invalid props, unsupported style keys, invalid CSS-like values, table hierarchy mistakes, and
misused template areas should be treated as compile diagnostics. Do not work around diagnostics with
casts or compatibility aliases; fix the authored JSX, style, template, or data model.

## Red Flags

Stop and refactor if:

- A generated deck is one huge TSX file.
- Most elements are individually fixed-positioned instead of using flow, grid, flex, or templates.
- Repeated formatting appears as copied inline style blocks.
- Components accept coordinates instead of semantic data.
- Slide declarations call opaque layout helpers such as `chrome(...)`, `card(...)`, or
  `statement(...)`.
- Slide declarations spread arrays returned by helper functions into JSX or slide factories.
- Tables, cards, timelines, and source lists are hand-placed cell by cell.
- A change to spacing, typography, or footer style requires editing many slides.

## Testing And Review

- Before implementing, identify whether the change belongs to the data graph, component graph,
  style resolution, layout, projection, writer, or runtime/source boundary.
- In reviews, trace `data snapshot -> JSX -> compile -> project -> render`.
- Use `deck.compile()` for authoring semantics and `await deck.project()` for output-facing layout,
  resolved style, diagnostics, and package projection inspection.
- For library changes, run `vp check` and `vp test`. For output-specific work, also run
  `bun run benchmark:pptx -- --iterations 1 --strict` and
  `bun run verify:render -- --skip-raster` when available.
- For generated standalone decks, run that project's type/build command and render the `.pptx`.

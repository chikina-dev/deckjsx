---
name: deckjsx-slides-ja
description: deckjsx ライブラリで PowerPoint / PPTX デッキを作成、編集、変換、レビューするときに使う日本語ガイド。Deck と deck.slide()、lowercase HTML-like JSX、data snapshot、再利用可能な component、Theme defaults、StyleSheet classes、templates、Project inspection、direct PPTX writer を使う。authored x/y positioning と coordinate helper code は、隔離された低レベル互換境界以外では public authoring API 外として扱う。
---

# deckjsx Slides 日本語ガイド

`deckjsx` は PowerPoint の座標描画 DSL ではなく、presentation compiler として扱います。

基本の流れはこれです。

```text
data snapshot -> component graph -> Semantic Author Graph -> Resolved Style -> Projected Layout -> Pptx Package Model -> writer
```

`Deck`、`deck.slide()`、lowercase HTML-like tag、`Theme`、`StyleSheet`、templates、通常の
TypeScript component で書きます。authoring semantics は `deck.compile()`、出力向け状態は
`await deck.project()`、PPTX 出力は `await deck.render(...)` で扱います。

英語版の標準 skill は `SKILL.md` です。更新時は英語版と日本語版を揃えてください。

## 必須ルール

- `Slide`、`View`、`Text`、`Image`、`Shape` のような capitalized slide primitive は使わない。
  public authoring は `Deck` + `deck.slide()` + lowercase JSX tag。
- authored `x` / `y` positioning は public authoring API 外として扱う。slide JSX、
  component、StyleSheet class で `x` / `y` style key を使わない。
- component props に `x`、`y`、`w`、`h`、`shapeId`、PowerPoint object name を渡さない。
- `text(x, y, w, h, ...)`、`card(x, y, ...)`、`table(x, y, ...)` のような helper を作らない。
  それは deckjsx を間違った抽象に落とします。
- `chrome(title, subtitle, body, children)` のような不透明 helper で slide 全体を包まない。
  template、component hierarchy、layout semantics が JSX から見えなくなります。
- `...card(0.75, 1.38, ...)` や `...statement(0.75, 4.35, ...)` のように、
  coordinate-generated element の配列を slide に spread しない。
- Template Area は `style.gridArea`、`alignSelf`、`justifySelf` などの authored style を使い、
  numeric `frame` definition は受け取らない。
- Slide Template root の `style` は flow-layout surface。template root style に `width`、
  `height`、`position`、`left`、`top`、`right`、`bottom` を入れない。slide size は `Deck`
  layout、slide content は通常の authored element style で扱う。

## 制約と推奨を分ける

deckjsx は authoring では意図的に Web に近い書き味にしています。多くの slide code は、通常の
JSX、component、配列の map、CSS-like な layout / style object として書けます。deckjsx を、
常に PPTX の低レベル object を意識して書く API として説明しないでください。

ユーザーに案内するときは、次を分けます。

- Public API の制約: lowercase deckjsx tag、typed children、direct style prop ではなく
  `style={{ ... }}`、authored `x` / `y` key なし、tag ごとの style key、slide factory の typed
  `template` handle から得る Template Area reference。
- Authoring の推奨: 繰り返す slide region には template、繰り返す visual vocabulary には
  StyleSheet / Theme、不透明 helper より named component、fixed placement より grid / flex /
  flow、data normalization は JSX の外。

推奨は、読みやすさ、再利用、Project inspection のしやすさのためです。deckjsx が Web-like ではない、
または一回限りの inline style がすべて悪い、という意味ではありません。

## Authoring Samples

nontrivial な deck を生成する前に、この skill directory の sample file を読みます。

- `samples/review-loop-project/`: `theme.ts`、`styles.ts`、`templates.ts`、`data/`、
  `components/`、`slides/`、`deck.tsx` entrypoint、`package.json`、`tsconfig.sample.json`、
  Project inspection、minimal PDF review output、final PPTX render を含む complete multi-file
  sample project。
- `samples/review-loop.tsx`: Web-like JSX authoring、`project({ inspection: "summary" })`、
  `visualChecks`、minimal PDF review output、final PPTX render を1つの compact file にした例。
- `samples/component-pattern.tsx`: data array -> named component -> visible `deck.slide(...)`
  structure、template area、StyleSheet class を1つの compact file にした例。

これらは prose snippet ではなく reference implementation として扱います。新しい deck structure を
発明する前に、この形をコピーしてください。1つの opaque helper call に畳んだり、coordinate helper に
書き換えたりしないでください。

ユーザーが sample project を求めている場合は、`samples/review-loop-project/` を標準形として使います。
single-file sample は compact explanation、smoke test、小さな sketch のためにだけ使います。

custom component に Template Area reference を渡す場合、prop は `deckjsx` から import した
`TemplateAreaRef` として型付けします。sample code で `unknown`、`any`、hand-built template area
object を使わないでください。

coordinate-helper refactor では、representative explanation と implementation shape を分けます。

- plan や representative TSX を求められた場合は compact excerpt でもよいですが、実装コードにするなら
  `theme.ts`、`styles.ts`、`templates.ts`、`data/`、`components/`、`slides/` に分ける、と明示します。
- sample project や implementation を求められた場合は、最初から multi-file shape で作ります。
- 元 slide の exact dimensions や visual constraints がない場合、coordinate-equivalent な spacing を
  invent せず、まず semantic content と component structure を保ちます。rows、gaps、text heights、
  fit は `deck.project({ inspection: "summary" })` で詰めます。

## プロジェクト構成

小さな例以外はファイルを分けます。

```text
package.json
tsconfig.sample.json
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

sketch なら少ないファイルでもよいですが、data schema、繰り返す visual pattern、混み合う
templates/styles、名前を持つべき slide archetype が出たら分割します。

direct writer を呼ぶ、または `process` を使う standalone TypeScript deck では、project template に
Node 型を含めます。`@types/node` を入れ、`compilerOptions.types` に `["node"]` を設定します。
sample project ではこれを `tsconfig.sample.json` に置き、`npm run check` がその file を見るようにします。

## データフロー

deck は compiler に入る2つの dependency graph として捉えます。

- Data Graph: source text、metrics、table rows、citations、asset references、computed values。
  slide factory が動く前に正規化します。
- Component Graph: authored JSX structure、components、lowercase tags、templates、areas、
  `className`、local `style` declarations。

slide JSX は `snapshot -> component graph -> layout/style declarations` の対応を書く場所です。
JSX node の中に data fetch、mutation、global state read、runtime file access、asset byte loading を
隠さないでください。

## 基本ワークフロー

1. 明示的な slide size を持つ `Deck` を作る。非 trivial な deck では `Theme`、templates、styles も用意する。
2. source data、assets、tables、metrics、citations を typed snapshot に正規化する。
3. typography、通常の text color、基礎 visual vocabulary を `Theme` defaults に置く。
4. 再利用する layout / appearance を `StyleSheet` classes に置く。
5. title、body、media、sidebar、footer、source note などの繰り返す semantic region を templates に置く。
6. ほとんどの slide declaration を書く前に reusable component を実装する。
7. `deck.slide({ template: "..." }, ({ template }) => <main>...</main>)` で slide を追加する。
8. layout、cascade、template placement、assets、diagnostics は `await deck.project()` で確認する。
9. writer output が必要な時だけ `await deck.render(...)` を使う。

## Authoring Surface

lowercase tag を使います。

- View-like: `main`、`section`、`article`、`div`、`header`、`footer`、`aside`、`nav`、`figure`
- Text-like: `h1`-`h6`、`p`、inline `span`
- Media: `img`、`video`
- 編集可能な単純図形: lowercase `shape` with `shape="rect"`、`"roundRect"`、`"ellipse"`、
  `"line"`

view-like tag は authored element children を受け、text-like tag は primitive text と inline
`span` run を受けます。これは typed deckjsx child contract であり、Web-like authoring を否定する
ものではありません。projected text box を inspection しやすく保つため、通常は layout/container
style を view-like tag に、typography を text-like tag に置きます。

## Layout Policy

layout はこの順で考えます。

1. 繰り返す page region には template area。
2. 単純な縦方向 content には normal block flow。
3. row、column、strip、一次元の繰り返しには flex。
4. dashboard、card grid、matrix、comparison、table-like structure には grid。
5. local overlay や slide-local fixed geometry が必要な場合は、サポート範囲内で `left`、`top`、
   `right`、`bottom` の inset-style placement。
6. absolute placement は one-off callout、overlay、互換ケース、exact placement を意図的に検証する
   fixture などに使えます。

繰り返し要素を手配置せず、`gap`、`padding`、`gridTemplateColumns`、`gridTemplateRows`、
`flexDirection`、`alignItems`、`justifyContent`、percentage、`fr` track を使います。

dense deck では explicit text height、controlled `lineHeight`、読みやすい padding、
`fit: "shrink"` を安全網として使います。full PPTX review の前に Project inspection の
`textMetrics` と `visualChecks` で、縮小や overflow の可能性がある text を見つけます。
inspection summary では、`slide.visualChecks` が slide の review hint を集約し、`textMetrics` と
`mediaMetrics` は top-level の `slide.elements[]` entry 上にあります。nested group content や
native table cell については、top-level slide element に出ない content の metrics を
`visualChecks[].metrics` が持つことがあります。

## よいパターン

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
    slide: { target: "main.slide", style: { backgroundColor: theme.colors.paper } },
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

deck.slide({ name: "Findings", template: "report" }, ({ template, composition }) => (
  <main className="slide">
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
));
```

この形では page-level placement は template 定義に、繰り返す rhythm は class に、slide content は
data/component に置かれます。

## アンチパターン

最初に出した coordinate-heavy な形を出発点にしないでください。これはアンチパターンです。

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

何が悪いか:

- slide JSX が component graph ではなく coordinate transcription になっている。
- 意味のある slide region を generic positioning helper で包み、名前を失っている。
- title、body、footer のような繰り返し region が template になっていない。
- typography と繰り返す layout が `Theme` / `StyleSheet` に昇格していない。
- slide body が multi-file deck や reusable component に育たない。
- 後から直すたびに raw position を複数 slide で触ることになる。

この形が出たら、slide を増やす前に `templates.ts`、`theme.ts`、`styles.ts`、data snapshot、
named component へ分解してください。

### Coordinate Helper Slide

こういう slide は作らないでください。

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

何が悪いか:

- `deck.slide()` に readable な lowercase JSX ではなく opaque helper result を渡している。
- `chrome(...)` が template または component として見えるべき slide shell を隠している。
- `card(x, y, w, h, ...)` が layout を component structure と CSS-like class ではなく引数に埋めている。
- generated node の配列 spread は semantic ownership を消し、Project/component inspection を弱くする。
- data model が named array や typed record ではなく slide call の中に閉じ込められている。

こう書き換えます。

```tsx
const disputes = [
  { lens: "技術", tone: "blue", points: ["Fable固有の問題か", "他モデルでも可能な能力か"] },
  { lens: "法制度", tone: "red", points: ["EARでAPI利用をどう扱うか", "透明で公平な手続きの有無"] },
  { lens: "政治", tone: "amber", points: ["米中AI競争の文脈", "同盟国アクセスの境界"] },
];

deck.slide({ name: "Three disputes", template: "report" }, ({ template }) => (
  <main className="slide">
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

この置き換えでは、content は data、slide furniture は template/component、繰り返す card layout は
`.disputeGrid` や `.disputeCard` のような `StyleSheet` class に置きます。

## Style Cascade

resolved style は property ごとに次の順で作られます。

1. Element defaults
2. `p`、`h1`、`div`、`span`、`img` など authored tag に対する `Theme` defaults
3. `deck.useStyles()` で登録された matching `StyleSheet` class rules
4. JSX の inline `style`

`x={1}`、`color="red"`、`display="grid"` のような direct style prop は避けます。local value は
`style={{ ... }}`、再利用する layout/style は `StyleSheet` class に置きます。class conflict は
selector specificity、次に stylesheet registration / rule order で決まります。

## Assets

data URI は `data`、authored image reference は `src` を使います。filesystem、framework、
authenticated asset の都合は JSX に混ぜず、asset loader または plugin に置きます。

foreground image には `objectFit`、`objectPosition`、`crop` を使います。装飾や下敷き画像は
view-like box の `background`、`backgroundSize`、`backgroundPosition`、`backgroundRepeat`、
`backgroundClip`、`backgroundOrigin` で扱います。

## Authoring Model

authoring は semantic slide structure から始めます。templates は繰り返す region、components は
content pattern、`Theme` は基礎 typography と visual vocabulary、`StyleSheet` classes は再利用する
layout / appearance を定義します。slide-local inline `style` は一回限りの値に使い、component
structure の代わりにしません。

inline `style` は、1枚の slide や1つの authored element に属する値なら普通に使って構いません。
同じ値が繰り返される、deck 全体の vocabulary になる、後の inspection や編集を楽にする、という時に
`StyleSheet`、`Theme`、template に昇格します。

## Layout Flow

view-like element はデフォルトで normal flow に参加します。region 内の rhythm は block、flex、
grid layout で作ります。繰り返す pattern では tracks、gaps、padding、alignment を `StyleSheet`
class に置きます。

## Positioning

absolute placement は明示的に使います。local fixed placement が本当に必要な要素だけ
`position: "absolute"` と `left`、`top`、`right`、`bottom`、`width`、`height`、`inset` を
使います。繰り返す slide-level region は template area を優先します。

## Style Type Safety

authored tag が受け付ける public style key だけを使います。text style は `p`、heading、table
cell、`span` に置き、media fitting は `img` / `video`、shape paint は `shape` に置きます。
`x` と `y` は public authoring style key ではありません。

`toneColor(tone): string` のような palette helper は、`color`、`backgroundColor`、
`borderColor`、`textDecorationColor` などの color-bearing property に使えます。malformed な
dynamic color string は compile/project 時に deckjsx が検証します。style error を消すために
`as any` や広い cast を足さないでください。`background`、`border`、`fill`、`stroke` のような
shorthand が type-check で落ちる場合は、shorthand syntax を直すか、dynamic value を specific
color property に移します。

## Diagnostics

invalid props、unsupported style key、invalid CSS-like value、table hierarchy mistake、
misused template area は compile diagnostics として扱います。cast や compatibility alias で
diagnostics を回避せず、authored JSX、style、template、data model を直します。

視覚品質の問題は compile failure とは別です。`await deck.project({ inspection: "summary" })` で
`visualChecks`、text metrics、media placement、clipping、projected frame を確認します。text-heavy
deck では minimal PDF render を速い確認 artifact として使えますが、納品前に確認すべき最終出力は
生成された PPTX です。
`visualChecks` は各 slide から読みます。`textMetrics` / `mediaMetrics` は top-level の
`slide.elements[]` entry から読み、nested group content や native table cell の check では
`visualChecks[].metrics` も読みます。これらの metrics を slide-level field として扱わないでください。

`visualChecks`、text metrics、media metrics に universal な pass/fail threshold を invent
しないでください。これらは human judgment が必要な slide を示す triage list として扱います。最終的な
acceptability は generated PPTX を開き、意図した presentation context で確認して判断します。

## Red Flags

次が見えたら止まって refactor します。

- generated deck が巨大な1ファイルになっている。
- ほとんどの要素が flow、grid、flex、template ではなく個別の fixed positioning で配置されている。
- 繰り返しの formatting が copied inline style block になっている。
- component が semantic data ではなく coordinates を受け取っている。
- slide declaration が `chrome(...)`、`card(...)`、`statement(...)` のような opaque layout helper を呼んでいる。
- helper function が返した配列を JSX や slide factory に spread している。
- table、card、timeline、source list が cell by cell に手配置されている。
- spacing、typography、footer style の変更に多数の slide 編集が必要。

## テストとレビュー

- 実装前に、その変更が data graph、component graph、style resolution、layout、projection、
  writer、runtime/source boundary のどこに属するかを明確にする。
- review では `data snapshot -> JSX -> compile -> project -> render` を辿る。
- authoring semantics は `deck.compile()`、output-facing layout、resolved style、diagnostics、
  package projection は `await deck.project()` で確認する。
- ライブラリ変更では `vp check` と `vp test` を実行する。output-specific work では可能なら
  `bun run benchmark:pptx -- --iterations 1 --strict` と
  `bun run verify:render -- --skip-raster` も実行する。
- standalone generated deck では、その project の type/build command を実行し、`.pptx` を render する。
  可能なら `package.json`、task config、README を確認します。command が提示されていない場合は、
  存在しない command を invent せず、その project の既存 validation/render command を使う、と案内します。

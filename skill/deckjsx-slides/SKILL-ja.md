---
name: deckjsx-slides-ja
description: deckjsx ライブラリで PowerPoint スライドや PPTX デッキを作成、編集、レビューするときに使う日本語ガイド。Deck、deck.slide()、html-like lowercase tag、Project inspection、direct PPTX writer を使う TSX/JSX スライド制作向け。authored component graph と data graph inputs、layout/style/template、asset loader、projected output snapshot を分ける綺麗なデータフローを重視する。
---

# deckjsx Slides 日本語ガイド

`deckjsx` は JSX/TSX で書いたスライドを Semantic Author Graph と Pptx Package Model に変換し、direct PPTX writer で `.pptx` に出力する presentation compiler として扱います。`deck.slide()` でスライドを宣言し、lowercase の html-like tag でスライド内容を書くのを基本にします。

例の中で `Slide`、`View`、`Text`、`Image`、`Shape` のような capitalized slide primitive を新しく使わないでください。public authoring の方向性は `Deck`、`deck.slide()`、lowercase JSX tag です。

英語版の標準 skill は `SKILL.md` です。例や運用ルールを更新するときは、この日本語版も同じ内容に揃えてください。

## データフローを先に整理する

deck は compiler に入る2つの dependency graph として捉えます。

- Component Graph: `Deck`、`deck.slide()`、lowercase tag、階層、template、area、
  composition slot、source-local な `className` / `style` 宣言を含む authored JSX structure。
  この graph は JSX を読めば分かる状態にし、slide semantics を表現します。runtime data
  retrieval をここに混ぜません。
- Data Graph: user/business data、framework/filesystem path、authenticated asset record、
  metrics、async fetch、computed table など、authoring の前に存在する値。slide factory が動く前に
  serializable snapshot へ正規化し、Source Context、mounted source、local constant、明示的な
  props で渡します。asset は `deck.useAssets()` で登録します。

data graph の判断は authoring の前、または source boundary に置きます。JSX node の中に data fetch、
mutation、global state read、runtime file access、asset byte loading を隠さないでください。slide JSX は
`snapshot -> component graph -> layout/style declarations` の対応を書く場所です。

実装前に次の流れを確認します。

```text
data snapshot -> slide factory/source context -> lowercase JSX component graph -> Semantic Author Graph -> Resolved Style -> Layout Input Snapshot -> Projected Layout Snapshot -> Pptx Package Model -> writer
```

authored semantics は `Deck#compile()`、Layout Input / Projected / PPTX-facing model は
`Deck#project()`、writer side effect が必要なときだけ `Deck#render()` で確認します。複数の独立した
domain がある deck では、JSX 内で横断的に data を読まず、`metrics`、`themeCopy`、`chartAssets`
のような名前付き snapshot object を作ります。

## 基本ワークフロー

1. `Deck` を作り、スライドサイズを明示する。
2. user/business data、asset reference、computed value は slide factory が動く前に data snapshot へ正規化する。
3. component graph と data graph を別々に描いてから、JSX は snapshot value から authored slide structure への mapping として書く。
4. `deck.slide((context) => <main>...</main>)` のように view-like root でスライドを追加する。
5. 基本は html-like tag を使う。`div`、`section`、`article`、`main`、`header`、`footer`、`aside`、`nav`、`figure` は view-like container、`p` と `h1`-`h6` は text-like、`img` は leaf image。
6. layout/container の style は view-like tag に、typography の style は text-like tag に置く。たとえば `fontSize` は `<header>` や `<footer>` ではなく `<h1>` や `<p>` に置く。
7. 図形は lowercase の `<shape shape="rect" />`、`<shape shape="ellipse" />`、`<shape shape="line" />` を使う。
8. layout と visual style がどちらも JSX の `style` prop に書かれる場合でも、component graph、data graph、layout、style、template は概念として分けて扱う。
9. authored asset が path、framework-public URL、authenticated URL、app media record の場合は `deck.useAssets(loader)` で runtime-specific な画像解決を登録する。
10. 出力向けの計算結果を確認、テスト、snapshot するときは `await deck.project()` を使う。
11. PPTX を書き出すときは `await deck.render({ output: "deck.pptx" })` を使う。
12. inspection summary が不要な Project / Render hot path では `inspection: "none"` を使う。
13. subtree opacity compositing や transform と組み合わさった clipping など、CSS-like fidelity gap は構造的に有効な PPTX fallback がある限り Project warning と projection metadata の保存で扱う。
14. ライブラリを変更したら `vp check` と `vp test` で検証する。writer output を触る場合は `bun run benchmark:pptx -- --iterations 1 --strict` と `bun run verify:render -- --skip-raster` も実行し、必要に応じて生成した PPTX の XML や描画結果を確認する。

## 最小の PPTX 出力

`tests/pptx/writer.test.tsx` の PPTX writer coverage に近い、最小の出力例です。

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

## 標準的なスライド例

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
          1枚のスライドには1つの主張を置き、階層はサイズ、余白、色、配置で表現する。
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
```

## Layout、Style、Templates

この3つの言葉は意識して使い分けます。

- Layout: slide size、frame、local containing block、`x`、`y`、`width`、`height`、inset values、`display`、flex、grid、gap、padding、ordering、z-index-like paint order。projected PPTX model 上で要素がどこに置かれるかを決める。
- Style: fill、border、radius、shadow、opacity、transform、text color、typography、alignment、bullet、link、background layer、image fitting。解決済みの box をどう描くかを決める。
- Templates: deck に宣言した reusable semantic region を、slide JSX から typed `template` handle で指定するもの。繰り返し使う構造のための仕組みであり、単発の装飾ではない。

deckjsx は HTML/CSS-like なので layout property も `style` に書きます。それでも考え方としては、繰り返す slide region には template、位置と流れには layout、見た目には style を使います。

## Style Cascade

この skill で cascade と言う場合、ブラウザ CSS engine 全体ではなく、deckjsx の element ごとの style resolution を指します。各 element の resolved style は property ごとに次の順序で作られます。

1. Element defaults。
2. `p`、`h1`、`div`、`span`、`img` など authored tag に対する `Theme` defaults。
3. `deck.useStyles()` で登録された `StyleSheet` のうち、match した class rules。
4. JSX `style` object による inline authoring style。

後の layer が同じ property の前の layer を置き換えます。新しい例では `x={1}`、`color="red"`、`display="grid"` のような direct style props は避けてください。これらは v0.8.1 で削除予定です。局所的な inline value は `style={{ ... }}`、再利用する layout/style は `StyleSheet` class に置きます。

class rule では `className` token order は conflict priority ではありません。まず selector specificity が勝ち、次に stylesheet registration / rule order が効きます。使う selector は `.class`、`tag.class`、compound class selector、`.card .caption` のような descendant selector の範囲に留めます。

cascade は source-local です。mounted deck は自分の theme と stylesheet で解決されるため、sandbox 的な composition や HMR 的な再利用が予測しやすくなります。実際に projection がその継承を実装している場合を除き、cascade を一般的な parent-to-child CSS inheritance として説明しないでください。

## Assets

data URI は `data`、authored image reference は `src` を使います。filesystem、framework、authenticated asset の都合は JSX に混ぜず、deck に asset loader を登録して扱います。

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

Project は `probe()` を使って dimensions と media metadata を projected model に渡します。Render は同じ loader scope で `load()` を使うため、bytes、media type、dimensions が同じ runtime 前提から得られます。dimensions を probe できない場合は writer に推測させず、asset retrieval failure として扱います。

## Slide Templates

繰り返し使うスライド構造がある場合は deck templates を使います。template は deck configuration で named area を定義し、slide factory に渡る typed `template` handle で通常の authored JSX を配置します。

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
      <p>Performance highlights</p>
    </section>
  </main>
));
```

## テスト由来のサンプルパターン

以下はリポジトリ内のテストに基づく、信頼して使いやすい出発点です。

### 複数スライドとページ番号

`tests/authoring/deck.test.tsx` に基づくパターンです。

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

### 厳密な absolute レイアウト

PowerPoint らしい正確な配置が必要なときに使います。

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

### stack / flex レイアウト

`tests/layout/stack.test.tsx` に基づくパターンです。

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

### grid レイアウト

`tests/layout/grid.test.tsx` に基づくパターンです。

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

### 画像の fit / crop / position

`tests/style/image-values.test.tsx` に基づくパターンです。

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

### 背景レイヤー

`tests/style/background-layers.test.tsx` に基づくパターンです。

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

### グラデーションと影

`tests/style/gradient-values.test.tsx` と `tests/pptx/writer.test.tsx` に基づくパターンです。

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

### タイポグラフィ、リンク、リスト

`tests/style/typography-values.test.tsx` と `tests/style/values.test.tsx` に基づくパターンです。

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

## スライド制作の判断基準

- まず実際のスライドを作る。説明用のランディングページや不要な足場は作らない。
- 指定がなければ 16:9 の `{ width: 13.333, height: 7.5, unit: "in" }` を使う。
- 精密な構図には absolute placement を使う。
- 単純な縦横並びや繰り返し要素には `display: "flex"` または `layout: "stack"` を使う。
- ダッシュボード、比較表、マトリクス、分析スライドには `display: "grid"` を使う。
- スライド上の文章は短くする。長文で説明せず、文字サイズ、太さ、色、余白、配置で階層を作る。
- ページ番号、セクション名、注記などの反復要素は位置とスタイルを揃える。
- 可変テキストには `fit: "shrink"` や明示的な `height` を使い、出力後に見た目を確認する。

## JSX-like reference の使い方

composition や data flow が曖昧なときは、React、Preact、MDX、Remotion、またはローカルの
`vercel-react-best-practices`、`building-components` のような JSX-oriented skill の設計観点を参考にします。
参考にしてよいのは、読みやすい component hierarchy、data fetching を render/JSX の外へ出すこと、static
structure の hoist、stable props / snapshot の受け渡し、繰り返す structure を inline component definition にしないことです。

ただし browser / React runtime の前提は deckjsx authoring に持ち込みません。deckjsx の JSX は PowerPoint
output のための compiler input であり、interactive DOM ではありません。hydration、lifecycle hook、
event handler、client/server component boundary、browser layout engine に基づく guidance は、deckjsx 実装が明示的にサポートしている場合を除いて避けます。side effect は Source Context、asset loader、Project inspection、Render などの明示的な runtime boundary に置きます。

## API メモ

- 推奨の authoring surface は `Deck`、`deck.slide()`、lowercase html-like tag。view-like tag は `div`、`section`、`article`、`main`、`header`、`footer`、`aside`、`nav`、`figure`。text-like tag は `p` と `h1`-`h6`。image tag は `img`。
- public html-like authoring surface を示す deck example や test では `<Slide>`、`<View>`、`<Text>`、`<Image>`、`<Shape>` を使わない。
- `Deck#slide()` の callback には `{ composition }` が渡る。`composition.slideIndex` と `composition.totalSlides` を使う。
- 幾何値の number は inch、font size の number は point として扱う。
- view-like tag は view/layout style を受け取る。text style は `p` または `h1`-`h6` に置く。
- text-like element の中では `span` を使って rich inline text run を表現できる。
- length 文字列は `"in"`、`"pt"`、`"px"`、`"%"` などを使える。
- CSS 風 alias は `left`、`top`、`display`、`flexDirection`、`objectFit`、`objectPosition`、`background`、`border`、`boxShadow`、`textDecoration`、grid 系 property を優先する。
- `img` は path 用の `src` と data URI 用の `data` を受け取る。leaf element なので children は受け取らない。
- `shape` は現在 `shape="rect"`、`"ellipse"`、`"line"` をサポートする。
- 実装済み writer は direct PPTX writer。通常は `await deck.render({ output })` を使い、明示的な writer adapter が必要な場合は `deckjsx/adapter` の `pptx()` を使う。
- XML emission、package assembly、ZIP details、output sink などの writer 内部実装は private として扱い、deck authoring guidance には出さない。

## テストとレビュー

- 実装前に、その変更が component graph、data graph、style resolution、layout snapshot、
  projection、writer、runtime/source boundary のどこに属するかを明確にする。
- review では `data snapshot -> JSX -> compile -> project -> render` を辿り、下流 module が live な
  data graph state を読み返していないことを確認する。
- compiler behavior を変えるときは、`deck.compile()` の authoring semantics または
  `await deck.project()` の出力向け計算結果を検証するテストを追加または更新する。
- writer output を変えるときは、一時 `.pptx` を生成し、必要なら unzip して XML の意味ある markup を検証する。
- render regression を見る場合は `bun run verify:render -- --skip-raster` を実行する。LibreOffice/raster verification が重要な場合は Docker/GitHub render workflow を使う。
- Node 専用のファイル書き込みは output/runtime 層に置き、core compiler normalization に混ぜない。
- 生成デッキの見た目がおかしいときは、まず `await deck.project()` の resolved frame を確認する。多くの見た目の問題は writer emission より前の layout や unit normalization にある。

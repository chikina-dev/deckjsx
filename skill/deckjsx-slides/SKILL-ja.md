---
name: deckjsx-slides-ja
description: deckjsx ライブラリで PowerPoint スライドや PPTX デッキを作成、編集、レビューするときに使う日本語ガイド。Deck、Slide、View、Text、Image、Shape、pptxgenjs backend を使う TSX/JSX スライド制作向け。
---

# deckjsx Slides 日本語ガイド

`deckjsx` は `pptxgenjs` の薄いラッパーではなく、JSX/TSX で書いたスライドを Presentation IR にコンパイルし、backend で `.pptx` に出力するライブラリとして扱います。

英語版の標準 skill は `SKILL.md` です。例や運用ルールを更新するときは、この日本語版も同じ内容に揃えてください。

## サンプルファイル

具体的な TSX サンプルは `examples/` に置いてあります。大きな例を本文から書き写すより、目的に合うファイルだけ読んで使ってください。

- `examples/minimal-output.tsx`: `pptxgenjs` backend で最小の `.pptx` を出力する例。
- `examples/multi-slide-report.tsx`: metadata、ページ番号、grid card、データ繰り返しを含む2枚構成のレポート例。
- `examples/layout-patterns.tsx`: absolute、flex/stack、grid、overlay positioning の例。
- `examples/visual-effects.tsx`: 背景レイヤー、グラデーション、影、画像 fit/position、shape stroke の例。

これらのファイルは、この repository 内で参照しやすいように `../../../src/index.ts` から import しています。外部プロジェクトにコピーして使う場合は import を `from "deckjsx"` に変えてください。

## 基本ワークフロー

1. `Deck` を作り、スライドサイズを明示する。
2. `deck.add((context) => <Slide>...</Slide>)` でスライドを追加する。
3. レイアウトと見た目は component の `style` オブジェクトにまとめる。
4. IR を確認、テスト、snapshot するときは `deck.render()` を使う。
5. PPTX を書き出すときは `await deck.output({ backend: "pptxgenjs", output: "deck.pptx" })` を使う。
6. ライブラリを変更したら `vp check` と `vp test` で検証する。出力 backend を触る場合は、必要に応じて生成した PPTX の XML も確認する。

## 最小の PPTX 出力

`tests/backend-pptxgenjs.test.tsx` に近い、最小の出力例です。

```tsx
import { Deck, Slide, Text } from "deckjsx";

const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
});

deck.add(() => (
  <Slide name="File output">
    <Text style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>Hello PPTX</Text>
  </Slide>
));

await deck.output({
  backend: "pptxgenjs",
  output: "sample.pptx",
});
```

## 標準的なスライド例

```tsx
import { Deck, Shape, Slide, Text, View } from "deckjsx";

const deck = new Deck({
  layout: { width: 13.333, height: 7.5, unit: "in" },
  meta: { title: "Quarterly Review", author: "deckjsx" },
});

deck.add(({ slideIndex, totalSlides }) => (
  <Slide name={`Slide ${slideIndex + 1}`} style={{ backgroundColor: "#F8FAFC" }}>
    <Text
      style={{
        x: 0.7,
        y: 0.5,
        width: 8.5,
        height: 0.6,
        fontFamily: "Aptos Display",
        fontSize: 28,
        fontWeight: 700,
        color: "#0F172A",
      }}
    >
      Quarterly Review
    </Text>
    <View
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
      <Text style={{ fontSize: 18, color: "#334155", fit: "shrink" }}>
        1枚のスライドには1つの主張を置き、階層はサイズ、余白、色、配置で表現する。
      </Text>
      <Shape
        shape="rect"
        style={{
          fill: "#2563EB",
          borderRadius: 0.16,
          boxShadow: "3px 3px 8px rgba(15, 23, 42, 0.22)",
        }}
      />
    </View>
    <Text
      style={{
        x: 11.2,
        y: 7,
        width: 1.4,
        height: 0.25,
        fontSize: 9,
        color: "#64748B",
        textAlign: "right",
      }}
    >
      {slideIndex + 1} / {totalSlides}
    </Text>
  </Slide>
));
```

## テスト由来のサンプルパターン

以下はリポジトリ内のテストに基づく、信頼して使いやすい出発点です。

### 複数スライドとページ番号

`tests/deck.test.tsx` に基づくパターンです。

```tsx
const deck = new Deck({
  layout: { width: 10, height: 5.625, unit: "in" },
  meta: { title: "Spec test", author: "deckjsx" },
});

deck.add(({ slideIndex, totalSlides }) => (
  <Slide name={`Slide ${slideIndex + 1}`}>
    <Text style={{ x: 1, y: 1, width: 4, height: 0.5, fontSize: 24 }}>
      {slideIndex + 1} / {totalSlides}
    </Text>
  </Slide>
));
```

### 厳密な absolute レイアウト

PowerPoint らしい正確な配置が必要なときに使います。

```tsx
<Slide name="Absolute">
  <Text style={{ x: 0.75, y: 0.6, width: 8, height: 0.55, fontSize: 26 }}>Executive Summary</Text>
  <View
    style={{
      x: 0.75,
      y: 1.4,
      width: 5.5,
      height: 4.5,
      backgroundColor: "#E0F2FE",
      borderRadius: 0.12,
    }}
  />
</Slide>
```

### stack / flex レイアウト

`tests/layout-stack.test.tsx` に基づくパターンです。

```tsx
<View
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
  <Text style={{ width: 2, height: 0.5, fontSize: 18, order: -1 }}>First</Text>
  <Text style={{ width: 2, height: 0.5, fontSize: 18 }}>Second</Text>
  <Text
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
  </Text>
</View>
```

### grid レイアウト

`tests/layout-grid.test.tsx` に基づくパターンです。

```tsx
<View
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
  <View style={{ gridColumn: "span 2", backgroundColor: "#D1D5DB" }} />
  <View style={{ placeSelf: "start center", width: 1, height: 0.5, backgroundColor: "#CBD5E1" }} />
</View>
```

### 画像の fit / crop / position

`tests/image-values.test.tsx` に基づくパターンです。

```tsx
<Image
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

`tests/background-layers.test.tsx` に基づくパターンです。

```tsx
<Slide
  name="Background"
  style={{
    background:
      `url("${WIDE_SVG_DATA_URI}") no-repeat right bottom / contain, ` +
      "linear-gradient(180deg, #111111 0%, #333333 100%)",
  }}
>
  <View
    style={{
      x: 1,
      y: 1,
      width: 2,
      height: 1,
      background: `url("${SAMPLE_SVG_DATA_URI}") repeat-x left top / contain`,
    }}
  />
</Slide>
```

### グラデーションと影

`tests/gradient-values.test.tsx` と `tests/backend-pptxgenjs.test.tsx` に基づくパターンです。

```tsx
<Slide
  name="Effects"
  style={{
    backgroundImage:
      "radial-gradient(ellipse 20% 30% at 25% 75%, rgba(37, 99, 235, 0.4) 0%, #F97316 100%)",
  }}
>
  <Shape
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
</Slide>
```

### タイポグラフィ、リンク、リスト

`tests/typography-values.test.tsx` と `tests/style-values.test.tsx` に基づくパターンです。

```tsx
<Text
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
</Text>
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

## API メモ

- 公開 component は `Slide`、`View`、`Text`、`Image`、`Shape`。
- `Deck#add()` の callback には `{ slideIndex, totalSlides }` が渡る。
- 幾何値の number は inch、font size の number は point として扱う。
- length 文字列は `"in"`、`"pt"`、`"px"`、`"%"` などを使える。
- CSS 風 alias は `left`、`top`、`display`、`flexDirection`、`objectFit`、`objectPosition`、`background`、`border`、`boxShadow`、`textDecoration`、grid 系 property を優先する。
- `Image` は path 用の `src` と data URI 用の `data` を受け取る。
- `Shape` は現在 `shape="rect"`、`"ellipse"`、`"line"` をサポートする。
- 実装済み backend は `"pptxgenjs"`。`"ooxml"` は将来の backend 名で、現時点で選ぶ出力先ではない。

## テストとレビュー

- compiler behavior を変えるときは、`deck.render()` の IR を検証するテストを追加または更新する。
- backend output を変えるときは、一時 `.pptx` を生成し、必要なら unzip して XML の意味ある markup を検証する。
- Node 専用のファイル書き込みは output/runtime 層に置き、core compiler normalization に混ぜない。
- 生成デッキの見た目がおかしいときは、まず IR の resolved frame を確認する。多くの見た目の問題は backend emission より前の layout や unit normalization にある。

import { describe, expect, test } from "vite-plus/test";
import { transformDeckjsxMediaSourceOrigins } from "../src/media-source-transform.ts";

describe("@deckjsx/node media source transform", () => {
  test("annotates intrinsic media path literals with prop-level source origins", () => {
    const source = [
      'import { Deck } from "deckjsx";',
      "const deck = new Deck({ layout: { width: 10, height: 5.625, unit: 'in' } });",
      'deck.slide({ name: "Media" }, () => <div><img src="./hero.png" /><video src="./clip.mp4" poster="/poster.png" /></div>);',
    ].join("\n");

    const code = transformDeckjsxMediaSourceOrigins(source, "/project/src/deck.tsx");

    expect(code).toContain("authoringMetadata as __deckjsxAuthoringMetadata");
    expect(code).toContain(
      '<img {...__deckjsxAuthoringMetadata({ mediaSourceOrigins: { src: { importer: "/project/src/deck.tsx", source: "./hero.png" } } })} src="./hero.png" />',
    );
    expect(code).toContain(
      '<video {...__deckjsxAuthoringMetadata({ mediaSourceOrigins: { src: { importer: "/project/src/deck.tsx", source: "./clip.mp4" }, poster: { importer: "/project/src/deck.tsx", source: "/poster.png" } } })} src="./clip.mp4" poster="/poster.png" />',
    );
  });

  test("annotates component media props so forwarded props keep source origins", () => {
    const source = [
      "function Card(props: { src: string }) { return <img {...props} />; }",
      'export function Slide() { return <Card src="./card.png" />; }',
    ].join("\n");

    const code = transformDeckjsxMediaSourceOrigins(source, "/project/src/components/CardDeck.tsx");

    expect(code).toContain(
      '<Card {...__deckjsxAuthoringMetadata({ mediaSourceOrigins: { src: { importer: "/project/src/components/CardDeck.tsx", source: "./card.png" } }, componentProvenance: { stack: [{ name: "Card", moduleId: "/project/src/components/CardDeck.tsx", sourceSpan: { file: "/project/src/components/CardDeck.tsx", line: 2, column: 34 } }] } })} src="./card.png" />',
    );
  });

  test("annotates component calls with component provenance even without media props", () => {
    const source = [
      "function MetricCard(props: { title: string }) { return <div>{props.title}</div>; }",
      'export function Slide() { return <MetricCard title="Revenue" />; }',
    ].join("\n");

    const code = transformDeckjsxMediaSourceOrigins(source, "/project/src/slides/Overview.tsx");

    expect(code).toContain(
      '<MetricCard {...__deckjsxAuthoringMetadata({ componentProvenance: { stack: [{ name: "MetricCard", moduleId: "/project/src/slides/Overview.tsx", sourceSpan: { file: "/project/src/slides/Overview.tsx", line: 2, column: 34 } }] } })} title="Revenue" />',
    );
  });

  test("annotates bare relative media paths with importer origins", () => {
    const source = 'export function Slide() { return <img src="chart.png" />; }';

    const code = transformDeckjsxMediaSourceOrigins(source, "/project/src/deck.tsx");

    expect(code).toContain(
      '<img {...__deckjsxAuthoringMetadata({ mediaSourceOrigins: { src: { importer: "/project/src/deck.tsx", source: "chart.png" } } })} src="chart.png" />',
    );
  });

  test("does not annotate media-looking JSX in comments or strings", () => {
    const source = [
      'const example = "<img src=\\"./hero.png\\" />";',
      '// <video src="./clip.mp4" poster="./poster.png" />',
      '/* <Card src="./card.png" /> */',
    ].join("\n");

    const transformed = transformDeckjsxMediaSourceOrigins(source, "/project/src/deck.tsx");

    expect(transformed).toBeUndefined();
  });

  test("does not rewrite TypeScript generic syntax in non-JSX modules", () => {
    const source = [
      "export function identity<T>(value: T): T {",
      "  return value;",
      "}",
      "type Box<T> = { value: T };",
    ].join("\n");

    const transformed = transformDeckjsxMediaSourceOrigins(source, "/project/src/helpers.ts");

    expect(transformed).toBeUndefined();
  });
});

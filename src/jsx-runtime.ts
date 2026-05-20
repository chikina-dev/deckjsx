import type {
  ContentJsxChild,
  DeckJsxIntrinsicElements,
  IntrinsicDivProps,
  IntrinsicImgProps,
  IntrinsicPProps,
  IntrinsicTextTag,
  IntrinsicViewTag,
  JsxNode,
} from "./authoring/index";
import { Fragment, createElement } from "./jsx";

export type JsxKey = string | number | bigint;

type JsxComponent<P, R extends JsxNode> = (props: P) => R;
type JsxProps<P> = P extends { children?: unknown }
  ? Omit<P, "children"> & Partial<Pick<P, "children">>
  : P;

export { Fragment };

export function jsx<P, R extends JsxNode>(
  type: JsxComponent<P, R>,
  props: JsxProps<P> | null,
  key?: JsxKey,
): R;
export function jsx(
  type: IntrinsicViewTag,
  props: JsxProps<IntrinsicDivProps> | null,
  key?: JsxKey,
): JsxNode;
export function jsx(
  type: IntrinsicTextTag,
  props: JsxProps<IntrinsicPProps> | null,
  key?: JsxKey,
): JsxNode;
export function jsx(type: "img", props: IntrinsicImgProps, key?: JsxKey): JsxNode;
export function jsx(type: string, props: Record<string, unknown> | null, key?: JsxKey): never;
export function jsx(type: unknown, props: unknown, _key?: JsxKey): JsxNode {
  return createElement(
    type as (props: { children?: unknown }) => JsxNode,
    props as { children?: unknown } | null,
  );
}

export const jsxs = jsx;

export namespace JSX {
  export type Element = ContentJsxChild;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicAttributes {
    key?: JsxKey;
  }

  export interface IntrinsicElements extends DeckJsxIntrinsicElements {}
}

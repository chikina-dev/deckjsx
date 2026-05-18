import type { ContentJsxChild, JsxNode } from "./authoring/index";
import { Fragment, createElement } from "./jsx";

type JsxComponent<P, R extends JsxNode> = (props: P) => R;
type JsxProps<P> = P extends { children?: unknown }
  ? Omit<P, "children"> & Partial<Pick<P, "children">>
  : P;

export { Fragment };

export function jsx<P, R extends JsxNode>(
  type: JsxComponent<P, R>,
  props: JsxProps<P> | null,
  key?: string,
): R;
export function jsx(type: string, props: Record<string, unknown> | null, key?: string): never;
export function jsx(type: unknown, props: unknown, _key?: string): JsxNode {
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

  export interface IntrinsicElements {}
}

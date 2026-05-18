import type { ContentJsxChild, JsxNode } from "./authoring/index";
import { Fragment, createElement } from "./jsx";

type JsxComponent = (props: { children?: JsxNode } & Record<string, unknown>) => JsxNode;

export { Fragment };

export function jsx(type: JsxComponent, props: Record<string, unknown> | null): JsxNode;
export function jsx(type: string, props: Record<string, unknown> | null): never;
export function jsx(type: unknown, props: Record<string, unknown> | null): JsxNode {
  return createElement(type as JsxComponent, props);
}

export const jsxs = jsx;

export namespace JSX {
  export type Element = ContentJsxChild;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicElements {}
}

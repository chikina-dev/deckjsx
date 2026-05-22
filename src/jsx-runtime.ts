import type {
  DeckJsxIntrinsicElements,
  IntrinsicDivProps,
  IntrinsicImgProps,
  IntrinsicPProps,
  IntrinsicTextTag,
  IntrinsicViewTag,
} from "./authoring/index";
import { Fragment, createElementWithMetadata } from "./jsx";
import type { AuthorTreeNode, JsxKey } from "./authoring/tree";

type JsxComponent<P, R extends AuthorTreeNode> = (props: P) => R;
type JsxProps<P> = P extends { children?: unknown }
  ? Omit<P, "children"> & Partial<Pick<P, "children">>
  : P;

export { Fragment };

export type { JsxKey } from "./authoring/tree";

export function jsx<P, R extends AuthorTreeNode>(
  type: JsxComponent<P, R>,
  props: JsxProps<P> | null,
  key?: JsxKey,
): R;
export function jsx(
  type: IntrinsicViewTag,
  props: JsxProps<IntrinsicDivProps> | null,
  key?: JsxKey,
): AuthorTreeNode;
export function jsx(
  type: IntrinsicTextTag,
  props: JsxProps<IntrinsicPProps> | null,
  key?: JsxKey,
): AuthorTreeNode;
export function jsx(
  type: "span",
  props: JsxProps<IntrinsicPProps> | null,
  key?: JsxKey,
): AuthorTreeNode;
export function jsx(type: "img", props: IntrinsicImgProps, key?: JsxKey): AuthorTreeNode;
export function jsx(type: string, props: Record<string, unknown> | null, key?: JsxKey): never;
export function jsx(type: unknown, props: unknown, key?: JsxKey): AuthorTreeNode {
  return createElementWithMetadata(type, props, key);
}

export const jsxs = jsx;

export namespace JSX {
  export type Element = AuthorTreeNode;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicAttributes {
    key?: JsxKey;
  }

  export interface IntrinsicElements extends DeckJsxIntrinsicElements {
    span: IntrinsicPProps;
  }
}

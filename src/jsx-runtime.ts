import type {
  DeckJsxIntrinsicElements,
  DeckJsxElement,
  IntrinsicDivProps,
  IntrinsicImgProps,
  IntrinsicPProps,
  IntrinsicShapeProps,
  IntrinsicTextTag,
  IntrinsicVideoProps,
  IntrinsicViewTag,
  JsxNode,
} from "./authoring/index";
import { Fragment, createElementWithMetadata } from "./jsx";
import type { JsxKey } from "./authoring/tree";

type JsxComponent<P, R extends DeckJsxElement> = (props: P) => R;
type JsxProps<P> = P extends { children?: JsxNode }
  ? Omit<P, "children"> & Partial<Pick<P, "children">>
  : P;
type JsxComponentProps = {
  readonly children?: JsxNode;
};
type JsxDevSource = {
  readonly fileName?: string;
  readonly lineNumber?: number;
  readonly columnNumber?: number;
};

export { Fragment };

export type { JsxKey } from "./authoring/tree";

export function jsx<P extends JsxComponentProps, R extends DeckJsxElement>(
  type: JsxComponent<P, R>,
  props: JsxProps<P> | null,
  key?: JsxKey,
): R;
export function jsx(
  type: IntrinsicViewTag,
  props: JsxProps<IntrinsicDivProps> | null,
  key?: JsxKey,
): DeckJsxElement;
export function jsx(
  type: IntrinsicTextTag,
  props: JsxProps<IntrinsicPProps> | null,
  key?: JsxKey,
): DeckJsxElement;
export function jsx(
  type: "span",
  props: JsxProps<IntrinsicPProps> | null,
  key?: JsxKey,
): DeckJsxElement;
export function jsx(type: "img", props: IntrinsicImgProps, key?: JsxKey): DeckJsxElement;
export function jsx(type: "video", props: IntrinsicVideoProps, key?: JsxKey): DeckJsxElement;
export function jsx(type: "shape", props: IntrinsicShapeProps, key?: JsxKey): DeckJsxElement;
export function jsx(type: string, props: JsxComponentProps | null, key?: JsxKey): never;
export function jsx(
  type: string | JsxComponent<JsxComponentProps, DeckJsxElement>,
  props: JsxComponentProps | null,
  key?: JsxKey,
): DeckJsxElement {
  return createElementWithMetadata(type, props, key);
}

export const jsxs = jsx;

export type { JsxComponentProps, JsxDevSource };

export namespace JSX {
  export type Element = DeckJsxElement;

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

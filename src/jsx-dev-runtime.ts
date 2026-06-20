import type {
  DeckJsxIntrinsicElements,
  DeckJsxElement,
  IntrinsicDivProps,
  IntrinsicImgProps,
  IntrinsicPProps,
  IntrinsicShapeProps,
  IntrinsicSpanProps,
  IntrinsicTextTag,
  IntrinsicVideoProps,
  IntrinsicViewTag,
  JsxNode,
} from "./authoring/index";
import type { JsxKey, SourceSpan } from "./authoring/tree";
import { createElementWithMetadata } from "./jsx";
import type { JsxComponentProps, JsxDevSource } from "./jsx-runtime";

export { Fragment, jsx, jsxs } from "./jsx-runtime";

type JsxComponent<P, R extends DeckJsxElement> = (props: P) => R;
type JsxProps<P> = P extends { children?: JsxNode }
  ? Omit<P, "children"> & Partial<Pick<P, "children">>
  : P;

function sourceSpanFromDevSource(source: JsxDevSource | undefined): SourceSpan | undefined {
  if (!source) {
    return undefined;
  }

  if (
    source.fileName === undefined &&
    source.lineNumber === undefined &&
    source.columnNumber === undefined
  ) {
    return undefined;
  }

  return {
    file: source.fileName,
    line: source.lineNumber,
    column: source.columnNumber,
  };
}

export function jsxDEV<P extends JsxComponentProps, R extends DeckJsxElement>(
  type: JsxComponent<P, R>,
  props: JsxProps<P> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): R;
export function jsxDEV(
  type: IntrinsicViewTag,
  props: JsxProps<IntrinsicDivProps> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement;
export function jsxDEV(
  type: IntrinsicTextTag,
  props: JsxProps<IntrinsicPProps> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement;
export function jsxDEV(
  type: "span",
  props: JsxProps<IntrinsicSpanProps> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement;
export function jsxDEV(
  type: "img",
  props: IntrinsicImgProps,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement;
export function jsxDEV(
  type: "video",
  props: IntrinsicVideoProps,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement;
export function jsxDEV(
  type: "shape",
  props: IntrinsicShapeProps,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement;
export function jsxDEV(
  type: string,
  props: JsxComponentProps | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): never;
export function jsxDEV(
  type: string | JsxComponent<JsxComponentProps, DeckJsxElement>,
  props: JsxComponentProps | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement {
  return createElementWithMetadata(type, props, key, sourceSpanFromDevSource(source));
}

export namespace JSX {
  export type Element = DeckJsxElement;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicAttributes {
    key?: JsxKey;
  }

  export interface IntrinsicElements extends DeckJsxIntrinsicElements {
    span: IntrinsicSpanProps;
  }
}

import type {
  DeckJsxIntrinsicElements,
  IntrinsicDivProps,
  IntrinsicImgProps,
  IntrinsicPProps,
  IntrinsicShapeProps,
  IntrinsicSpanProps,
  IntrinsicTableCellProps,
  IntrinsicTableProps,
  IntrinsicTableRowProps,
  IntrinsicTableSectionProps,
  IntrinsicTextTag,
  IntrinsicVideoProps,
  IntrinsicViewTag,
} from "./authoring/intrinsic";
import type { DeckJsxElement, DeckJsxElementValue, JsxNode } from "./authoring/jsx-types";
import { Fragment, createElementWithMetadata } from "./jsx";
import type { JsxKey } from "./authoring/tree";

type JsxComponent<P, R extends DeckJsxElement> = (props: P) => R;
type JsxProps<P> = P extends { children?: JsxNode }
  ? Omit<P, "children"> & Partial<Pick<P, "children">>
  : P;
type JsxComponentProps = {
  readonly children?: JsxNode;
};

/**
 * Source location shape accepted by the development JSX runtime.
 *
 * This mirrors the metadata passed by TypeScript/Babel JSX transforms. It is used only for
 * diagnostics and inspection provenance.
 */
type JsxDevSource = {
  readonly fileName?: string;
  readonly lineNumber?: number;
  readonly columnNumber?: number;
};

export { Fragment };

export type { JsxKey } from "./authoring/tree";

/**
 * Create a deckjsx author-tree element from compiled JSX.
 *
 * This function is the automatic JSX runtime entry point for `jsxImportSource: "deckjsx"`. Authors
 * normally write TSX instead of calling it directly. Its overloads are intentionally tag-specific:
 * non-public intrinsic tags, direct style props, invalid children, and wrong style groups are
 * rejected at the public authoring API.
 */
export function jsx<P extends JsxComponentProps, R extends DeckJsxElement>(
  type: JsxComponent<P, R>,
  props: JsxProps<P> | null,
  key?: JsxKey,
): R;
export function jsx<const TTag extends IntrinsicViewTag>(
  type: TTag,
  props: JsxProps<IntrinsicDivProps> | null,
  key?: JsxKey,
): DeckJsxElement<TTag>;
export function jsx<const TTag extends IntrinsicTextTag>(
  type: TTag,
  props: JsxProps<IntrinsicPProps> | null,
  key?: JsxKey,
): DeckJsxElement<TTag>;
export function jsx(
  type: "span",
  props: JsxProps<IntrinsicSpanProps> | null,
  key?: JsxKey,
): DeckJsxElement<"span">;
export function jsx(type: "img", props: IntrinsicImgProps, key?: JsxKey): DeckJsxElement<"img">;
export function jsx(
  type: "video",
  props: IntrinsicVideoProps,
  key?: JsxKey,
): DeckJsxElement<"video">;
export function jsx(
  type: "shape",
  props: IntrinsicShapeProps,
  key?: JsxKey,
): DeckJsxElement<"shape">;
export function jsx(
  type: "table",
  props: JsxProps<IntrinsicTableProps> | null,
  key?: JsxKey,
): DeckJsxElement<"table">;
export function jsx<const TTag extends "thead" | "tbody" | "tfoot">(
  type: TTag,
  props: JsxProps<IntrinsicTableSectionProps> | null,
  key?: JsxKey,
): DeckJsxElement<TTag>;
export function jsx(
  type: "tr",
  props: JsxProps<IntrinsicTableRowProps> | null,
  key?: JsxKey,
): DeckJsxElement<"tr">;
export function jsx<const TTag extends "th" | "td">(
  type: TTag,
  props: JsxProps<IntrinsicTableCellProps> | null,
  key?: JsxKey,
): DeckJsxElement<TTag>;
export function jsx(type: string, props: never, key?: JsxKey): never;
export function jsx(
  type: string | JsxComponent<JsxComponentProps, DeckJsxElement>,
  props: JsxComponentProps | null,
  key?: JsxKey,
): DeckJsxElement {
  return createElementWithMetadata(type, props, key) as unknown as DeckJsxElement;
}

/**
 * Multi-child JSX runtime entry point.
 *
 * deckjsx uses the same typed authoring contract for `jsxs` as `jsx`.
 */
export const jsxs = jsx;

/**
 * Props accepted by deckjsx JSX components.
 *
 * Component authors should prefer explicit prop types. This helper exists for the JSX runtime and
 * keeps custom component children inside deckjsx's author-tree value model.
 */
export type { JsxComponentProps, JsxDevSource };

export namespace JSX {
  export type Element = DeckJsxElementValue;

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

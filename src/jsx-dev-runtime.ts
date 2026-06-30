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

  const file = typeof source.fileName === "string" ? source.fileName : undefined;
  const line = validSourcePosition(source.lineNumber) ? source.lineNumber : undefined;
  const column = validSourcePosition(source.columnNumber) ? source.columnNumber : undefined;

  if (file === undefined && line === undefined && column === undefined) {
    return undefined;
  }

  return {
    ...(file === undefined ? {} : { file }),
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  };
}

function validSourcePosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/**
 * Development JSX runtime entry point.
 *
 * `jsxDEV` accepts the same public authoring props, children, and style contracts as `jsx`, then
 * attaches optional source metadata from the JSX transform for diagnostics and inspection. Source
 * metadata does not change layout, style resolution, or projection output.
 */
export function jsxDEV<P extends JsxComponentProps, R extends DeckJsxElement>(
  type: JsxComponent<P, R>,
  props: JsxProps<P> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): R;
export function jsxDEV<const TTag extends IntrinsicViewTag>(
  type: TTag,
  props: JsxProps<IntrinsicDivProps> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement<TTag>;
export function jsxDEV<const TTag extends IntrinsicTextTag>(
  type: TTag,
  props: JsxProps<IntrinsicPProps> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement<TTag>;
export function jsxDEV(
  type: "span",
  props: JsxProps<IntrinsicSpanProps> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement<"span">;
export function jsxDEV(
  type: "img",
  props: IntrinsicImgProps,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement<"img">;
export function jsxDEV(
  type: "video",
  props: IntrinsicVideoProps,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement<"video">;
export function jsxDEV(
  type: "shape",
  props: IntrinsicShapeProps,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement<"shape">;
export function jsxDEV(
  type: "table",
  props: JsxProps<IntrinsicTableProps> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement<"table">;
export function jsxDEV<const TTag extends "thead" | "tbody" | "tfoot">(
  type: TTag,
  props: JsxProps<IntrinsicTableSectionProps> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement<TTag>;
export function jsxDEV(
  type: "tr",
  props: JsxProps<IntrinsicTableRowProps> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement<"tr">;
export function jsxDEV<const TTag extends "th" | "td">(
  type: TTag,
  props: JsxProps<IntrinsicTableCellProps> | null,
  key?: JsxKey,
  _isStaticChildren?: boolean,
  source?: JsxDevSource,
): DeckJsxElement<TTag>;
export function jsxDEV(
  type: string,
  props: never,
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
  return createElementWithMetadata(
    type,
    props,
    key,
    sourceSpanFromDevSource(source),
  ) as unknown as DeckJsxElement;
}

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

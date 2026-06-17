import {
  createAuthorElement,
  createAuthorFragment,
  type AuthorElementPropValue,
  type AuthorElementProps,
  type AuthorTreeChild,
  type AuthorTreeNode,
  type JsxKey,
  type SourceSpan,
  authorElementPropsFromEntries,
  authorTreeChildrenFromUnknown,
  collectChildren,
  isAuthorTreeNode,
} from "./authoring/tree";
import { MEDIA_SOURCE_ORIGINS, type MediaSourceOriginByField } from "./media-source-origin";
import {
  isAuthoredTag,
  isIntrinsicTableTag,
  isIntrinsicTextTag,
  isIntrinsicViewTag,
  type IntrinsicTableTag,
  type IntrinsicTextTag,
  type IntrinsicViewTag,
} from "./authoring/tags";
import type {
  DeckJsxElement,
  IntrinsicDivProps,
  IntrinsicImgProps,
  IntrinsicPProps,
  IntrinsicSpanProps,
  IntrinsicShapeProps,
  IntrinsicTableCellProps,
  IntrinsicTableProps,
  IntrinsicTableRowProps,
  IntrinsicTableSectionProps,
  IntrinsicVideoProps,
  JsxNode,
  ShapeNodeProps,
  ImageNodeProps,
  TableCellNodeProps,
  TableNodeProps,
  TableRowNodeProps,
  TableSectionNodeProps,
  TextNodeProps,
  TextRunNodeProps,
  VideoNodeProps,
  ViewNodeProps,
} from "./authoring/index";

type ComponentProps = {
  children?: AuthorTreeChild;
};
type RuntimeProps = Readonly<Record<string, AuthorElementPropValue | AuthorTreeChild>> & {
  readonly children?: AuthorTreeChild;
  readonly [MEDIA_SOURCE_ORIGINS]?: MediaSourceOriginByField;
};
type ElementChildren<P> = P extends { children?: infer Child } ? Child : never;
type ElementChildArgs<P> = P extends { children?: never } ? [] : ElementChildren<P>[];

function isRecord(value: unknown): value is RuntimeProps {
  return typeof value === "object" && value !== null;
}

function propsRecordWithoutChildren<TProps extends AuthorElementProps>(
  props: RuntimeProps,
): TProps {
  return authorElementPropsFromEntries<TProps>(
    Object.entries(props).filter(([key]) => key !== "children"),
  );
}

function splitProps<TProps extends AuthorElementProps>(
  props: RuntimeProps,
  children: readonly AuthorTreeChild[],
) {
  const rawChildren = collectChildren(props, children);
  return {
    props: propsRecordWithoutChildren<TProps>(props),
    children: rawChildren === undefined ? [] : [rawChildren],
    mediaSourceOrigins: props[MEDIA_SOURCE_ORIGINS],
  };
}

function authorMetadata(input: {
  readonly key?: JsxKey;
  readonly sourceSpan?: SourceSpan;
  readonly mediaSourceOrigins?: MediaSourceOriginByField;
}) {
  return {
    ...(input.key !== undefined ? { key: input.key } : {}),
    ...(input.sourceSpan ? { sourceSpan: input.sourceSpan } : {}),
    ...(input.mediaSourceOrigins ? { mediaSourceOrigins: input.mediaSourceOrigins } : {}),
  };
}

function intrinsicElement(
  type:
    | IntrinsicViewTag
    | IntrinsicTextTag
    | IntrinsicTableTag
    | "img"
    | "shape"
    | "span"
    | "video",
  propsObject: RuntimeProps,
  children: AuthorTreeChild[],
  key?: JsxKey,
  sourceSpan?: SourceSpan,
): AuthorTreeNode {
  if (isIntrinsicViewTag(type)) {
    const authored = splitProps<ViewNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({ key, sourceSpan, mediaSourceOrigins: authored.mediaSourceOrigins }),
    });
  }

  if (isIntrinsicTextTag(type)) {
    const authored = splitProps<TextNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({ key, sourceSpan, mediaSourceOrigins: authored.mediaSourceOrigins }),
    });
  }

  if (type === "span") {
    const authored = splitProps<TextRunNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({ key, sourceSpan, mediaSourceOrigins: authored.mediaSourceOrigins }),
    });
  }

  if (type === "table") {
    const authored = splitProps<TableNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({ key, sourceSpan, mediaSourceOrigins: authored.mediaSourceOrigins }),
    });
  }

  if (type === "thead" || type === "tbody" || type === "tfoot") {
    const authored = splitProps<TableSectionNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({ key, sourceSpan, mediaSourceOrigins: authored.mediaSourceOrigins }),
    });
  }

  if (type === "tr") {
    const authored = splitProps<TableRowNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({ key, sourceSpan, mediaSourceOrigins: authored.mediaSourceOrigins }),
    });
  }

  if (type === "th" || type === "td") {
    const authored = splitProps<TableCellNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({ key, sourceSpan, mediaSourceOrigins: authored.mediaSourceOrigins }),
    });
  }

  if (type === "img") {
    const authored = splitProps<ImageNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({ key, sourceSpan, mediaSourceOrigins: authored.mediaSourceOrigins }),
    });
  }

  if (type === "video") {
    const authored = splitProps<VideoNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({ key, sourceSpan, mediaSourceOrigins: authored.mediaSourceOrigins }),
    });
  }

  const authored = splitProps<ShapeNodeProps>(propsObject, children);
  return createAuthorElement({
    source: { kind: "tag", tag: type },
    props: authored.props,
    children: authored.children,
    ...authorMetadata({ key, sourceSpan, mediaSourceOrigins: authored.mediaSourceOrigins }),
  });
}

export function createElement<P extends { children?: JsxNode }, R extends AuthorTreeNode>(
  type: (props: P) => R,
  props: (Omit<P, "children"> & Partial<Pick<P, "children">>) | null,
  ...children: ElementChildArgs<P>
): R;
export function createElement(
  type: IntrinsicViewTag,
  props:
    | (Omit<IntrinsicDivProps, "children"> & Partial<Pick<IntrinsicDivProps, "children">>)
    | null,
  ...children: ElementChildArgs<IntrinsicDivProps>
): AuthorTreeNode;
export function createElement(
  type: IntrinsicTextTag,
  props: (Omit<IntrinsicPProps, "children"> & Partial<Pick<IntrinsicPProps, "children">>) | null,
  ...children: ElementChildArgs<IntrinsicPProps>
): AuthorTreeNode;
export function createElement(
  type: "span",
  props:
    | (Omit<IntrinsicSpanProps, "children"> & Partial<Pick<IntrinsicSpanProps, "children">>)
    | null,
  ...children: ElementChildArgs<IntrinsicSpanProps>
): AuthorTreeNode;
export function createElement(
  type: "table",
  props:
    | (Omit<IntrinsicTableProps, "children"> & Partial<Pick<IntrinsicTableProps, "children">>)
    | null,
  ...children: ElementChildArgs<IntrinsicTableProps>
): AuthorTreeNode;
export function createElement(
  type: "thead" | "tbody" | "tfoot",
  props:
    | (Omit<IntrinsicTableSectionProps, "children"> &
        Partial<Pick<IntrinsicTableSectionProps, "children">>)
    | null,
  ...children: ElementChildArgs<IntrinsicTableSectionProps>
): AuthorTreeNode;
export function createElement(
  type: "tr",
  props:
    | (Omit<IntrinsicTableRowProps, "children"> & Partial<Pick<IntrinsicTableRowProps, "children">>)
    | null,
  ...children: ElementChildArgs<IntrinsicTableRowProps>
): AuthorTreeNode;
export function createElement(
  type: "th" | "td",
  props:
    | (Omit<IntrinsicTableCellProps, "children"> &
        Partial<Pick<IntrinsicTableCellProps, "children">>)
    | null,
  ...children: ElementChildArgs<IntrinsicTableCellProps>
): AuthorTreeNode;
export function createElement(type: "img", props: IntrinsicImgProps): AuthorTreeNode;
export function createElement(type: "video", props: IntrinsicVideoProps): AuthorTreeNode;
export function createElement(type: "shape", props: IntrinsicShapeProps): AuthorTreeNode;
export function createElement(type: string, props: ComponentProps | null): never;
export function createElement(
  type: unknown,
  props: unknown,
  ...children: unknown[]
): AuthorTreeNode {
  return createElementWithMetadata(
    type,
    props,
    undefined,
    undefined,
    authorTreeChildrenFromUnknown(children),
  );
}

export function createElementWithMetadata(
  type: unknown,
  props: unknown,
  key?: JsxKey,
  sourceSpan?: SourceSpan,
  children: AuthorTreeChild[] = [],
): AuthorTreeNode {
  if (typeof type === "string") {
    if (
      isIntrinsicViewTag(type) ||
      isIntrinsicTextTag(type) ||
      isIntrinsicTableTag(type) ||
      type === "img" ||
      type === "shape" ||
      type === "span" ||
      type === "video"
    ) {
      return intrinsicElement(type, isRecord(props) ? props : {}, children, key, sourceSpan);
    }

    if (!isAuthoredTag(type)) {
      throw new Error(`Intrinsic element is not supported: <${type}>.`);
    }
  }

  if (typeof type !== "function") {
    throw new Error("JSX element type must be a function component.");
  }

  if (type === Fragment) {
    const propsObject = isRecord(props) ? props : {};
    const rawChildren = collectChildren(propsObject, children);
    return createAuthorFragment({
      children: rawChildren === undefined ? [] : [rawChildren],
      ...(key !== undefined ? { key } : {}),
      ...(sourceSpan ? { sourceSpan } : {}),
    });
  }

  const propsObject = isRecord(props) ? props : {};
  const rawChildren = collectChildren(propsObject, children);
  const nextProps: ComponentProps = {
    ...propsObject,
    children: rawChildren,
  };
  const result = type(nextProps);

  if (!isAuthorTreeNode(result)) {
    throw new Error("Function components must return a deckjsx author tree node.");
  }

  if (key === undefined && sourceSpan === undefined) {
    return result;
  }

  if (result.kind === "element") {
    return {
      ...result,
      ...(key !== undefined ? { key } : {}),
      ...(sourceSpan ? { sourceSpan } : {}),
    };
  }

  return result;
}

export function Fragment(props: { children?: JsxNode }): DeckJsxElement {
  return createAuthorFragment({
    children: props.children === undefined ? [] : authorTreeChildrenFromUnknown([props.children]),
  });
}

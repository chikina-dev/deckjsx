import {
  createAuthorElement,
  createAuthorFragment,
  type AuthorElementPropValue,
  type AuthorElementProps,
  type AuthorTableCellElementNode,
  type AuthorTableElementNode,
  type AuthorTableRowElementNode,
  type AuthorTableSectionElementNode,
  type AuthorTreeChild,
  type AuthorTreeNode,
  type JsxKey,
  type SourceSpan,
  authorElementPropsFromEntries,
  authorTreeChildrenFromUnknown,
  collectChildren,
  isAuthorTreeNode,
} from "./authoring/tree";
import {
  AUTHORING_METADATA,
  type AuthoringMetadata,
  type ComponentFrame,
  type ComponentProvenance,
} from "./authoring-metadata";
import { observeAuthoringComponentInvocation } from "./authoring-runtime-observer";
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
import type { DeckJsxElement, JsxNode } from "./authoring/jsx-types";
import type {
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
} from "./authoring/intrinsic";
import type {
  ImageNodeProps,
  ShapeNodeProps,
  TableCellNodeProps,
  TableNodeProps,
  TableRowNodeProps,
  TableSectionNodeProps,
  TextNodeProps,
  TextRunNodeProps,
  VideoNodeProps,
  ViewNodeProps,
} from "./authoring/props";

type ComponentProps = {
  children?: AuthorTreeChild;
};
type RuntimeProps = Readonly<Record<string, AuthorElementPropValue | AuthorTreeChild>> & {
  readonly children?: AuthorTreeChild;
  readonly [AUTHORING_METADATA]?: AuthoringMetadata;
  readonly [MEDIA_SOURCE_ORIGINS]?: MediaSourceOriginByField;
};
type ElementChildren<P> = P extends { children?: infer Child } ? Child : never;
type ElementChildArgs<P> = P extends { children?: never } ? [] : ElementChildren<P>[];
interface StrictTableElementChildArray extends ReadonlyArray<StrictTableElementChild> {}
type StrictTableElementChild =
  | AuthorTableSectionElementNode
  | AuthorTableRowElementNode
  | boolean
  | null
  | undefined
  | StrictTableElementChildArray;
interface StrictTableSectionElementChildArray extends ReadonlyArray<StrictTableSectionElementChild> {}
type StrictTableSectionElementChild =
  | AuthorTableRowElementNode
  | boolean
  | null
  | undefined
  | StrictTableSectionElementChildArray;
interface StrictTableRowElementChildArray extends ReadonlyArray<StrictTableRowElementChild> {}
type StrictTableRowElementChild =
  | AuthorTableCellElementNode
  | boolean
  | null
  | undefined
  | StrictTableRowElementChildArray;
type StrictCreateElementTableProps = Omit<IntrinsicTableProps, "children"> & {
  children?: StrictTableElementChild;
};
type StrictCreateElementTableSectionProps = Omit<IntrinsicTableSectionProps, "children"> & {
  children?: StrictTableSectionElementChild;
};
type StrictCreateElementTableRowProps = Omit<IntrinsicTableRowProps, "children"> & {
  children?: StrictTableRowElementChild;
};

let activeComponentStack: readonly ComponentFrame[] = [];

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
  const metadata = props[AUTHORING_METADATA];
  const rawChildren = collectChildren(props, children);
  return {
    props: propsRecordWithoutChildren<TProps>(props),
    children: rawChildren === undefined ? [] : [rawChildren],
    mediaSourceOrigins: metadata?.mediaSourceOrigins ?? props[MEDIA_SOURCE_ORIGINS],
    componentProvenance: metadata?.componentProvenance ?? currentComponentProvenance(),
  };
}

function authorMetadata(input: {
  readonly key?: JsxKey;
  readonly sourceSpan?: SourceSpan;
  readonly mediaSourceOrigins?: MediaSourceOriginByField;
  readonly componentProvenance?: ComponentProvenance;
}) {
  return {
    ...(input.key !== undefined ? { key: input.key } : {}),
    ...(input.sourceSpan ? { sourceSpan: input.sourceSpan } : {}),
    ...(input.mediaSourceOrigins ? { mediaSourceOrigins: input.mediaSourceOrigins } : {}),
    ...(input.componentProvenance ? { componentProvenance: input.componentProvenance } : {}),
  };
}

function currentComponentProvenance(): ComponentProvenance | undefined {
  return activeComponentStack.length > 0 ? { stack: activeComponentStack } : undefined;
}

function componentNameFor(type: Function): string {
  const displayName = (type as { readonly displayName?: unknown }).displayName;
  return typeof displayName === "string" && displayName.length > 0
    ? displayName
    : type.name || "Anonymous";
}

function componentFrameFor(
  type: Function,
  key: JsxKey | undefined,
  sourceSpan: SourceSpan | undefined,
): ComponentFrame {
  return {
    name: componentNameFor(type),
    ...(sourceSpan ? { sourceSpan } : {}),
    ...(key !== undefined ? { key } : {}),
  };
}

function mergeComponentProvenance(
  current: ComponentProvenance | undefined,
  additional: ComponentProvenance | undefined,
): ComponentProvenance | undefined {
  const stack = [...(additional?.stack ?? []), ...(current?.stack ?? [])];
  return stack.length > 0 ? { stack } : undefined;
}

function propsObjectForRuntime(props: unknown): RuntimeProps {
  if (props === null || props === undefined) {
    return {};
  }

  if (!isRecord(props) || Array.isArray(props)) {
    throw new Error("JSX props must be a plain object or null.");
  }

  const prototype = Object.getPrototypeOf(props);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("JSX props must be a plain object or null.");
  }

  return props;
}

function keyForRuntime(key: JsxKey | undefined): JsxKey | undefined {
  if (key === undefined || typeof key === "string" || typeof key === "bigint") {
    return key;
  }

  if (typeof key === "number") {
    if (Number.isFinite(key)) {
      return key;
    }

    throw new Error("JSX numeric key must be finite.");
  }

  throw new Error("JSX key must be a string, number, or bigint.");
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
  const runtimeKey = keyForRuntime(key);
  if (isIntrinsicViewTag(type)) {
    const authored = splitProps<ViewNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({
        key: runtimeKey,
        sourceSpan,
        mediaSourceOrigins: authored.mediaSourceOrigins,
        componentProvenance: authored.componentProvenance,
      }),
    });
  }

  if (isIntrinsicTextTag(type)) {
    const authored = splitProps<TextNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({
        key: runtimeKey,
        sourceSpan,
        mediaSourceOrigins: authored.mediaSourceOrigins,
        componentProvenance: authored.componentProvenance,
      }),
    });
  }

  if (type === "span") {
    const authored = splitProps<TextRunNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({
        key: runtimeKey,
        sourceSpan,
        mediaSourceOrigins: authored.mediaSourceOrigins,
        componentProvenance: authored.componentProvenance,
      }),
    });
  }

  if (type === "table") {
    const authored = splitProps<TableNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({
        key: runtimeKey,
        sourceSpan,
        mediaSourceOrigins: authored.mediaSourceOrigins,
        componentProvenance: authored.componentProvenance,
      }),
    });
  }

  if (type === "thead" || type === "tbody" || type === "tfoot") {
    const authored = splitProps<TableSectionNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({
        key: runtimeKey,
        sourceSpan,
        mediaSourceOrigins: authored.mediaSourceOrigins,
        componentProvenance: authored.componentProvenance,
      }),
    });
  }

  if (type === "tr") {
    const authored = splitProps<TableRowNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({
        key: runtimeKey,
        sourceSpan,
        mediaSourceOrigins: authored.mediaSourceOrigins,
        componentProvenance: authored.componentProvenance,
      }),
    });
  }

  if (type === "th" || type === "td") {
    const authored = splitProps<TableCellNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({
        key: runtimeKey,
        sourceSpan,
        mediaSourceOrigins: authored.mediaSourceOrigins,
        componentProvenance: authored.componentProvenance,
      }),
    });
  }

  if (type === "img") {
    const authored = splitProps<ImageNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({
        key: runtimeKey,
        sourceSpan,
        mediaSourceOrigins: authored.mediaSourceOrigins,
        componentProvenance: authored.componentProvenance,
      }),
    });
  }

  if (type === "video") {
    const authored = splitProps<VideoNodeProps>(propsObject, children);
    return createAuthorElement({
      source: { kind: "tag", tag: type },
      props: authored.props,
      children: authored.children,
      ...authorMetadata({
        key: runtimeKey,
        sourceSpan,
        mediaSourceOrigins: authored.mediaSourceOrigins,
        componentProvenance: authored.componentProvenance,
      }),
    });
  }

  const authored = splitProps<ShapeNodeProps>(propsObject, children);
  return createAuthorElement({
    source: { kind: "tag", tag: type },
    props: authored.props,
    children: authored.children,
    ...authorMetadata({
      key: runtimeKey,
      sourceSpan,
      mediaSourceOrigins: authored.mediaSourceOrigins,
      componentProvenance: authored.componentProvenance,
    }),
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
    | (Omit<StrictCreateElementTableProps, "children"> &
        Partial<Pick<StrictCreateElementTableProps, "children">>)
    | null,
  ...children: ElementChildArgs<StrictCreateElementTableProps>
): AuthorTableElementNode;
export function createElement(
  type: "thead" | "tbody" | "tfoot",
  props:
    | (Omit<StrictCreateElementTableSectionProps, "children"> &
        Partial<Pick<StrictCreateElementTableSectionProps, "children">>)
    | null,
  ...children: ElementChildArgs<StrictCreateElementTableSectionProps>
): AuthorTableSectionElementNode;
export function createElement(
  type: "tr",
  props:
    | (Omit<StrictCreateElementTableRowProps, "children"> &
        Partial<Pick<StrictCreateElementTableRowProps, "children">>)
    | null,
  ...children: ElementChildArgs<StrictCreateElementTableRowProps>
): AuthorTableRowElementNode;
export function createElement(
  type: "th" | "td",
  props:
    | (Omit<IntrinsicTableCellProps, "children"> &
        Partial<Pick<IntrinsicTableCellProps, "children">>)
    | null,
  ...children: ElementChildArgs<IntrinsicTableCellProps>
): AuthorTableCellElementNode;
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
  const runtimeKey = keyForRuntime(key);
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
      return intrinsicElement(type, propsObjectForRuntime(props), children, runtimeKey, sourceSpan);
    }

    if (!isAuthoredTag(type)) {
      throw new Error(`Intrinsic element is not part of the public authoring API: <${type}>.`);
    }
  }

  if (typeof type !== "function") {
    throw new Error("JSX element type must be a function component.");
  }

  if (type === Fragment) {
    const propsObject = propsObjectForRuntime(props);
    const rawChildren = collectChildren(propsObject, children);
    return createAuthorFragment({
      children: rawChildren === undefined ? [] : [rawChildren],
      ...(runtimeKey !== undefined ? { key: runtimeKey } : {}),
      ...(sourceSpan ? { sourceSpan } : {}),
    });
  }

  const propsObject = propsObjectForRuntime(props);
  const rawChildren = collectChildren(propsObject, children);
  const nextProps: ComponentProps = {
    ...propsObject,
    children: rawChildren,
  };
  const injectedComponentProvenance = propsObject[AUTHORING_METADATA]?.componentProvenance;
  const componentFrame = componentFrameFor(type, runtimeKey, sourceSpan);
  const observerStack = componentStackForInvocation({
    type,
    key: runtimeKey,
    sourceSpan,
    injectedComponentProvenance,
  });
  const observerFrame = observerStack.at(-1)!;
  observeAuthoringComponentInvocation({
    name: observerFrame.name,
    ...(observerFrame.key !== undefined ? { key: observerFrame.key } : {}),
    ...(observerFrame.sourceSpan ? { sourceSpan: observerFrame.sourceSpan } : {}),
    stack: observerStack,
    props: nextProps,
  });
  const previousStack = activeComponentStack;
  activeComponentStack = [...activeComponentStack, componentFrame];
  let result: AuthorTreeNode;
  try {
    result = type(nextProps);
  } finally {
    activeComponentStack = previousStack;
  }

  if (!isAuthorTreeNode(result)) {
    throw new Error("Function components must return a deckjsx author tree node.");
  }

  if (runtimeKey === undefined && !injectedComponentProvenance) {
    return result;
  }

  if (result.kind === "element") {
    const componentProvenance = mergeComponentProvenance(
      result.componentProvenance,
      injectedComponentProvenance,
    );
    return {
      ...result,
      ...(runtimeKey !== undefined ? { key: runtimeKey } : {}),
      ...(componentProvenance ? { componentProvenance } : {}),
    };
  }

  return result;
}

function componentStackForInvocation(input: {
  readonly type: Function;
  readonly key: JsxKey | undefined;
  readonly sourceSpan: SourceSpan | undefined;
  readonly injectedComponentProvenance: ComponentProvenance | undefined;
}): readonly ComponentFrame[] {
  const injectedStack = input.injectedComponentProvenance?.stack;
  return [
    ...activeComponentStack,
    ...(injectedStack && injectedStack.length > 0
      ? injectedStack
      : [componentFrameFor(input.type, input.key, input.sourceSpan)]),
  ];
}

export function Fragment(props: { children?: JsxNode }): DeckJsxElement {
  return createAuthorFragment({
    children: props.children === undefined ? [] : authorTreeChildrenFromUnknown([props.children]),
  }) as unknown as DeckJsxElement;
}

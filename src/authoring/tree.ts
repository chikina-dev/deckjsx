import { isIntrinsicTableTag, isIntrinsicTextTag, isIntrinsicViewTag } from "./tags";
import type { AuthoredTag, IntrinsicTextTag, IntrinsicViewTag } from "./tags";
import type {
  ImageNodeProps,
  ShapeNodeProps,
  SlideNodeProps,
  TableCellNodeProps,
  TableNodeProps,
  TableRowNodeProps,
  TableSectionNodeProps,
  TextNodeProps,
  TextRunNodeProps,
  VideoNodeProps,
  ViewNodeProps,
} from "./props";

export type JsxKey = string | number | bigint;

export type SourceSpan = {
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
};

export type AuthorElementSource =
  | {
      readonly kind: "tag";
      readonly tag: AuthoredTag;
    }
  | { readonly kind: "slide" };

type AuthorElementNodeBase<
  TSource extends AuthorElementSource,
  TProps extends AuthorElementProps,
> = {
  readonly $$typeof: "deckjsx.author-tree";
  readonly kind: "element";
  readonly source: TSource;
  readonly key?: JsxKey;
  readonly props: TProps;
  readonly children: readonly AuthorTreeNode[];
  readonly sourceSpan?: SourceSpan;
};

export type AuthorElementPropValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly AuthorElementPropValue[]
  | { readonly [key: string]: AuthorElementPropValue };

export type AuthorElementProps = Readonly<Record<string, AuthorElementPropValue>>;

export type AuthorSlideElementNode = AuthorElementNodeBase<
  { readonly kind: "slide" },
  SlideNodeProps
>;
export type AuthorViewElementNode = AuthorElementNodeBase<
  { readonly kind: "tag"; readonly tag: IntrinsicViewTag },
  ViewNodeProps
>;
export type AuthorTextElementNode = AuthorElementNodeBase<
  { readonly kind: "tag"; readonly tag: IntrinsicTextTag },
  TextNodeProps
>;
export type AuthorSpanElementNode = AuthorElementNodeBase<
  { readonly kind: "tag"; readonly tag: "span" },
  TextRunNodeProps
>;
export type AuthorImageElementNode = AuthorElementNodeBase<
  { readonly kind: "tag"; readonly tag: "img" },
  ImageNodeProps
>;
export type AuthorVideoElementNode = AuthorElementNodeBase<
  { readonly kind: "tag"; readonly tag: "video" },
  VideoNodeProps
>;
export type AuthorShapeElementNode = AuthorElementNodeBase<
  { readonly kind: "tag"; readonly tag: "shape" },
  ShapeNodeProps
>;
export type AuthorTableElementNode = AuthorElementNodeBase<
  { readonly kind: "tag"; readonly tag: "table" },
  TableNodeProps
>;
export type AuthorTableSectionElementNode = AuthorElementNodeBase<
  { readonly kind: "tag"; readonly tag: "thead" | "tbody" | "tfoot" },
  TableSectionNodeProps
>;
export type AuthorTableRowElementNode = AuthorElementNodeBase<
  { readonly kind: "tag"; readonly tag: "tr" },
  TableRowNodeProps
>;
export type AuthorTableCellElementNode = AuthorElementNodeBase<
  { readonly kind: "tag"; readonly tag: "th" | "td" },
  TableCellNodeProps
>;

export type AuthorElementNode =
  | AuthorSlideElementNode
  | AuthorViewElementNode
  | AuthorTextElementNode
  | AuthorSpanElementNode
  | AuthorImageElementNode
  | AuthorVideoElementNode
  | AuthorShapeElementNode
  | AuthorTableElementNode
  | AuthorTableSectionElementNode
  | AuthorTableRowElementNode
  | AuthorTableCellElementNode;

export type AuthorFragmentNode = {
  readonly $$typeof: "deckjsx.author-tree";
  readonly kind: "fragment";
  readonly key?: JsxKey;
  readonly children: readonly AuthorTreeNode[];
  readonly sourceSpan?: SourceSpan;
};

export type AuthorTextLeaf = {
  readonly $$typeof: "deckjsx.author-tree";
  readonly kind: "text";
  readonly value: string | number;
  readonly sourceSpan?: SourceSpan;
};

export type AuthorTreeNode = AuthorElementNode | AuthorFragmentNode | AuthorTextLeaf;
export type AuthorTreeChild =
  | AuthorTreeNode
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly AuthorTreeChild[];

function isRecord(value: unknown): value is Record<PropertyKey, AuthorElementPropValue> {
  return typeof value === "object" && value !== null;
}

export function isAuthorElementPropValue(value: unknown): value is AuthorElementPropValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isAuthorElementPropValue);
  }

  if (typeof value !== "object" || isAuthorTreeNode(value)) {
    return false;
  }

  return Object.values(value).every(isAuthorElementPropValue);
}

export function authorElementPropsFromEntries<
  TProps extends AuthorElementProps = AuthorElementProps,
>(entries: Iterable<readonly [string, unknown]>): TProps {
  const props: Record<string, AuthorElementPropValue> = {};
  for (const [key, value] of entries) {
    if (!isAuthorElementPropValue(value)) {
      throw new Error(`JSX prop "${key}" must be serializable authoring data.`);
    }

    props[key] = value;
  }

  return props as TProps;
}

export function createAuthorText(value: string | number, sourceSpan?: SourceSpan): AuthorTextLeaf {
  return {
    $$typeof: "deckjsx.author-tree",
    kind: "text",
    value,
    ...(sourceSpan ? { sourceSpan } : {}),
  };
}

type AuthorElementInput<TNode extends AuthorElementNode> = {
  source: TNode["source"];
  props?: TNode["props"];
  children?: readonly AuthorTreeChild[];
  key?: JsxKey;
  sourceSpan?: SourceSpan;
};

type RequiredAuthorElementInput<TNode extends AuthorElementNode> = Omit<
  AuthorElementInput<TNode>,
  "props"
> & {
  props: TNode["props"];
};

type AnyAuthorElementInput =
  | AuthorElementInput<AuthorSlideElementNode>
  | AuthorElementInput<AuthorViewElementNode>
  | AuthorElementInput<AuthorTextElementNode>
  | AuthorElementInput<AuthorSpanElementNode>
  | AuthorElementInput<AuthorTableElementNode>
  | AuthorElementInput<AuthorTableSectionElementNode>
  | AuthorElementInput<AuthorTableRowElementNode>
  | AuthorElementInput<AuthorTableCellElementNode>
  | RequiredAuthorElementInput<AuthorImageElementNode>
  | RequiredAuthorElementInput<AuthorVideoElementNode>
  | RequiredAuthorElementInput<AuthorShapeElementNode>;

function buildAuthorElement<
  TSource extends AuthorElementSource,
  TProps extends AuthorElementProps,
>(input: {
  source: TSource;
  props: TProps;
  children?: readonly AuthorTreeChild[];
  key?: JsxKey;
  sourceSpan?: SourceSpan;
}): AuthorElementNodeBase<TSource, TProps> {
  return {
    $$typeof: "deckjsx.author-tree",
    kind: "element",
    source: input.source,
    ...(input.key !== undefined ? { key: input.key } : {}),
    props: input.props,
    children: normalizeAuthorChildren(input.children ?? []),
    ...(input.sourceSpan ? { sourceSpan: input.sourceSpan } : {}),
  };
}

function isSlideElementInput(
  input: AnyAuthorElementInput,
): input is AuthorElementInput<AuthorSlideElementNode> {
  return input.source.kind === "slide";
}

function isViewElementInput(
  input: AnyAuthorElementInput,
): input is AuthorElementInput<AuthorViewElementNode> {
  return input.source.kind === "tag" && isIntrinsicViewTag(input.source.tag);
}

function isTextElementInput(
  input: AnyAuthorElementInput,
): input is AuthorElementInput<AuthorTextElementNode> {
  return input.source.kind === "tag" && isIntrinsicTextTag(input.source.tag);
}

function isSpanElementInput(
  input: AnyAuthorElementInput,
): input is AuthorElementInput<AuthorSpanElementNode> {
  return input.source.kind === "tag" && input.source.tag === "span";
}

function isImageElementInput(
  input: AnyAuthorElementInput,
): input is RequiredAuthorElementInput<AuthorImageElementNode> {
  return input.source.kind === "tag" && input.source.tag === "img";
}

function isVideoElementInput(
  input: AnyAuthorElementInput,
): input is RequiredAuthorElementInput<AuthorVideoElementNode> {
  return input.source.kind === "tag" && input.source.tag === "video";
}

function isShapeElementInput(
  input: AnyAuthorElementInput,
): input is RequiredAuthorElementInput<AuthorShapeElementNode> {
  return input.source.kind === "tag" && input.source.tag === "shape";
}

function isTableElementInput(
  input: AnyAuthorElementInput,
): input is AuthorElementInput<AuthorTableElementNode> {
  return input.source.kind === "tag" && input.source.tag === "table";
}

function isTableSectionElementInput(
  input: AnyAuthorElementInput,
): input is AuthorElementInput<AuthorTableSectionElementNode> {
  return (
    input.source.kind === "tag" &&
    (input.source.tag === "thead" || input.source.tag === "tbody" || input.source.tag === "tfoot")
  );
}

function isTableRowElementInput(
  input: AnyAuthorElementInput,
): input is AuthorElementInput<AuthorTableRowElementNode> {
  return input.source.kind === "tag" && input.source.tag === "tr";
}

function isTableCellElementInput(
  input: AnyAuthorElementInput,
): input is AuthorElementInput<AuthorTableCellElementNode> {
  return (
    input.source.kind === "tag" &&
    isIntrinsicTableTag(input.source.tag) &&
    (input.source.tag === "th" || input.source.tag === "td")
  );
}

export function createAuthorElement(
  input: AuthorElementInput<AuthorSlideElementNode>,
): AuthorSlideElementNode;
export function createAuthorElement(
  input: AuthorElementInput<AuthorViewElementNode>,
): AuthorViewElementNode;
export function createAuthorElement(
  input: AuthorElementInput<AuthorTextElementNode>,
): AuthorTextElementNode;
export function createAuthorElement(
  input: AuthorElementInput<AuthorSpanElementNode>,
): AuthorSpanElementNode;
export function createAuthorElement(
  input: RequiredAuthorElementInput<AuthorImageElementNode>,
): AuthorImageElementNode;
export function createAuthorElement(
  input: RequiredAuthorElementInput<AuthorVideoElementNode>,
): AuthorVideoElementNode;
export function createAuthorElement(
  input: RequiredAuthorElementInput<AuthorShapeElementNode>,
): AuthorShapeElementNode;
export function createAuthorElement(
  input: AuthorElementInput<AuthorTableElementNode>,
): AuthorTableElementNode;
export function createAuthorElement(
  input: AuthorElementInput<AuthorTableSectionElementNode>,
): AuthorTableSectionElementNode;
export function createAuthorElement(
  input: AuthorElementInput<AuthorTableRowElementNode>,
): AuthorTableRowElementNode;
export function createAuthorElement(
  input: AuthorElementInput<AuthorTableCellElementNode>,
): AuthorTableCellElementNode;
export function createAuthorElement(input: AnyAuthorElementInput): AuthorElementNode {
  if (isSlideElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props ?? {},
    });
  }

  if (isViewElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props ?? {},
    });
  }

  if (isTextElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props ?? {},
    });
  }

  if (isSpanElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props ?? {},
    });
  }

  if (isImageElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props,
    });
  }

  if (isVideoElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props,
    });
  }

  if (isShapeElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props,
    });
  }

  if (isTableElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props ?? {},
    });
  }

  if (isTableSectionElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props ?? {},
    });
  }

  if (isTableRowElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props ?? {},
    });
  }

  if (isTableCellElementInput(input)) {
    return buildAuthorElement({
      ...input,
      source: input.source,
      props: input.props ?? {},
    });
  }

  throw new Error("Unsupported author element source.");
}

export function createAuthorFragment(input: {
  children?: readonly AuthorTreeChild[];
  key?: JsxKey;
  sourceSpan?: SourceSpan;
}): AuthorFragmentNode {
  return {
    $$typeof: "deckjsx.author-tree",
    kind: "fragment",
    ...(input.key !== undefined ? { key: input.key } : {}),
    children: normalizeAuthorChildren(input.children ?? []),
    ...(input.sourceSpan ? { sourceSpan: input.sourceSpan } : {}),
  };
}

export function isAuthorTreeNode(value: unknown): value is AuthorTreeNode {
  return isRecord(value) && value.$$typeof === "deckjsx.author-tree";
}

export function isAuthorTreeChild(value: unknown): value is AuthorTreeChild {
  return (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    typeof value === "number" ||
    isAuthorTreeNode(value) ||
    (Array.isArray(value) && value.every(isAuthorTreeChild))
  );
}

export function authorTreeChildrenFromUnknown(children: readonly unknown[]): AuthorTreeChild[] {
  return children.map((child) => {
    if (!isAuthorTreeChild(child)) {
      throw new Error("JSX children must be deckjsx author tree nodes or primitive text values.");
    }

    return child;
  });
}

export function normalizeAuthorChildren(children: readonly AuthorTreeChild[]): AuthorTreeNode[] {
  return children.flatMap((child): AuthorTreeNode[] => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return [];
    }

    if (typeof child === "string" || typeof child === "number") {
      return [createAuthorText(child)];
    }

    if (Array.isArray(child)) {
      return normalizeAuthorChildren(child);
    }

    if (isAuthorTreeNode(child)) {
      return [child];
    }

    throw new Error("JSX children must be deckjsx author tree nodes or primitive text values.");
  });
}

export function collectChildren(
  propsObject: { readonly children?: AuthorTreeChild },
  children: readonly AuthorTreeChild[],
): AuthorTreeChild {
  if (children.length === 0) {
    return propsObject.children;
  }

  if (children.length === 1) {
    return children[0];
  }

  return children;
}

import type { AuthoredComponent, AuthoredTag } from "./tags";

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
  | {
      readonly kind: "component";
      readonly component: AuthoredComponent;
    };

export type AuthorElementNode = {
  readonly $$typeof: "deckjsx.author-tree";
  readonly kind: "element";
  readonly source: AuthorElementSource;
  readonly key?: JsxKey;
  readonly props: Record<string, unknown>;
  readonly children: readonly AuthorTreeNode[];
  readonly sourceSpan?: SourceSpan;
};

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

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

export function createAuthorText(value: string | number, sourceSpan?: SourceSpan): AuthorTextLeaf {
  return {
    $$typeof: "deckjsx.author-tree",
    kind: "text",
    value,
    ...(sourceSpan ? { sourceSpan } : {}),
  };
}

export function createAuthorElement(input: {
  source: AuthorElementSource;
  props?: Record<string, unknown>;
  children?: readonly AuthorTreeChild[];
  key?: JsxKey;
  sourceSpan?: SourceSpan;
}): AuthorElementNode {
  return {
    $$typeof: "deckjsx.author-tree",
    kind: "element",
    source: input.source,
    ...(input.key !== undefined ? { key: input.key } : {}),
    props: input.props ?? {},
    children: normalizeAuthorChildren(input.children ?? []),
    ...(input.sourceSpan ? { sourceSpan: input.sourceSpan } : {}),
  };
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
  propsObject: Record<PropertyKey, unknown>,
  children: readonly unknown[],
): unknown {
  if (children.length === 0) {
    return propsObject.children;
  }

  if (children.length === 1) {
    return children[0];
  }

  return children;
}

import { Image, Shape, Slide, Text, View } from "./authoring/components";
import {
  createAuthorElement,
  createAuthorFragment,
  type AuthorTreeChild,
  type AuthorTreeNode,
  type JsxKey,
  type SourceSpan,
  collectChildren,
  isAuthorTreeNode,
} from "./authoring/tree";
import {
  isAuthoredTag,
  isIntrinsicTextTag,
  isIntrinsicViewTag,
  type IntrinsicTextTag,
  type IntrinsicViewTag,
} from "./authoring/tags";
import { isLegacyAuthorNode } from "./authoring/legacy";
import type {
  AuthorNode,
  AuthorNodeKind,
  ContentAuthorNode,
  IntrinsicDivProps,
  IntrinsicImgProps,
  IntrinsicPProps,
} from "./authoring/index";

type ComponentProps = {
  children?: AuthorTreeChild;
};
type ElementChildren<P> = P extends { children?: infer Child } ? Child : never;
type ElementChildArgs<P> = P extends { children?: never } ? [] : ElementChildren<P>[];

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function splitProps(props: Record<PropertyKey, unknown>, children: readonly unknown[]) {
  const rawChildren = collectChildren(props, children);
  const { children: _children, ...nodeProps } = props;
  return {
    props: nodeProps as Record<string, unknown>,
    children: rawChildren === undefined ? [] : [rawChildren as AuthorTreeChild],
  };
}

function intrinsicElement(
  type: IntrinsicViewTag | IntrinsicTextTag | "img" | "span",
  propsObject: Record<PropertyKey, unknown>,
  children: unknown[],
  key?: JsxKey,
  sourceSpan?: SourceSpan,
): AuthorTreeNode {
  const authored = splitProps(propsObject, children);
  return createAuthorElement({
    source: { kind: "tag", tag: type },
    props: authored.props,
    children: authored.children,
    ...(key !== undefined ? { key } : {}),
    ...(sourceSpan ? { sourceSpan } : {}),
  });
}

export function createElement<P extends { children?: unknown }, R extends AuthorTreeNode>(
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
export function createElement(type: "span", props: IntrinsicPProps | null): AuthorTreeNode;
export function createElement(type: "img", props: IntrinsicImgProps): AuthorTreeNode;
export function createElement(type: string, props: ComponentProps | null): never;
export function createElement(
  type: unknown,
  props: unknown,
  ...children: unknown[]
): AuthorTreeNode {
  return createElementWithMetadata(type, props, undefined, undefined, children);
}

export function createElementWithMetadata(
  type: unknown,
  props: unknown,
  key?: JsxKey,
  sourceSpan?: SourceSpan,
  children: unknown[] = [],
): AuthorTreeNode {
  if (typeof type === "string") {
    if (isIntrinsicViewTag(type) || isIntrinsicTextTag(type) || type === "img" || type === "span") {
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
      children: rawChildren === undefined ? [] : [rawChildren as AuthorTreeChild],
      ...(key !== undefined ? { key } : {}),
      ...(sourceSpan ? { sourceSpan } : {}),
    });
  }

  const propsObject = isRecord(props) ? props : {};
  const rawChildren = collectChildren(propsObject, children);
  const nextProps: ComponentProps = {
    ...propsObject,
    children: rawChildren as AuthorTreeChild,
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

export function Fragment(_props: { children?: AuthorTreeChild }): AuthorTreeNode {
  return createAuthorFragment({});
}

function isAuthorNodeKind(value: unknown): value is AuthorNodeKind {
  return (
    value === "slide" ||
    value === "view" ||
    value === "text" ||
    value === "image" ||
    value === "shape"
  );
}

export function isAuthorNode(value: unknown): value is AuthorNode {
  if (!isLegacyAuthorNode(value)) {
    return false;
  }

  return isAuthorNodeKind((value as { kind?: unknown }).kind);
}

export function isSlideNode(value: unknown): value is AuthorNode<"slide"> {
  return isAuthorNode(value) && value.kind === "slide";
}

export function isContentNode(value: unknown): value is ContentAuthorNode {
  return isAuthorNode(value) && value.kind !== "slide";
}

export { Image, Shape, Slide, Text, View };
export type { AuthorTreeNode, JsxKey, SourceSpan };

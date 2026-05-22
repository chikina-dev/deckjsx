import type {
  AuthorNode,
  AuthorNodeKind,
  ContentJsxChild,
  ImageNodeProps,
  ShapeNodeProps,
  SlideNodeProps,
  TextJsxChild,
  TextNodeProps,
  ViewNodeProps,
} from "./index";
import { type AuthorElementNode, type AuthorTreeNode, isAuthorTreeNode } from "./tree";
import { isIntrinsicTextTag, isIntrinsicViewTag } from "./tags";

type LegacyChild = AuthorNode | string | number | boolean | null | undefined | LegacyChild[];

function textFromPrimitive(value: string | number): AuthorNode<"text"> | null {
  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }

  const text = typeof value === "string" && /[\n\r\t]/.test(value) ? value.trim() : String(value);
  if (text.length === 0) {
    return null;
  }

  return legacyNode("text", {}, [text]);
}

function legacyNode<K extends AuthorNodeKind>(
  kind: K,
  props: AuthorNode<K>["props"],
  children: AuthorNode<K>["children"],
): AuthorNode<K> {
  return {
    $$typeof: "deckjsx.author-node",
    kind,
    props,
    children,
  } as AuthorNode<K>;
}

function elementKind(node: AuthorElementNode): AuthorNodeKind {
  if (node.source.kind === "component") {
    switch (node.source.component) {
      case "Slide":
        return "slide";
      case "View":
        return "view";
      case "Text":
        return "text";
      case "Image":
        return "image";
      case "Shape":
        return "shape";
    }
  }

  if (isIntrinsicViewTag(node.source.tag)) {
    return "view";
  }

  if (isIntrinsicTextTag(node.source.tag) || node.source.tag === "span") {
    return "text";
  }

  return "image";
}

function convertChildrenFor(
  kind: AuthorNodeKind,
  children: readonly AuthorTreeNode[],
): LegacyChild[] {
  const converted: LegacyChild[] = [];

  for (const child of children) {
    if (child.kind === "fragment") {
      converted.push(...convertChildrenFor(kind, child.children));
      continue;
    }

    if (child.kind === "text") {
      if (kind === "view" || kind === "slide") {
        const textNode = textFromPrimitive(child.value);
        if (textNode) {
          converted.push(textNode);
        }
        continue;
      }

      converted.push(child.value);
      continue;
    }

    converted.push(toLegacyAuthorNode(child));
  }

  return converted;
}

export function toLegacyAuthorNode(node: AuthorElementNode): AuthorNode {
  const kind = elementKind(node);
  const props = node.props;

  switch (kind) {
    case "slide":
      return legacyNode(
        "slide",
        props as SlideNodeProps,
        convertChildrenFor(kind, node.children) as ContentJsxChild[],
      );
    case "view":
      return legacyNode(
        "view",
        props as ViewNodeProps,
        convertChildrenFor(kind, node.children) as ContentJsxChild[],
      );
    case "text":
      return legacyNode(
        "text",
        props as TextNodeProps,
        convertChildrenFor(kind, node.children) as TextJsxChild[],
      );
    case "image":
      return legacyNode("image", props as ImageNodeProps, []);
    case "shape":
      return legacyNode("shape", props as ShapeNodeProps, []);
  }
}

export function toLegacyJsxNode(value: unknown): ContentJsxChild | AuthorNode<"slide"> {
  if (isLegacyAuthorNode(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toLegacyJsxNode(item)) as ContentJsxChild;
  }

  if (!isAuthorTreeNode(value)) {
    return value as ContentJsxChild;
  }

  if (value.kind === "fragment") {
    return value.children.map((child) => toLegacyJsxNode(child)) as ContentJsxChild;
  }

  if (value.kind === "text") {
    return value.value as unknown as ContentJsxChild;
  }

  return toLegacyAuthorNode(value);
}

export function isLegacyAuthorNode(value: unknown): value is AuthorNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "$$typeof" in value &&
    (value as { $$typeof?: unknown }).$$typeof === "deckjsx.author-node"
  );
}

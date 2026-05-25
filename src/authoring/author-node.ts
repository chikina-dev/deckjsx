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
import { isIntrinsicTextTag, isIntrinsicViewTag } from "./tags";
import { type AuthorElementNode, type AuthorTreeNode, isAuthorTreeNode } from "./tree";

type AuthorNodeChild =
  | AuthorNode
  | string
  | number
  | boolean
  | null
  | undefined
  | AuthorNodeChild[];

function textFromPrimitive(value: string | number): AuthorNode<"text"> | null {
  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }

  const text = typeof value === "string" && /[\n\r\t]/.test(value) ? value.trim() : String(value);
  if (text.length === 0) {
    return null;
  }

  return authorNode("text", {}, [text]);
}

function authorNode<K extends AuthorNodeKind>(
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
): AuthorNodeChild[] {
  const converted: AuthorNodeChild[] = [];

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

    converted.push(toAuthorNode(child));
  }

  return converted;
}

export function toAuthorNode(node: AuthorElementNode): AuthorNode {
  const kind = elementKind(node);
  const props = node.props;

  switch (kind) {
    case "slide":
      return authorNode(
        "slide",
        props as SlideNodeProps,
        convertChildrenFor(kind, node.children) as ContentJsxChild[],
      );
    case "view":
      return authorNode(
        "view",
        props as ViewNodeProps,
        convertChildrenFor(kind, node.children) as ContentJsxChild[],
      );
    case "text":
      return authorNode(
        "text",
        props as TextNodeProps,
        convertChildrenFor(kind, node.children) as TextJsxChild[],
      );
    case "image":
      return authorNode("image", props as ImageNodeProps, []);
    case "shape":
      return authorNode("shape", props as ShapeNodeProps, []);
  }
}

export function toAuthorJsxNode(value: unknown): ContentJsxChild | AuthorNode<"slide"> {
  if (isAuthorNodeValue(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toAuthorJsxNode(item)) as ContentJsxChild;
  }

  if (!isAuthorTreeNode(value)) {
    return value as ContentJsxChild;
  }

  if (value.kind === "fragment") {
    return value.children.map((child) => toAuthorJsxNode(child)) as ContentJsxChild;
  }

  if (value.kind === "text") {
    return value.value as unknown as ContentJsxChild;
  }

  return toAuthorNode(value);
}

export function isAuthorNodeValue(value: unknown): value is AuthorNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "$$typeof" in value &&
    (value as { $$typeof?: unknown }).$$typeof === "deckjsx.author-node"
  );
}

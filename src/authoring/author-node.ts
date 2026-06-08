import type {
  AuthorNode,
  ContentJsxChild,
  ImageNodeProps,
  ShapeNodeProps,
  SlideNodeProps,
  TextJsxChild,
  TextNodeProps,
  ViewNodeProps,
} from "./index";
import { isIntrinsicTextTag, isIntrinsicViewTag } from "./tags";
import {
  type AuthorElementNode,
  type AuthorImageElementNode,
  type AuthorShapeElementNode,
  type AuthorSlideElementNode,
  type AuthorSpanElementNode,
  type AuthorTextElementNode,
  type AuthorTreeNode,
  type AuthorViewElementNode,
  isAuthorTreeNode,
} from "./tree";

function textAuthorNode(
  props: TextNodeProps,
  children: readonly TextJsxChild[],
): AuthorNode<"text"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "text",
    props,
    children,
  };
}

function textFromPrimitive(value: string | number): AuthorNode<"text"> | null {
  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }

  const text = typeof value === "string" && /[\n\r\t]/.test(value) ? value.trim() : String(value);
  if (text.length === 0) {
    return null;
  }

  return textAuthorNode({}, [text]);
}

function convertContentChildren(children: readonly AuthorTreeNode[]): ContentJsxChild[] {
  const converted: ContentJsxChild[] = [];

  for (const child of children) {
    if (child.kind === "fragment") {
      converted.push(...convertContentChildren(child.children));
      continue;
    }

    if (child.kind === "text") {
      const textNode = textFromPrimitive(child.value);
      if (textNode) {
        converted.push(textNode);
      }
      continue;
    }

    converted.push(toAuthorNode(child));
  }

  return converted;
}

function convertTextChildren(children: readonly AuthorTreeNode[]): TextJsxChild[] {
  const converted: TextJsxChild[] = [];

  for (const child of children) {
    if (child.kind === "fragment") {
      converted.push(...convertTextChildren(child.children));
      continue;
    }

    if (child.kind === "text") {
      converted.push(child.value);
      continue;
    }

    const node = toAuthorNode(child);
    if (node.kind === "text") {
      converted.push(node);
    }
  }

  return converted;
}

function slideAuthorNode(
  props: SlideNodeProps,
  children: readonly ContentJsxChild[],
): AuthorNode<"slide"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "slide",
    props,
    children,
  };
}

function viewAuthorNode(
  props: ViewNodeProps,
  children: readonly ContentJsxChild[],
): AuthorNode<"view"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "view",
    props,
    children,
  };
}

function imageAuthorNode(props: ImageNodeProps): AuthorNode<"image"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "image",
    props,
    children: [],
  };
}

function shapeAuthorNode(props: ShapeNodeProps): AuthorNode<"shape"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "shape",
    props,
    children: [],
  };
}

function isSlideElement(node: AuthorElementNode): node is AuthorSlideElementNode {
  return node.source.kind === "slide";
}

function isViewElement(node: AuthorElementNode): node is AuthorViewElementNode {
  return node.source.kind === "tag" && isIntrinsicViewTag(node.source.tag);
}

function isTextElement(node: AuthorElementNode): node is AuthorTextElementNode {
  return node.source.kind === "tag" && isIntrinsicTextTag(node.source.tag);
}

function isSpanElement(node: AuthorElementNode): node is AuthorSpanElementNode {
  return node.source.kind === "tag" && node.source.tag === "span";
}

function isImageElement(node: AuthorElementNode): node is AuthorImageElementNode {
  return node.source.kind === "tag" && node.source.tag === "img";
}

function isShapeElement(node: AuthorElementNode): node is AuthorShapeElementNode {
  return node.source.kind === "tag" && node.source.tag === "shape";
}

export function toAuthorNode(node: AuthorElementNode): AuthorNode {
  if (isSlideElement(node)) {
    return slideAuthorNode(node.props, convertContentChildren(node.children));
  }

  if (isViewElement(node)) {
    return viewAuthorNode(node.props, convertContentChildren(node.children));
  }

  if (isTextElement(node)) {
    return textAuthorNode(node.props, convertTextChildren(node.children));
  }

  if (isSpanElement(node)) {
    return textAuthorNode(node.props, convertTextChildren(node.children));
  }

  if (isImageElement(node)) {
    return imageAuthorNode(node.props);
  }

  if (isShapeElement(node)) {
    return shapeAuthorNode(node.props);
  }

  throw new Error("Unsupported author element node.");
}

export function toAuthorJsxNode(value: unknown): ContentJsxChild {
  if (isAuthorNodeValue(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toAuthorJsxNode(item));
  }

  if (!isAuthorTreeNode(value)) {
    if (typeof value === "string" || typeof value === "number") {
      return textFromPrimitive(value) ?? undefined;
    }

    if (value === null || value === undefined || typeof value === "boolean") {
      return value;
    }

    throw new Error("JSX content must be deckjsx author tree nodes or primitive text values.");
  }

  if (value.kind === "fragment") {
    return value.children.map((child) => toAuthorJsxNode(child));
  }

  if (value.kind === "text") {
    return textFromPrimitive(value.value) ?? undefined;
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

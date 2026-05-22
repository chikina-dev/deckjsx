import type { ImageProps, ShapeProps, SlideProps, TextProps, ViewProps } from "./index";
import { createAuthorElement, type AuthorElementNode, type AuthorTreeChild } from "./tree";

function splitChildren(props: Record<string, unknown>): {
  props: Record<string, unknown>;
  children: readonly AuthorTreeChild[];
} {
  const { children, ...nodeProps } = props;
  return {
    props: nodeProps,
    children: children === undefined ? [] : [children as AuthorTreeChild],
  };
}

function leafProps(props: Record<string, unknown>): Record<string, unknown> {
  const { children: _children, ...nodeProps } = props;
  return nodeProps;
}

export function Slide(props: SlideProps): AuthorElementNode {
  const authored = splitChildren(props as Record<string, unknown>);
  return createAuthorElement({
    source: { kind: "component", component: "Slide" },
    props: authored.props,
    children: authored.children,
  });
}

export function View(props: ViewProps): AuthorElementNode {
  const authored = splitChildren(props as Record<string, unknown>);
  return createAuthorElement({
    source: { kind: "component", component: "View" },
    props: authored.props,
    children: authored.children,
  });
}

export function Text(props: TextProps): AuthorElementNode {
  const authored = splitChildren(props as Record<string, unknown>);
  return createAuthorElement({
    source: { kind: "component", component: "Text" },
    props: authored.props,
    children: authored.children,
  });
}

export function Image(props: ImageProps): AuthorElementNode {
  return createAuthorElement({
    source: { kind: "component", component: "Image" },
    props: leafProps(props as Record<string, unknown>),
  });
}

export function Shape(props: ShapeProps): AuthorElementNode {
  return createAuthorElement({
    source: { kind: "component", component: "Shape" },
    props: leafProps(props as Record<string, unknown>),
  });
}

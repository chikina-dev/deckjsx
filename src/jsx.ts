import type {
  AuthorNode,
  AuthorNodeKind,
  AuthorNodeMap,
  AuthorNodeProps,
  ContentAuthorNode,
  ContentJsxChild,
  ImageProps,
  JsxNode,
  ShapeProps,
  SlideProps,
  TextProps,
  ViewProps,
} from "./authoring/index.js";

type ComponentProps = {
  children?: JsxNode;
};
type ElementChildren<P> = P extends { children?: infer Child } ? Child : never;
type ElementChildArgs<P> = P extends { children?: never } ? [] : ElementChildren<P>[];

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function isJsxNode(value: unknown): value is JsxNode {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    isAuthorNode(value) ||
    (Array.isArray(value) && value.every((item) => isJsxNode(item)))
  );
}

function requireJsxNode(value: unknown): JsxNode {
  if (isJsxNode(value)) {
    return value;
  }

  throw new Error("JSX children must be deckjsx nodes or primitive text values.");
}

function flattenChildren(input: JsxNode): JsxNode[] {
  if (Array.isArray(input)) {
    return input.flatMap((item) => flattenChildren(item));
  }

  return [input];
}

function authorNode<K extends AuthorNodeKind>(kind: K, props: AuthorNodeMap[K]): AuthorNode<K> {
  const { children: rawChildren, ...nodeProps } = props;
  const children = rawChildren === undefined ? [] : flattenChildren(rawChildren);
  const authoredProps = nodeProps as AuthorNodeProps<K>;

  return {
    $$typeof: "deckjsx.author-node",
    kind,
    props: authoredProps,
    children,
  };
}

export function createElement<P extends { children?: unknown }, R extends JsxNode>(
  type: (props: P) => R,
  props: (Omit<P, "children"> & Partial<Pick<P, "children">>) | null,
  ...children: ElementChildArgs<P>
): R;
export function createElement(type: string, props: ComponentProps | null): never;
export function createElement(type: unknown, props: unknown, ...children: unknown[]): JsxNode {
  if (typeof type === "string") {
    throw new Error(`Intrinsic elements are not supported: <${type}>.`);
  }

  if (typeof type !== "function") {
    throw new Error("JSX element type must be a function component.");
  }

  const propsObject = isRecord(props) ? props : {};
  const nextProps: ComponentProps = {
    ...propsObject,
    children:
      children.length === 0
        ? requireJsxNode(propsObject.children)
        : children.length === 1
          ? requireJsxNode(children[0])
          : children.map((child) => requireJsxNode(child)),
  };

  return type(nextProps);
}

export function Fragment(props: { children?: ContentJsxChild }): ContentJsxChild {
  return props.children ?? null;
}

export function Slide(props: SlideProps): AuthorNode<"slide"> {
  return authorNode("slide", props);
}

export function View(props: ViewProps): AuthorNode<"view"> {
  return authorNode("view", props);
}

export function Text(props: TextProps): AuthorNode<"text"> {
  return authorNode("text", props);
}

export function Image(props: ImageProps): AuthorNode<"image"> {
  return authorNode("image", props);
}

export function Shape(props: ShapeProps): AuthorNode<"shape"> {
  return authorNode("shape", props);
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
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.$$typeof === "deckjsx.author-node" &&
    isAuthorNodeKind(value.kind) &&
    isRecord(value.props) &&
    Array.isArray(value.children)
  );
}

export function isSlideNode(value: unknown): value is AuthorNode<"slide"> {
  return isAuthorNode(value) && value.kind === "slide";
}

export function isContentNode(value: unknown): value is ContentAuthorNode {
  return isAuthorNode(value) && value.kind !== "slide";
}

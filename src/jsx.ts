import type {
  AuthorNode,
  AuthorNodeKind,
  ContentAuthorNode,
  ContentJsxChild,
  ImageAuthorNode,
  ImageProps,
  IntrinsicDivProps,
  IntrinsicImgProps,
  IntrinsicPProps,
  IntrinsicTextTag,
  IntrinsicViewTag,
  JsxNode,
  ShapeAuthorNode,
  ShapeProps,
  SlideAuthorNode,
  SlideProps,
  TextAuthorNode,
  TextJsxChild,
  TextProps,
  ViewAuthorNode,
  ViewIntrinsicJsxChild,
  ViewProps,
} from "./authoring/index";

type ComponentProps = {
  children?: JsxNode;
};
type ElementChildren<P> = P extends { children?: infer Child } ? Child : never;
type ElementChildArgs<P> = P extends { children?: never } ? [] : ElementChildren<P>[];

const VIEW_INTRINSIC_TAGS = new Set<string>([
  "article",
  "aside",
  "div",
  "figure",
  "footer",
  "header",
  "main",
  "nav",
  "section",
]);
const TEXT_INTRINSIC_TAGS = new Set<string>(["h1", "h2", "h3", "h4", "h5", "h6", "p"]);

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function isViewIntrinsicTag(value: string): value is IntrinsicViewTag {
  return VIEW_INTRINSIC_TAGS.has(value);
}

function isTextIntrinsicTag(value: string): value is IntrinsicTextTag {
  return TEXT_INTRINSIC_TAGS.has(value);
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

function isTextJsxNode(value: unknown): value is TextJsxChild {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => isTextJsxNode(item)))
  );
}

function requireJsxNode(value: unknown): JsxNode {
  if (isJsxNode(value)) {
    return value;
  }

  throw new Error("JSX children must be deckjsx nodes or primitive text values.");
}

function requireTextJsxNode(value: unknown): TextJsxChild {
  if (isTextJsxNode(value)) {
    return value;
  }

  throw new Error("Text-like intrinsic children must be primitive text values.");
}

function flattenChildren(input: ContentJsxChild): ContentJsxChild[];
function flattenChildren(input: TextJsxChild): TextJsxChild[];
function flattenChildren(input: ViewIntrinsicJsxChild): ViewIntrinsicJsxChild[];
function flattenChildren(input: JsxNode): JsxNode[];
function flattenChildren(input: JsxNode): JsxNode[] {
  if (Array.isArray(input)) {
    return input.flatMap((item) => flattenChildren(item));
  }

  return [input];
}

function splitContentProps<P extends { children?: ContentJsxChild }>(
  props: P,
): {
  props: Omit<P, "children">;
  children: ContentJsxChild[];
} {
  const { children: rawChildren, ...nodeProps } = props;

  return {
    props: nodeProps,
    children: rawChildren === undefined ? [] : flattenChildren(rawChildren),
  };
}

function splitTextProps<P extends { children?: TextJsxChild }>(
  props: P,
): {
  props: Omit<P, "children">;
  children: TextJsxChild[];
} {
  const { children: rawChildren, ...nodeProps } = props;

  return {
    props: nodeProps,
    children: rawChildren === undefined ? [] : flattenChildren(rawChildren),
  };
}

function splitLeafProps<P extends { children?: never }>(props: P): Omit<P, "children"> {
  const { children: _rawChildren, ...nodeProps } = props;

  return nodeProps;
}

function collectRawChildren(propsObject: Record<PropertyKey, unknown>, children: unknown[]) {
  if (children.length === 0) {
    return propsObject.children;
  }

  if (children.length === 1) {
    return children[0];
  }

  return children;
}

function implicitTextNode(value: string | number): AuthorNode<"text"> | null {
  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }

  const text = typeof value === "string" && /[\n\r\t]/.test(value) ? value.trim() : String(value);
  if (text.length === 0) {
    return null;
  }

  return Text({ children: text });
}

function normalizeViewIntrinsicChildren(value: ViewIntrinsicJsxChild | undefined): ContentJsxChild {
  if (value === undefined) {
    return undefined;
  }

  return flattenChildren(value).map((child) => {
    if (typeof child === "string" || typeof child === "number") {
      return implicitTextNode(child);
    }

    return child;
  }) as ContentJsxChild;
}

function intrinsicElement(
  type: IntrinsicViewTag | IntrinsicTextTag | "img",
  propsObject: Record<PropertyKey, unknown>,
  children: unknown[],
) {
  const rawChildren = collectRawChildren(propsObject, children);
  const { children: _children, ...nodeProps } = propsObject;

  if (isViewIntrinsicTag(type)) {
    const viewChildren = requireJsxNode(rawChildren) as ViewIntrinsicJsxChild | undefined;
    return View({
      ...nodeProps,
      children: normalizeViewIntrinsicChildren(viewChildren),
    } as ViewProps);
  }

  if (isTextIntrinsicTag(type)) {
    return Text({
      ...nodeProps,
      children: requireTextJsxNode(rawChildren),
    } as IntrinsicPProps);
  }

  if (rawChildren !== undefined) {
    throw new Error("<img> is a leaf element and does not accept children.");
  }

  if (typeof propsObject.src !== "string" && typeof propsObject.data !== "string") {
    throw new Error("<img> requires either src or data.");
  }

  return Image(nodeProps as IntrinsicImgProps);
}

export function createElement<P extends { children?: unknown }, R extends JsxNode>(
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
): AuthorNode<"view">;
export function createElement(
  type: IntrinsicTextTag,
  props: (Omit<IntrinsicPProps, "children"> & Partial<Pick<IntrinsicPProps, "children">>) | null,
  ...children: ElementChildArgs<IntrinsicPProps>
): AuthorNode<"text">;
export function createElement(type: "img", props: IntrinsicImgProps): AuthorNode<"image">;
export function createElement(type: string, props: ComponentProps | null): never;
export function createElement(type: unknown, props: unknown, ...children: unknown[]): JsxNode {
  if (typeof type === "string") {
    if (isViewIntrinsicTag(type) || isTextIntrinsicTag(type) || type === "img") {
      return intrinsicElement(type, isRecord(props) ? props : {}, children);
    }

    throw new Error(`Intrinsic element is not supported: <${type}>.`);
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
  const authored = splitContentProps(props);

  return {
    $$typeof: "deckjsx.author-node",
    kind: "slide",
    props: authored.props,
    children: authored.children,
  } satisfies SlideAuthorNode;
}

export function View(props: ViewProps): AuthorNode<"view"> {
  const authored = splitContentProps(props);

  return {
    $$typeof: "deckjsx.author-node",
    kind: "view",
    props: authored.props,
    children: authored.children,
  } satisfies ViewAuthorNode;
}

export function Text(props: TextProps): AuthorNode<"text"> {
  const authored = splitTextProps(props);

  return {
    $$typeof: "deckjsx.author-node",
    kind: "text",
    props: authored.props,
    children: authored.children,
  } satisfies TextAuthorNode;
}

export function Image(props: ImageProps): AuthorNode<"image"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "image",
    props: splitLeafProps(props) as ImageProps,
    children: [],
  } satisfies ImageAuthorNode;
}

export function Shape(props: ShapeProps): AuthorNode<"shape"> {
  return {
    $$typeof: "deckjsx.author-node",
    kind: "shape",
    props: splitLeafProps(props),
    children: [],
  } satisfies ShapeAuthorNode;
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

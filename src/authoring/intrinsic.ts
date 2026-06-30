import type { DeckJsxElement } from "./jsx-types";
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
import type { JsxKey } from "./tree";

/** Recursive children accepted by block text elements. Only text and inline `span` runs are valid. */
export interface TextJsxChildArray extends ReadonlyArray<TextJsxChild> {}

/**
 * Public child contract for text-like elements such as `p`, `h1`, and `h2`.
 *
 * Text blocks accept primitive text, booleans/nullish values for conditional authoring, arrays, and
 * inline `span` runs. View, media, shape, and table elements are not public text children.
 */
export type TextJsxChild =
  | DeckJsxElement<"span">
  | string
  | number
  | boolean
  | null
  | undefined
  | TextJsxChildArray;

/** Recursive children accepted by authored element containers after JSX normalization. */
export interface ContentJsxChildArray extends ReadonlyArray<ContentJsxChild> {}

/** Authored elements that may appear as block/view content. Inline `span` is text-only. */
export type ContentJsxElement = DeckJsxElement<
  IntrinsicViewTag | IntrinsicTextTag | "img" | "shape" | "table" | "video"
>;

/** Public child contract for generic authored content containers. */
export type ContentJsxChild = ContentJsxElement | boolean | null | undefined | ContentJsxChildArray;

/** Recursive children accepted by view-like intrinsic elements. */
export interface ViewIntrinsicJsxChildArray extends ReadonlyArray<ViewIntrinsicJsxChild> {}

/**
 * Public child contract for view-like elements.
 *
 * View elements accept authored elements only. Put primitive text inside text-like elements such as
 * `p` or `h1` so typography, flow, and diagnostics stay attached to an explicit text box. Media and
 * shape elements expose `children?: never` through their intrinsic props.
 */
export type ViewIntrinsicJsxChild = ContentJsxChild | ViewIntrinsicJsxChildArray;

export type SlideProps = SlideNodeProps & {
  children?: ContentJsxChild;
};

export type ViewProps = ViewNodeProps & {
  children?: ViewIntrinsicJsxChild;
};

export type TextProps = TextNodeProps & {
  children?: TextJsxChild;
};

export type ImageProps = ImageNodeProps & {
  children?: never;
};

export type VideoProps = VideoNodeProps & {
  children?: never;
};

export type ShapeProps = ShapeNodeProps & {
  children?: never;
};

type IntrinsicKeyProps = {
  key?: JsxKey;
};

/** Props accepted by view-like intrinsic tags such as `div`, `main`, and `section`. */
export type IntrinsicDivProps = ViewNodeProps &
  IntrinsicKeyProps & {
    children?: ViewIntrinsicJsxChild;
  };

/** Props accepted by text block intrinsic tags such as `p`, `h1`, and `h2`. */
export type IntrinsicPProps = TextNodeProps &
  IntrinsicKeyProps & {
    children?: TextJsxChild;
  };

/** Props accepted by inline text run `span` elements. */
export type IntrinsicSpanProps = TextRunNodeProps &
  IntrinsicKeyProps & {
    children?: TextJsxChild;
  };

export type IntrinsicImgProps = ImageProps & IntrinsicKeyProps;
export type IntrinsicVideoProps = VideoProps & IntrinsicKeyProps;
export type IntrinsicShapeProps = ShapeProps & IntrinsicKeyProps;

/** View-like authored tags that create containing layout boxes. */
export type IntrinsicViewTag =
  | "article"
  | "aside"
  | "div"
  | "figure"
  | "footer"
  | "header"
  | "main"
  | "nav"
  | "section";

/** Text block authored tags that accept text and inline `span` runs. */
export type IntrinsicTextTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p";

/** Table authored tags with table-structured children. */
export type IntrinsicTableTag = "table" | "thead" | "tbody" | "tfoot" | "tr" | "th" | "td";

/** Recursive child contract for `table`: sections or direct rows only. */
export interface TableJsxChildArray extends ReadonlyArray<TableJsxChild> {}

export type TableJsxChild =
  | DeckJsxElement<"thead" | "tbody" | "tfoot" | "tr">
  | boolean
  | null
  | undefined
  | TableJsxChildArray;

/** Recursive child contract for table sections: rows only. */
export interface TableSectionJsxChildArray extends ReadonlyArray<TableSectionJsxChild> {}

export type TableSectionJsxChild =
  | DeckJsxElement<"tr">
  | boolean
  | null
  | undefined
  | TableSectionJsxChildArray;

/** Recursive child contract for table rows: header/data cells only. */
export interface TableRowJsxChildArray extends ReadonlyArray<TableRowJsxChild> {}

export type TableRowJsxChild =
  | DeckJsxElement<"th" | "td">
  | boolean
  | null
  | undefined
  | TableRowJsxChildArray;

/** Recursive child contract for table cells. Cells may contain text or authored elements. */
export interface TableCellJsxChildArray extends ReadonlyArray<TableCellJsxChild> {}

export type TableCellJsxChild = ViewIntrinsicJsxChild | string | number | TableCellJsxChildArray;

/** Props accepted by `table` intrinsic elements. */
export type IntrinsicTableProps = TableNodeProps &
  IntrinsicKeyProps & {
    children?: TableJsxChild;
  };

/** Props accepted by `thead`, `tbody`, and `tfoot` intrinsic elements. */
export type IntrinsicTableSectionProps = TableSectionNodeProps &
  IntrinsicKeyProps & {
    children?: TableSectionJsxChild;
  };

/** Props accepted by `tr` intrinsic elements. */
export type IntrinsicTableRowProps = TableRowNodeProps &
  IntrinsicKeyProps & {
    children?: TableRowJsxChild;
  };

/** Props accepted by `td` and `th` intrinsic elements. */
export type IntrinsicTableCellProps = TableCellNodeProps &
  IntrinsicKeyProps & {
    children?: TableCellJsxChild;
  };

/**
 * Public TSX intrinsic element contract.
 *
 * Each tag exposes only its structured authoring props: `style`, `className`, `area`, source props,
 * and table span props where applicable. Direct style props such as `left={1}` are not part of the
 * public authoring API.
 */
export type DeckJsxIntrinsicElements = {
  img: IntrinsicImgProps;
  shape: IntrinsicShapeProps;
  span: IntrinsicSpanProps;
  video: IntrinsicVideoProps;
  table: IntrinsicTableProps;
  thead: IntrinsicTableSectionProps;
  tbody: IntrinsicTableSectionProps;
  tfoot: IntrinsicTableSectionProps;
  tr: IntrinsicTableRowProps;
  th: IntrinsicTableCellProps;
  td: IntrinsicTableCellProps;
} & {
  [Tag in IntrinsicViewTag]: IntrinsicDivProps;
} & {
  [Tag in IntrinsicTextTag]: IntrinsicPProps;
};

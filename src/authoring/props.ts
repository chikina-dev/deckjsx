import type { TemplateAreaRef } from "../templates";
import type { ShapeName, TableCellSpan } from "./contract";
import type {
  ImageStyle,
  ShapeStyle,
  SlideStyle,
  TableCellStyle,
  TableRowStyle,
  TableSectionStyle,
  TableStyle,
  TextRunStyle,
  TextStyle,
  VideoStyle,
  ViewStyle,
} from "../style/types";

/** Array form accepted by `className`, including nested arrays. */
export interface ClassNameValueArray extends ReadonlyArray<ClassNameValue> {}

/**
 * Object form accepted by `className`.
 *
 * Keys are class tokens and truthy values include the token. Empty, whitespace-only, and
 * whitespace-containing class tokens are reported by compile diagnostics for JavaScript or casted
 * inputs.
 */
export type ClassNameObject = Readonly<Record<string, boolean | null | undefined>>;

/**
 * Public `className` value accepted by authored JSX elements.
 *
 * The value is normalized into class tokens for StyleSheet matching. `className` is structural
 * authoring metadata; visual and layout properties belong inside `style`, not as direct JSX props.
 */
export type ClassNameValue =
  | string
  | false
  | null
  | undefined
  | ClassNameValueArray
  | ClassNameObject;

type ClassNameAuthorProps = {
  className?: ClassNameValue;
};

type TemplateAreaAuthorProps = {
  area?: TemplateAreaRef;
};

/**
 * Inline media data URI accepted by `data` and `posterData` authoring props.
 *
 * The public type keeps the `data:<type>/<subtype>,...` prefix shape without enumerating every
 * possible payload-starting character in editor hovers. deckjsx compile diagnostics validate media
 * type, subtype, metadata whitespace, and payload shape for JavaScript and casted inputs.
 */
export type DataUriString = `data:${string}/${string},${string}`;

type RelativeOrLocalMediaSourceString =
  | `${string}.${string}`
  | `./${string}`
  | `../${string}`
  | `/${string}`
  | `~/${string}`;
type WindowsDriveMediaSourceString = `${string}:\\${string}`;
type HttpMediaSourceString = `http://${string}` | `https://${string}`;

/**
 * Public image source path or HTTP(S) URL accepted by `img src` and `video poster`.
 *
 * Inline media belongs in `data` / `posterData`. The type intentionally rejects empty strings,
 * whitespace-starting values, and obvious `data:` mixups before runtime asset diagnostics run.
 * Compile diagnostics reject non-HTTP URL schemes for JavaScript and casted input without expanding
 * a costly URL parser into editor type checking.
 */
export type ImageSourceString =
  | RelativeOrLocalMediaSourceString
  | WindowsDriveMediaSourceString
  | HttpMediaSourceString;

/**
 * Public local video source path accepted by `video src`.
 *
 * Remote video URLs are not part of the public authoring API; compile diagnostics reject URL
 * schemes for JavaScript and casted input. The public type rejects inline `data:` mixups and
 * accepts local relative, absolute, home-relative, and Windows-drive paths without expanding a
 * costly path parser into editor type checking.
 */
export type VideoSourceString = RelativeOrLocalMediaSourceString | WindowsDriveMediaSourceString;

type ImageSourceAuthorProps =
  | {
      src: ImageSourceString;
      data?: never;
    }
  | {
      src?: never;
      data: DataUriString;
    };

type VideoSourceAuthorProps =
  | {
      src: VideoSourceString;
      data?: never;
    }
  | {
      src?: never;
      data: DataUriString;
    };

type VideoPosterAuthorProps =
  | {
      poster?: ImageSourceString;
      posterData?: never;
    }
  | {
      poster?: never;
      posterData?: DataUriString;
    };

/** Props accepted by deck slide declarations. */
export type SlideNodeProps = {
  /** Optional slide name used by diagnostics and inspection. */
  name?: string;
  /** Template name from the Deck `templates` option. */
  template?: string;
  /** Optional classes for slide-level StyleSheet matching. */
  className?: ClassNameValue;
  /** Slide background style. Element layout properties are not slide declaration props. */
  style?: SlideStyle;
};

/**
 * Props accepted by view-like authored elements such as `div`, `main`, `section`, and `figure`.
 *
 * View elements accept view layout/box style, classes, and optional Template Area placement. Direct
 * style props such as `left={1}` or `display="grid"` are not part of the public authoring API.
 */
export type ViewNodeProps = {
  style?: ViewStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps;

/** Props accepted by block text authored elements such as `p`, `h1`, and `h2`. */
export type TextNodeProps = {
  style?: TextStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps;

/**
 * Props accepted by inline text runs.
 *
 * `span` styles are intentionally limited to typography, hyperlink, and text effect properties.
 * Layout and box styles belong to the surrounding block text element.
 */
export type TextRunNodeProps = {
  style?: TextRunStyle;
} & ClassNameAuthorProps;

/**
 * Props accepted by image authored elements.
 *
 * Images require either `src` or inline `data`, not both. `src` accepts local paths and HTTP(S)
 * URLs; inline `data:` media belongs in `data` so asset loading and diagnostics can distinguish
 * file/URL media from embedded bytes. Image children are not public authoring input and are
 * rejected by the intrinsic JSX contract.
 */
export type ImageNodeProps = {
  style?: ImageStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps &
  ImageSourceAuthorProps;

/**
 * Props accepted by video authored elements.
 *
 * Videos require either local `src` or inline `data`, not both. Remote video URLs are intentionally
 * outside the public `video src` API; use inline `data` or an integration asset loader boundary for
 * trusted remote media. `poster` accepts image source paths/HTTP(S) URLs, while `posterData` must
 * be a data URI; provide at most one poster source. Video children are not public authoring input
 * and are rejected by the intrinsic JSX contract.
 */
export type VideoNodeProps = {
  style?: VideoStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps &
  VideoPosterAuthorProps &
  VideoSourceAuthorProps;

/**
 * Props accepted by `shape` authored elements.
 *
 * Shape appearance is controlled through `style` and the closed `shape` literal set. Direct paint
 * props such as `fill="#fff"` are not public authoring props; put visual properties inside
 * `style`. Shape children are not public authoring input.
 */
export type ShapeNodeProps = {
  style?: ShapeStyle;
  shape?: ShapeName;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps;

/**
 * Props accepted by `table` authored elements.
 *
 * Table structure is enforced by the intrinsic children contract: tables contain table sections or
 * rows, not arbitrary text/view children. Table visual/layout properties belong inside `style`.
 */
export type TableNodeProps = {
  style?: TableStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps;

/**
 * Props accepted by `thead`, `tbody`, and `tfoot` authored elements.
 *
 * Section children are rows only. Sections intentionally do not accept Template Area placement;
 * place the enclosing table when a table participates in slide layout.
 */
export type TableSectionNodeProps = {
  style?: TableSectionStyle;
} & ClassNameAuthorProps;

/**
 * Props accepted by `tr` authored elements.
 *
 * Row children are `td` and `th` cells only. Row-level style is limited to the row public style
 * surface and does not expose slide placement props as direct JSX props.
 */
export type TableRowNodeProps = {
  style?: TableRowStyle;
} & ClassNameAuthorProps;

/**
 * Props accepted by `td` and `th` authored elements.
 *
 * Cells accept normal view/text children and optional positive integer `colspan` / `rowspan`
 * values. Cell typography, padding, and paint are authored through `style`.
 */
export type TableCellNodeProps = {
  style?: TableCellStyle;
  colspan?: TableCellSpan;
  rowspan?: TableCellSpan;
} & ClassNameAuthorProps;

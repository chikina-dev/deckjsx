import type { AuthoredTag } from "../authoring/tags";
import type {
  ImageStyle,
  ShapeStyle,
  SlideStyle,
  StyleForAuthoredTag,
  TableStyle,
  TextRunStyle,
  TextStyle,
  VideoStyle,
  ViewStyle,
} from "./types";

type KnownStyleDeclarationSource =
  | SlideStyle
  | ViewStyle
  | TableStyle
  | TextStyle
  | TextRunStyle
  | ImageStyle
  | VideoStyle
  | ShapeStyle;
type KeysOfUnion<T> = T extends T ? keyof T : never;
export type StyleDeclarationKey = KeysOfUnion<KnownStyleDeclarationSource>;

type ValueForStyleDeclarationKey<TStyle, TKey extends StyleDeclarationKey> = TStyle extends unknown
  ? TKey extends keyof TStyle
    ? TStyle[TKey]
    : never
  : never;

/**
 * Internal resolved-style value boundary.
 *
 * Public authored styles should use tag-specific types such as `ViewStyle`, `TextStyle`, or
 * `StyleForAuthoredTag<Tag>`. This type exists only after authoring validation has accepted a style
 * key and the value is moving through resolution, layout, projection, or inspection.
 */
export type StyleDeclarationValue<TKey extends StyleDeclarationKey = StyleDeclarationKey> =
  ValueForStyleDeclarationKey<KnownStyleDeclarationSource, TKey>;

/**
 * Internal declaration map for resolved style storage.
 *
 * It is intentionally not exported from root `deckjsx` or `deckjsx/style`; exposing it would turn the
 * union of all style keys back into an authoring surface.
 */
export type StyleDeclaration = {
  readonly [Key in StyleDeclarationKey]?: StyleDeclarationValue<Key>;
};

/** Exact validated declaration shape for one authored style target. */
export type StyleDeclarationForTarget<TTarget extends AuthoredTag | "slide"> =
  TTarget extends "slide"
    ? SlideStyle
    : TTarget extends AuthoredTag
      ? StyleForAuthoredTag<TTarget>
      : never;

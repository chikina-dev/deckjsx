import type {
  ImageStyle,
  ShapeStyle,
  SlideStyle,
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
type KnownStyleDeclarationKey = KeysOfUnion<KnownStyleDeclarationSource>;

/**
 * Internal resolved-style value boundary.
 *
 * Public authored styles should use tag-specific types such as `ViewStyle`, `TextStyle`, or
 * `StyleForAuthoredTag<Tag>`. This type exists only after authoring validation has accepted a style
 * key and the value is moving through resolution, layout, projection, or inspection.
 */
export type StyleDeclarationValue = unknown;

/**
 * Internal declaration map for resolved style storage.
 *
 * It is intentionally not exported from root `deckjsx` or `deckjsx/style`; exposing it would turn the
 * union of all style keys back into an authoring surface.
 */
export type StyleDeclaration = {
  readonly [Key in KnownStyleDeclarationKey]?: StyleDeclarationValue;
};

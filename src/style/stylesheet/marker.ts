export const STYLE_SHEET_VALUE = Symbol("deckjsx.styleSheetValue");

/**
 * Public marker for values that can be registered with `deck.useStyles(...)`.
 *
 * Authors normally create this value with `new StyleSheet({ classes })` or
 * `theme.defineStyles(...)`. The marker keeps `deck.useStyles(...)` from accepting plain objects
 * while allowing Deck's authoring surface to avoid importing the full StyleSheet selector
 * validator.
 */
export type RegisteredStyleSheetValue = {
  readonly [STYLE_SHEET_VALUE]: true;
  readonly classes: Readonly<Record<string, unknown>>;
};

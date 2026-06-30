export const THEME_VALUE = Symbol("deckjsx.themeValue");

/**
 * Public marker for values that can be used as Deck Themes.
 *
 * Authors normally create this value with `new Theme({ defaults })`. The marker keeps
 * `new Deck({ theme })` from accepting plain objects while allowing Deck construction options to
 * avoid importing Theme's full generic authoring validator.
 */
export type RegisteredThemeValue = {
  readonly [THEME_VALUE]: true;
};

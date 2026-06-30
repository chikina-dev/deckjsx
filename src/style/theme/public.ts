import type { Diagnostic } from "../../diagnostics";
import type { AuthoredTag } from "../../authoring/tags";
import { StyleSheet, type StyleSheetInput } from "../stylesheet/public";
import type { ThemeDefaults } from "../defaults";
import type { StyleForAuthoredTag } from "../types";
import { THEME_VALUE } from "./marker";
import { isTheme, themeDiagnostics, THEME_DIAGNOSTICS, themeInput, THEME_INPUT } from "./runtime";
import { cloneThemeValue, isRecord, mergeThemeValues, type MergedTheme } from "./values";
import { validateThemeDefaults } from "./validation";

/**
 * Public Theme input.
 *
 * `defaults` are keyed by authored deckjsx tags and each value is checked against that tag's public
 * style type. Internal normalized layout/style objects are intentionally not accepted here. Prefer
 * `new Theme({ defaults })` for inference; use this helper with an explicit defaults map type when
 * naming an input shape.
 */
export interface ThemeInput<TDefaults extends ThemeDefaults> extends Readonly<object> {
  readonly defaults?: TDefaults;
}

type ThemeDefaultsUseAuthoredTags<TDefaults> = TDefaults extends object
  ? string extends keyof TDefaults
    ? false
    : Exclude<keyof TDefaults, AuthoredTag> extends never
      ? false extends {
          readonly [Tag in keyof TDefaults]: Tag extends AuthoredTag
            ? ThemeDefaultStyleMatchesTag<TDefaults[Tag], Tag>
            : false;
        }[keyof TDefaults]
        ? false
        : true
      : false
  : false;
type ExtraThemeDefaultStyleKeys<TStyle, Tag extends AuthoredTag> = Exclude<
  keyof TStyle,
  keyof StyleForAuthoredTag<Tag>
>;
type ThemeDefaultStyleMatchesTag<TStyle, Tag extends AuthoredTag> = [
  ExtraThemeDefaultStyleKeys<TStyle, Tag>,
] extends [never]
  ? TStyle extends StyleForAuthoredTag<Tag>
    ? true
    : false
  : false;

type ThemeInputUsesAuthoredDefaults<TTheme> = TTheme extends { readonly defaults: infer TDefaults }
  ? ThemeDefaultsUseAuthoredTags<TDefaults>
  : true;
type ThemeObjectExtensionIsValid<TTheme> = TTheme extends (...args: never[]) => unknown
  ? false
  : ThemeInputUsesAuthoredDefaults<TTheme>;
type ThemeObjectExtensionInvalidRest<TTheme> =
  ThemeObjectExtensionIsValid<TTheme> extends true
    ? []
    : ["Theme defaults must use authored tag styles."];

/**
 * Public opaque Theme value accepted by `new Deck({ theme })`.
 *
 * Construct this value with `new Theme({ defaults })`. Deck construction uses this lightweight
 * contract so passing a Theme does not force TypeScript to re-evaluate the full Theme extension and
 * defaults validator.
 */
export interface ThemeValue {
  readonly [THEME_VALUE]: true;
}

interface ThemeInstance<TTheme extends object = ThemeInput<ThemeDefaults>> extends ThemeValue {
  readonly [THEME_INPUT]: TTheme;
  readonly [THEME_DIAGNOSTICS]: readonly Diagnostic[];
  /**
   * Return a new Theme by merging this theme with an authored Theme input.
   *
   * Object extensions must keep `defaults` keyed by authored tags. Function extensions receive the
   * current typed theme value and must return the same public Theme input shape.
   */
  extend<const TExtension extends ThemeInput<ThemeDefaults>>(
    extension: (theme: Theme<TTheme>) => TExtension,
  ): Theme<MergedTheme<TTheme, TExtension>>;
  extend<const TExtension extends ThemeInput<ThemeDefaults>>(
    extension: Theme<TExtension>,
  ): Theme<MergedTheme<TTheme, TExtension>>;
  extend<const TExtension extends object>(
    extension: TExtension,
    ...invalid: ThemeObjectExtensionInvalidRest<TExtension>
  ): Theme<MergedTheme<TTheme, TExtension>>;
  /**
   * Define a StyleSheet from this Theme.
   *
   * Returned class definitions use the same target-checked public StyleSheet contract as
   * `new StyleSheet(...)`; theme values do not widen class styles to internal style maps.
   */
  defineStyles<const TClasses extends Readonly<Record<string, unknown>>>(
    factory: (theme: Theme<TTheme>) => { readonly classes: StyleSheetInput<TClasses>["classes"] },
  ): StyleSheet<TClasses>;
}

/**
 * Public Theme value used by Decks and Theme-defined StyleSheets.
 *
 * A Theme preserves the authored input shape for typed access while carrying compile diagnostics
 * for invalid defaults that may arrive from JavaScript or casts.
 */
export type Theme<TTheme extends object = ThemeInput<ThemeDefaults>> = ThemeInstance<TTheme> &
  Readonly<TTheme>;

type ThemeRuntime<TTheme extends object> = ThemeImpl<TTheme> & Theme<TTheme>;

class ThemeImpl<
  TTheme extends object = ThemeInput<ThemeDefaults>,
> implements ThemeInstance<TTheme> {
  readonly [THEME_VALUE] = true;
  readonly [THEME_INPUT]: TTheme;
  readonly [THEME_DIAGNOSTICS]: readonly Diagnostic[];

  constructor(input: TTheme) {
    const value = cloneThemeValue(input);
    const themeInputValue = isRecord(value) ? value : Object.create(null);
    this[THEME_INPUT] = themeInputValue as TTheme;
    this[THEME_DIAGNOSTICS] = validateThemeDefaults(value);

    Object.entries(themeInputValue).forEach(([key, child]) => {
      if (key in ThemeImpl.prototype) {
        return;
      }

      Object.defineProperty(this, key, {
        enumerable: true,
        configurable: false,
        writable: false,
        value: child,
      });
    });
  }

  extend<const TExtension extends ThemeInput<ThemeDefaults>>(
    this: ThemeRuntime<TTheme>,
    extension: (theme: Theme<TTheme>) => TExtension,
  ): Theme<MergedTheme<TTheme, TExtension>>;
  extend<const TExtension extends ThemeInput<ThemeDefaults>>(
    this: ThemeRuntime<TTheme>,
    extension: Theme<TExtension>,
  ): Theme<MergedTheme<TTheme, TExtension>>;
  extend<const TExtension extends object>(
    this: ThemeRuntime<TTheme>,
    extension: TExtension,
    ...invalid: ThemeObjectExtensionInvalidRest<TExtension>
  ): Theme<MergedTheme<TTheme, TExtension>>;
  extend<const TExtension extends object>(
    this: ThemeRuntime<TTheme>,
    extension: TExtension | Theme<TExtension> | ((theme: Theme<TTheme>) => TExtension),
  ): Theme<MergedTheme<TTheme, TExtension>> {
    const input =
      typeof extension === "function"
        ? extension(this)
        : isTheme(extension)
          ? themeInput(extension)
          : extension;
    const ThemeConstructor = Theme as {
      new <TThemeValue extends object>(input: TThemeValue): Theme<TThemeValue>;
    };
    return new ThemeConstructor<MergedTheme<TTheme, TExtension>>(
      mergeThemeValues(this[THEME_INPUT], input) as MergedTheme<TTheme, TExtension>,
    );
  }

  defineStyles<const TClasses extends Readonly<Record<string, unknown>>>(
    this: ThemeRuntime<TTheme>,
    factory: (theme: Theme<TTheme>) => { readonly classes: StyleSheetInput<TClasses>["classes"] },
  ): StyleSheet<TClasses> {
    const StyleSheetConstructor = StyleSheet as unknown as {
      new <const TStyleClasses extends Readonly<Record<string, unknown>>>(input: {
        readonly classes: TStyleClasses;
      }): StyleSheet<TStyleClasses>;
    };
    return new StyleSheetConstructor(factory(this));
  }
}

/**
 * Construct a public Theme for Deck authoring.
 *
 * Theme defaults are keyed by authored deckjsx tags such as `p`, `h1`, `div`, `span`, or `img`.
 * Each default value is checked against that tag's public style contract; internal normalized style
 * maps and broad CSS objects are not accepted as Theme defaults. Invalid JavaScript or casted input
 * is carried as compile diagnostics.
 */
export const Theme: {
  new <const TTheme extends object>(
    input: TTheme,
    ...invalid: ThemeInputUsesAuthoredDefaults<TTheme> extends true
      ? []
      : ["Theme defaults must use authored tag styles."]
  ): Theme<TTheme>;
} = ThemeImpl as typeof ThemeImpl as {
  new <const TTheme extends object>(
    input: TTheme,
    ...invalid: ThemeInputUsesAuthoredDefaults<TTheme> extends true
      ? []
      : ["Theme defaults must use authored tag styles."]
  ): Theme<TTheme>;
};
export { isTheme, themeDiagnostics, themeInput };

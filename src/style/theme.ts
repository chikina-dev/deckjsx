import type { Diagnostic } from "../diagnostics";
import { StyleSheet, type StyleSheetInput } from "./stylesheet";
import type { ThemeDefaults } from "./defaults";
import { cloneThemeValue, isRecord, mergeThemeValues, type MergedTheme } from "./theme-values";
import { validateThemeDefaults } from "./theme-validation";

const THEME_INPUT = Symbol("deckjsx.themeInput");
const THEME_DIAGNOSTICS = Symbol("deckjsx.themeDiagnostics");

export type ThemeInput = Readonly<object> & {
  readonly defaults?: ThemeDefaults;
};

type ThemeInstance<TTheme extends object = ThemeInput> = {
  readonly [THEME_INPUT]: TTheme;
  readonly [THEME_DIAGNOSTICS]: readonly Diagnostic[];
  extend<const TExtension extends ThemeInput>(
    extension: TExtension,
  ): Theme<MergedTheme<TTheme, TExtension>>;
  extend<const TExtension extends ThemeInput>(
    extension: Theme<TExtension>,
  ): Theme<MergedTheme<TTheme, TExtension>>;
  extend<const TExtension extends ThemeInput>(
    extension: (theme: Theme<TTheme>) => TExtension,
  ): Theme<MergedTheme<TTheme, TExtension>>;
  defineStyles<const TStyleSheet extends StyleSheetInput>(
    factory: (theme: Theme<TTheme>) => TStyleSheet,
  ): StyleSheet<TStyleSheet["classes"]>;
};

export type Theme<TTheme extends object = ThemeInput> = ThemeInstance<TTheme> & Readonly<TTheme>;

class ThemeImpl<TTheme extends object = ThemeInput> {
  readonly [THEME_INPUT]: TTheme;
  readonly [THEME_DIAGNOSTICS]: readonly Diagnostic[];

  constructor(input: TTheme) {
    const value = cloneThemeValue(input);
    this[THEME_INPUT] = value;
    this[THEME_DIAGNOSTICS] = validateThemeDefaults(value);

    Object.entries(value).forEach(([key, child]) => {
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

  extend<const TExtension extends ThemeInput>(
    extension: TExtension | Theme<TExtension> | ((theme: Theme<TTheme>) => TExtension),
  ): Theme<MergedTheme<TTheme, TExtension>> {
    const input =
      typeof extension === "function"
        ? extension(this as unknown as Theme<TTheme>)
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

  defineStyles<const TStyleSheet extends StyleSheetInput>(
    factory: (theme: Theme<TTheme>) => TStyleSheet,
  ): StyleSheet<TStyleSheet["classes"]> {
    return new StyleSheet(factory(this as unknown as Theme<TTheme>));
  }
}

export const Theme: {
  new <const TTheme extends object>(
    input: TTheme,
    ...invalid: TTheme extends ThemeInput ? [] : ["Theme defaults must use authored tag styles."]
  ): Theme<TTheme>;
} = ThemeImpl as typeof ThemeImpl as {
  new <const TTheme extends object>(
    input: TTheme,
    ...invalid: TTheme extends ThemeInput ? [] : ["Theme defaults must use authored tag styles."]
  ): Theme<TTheme>;
};

export function isTheme(value: unknown): value is Theme {
  return isRecord(value) && THEME_INPUT in value && THEME_DIAGNOSTICS in value;
}

export function themeInput<TTheme extends object>(theme: Theme<TTheme>): TTheme {
  return theme[THEME_INPUT];
}

export function themeDiagnostics(theme: Theme | undefined): readonly Diagnostic[] {
  return theme?.[THEME_DIAGNOSTICS] ?? [];
}

import type { Diagnostic } from "../../diagnostics";
import { type RegisteredThemeValue } from "./marker";

export const THEME_INPUT = Symbol("deckjsx.themeInput");
export const THEME_DIAGNOSTICS = Symbol("deckjsx.themeDiagnostics");

export type ThemeRuntimeValue<TTheme extends object = Record<string, unknown>> =
  RegisteredThemeValue & {
    readonly [THEME_INPUT]: TTheme;
    readonly [THEME_DIAGNOSTICS]: readonly Diagnostic[];
    extend(extension: ThemeRuntimeValue): ThemeRuntimeValue;
  };

export function isTheme(value: unknown): value is ThemeRuntimeValue {
  return isRecord(value) && THEME_INPUT in value && THEME_DIAGNOSTICS in value;
}

export function themeInput<TTheme extends object>(theme: ThemeRuntimeValue<TTheme>): TTheme {
  return theme[THEME_INPUT];
}

export function themeDiagnostics(theme: ThemeRuntimeValue | undefined): readonly Diagnostic[] {
  return theme?.[THEME_DIAGNOSTICS] ?? [];
}

function isRecord(value: unknown): value is Record<string | symbol, unknown> {
  return typeof value === "object" && value !== null;
}

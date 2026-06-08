import { isAuthoredTag, type AuthoredTag } from "../authoring/tags";
import { diagnostic, type Diagnostic } from "../diagnostics";
import { IMAGE_STYLE_KEYS, TEXT_RUN_STYLE_KEYS, TEXT_STYLE_KEYS, VIEW_STYLE_KEYS } from "./types";
import { isRecord } from "./theme-values";

function styleKeysForTag(tag: AuthoredTag): ReadonlySet<string> {
  if (tag === "span") {
    return new Set(TEXT_RUN_STYLE_KEYS);
  }

  if (tag === "img") {
    return new Set(IMAGE_STYLE_KEYS);
  }

  if (/^h[1-6]$/.test(tag) || tag === "p") {
    return new Set(TEXT_STYLE_KEYS);
  }

  return new Set(VIEW_STYLE_KEYS);
}

function themeDiagnostic(input: {
  code: string;
  title: string;
  path: string;
  message: string;
  help?: readonly string[];
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: input.code,
    title: input.title,
    message: input.message,
    labels: [{ path: input.path, message: input.message }],
    ...(input.help ? { help: input.help } : {}),
  });
}

export function validateThemeDefaults(input: object): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const defaults = isRecord(input) ? input.defaults : undefined;
  if (defaults === undefined) {
    return diagnostics;
  }

  if (!isRecord(defaults)) {
    return [
      themeDiagnostic({
        code: "E_THEME_INVALID_DEFAULTS",
        title: "invalid theme defaults",
        path: "theme.defaults",
        message: "Theme defaults must be an object keyed by authored tag.",
      }),
    ];
  }

  Object.entries(defaults).forEach(([tag, style]) => {
    if (!isAuthoredTag(tag)) {
      diagnostics.push(
        themeDiagnostic({
          code: "E_THEME_INVALID_DEFAULT_KEY",
          title: "invalid theme default key",
          path: `theme.defaults.${tag}`,
          message: `Theme default key "${tag}" is not a supported authored tag.`,
          help: ["Use authored tags such as p, h1, div, section, span, or img."],
        }),
      );
      return;
    }

    if (!isRecord(style)) {
      diagnostics.push(
        themeDiagnostic({
          code: "E_THEME_INVALID_DEFAULT_STYLE",
          title: "invalid theme default style",
          path: `theme.defaults.${tag}`,
          message: `Theme default "${tag}" must be a style object.`,
        }),
      );
      return;
    }

    const allowed = styleKeysForTag(tag);
    Object.keys(style).forEach((key) => {
      if (allowed.has(key)) {
        return;
      }

      diagnostics.push(
        themeDiagnostic({
          code: "E_THEME_INVALID_DEFAULT_STYLE",
          title: "invalid theme default style",
          path: `theme.defaults.${tag}.${key}`,
          message: `Style property "${key}" is not supported by Theme default "${tag}".`,
        }),
      );
    });
  });

  return diagnostics;
}

import { isAuthoredTag } from "../../authoring/tags";
import { diagnostic, type Diagnostic } from "../../diagnostics";
import { isAuthoringStyleRecord, validateSupportedStyleDeclaration } from "../authoring-validation";
import { isRecord } from "./values";

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

export function validateThemeDefaults(input: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) {
    return [
      themeDiagnostic({
        code: "E_THEME_INPUT_INVALID",
        title: "theme input is not part of the public authoring API",
        path: "theme",
        message: "Theme input must be an object in the public authoring API.",
        help: ["Pass new Theme({ defaults: { p: { ... } } }) or another authored theme object."],
      }),
    ];
  }

  const defaults = input.defaults;
  if (defaults === undefined) {
    return diagnostics;
  }

  if (!isRecord(defaults)) {
    return [
      themeDiagnostic({
        code: "E_THEME_INVALID_DEFAULTS",
        title: "theme defaults are not part of the public authoring API",
        path: "theme.defaults",
        message:
          "Theme defaults must be an object keyed by authored tag in the public authoring API.",
        help: ['Use new Theme({ defaults: { p: { color: "red" } } }).'],
      }),
    ];
  }

  Object.entries(defaults).forEach(([tag, style]) => {
    if (!isAuthoredTag(tag)) {
      diagnostics.push(
        themeDiagnostic({
          code: "E_THEME_INVALID_DEFAULT_KEY",
          title: "theme default key is not part of the public authoring API",
          path: `theme.defaults.${tag}`,
          message: `Theme default key "${tag}" is not part of the public authoring API. Theme defaults are keyed by authored tags.`,
          help: ["Use authored tags such as p, h1, div, section, span, or img."],
        }),
      );
      return;
    }

    if (!isAuthoringStyleRecord(style)) {
      diagnostics.push(
        themeDiagnostic({
          code: "E_THEME_INVALID_DEFAULT_STYLE",
          title: "theme default style is not part of the public authoring API",
          path: `theme.defaults.${tag}`,
          message: `Theme default "${tag}" style must be an object in the public authoring API.`,
          help: ["Theme defaults use authored tag keys and style objects for those tags."],
        }),
      );
      return;
    }

    diagnostics.push(
      ...validateSupportedStyleDeclaration({
        path: `theme.defaults.${tag}`,
        tag,
        style,
      }),
    );
  });

  return diagnostics;
}

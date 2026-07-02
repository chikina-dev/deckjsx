import {
  createDiagnostics,
  diagnostic,
  type Diagnostic,
  type Diagnostics,
} from "../../diagnostics";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type DeckOptionDiagnosticCode =
  | "E_DECK_INVALID_OPTIONS"
  | "E_DECK_INVALID_LAYOUT"
  | "E_DECK_INVALID_META"
  | "E_DECK_INVALID_OUTPUT";

const deckOptionKeys = ["layout", "templates", "meta", "theme", "output"] as const;
const metaKeys = ["title", "author", "subject"] as const;
const outputKeys = ["formats"] as const;
const legacyOutputKeys = ["format"] as const;

function includesString(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

function deckOptionDiagnostic(input: {
  code: DeckOptionDiagnosticCode;
  section: "options" | "layout" | "metadata" | "output";
  path: string;
  message: string;
  help?: readonly string[];
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: input.code,
    title:
      input.section === "options"
        ? "deck options are not part of the public authoring API"
        : `deck ${input.section} is not part of the public authoring API`,
    message: input.message,
    labels: [{ path: input.path, message: input.message }],
    help: input.help,
  });
}

/**
 * Validate runtime Deck options that may have bypassed the public TypeScript authoring contract.
 */
export function validateDeckOptions(options: unknown): Diagnostics {
  if (!isRecord(options)) {
    return createDiagnostics([
      deckOptionDiagnostic({
        code: "E_DECK_INVALID_OPTIONS",
        section: "options",
        path: "deck.options",
        message: "Deck options must be an object in the public authoring API.",
        help: ['Use new Deck({ layout: { width: 10, height: 5.625, unit: "in" } }) or unit: "pt".'],
      }),
    ]);
  }

  const diagnostics: Diagnostic[] = [];

  for (const key of Object.keys(options)) {
    if (!includesString(deckOptionKeys, key)) {
      diagnostics.push(
        deckOptionDiagnostic({
          code: "E_DECK_INVALID_OPTIONS",
          section: "options",
          path: `deck.options.${key}`,
          message: `Deck option ${key} is not part of the public authoring API.`,
        }),
      );
    }
  }

  if (!isRecord(options.layout)) {
    diagnostics.push(
      deckOptionDiagnostic({
        code: "E_DECK_INVALID_LAYOUT",
        section: "layout",
        path: "deck.options.layout",
        message: "Deck layout must be an object in the public authoring API.",
        help: ['Use new Deck({ layout: { width: 10, height: 5.625, unit: "in" } }) or unit: "pt".'],
      }),
    );
  } else {
    if (
      typeof options.layout.width !== "number" ||
      !Number.isFinite(options.layout.width) ||
      options.layout.width <= 0
    ) {
      diagnostics.push(
        deckOptionDiagnostic({
          code: "E_DECK_INVALID_LAYOUT",
          section: "layout",
          path: "deck.options.layout.width",
          message:
            "Deck layout width must be a positive finite number in the public authoring API.",
        }),
      );
    }

    if (
      typeof options.layout.height !== "number" ||
      !Number.isFinite(options.layout.height) ||
      options.layout.height <= 0
    ) {
      diagnostics.push(
        deckOptionDiagnostic({
          code: "E_DECK_INVALID_LAYOUT",
          section: "layout",
          path: "deck.options.layout.height",
          message:
            "Deck layout height must be a positive finite number in the public authoring API.",
        }),
      );
    }

    if (options.layout.unit !== "in" && options.layout.unit !== "pt") {
      diagnostics.push(
        deckOptionDiagnostic({
          code: "E_DECK_INVALID_LAYOUT",
          section: "layout",
          path: "deck.options.layout.unit",
          message: 'Deck layout unit must be "in" or "pt" in the public authoring API.',
        }),
      );
    }
  }

  if (options.meta !== undefined) {
    if (!isRecord(options.meta)) {
      diagnostics.push(
        deckOptionDiagnostic({
          code: "E_DECK_INVALID_META",
          section: "metadata",
          path: "deck.options.meta",
          message: "Deck metadata must be an object in the public authoring API.",
        }),
      );
    } else {
      for (const key of Object.keys(options.meta)) {
        if (!includesString(metaKeys, key)) {
          diagnostics.push(
            deckOptionDiagnostic({
              code: "E_DECK_INVALID_META",
              section: "metadata",
              path: `deck.options.meta.${key}`,
              message: `Deck metadata ${key} is not part of the public authoring API.`,
            }),
          );
        }
      }

      for (const key of metaKeys) {
        const value = options.meta[key];
        if (value !== undefined && typeof value !== "string") {
          diagnostics.push(
            deckOptionDiagnostic({
              code: "E_DECK_INVALID_META",
              section: "metadata",
              path: `deck.options.meta.${key}`,
              message: `Deck metadata ${key} must be a string in the public authoring API.`,
            }),
          );
        }
      }
    }
  }

  if (options.output !== undefined) {
    if (!isRecord(options.output)) {
      diagnostics.push(
        deckOptionDiagnostic({
          code: "E_DECK_INVALID_OUTPUT",
          section: "output",
          path: "deck.options.output",
          message: "Deck output options must be an object in the public authoring API.",
        }),
      );
    } else {
      for (const key of Object.keys(options.output)) {
        if (!includesString(outputKeys, key) && !includesString(legacyOutputKeys, key)) {
          diagnostics.push(
            deckOptionDiagnostic({
              code: "E_DECK_INVALID_OUTPUT",
              section: "output",
              path: `deck.options.output.${key}`,
              message: `Deck output ${key} is not part of the public authoring API.`,
            }),
          );
        }
      }

      if ("format" in options.output) {
        diagnostics.push(
          deckOptionDiagnostic({
            code: "E_DECK_INVALID_OUTPUT",
            section: "output",
            path: "deck.options.output.format",
            message:
              "Deck output format is no longer part of the public authoring API. Use output.formats instead.",
          }),
        );
      }

      if (options.output.formats !== undefined) {
        if (!Array.isArray(options.output.formats)) {
          diagnostics.push(
            deckOptionDiagnostic({
              code: "E_DECK_INVALID_OUTPUT",
              section: "output",
              path: "deck.options.output.formats",
              message: "Deck output formats must be an array in the public authoring API.",
            }),
          );
        } else {
          const seenFormats = new Set<string>();
          for (const [index, format] of options.output.formats.entries()) {
            if (format !== "pptx" && format !== "pdf") {
              diagnostics.push(
                deckOptionDiagnostic({
                  code: "E_DECK_INVALID_OUTPUT",
                  section: "output",
                  path: `deck.options.output.formats.${index}`,
                  message: `Deck output formats[${index}] must be "pptx" or "pdf" in the public authoring API.`,
                }),
              );
              continue;
            }

            if (seenFormats.has(format)) {
              diagnostics.push(
                deckOptionDiagnostic({
                  code: "E_DECK_INVALID_OUTPUT",
                  section: "output",
                  path: `deck.options.output.formats.${index}`,
                  message: `Deck output formats must not contain duplicate format "${format}".`,
                }),
              );
            }
            seenFormats.add(format);
          }
        }
      }
    }
  }

  return createDiagnostics(diagnostics);
}

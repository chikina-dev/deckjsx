import type { Diagnostic } from "./diagnostics";
import { diagnostic } from "./diagnostics";
import { isDeckLengthString } from "./style/length";
import type { DeckLength } from "./style/types";

const TEMPLATE_AREA_REF = Symbol("deckjsx.templateAreaRef");

const TEMPLATE_AREA_KINDS = [
  "body",
  "date",
  "footer",
  "generic",
  "picture",
  "slideNumber",
  "title",
] as const;

export type TemplateAreaKind = (typeof TEMPLATE_AREA_KINDS)[number];

/** The concrete frame used by a Template Area before output projection. */
export type TemplateFrame = {
  readonly x: DeckLength;
  readonly y: DeckLength;
  readonly width: DeckLength;
  readonly height: DeckLength;
};

/** A named placement area inside a Slide Template. */
export type TemplateArea = {
  readonly frame: TemplateFrame;
  readonly kind?: TemplateAreaKind;
};

/** A reusable Deck-owned slide structure made of named Template Areas. */
export type SlideTemplate = {
  readonly areas: Readonly<Record<string, TemplateArea>>;
};

/** The Deck-local set of Slide Templates available to `deck.slide({ template })`. */
export type SlideTemplateSet = Readonly<Record<string, SlideTemplate>>;

export type EmptySlideTemplateSet = Record<never, never>;

/**
 * A branded authored reference from slide content to one Template Area.
 *
 * Authors normally obtain this value from the slide factory's `template` handle, for example
 * `area={template.title}`. The runtime reference object is library-owned so callers do not have to
 * manufacture branded values.
 *
 * @typeParam TTemplateName - Name of the Slide Template that owns the referenced area.
 * @typeParam TAreaName - Name of the referenced Template Area.
 */
export type TemplateAreaRef<
  TTemplateName extends string = string,
  TAreaName extends string = string,
> = Readonly<{
  readonly type: "deckjsx.templateAreaRef";
  readonly template: TTemplateName;
  readonly area: TAreaName;
}> & {
  readonly __deckjsxTemplateAreaRefBrand?: never;
};

type RuntimeTemplateAreaRef<
  TTemplateName extends string,
  TAreaName extends string,
> = TemplateAreaRef<TTemplateName, TAreaName> & {
  readonly [TEMPLATE_AREA_REF]: true;
};

type TemplateAreaNames<
  TTemplates extends SlideTemplateSet,
  TName extends keyof TTemplates,
> = keyof TTemplates[TName]["areas"] & string;

/**
 * The typed template handle passed to a templated slide factory.
 *
 * `$name` is a discriminant for template-name unions. Every other key maps to a Template Area
 * Reference for that area.
 *
 * @typeParam TTemplates - Deck-local Slide Template set.
 * @typeParam TName - Selected Slide Template name.
 */
export type TemplateHandle<
  TTemplates extends SlideTemplateSet,
  TName extends keyof TTemplates & string,
> = TName extends keyof TTemplates & string
  ? {
      readonly $name: TName;
    } & {
      readonly [AreaName in TemplateAreaNames<TTemplates, TName>]: TemplateAreaRef<TName, AreaName>;
    }
  : never;

export type TemplateName<TTemplates extends SlideTemplateSet> = keyof TTemplates & string;

/**
 * Create the runtime template handle passed to a templated slide factory.
 *
 * @param templates - Deck-local Slide Template set.
 * @param name - Selected Slide Template name.
 * @returns A handle exposing `$name` and typed Template Area References for the selected template.
 */
export function createTemplateHandle<
  TTemplates extends SlideTemplateSet,
  TName extends keyof TTemplates & string,
>(templates: TTemplates, name: TName): TemplateHandle<TTemplates, TName> {
  const template = templates[name];
  const handle: Record<string, string | TemplateAreaRef> = { $name: name };

  if (template && isRecord(template.areas)) {
    Object.keys(template.areas).forEach((area) => {
      handle[area] = createTemplateAreaRef(name, area);
    });
  }

  return handle as TemplateHandle<TTemplates, TName>;
}

/**
 * Create an internal Template Area Reference object for a template handle property.
 *
 * @param template - Slide Template name that owns the area.
 * @param area - Template Area name within the template.
 * @returns A branded Template Area Reference accepted by the `area` JSX prop.
 */
export function createTemplateAreaRef<TTemplateName extends string, TAreaName extends string>(
  template: TTemplateName,
  area: TAreaName,
): TemplateAreaRef<TTemplateName, TAreaName> {
  const ref: RuntimeTemplateAreaRef<TTemplateName, TAreaName> = {
    type: "deckjsx.templateAreaRef",
    template,
    area,
    [TEMPLATE_AREA_REF]: true,
  };
  return ref;
}

/**
 * Return whether a value is a deckjsx-created Template Area Reference.
 *
 * @param value - Unknown runtime value to test.
 * @returns `true` when the value carries deckjsx's Template Area Reference runtime brand.
 */
export function isTemplateAreaRef(value: unknown): value is TemplateAreaRef {
  return (
    isRecord(value) &&
    value.type === "deckjsx.templateAreaRef" &&
    value[TEMPLATE_AREA_REF] === true &&
    typeof value.template === "string" &&
    typeof value.area === "string"
  );
}

/**
 * Extract the serializable template and area names from a Template Area Reference.
 *
 * @param value - Template Area Reference produced by a template handle.
 * @returns The template and area names used by graph construction and diagnostics.
 */
export function templateRefValue(value: TemplateAreaRef): {
  readonly template: string;
  readonly area: string;
} {
  return {
    template: value.template,
    area: value.area,
  };
}

/**
 * Validate a Deck-local Slide Template set and return author-facing diagnostics.
 *
 * @param templates - Deck-local Slide Template set to validate.
 * @param path - Diagnostic path prefix used in labels.
 * @returns Diagnostics for malformed templates, areas, frames, or reserved names.
 */
export function validateSlideTemplates(
  templates: SlideTemplateSet | undefined,
  path = "templates",
): readonly Diagnostic[] {
  if (templates === undefined) {
    return [];
  }

  if (!isRecord(templates)) {
    return [templateDiagnostic("E_TEMPLATE_SET_INVALID", "invalid slide templates", path)];
  }

  const diagnostics: Diagnostic[] = [];
  Object.entries(templates).forEach(([templateName, template]) => {
    const templatePath = `${path}.${templateName}`;
    if (invalidName(templateName)) {
      diagnostics.push(
        templateDiagnostic(
          "E_TEMPLATE_RESERVED_NAME",
          "reserved slide template name",
          templatePath,
          `Slide Template name "${templateName}" is invalid.`,
          ['Template names must not be empty or start with deckjsx-reserved "$".'],
        ),
      );
    }

    if (!isRecord(template)) {
      diagnostics.push(
        templateDiagnostic("E_TEMPLATE_INVALID", "invalid slide template", templatePath),
      );
      return;
    }

    if (!isRecord(template.areas)) {
      diagnostics.push(
        templateDiagnostic(
          "E_TEMPLATE_AREAS_INVALID",
          "invalid template areas",
          `${templatePath}.areas`,
        ),
      );
      return;
    }

    Object.entries(template.areas).forEach(([areaName, area]) => {
      const areaPath = `${templatePath}.areas.${areaName}`;
      if (invalidName(areaName)) {
        diagnostics.push(
          templateDiagnostic(
            "E_TEMPLATE_AREA_RESERVED_NAME",
            "reserved template area name",
            areaPath,
            `Template Area name "${areaName}" is invalid.`,
            ['Template Area names must not be empty or start with deckjsx-reserved "$".'],
          ),
        );
      }

      if (!isRecord(area)) {
        diagnostics.push(templateDiagnostic("E_TEMPLATE_AREA_INVALID", "invalid area", areaPath));
        return;
      }

      if (area.kind !== undefined && !isTemplateAreaKind(area.kind)) {
        diagnostics.push(
          templateDiagnostic(
            "E_TEMPLATE_AREA_KIND_INVALID",
            "invalid template area kind",
            `${areaPath}.kind`,
            `Template Area kind must be one of: ${TEMPLATE_AREA_KINDS.join(", ")}.`,
          ),
        );
      }

      diagnostics.push(...validateFrame(area.frame, `${areaPath}.frame`));
    });
  });

  return diagnostics;
}

function validateFrame(value: unknown, path: string): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [templateDiagnostic("E_TEMPLATE_AREA_FRAME_INVALID", "invalid area frame", path)];
  }

  const diagnostics: Diagnostic[] = [];
  (["x", "y", "width", "height"] as const).forEach((key) => {
    if (!validLength(value[key])) {
      diagnostics.push(
        templateDiagnostic(
          "E_TEMPLATE_AREA_FRAME_INCOMPLETE",
          "template area frame is incomplete",
          `${path}.${key}`,
          `Template Area frame must define a valid ${key} value.`,
        ),
      );
    }
  });
  return diagnostics;
}

function invalidName(value: string): boolean {
  return value.trim().length === 0 || value.startsWith("$");
}

function validLength(value: unknown): boolean {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && isDeckLengthString(value))
  );
}

export function isTemplateAreaKind(value: unknown): value is TemplateAreaKind {
  return typeof value === "string" && (TEMPLATE_AREA_KINDS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function templateDiagnostic(
  code: string,
  title: string,
  path: string,
  message = "Slide Template definitions must be an object keyed by template and area names.",
  help?: readonly string[],
): Diagnostic {
  return diagnostic({
    severity: "error",
    code,
    title,
    message,
    labels: [{ path, message }],
    ...(help ? { help } : {}),
  });
}

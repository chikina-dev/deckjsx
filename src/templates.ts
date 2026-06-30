import type { Diagnostic } from "./diagnostics";
import { diagnostic } from "./diagnostics";
import type { AuthorElementPropValue } from "./authoring/tree";
import { SLIDE_FLOW_STYLE_KEYS } from "./style/keysets";
import type {
  CssAlignSelf,
  CssGridAreaAuthoringString,
  CssJustifySelf,
  ViewStyle,
} from "./style/types";
import { validateSupportedStyleDeclaration } from "./style/authoring-validation";

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

/**
 * Flow style accepted on a Slide Template root.
 *
 * This is the normal authoring path for reusable slide regions. It mirrors the public view layout
 * subset so template children can participate in grid, flex, and block flow without fixed
 * coordinates.
 */
export type SlideTemplateStyle = Pick<
  ViewStyle,
  | "display"
  | "gap"
  | "rowGap"
  | "columnGap"
  | "padding"
  | "alignItems"
  | "justifyContent"
  | "alignContent"
  | "flexWrap"
  | "gridTemplateAreas"
  | "gridTemplateColumns"
  | "gridTemplateRows"
  | "gridAutoColumns"
  | "gridAutoRows"
  | "gridAutoFlow"
  | "justifyItems"
  | "placeItems"
  | "placeContent"
>;

/**
 * Flow placement style accepted by a named area inside a Slide Template.
 *
 * The area style is applied to elements that use `area={template.name}` unless the element provides
 * its own inline style for the same property.
 */
export type TemplateAreaStyle = {
  readonly gridArea?: CssGridAreaAuthoringString;
  readonly alignSelf?: CssAlignSelf;
  readonly justifySelf?: CssJustifySelf;
};

/**
 * A named placement area inside a Slide Template.
 *
 * Areas define flow placement through `style`; fixed Template Area frames are intentionally not
 * part of the public authoring API.
 */
export type TemplateArea = {
  readonly style?: TemplateAreaStyle;
  readonly kind?: TemplateAreaKind;
};

/** A reusable Deck-owned slide structure made of named Template Areas and optional root flow style. */
export type SlideTemplate = {
  readonly areas: Readonly<Record<string, TemplateArea>>;
  readonly style?: SlideTemplateStyle;
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
 * @returns Diagnostics for malformed template sets, template areas, style objects, or reserved names.
 */
export function validateSlideTemplates(
  templates: unknown,
  path = "templates",
): readonly Diagnostic[] {
  if (templates === undefined) {
    return [];
  }

  if (!isRecord(templates)) {
    return [
      templateDiagnostic(
        "E_TEMPLATE_SET_INVALID",
        "slide templates are not part of the public authoring API",
        path,
        "Slide Template definitions must be an object keyed by template names in the public authoring API.",
      ),
    ];
  }

  const diagnostics: Diagnostic[] = [];
  Object.entries(templates).forEach(([templateName, template]) => {
    const templatePath = `${path}.${templateName}`;
    if (invalidName(templateName)) {
      diagnostics.push(
        templateDiagnostic(
          "E_TEMPLATE_RESERVED_NAME",
          "slide template name is not part of the public authoring API",
          templatePath,
          `Slide Template name "${templateName}" is not part of the public authoring API.`,
          ['Template names must not be empty or start with deckjsx-reserved "$".'],
        ),
      );
    }

    if (!isRecord(template)) {
      diagnostics.push(
        templateDiagnostic(
          "E_TEMPLATE_INVALID",
          "slide template is not part of the public authoring API",
          templatePath,
          "Slide Template definitions must be objects in the public authoring API.",
        ),
      );
      return;
    }

    diagnostics.push(...validateTemplateStyle(template.style, `${templatePath}.style`));

    if (!isRecord(template.areas)) {
      diagnostics.push(
        templateDiagnostic(
          "E_TEMPLATE_AREAS_INVALID",
          "template areas are not part of the public authoring API",
          `${templatePath}.areas`,
          "Slide Template areas must be an object keyed by area names in the public authoring API.",
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
            "template area name is not part of the public authoring API",
            areaPath,
            `Template Area name "${areaName}" is not part of the public authoring API.`,
            ['Template Area names must not be empty or start with deckjsx-reserved "$".'],
          ),
        );
      }

      if (!isRecord(area)) {
        diagnostics.push(
          templateDiagnostic(
            "E_TEMPLATE_AREA_INVALID",
            "template area is not part of the public authoring API",
            areaPath,
            "Template Area definitions must be objects in the public authoring API.",
          ),
        );
        return;
      }

      if (area.kind !== undefined && !isTemplateAreaKind(area.kind)) {
        diagnostics.push(
          templateDiagnostic(
            "E_TEMPLATE_AREA_KIND_INVALID",
            "template area kind is not part of the public authoring API",
            `${areaPath}.kind`,
            `Template Area kind is not part of the public authoring API. Use one of: ${TEMPLATE_AREA_KINDS.join(", ")}.`,
          ),
        );
      }

      const hasStyle = area.style !== undefined;
      if ("frame" in area) {
        diagnostics.push(
          templateDiagnostic(
            "E_TEMPLATE_AREA_FRAME_NON_PUBLIC",
            "template area frame is not part of the public authoring API",
            `${areaPath}.frame`,
            "Template Area frame is not part of the public authoring API.",
            [
              "Use Slide Template grid or flex flow plus Template Area style.gridArea, alignSelf, and justifySelf.",
            ],
          ),
        );
      }
      if (!hasStyle) {
        diagnostics.push(
          templateDiagnostic(
            "E_TEMPLATE_AREA_PLACEMENT_MISSING",
            "template area placement is missing",
            areaPath,
            "Template Area must define a public template-area style.",
          ),
        );
      }
      diagnostics.push(...validateTemplateAreaStyle(area.style, `${areaPath}.style`));
    });
  });

  return diagnostics;
}

function validateTemplateStyle(value: unknown, path: string): readonly Diagnostic[] {
  if (value === undefined) {
    return [];
  }
  if (!isRecord(value)) {
    return [
      templateDiagnostic(
        "E_TEMPLATE_STYLE_INVALID",
        "slide template style is not part of the public authoring API",
        path,
        "Slide Template style must be an object when provided in the public authoring API.",
      ),
    ];
  }
  const supportedKeys = new Set<string>(SLIDE_FLOW_STYLE_KEYS);
  const diagnostics: Diagnostic[] = [];
  for (const key of Object.keys(value)) {
    if (!supportedKeys.has(key)) {
      diagnostics.push(
        templateDiagnostic(
          "E_TEMPLATE_STYLE_NON_PUBLIC_PROP",
          "slide template style property is not part of the public authoring API",
          `${path}.${key}`,
          `Slide Template style property ${key} is not part of the public authoring API.`,
          [
            "Use flow layout keys such as display, gridTemplateAreas, grid tracks, gap, padding, and alignment.",
          ],
        ),
      );
    }
  }

  const publicStyle = Object.fromEntries(
    Object.entries(value).filter(([key]) => supportedKeys.has(key)),
  ) as Readonly<Record<string, AuthorElementPropValue>>;

  diagnostics.push(
    ...validateSupportedStyleDeclaration({
      path,
      tag: "div",
      style: publicStyle,
    }),
  );

  return diagnostics;
}

function validateTemplateAreaStyle(value: unknown, path: string): readonly Diagnostic[] {
  if (value === undefined) {
    return [];
  }
  if (!isRecord(value)) {
    return [
      templateDiagnostic(
        "E_TEMPLATE_AREA_STYLE_INVALID",
        "template area style is not part of the public authoring API",
        path,
        "Template Area style must be an object when provided in the public authoring API.",
      ),
    ];
  }

  const supportedKeys = new Set(["gridArea", "alignSelf", "justifySelf"]);
  const diagnostics: Diagnostic[] = [];
  for (const key of Object.keys(value)) {
    if (!supportedKeys.has(key)) {
      diagnostics.push(
        templateDiagnostic(
          "E_TEMPLATE_AREA_STYLE_NON_PUBLIC_PROP",
          "template area style property is not part of the public authoring API",
          `${path}.${key}`,
          `Template Area style property ${key} is not part of the public authoring API.`,
          ["Use gridArea, alignSelf, or justifySelf for flow placement inside a Slide Template."],
        ),
      );
    }
  }

  const publicStyle = Object.fromEntries(
    Object.entries(value).filter(([key]) => supportedKeys.has(key)),
  ) as Readonly<Record<string, AuthorElementPropValue>>;

  diagnostics.push(
    ...validateSupportedStyleDeclaration({
      path,
      tag: "div",
      style: publicStyle,
    }),
  );

  return diagnostics;
}

function invalidName(value: string): boolean {
  return value.trim().length === 0 || value.startsWith("$");
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

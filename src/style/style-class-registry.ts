import { diagnostic, type Diagnostic } from "../diagnostics";
import type { SemanticNode, StyleEntity } from "../graph";
import type { AuthoredTag } from "../authoring/tags";
import { isAuthoringStyleRecord, validateSupportedStyleDeclaration } from "./authoring-validation";
import type { StyleSheetValue } from "./stylesheet/public";
import type { StyleDeclaration } from "./declaration";
import {
  collectSelectorConditionClassNames,
  compareSpecificity,
  cssEscapeIdentifier,
  parseSelector,
  rightmostSelectorHasClass,
  selectorFor,
  selectorMatches,
  type ParsedSelector,
  type SelectorContext,
  type Specificity,
} from "./selectors";

type StyleTargetSelector = string;

type RuntimeTargetedStyleClassDefinition = {
  readonly target?: unknown;
  readonly style: unknown;
};

type RuntimeStyleClassDefinition = StyleDeclaration | RuntimeTargetedStyleClassDefinition;

type RegisteredClass = {
  readonly className: string;
  readonly definition: RuntimeStyleClassDefinition;
  readonly stylesheetIndex: number;
  readonly ruleIndex: number;
  readonly path: string;
  readonly selectors: readonly RegisteredSelector[];
  readonly hasTargetDiagnostics: boolean;
};

type RegisteredSelector = {
  readonly text: string;
  readonly selector: ParsedSelector;
};

export type StyleClassRegistry = {
  readonly classes: ReadonlyMap<string, readonly RegisteredClass[]>;
  readonly selectorConditionClassNames: ReadonlySet<string>;
};

export type MatchedClass = {
  readonly registration: RegisteredClass;
  readonly selector: string;
  readonly specificity: Specificity;
  readonly style: StyleDeclaration;
};

function isTargetedDefinition(
  definition: RuntimeStyleClassDefinition,
): definition is RuntimeTargetedStyleClassDefinition {
  return "style" in definition;
}

function styleObjectFor(definition: RuntimeStyleClassDefinition): StyleDeclaration {
  return (isTargetedDefinition(definition) ? definition.style : definition) as StyleDeclaration;
}

function targetsFor(
  definition: RuntimeStyleClassDefinition,
): readonly StyleTargetSelector[] | undefined {
  if (!isTargetedDefinition(definition) || definition.target === undefined) {
    return undefined;
  }

  return typeof definition.target === "string"
    ? [definition.target as StyleTargetSelector]
    : (definition.target as StyleTargetSelector[]);
}

function invalidTargetValueReason(target: unknown): string | undefined {
  if (typeof target === "string") {
    return target.trim().length === 0 ? "Style Class targets must not be empty." : undefined;
  }

  if (!Array.isArray(target) || target.length === 0) {
    return "Style Class targets must be a non-empty string or a non-empty array of strings.";
  }

  return target.every((item) => typeof item === "string" && item.trim().length > 0)
    ? undefined
    : "Style Class targets must be a non-empty string or a non-empty array of strings.";
}

function targetTextsFor(input: {
  definition: RuntimeStyleClassDefinition;
  className: string;
  path: string;
  diagnostics: Diagnostic[];
}): readonly StyleTargetSelector[] | undefined {
  if (!isTargetedDefinition(input.definition) || input.definition.target === undefined) {
    return undefined;
  }

  const invalidReason = invalidTargetValueReason(input.definition.target);
  if (invalidReason) {
    input.diagnostics.push(
      styleDiagnostic({
        code: "E_STYLE_INVALID_CLASS_TARGET",
        title: "style class target is not part of the public authoring API",
        path: `${input.path}.target`,
        message: `Style Class "${input.className}" target is not part of the public authoring API. ${invalidReason}`,
        help: [
          "Use a public StyleSheet selector string such as p.title, div.card, or an array of those selector strings.",
        ],
      }),
    );
    return [];
  }

  return targetsFor(input.definition) ?? [];
}

function isTargetlessStyleDeclaration(definition: RuntimeStyleClassDefinition): boolean {
  return isTargetedDefinition(definition)
    ? definition.target === undefined
    : Object.keys(definition).length > 0;
}

function rightmostSelectorNamesAuthoredTag(selector: ParsedSelector): boolean {
  return selector.parts.at(-1)?.tag !== undefined;
}

function validateTargetedStyleForTag(input: {
  definition: RuntimeTargetedStyleClassDefinition;
  path: string;
  tag: AuthoredTag;
  diagnostics: Diagnostic[];
}): boolean {
  const style = input.definition.style;
  if (!isAuthoringStyleRecord(style)) {
    input.diagnostics.push(
      styleDiagnostic({
        code: "E_STYLE_CLASS_STYLE_INVALID",
        title: "style class style is not part of the public authoring API",
        path: `${input.path}.style`,
        message: "Style Class style declarations must be objects in the public authoring API.",
        help: ['Use { target: "p.className", style: { color: "red" } }.'],
      }),
    );
    return false;
  }

  const declarationDiagnostics = validateSupportedStyleDeclaration({
    path: `${input.path}.style`,
    tag: input.tag,
    style,
  });
  input.diagnostics.push(...declarationDiagnostics);
  return declarationDiagnostics.length === 0;
}

function invalidClassNameReason(name: string): string | undefined {
  if (name.trim().length === 0) {
    return "Style Class names must not be empty.";
  }

  if (/\s/.test(name)) {
    return "Style Class names must not contain whitespace.";
  }

  return undefined;
}

function styleDiagnostic(input: {
  code: string;
  title: string;
  path: string;
  message: string;
  severity?: "error" | "warning";
  help?: readonly string[];
}): Diagnostic {
  return diagnostic({
    severity: input.severity ?? "error",
    code: input.code,
    title: input.title,
    message: input.message,
    labels: [{ path: input.path, message: input.message }],
    ...(input.help ? { help: input.help } : {}),
  });
}

export function registerStylesheets(
  sourceKey: string,
  stylesheets: readonly StyleSheetValue[] | undefined,
  diagnostics: Diagnostic[],
): StyleClassRegistry {
  const classes = new Map<string, RegisteredClass[]>();
  const selectorConditionClassNames = new Set<string>();
  let ruleIndex = 0;

  stylesheets?.forEach((stylesheet, stylesheetIndex) => {
    const stylesheetPath = `source:${sourceKey} > stylesheet[${stylesheetIndex}]`;
    if (!isAuthoringStyleRecord(stylesheet)) {
      diagnostics.push(
        styleDiagnostic({
          code: "E_STYLE_SHEET_INVALID",
          title: "registered stylesheet is not part of the public authoring API",
          path: stylesheetPath,
          message:
            "Registered StyleSheet values must be StyleSheet objects in the public authoring API.",
          help: ["Register styles with deck.useStyles(new StyleSheet({ classes: { ... } }))."],
        }),
      );
      return;
    }

    const classesPath = `source:${sourceKey} > stylesheet[${stylesheetIndex}].classes`;
    if (!isAuthoringStyleRecord(stylesheet.classes)) {
      diagnostics.push(
        styleDiagnostic({
          code: "E_STYLE_SHEET_CLASSES_INVALID",
          title: "stylesheet classes are not part of the public authoring API",
          path: classesPath,
          message: "StyleSheet classes must be an object in the public authoring API.",
          help: ["Pass new StyleSheet({ classes: { className: { target, style } } })."],
        }),
      );
      return;
    }

    Object.entries(stylesheet.classes).forEach(([className, definition]) => {
      const path = `source:${sourceKey} > stylesheet[${stylesheetIndex}].classes.${className}`;
      if (!isAuthoringStyleRecord(definition)) {
        diagnostics.push(
          styleDiagnostic({
            code: "E_STYLE_CLASS_DEFINITION_INVALID",
            title: "style class definition is not part of the public authoring API",
            path,
            message: `Style Class "${className}" definition must be an object in the public authoring API.`,
            help: [
              'Use { target: "p.className", style: { ... } } for styled classes, or {} for selector participation only.',
            ],
          }),
        );
        const list = classes.get(className) ?? [];
        classes.set(className, [
          ...list,
          {
            className,
            definition: {},
            stylesheetIndex,
            ruleIndex: ruleIndex++,
            path,
            selectors: [],
            hasTargetDiagnostics: true,
          },
        ]);
        return;
      }

      const invalidReason = invalidClassNameReason(className);
      if (invalidReason) {
        diagnostics.push(
          styleDiagnostic({
            code: "E_STYLE_INVALID_CLASS_NAME",
            title: "style class name is not part of the public authoring API",
            path,
            message: `${invalidReason} This is not part of the public authoring API.`,
            help: ["Use a non-empty class token without whitespace."],
          }),
        );
        return;
      }

      if (isTargetlessStyleDeclaration(definition)) {
        diagnostics.push(
          styleDiagnostic({
            code: "E_STYLE_CLASS_TARGET_REQUIRED",
            title: "style class targetless declaration is not part of the public authoring API",
            path,
            message: `Style Class "${className}" targetless style declaration is not part of the public authoring API.`,
            help: [
              'Use an explicit authored tag target such as { target: "p.className", style: { ... } }.',
            ],
          }),
        );
        const list = classes.get(className) ?? [];
        classes.set(className, [
          ...list,
          {
            className,
            definition,
            stylesheetIndex,
            ruleIndex: ruleIndex++,
            path,
            selectors: [],
            hasTargetDiagnostics: true,
          },
        ]);
        return;
      }

      const targets = targetTextsFor({ definition, className, path, diagnostics });
      const selectorTexts = targets === undefined ? [selectorFor(className, undefined)] : targets;
      let hasTargetDiagnostics = false;
      const selectors: RegisteredSelector[] = [];

      if (targets !== undefined && targets.length === 0) {
        hasTargetDiagnostics = true;
      }

      selectorTexts.forEach((selectorText) => {
        const selector = parseSelector(selectorText);
        if (!selector) {
          hasTargetDiagnostics = true;
          diagnostics.push(
            styleDiagnostic({
              code: "E_STYLE_NON_PUBLIC_SELECTOR",
              title: "stylesheet selector is not part of the public authoring API",
              path,
              message: `Selector "${selectorText}" is not part of the public authoring API.`,
              help: [
                "Use a public StyleSheet selector: class, authored tag, compound tag/class, or descendant selectors such as .title, p.title, or .card .caption.",
              ],
            }),
          );
          return;
        }

        if (!rightmostSelectorHasClass(selector, className)) {
          hasTargetDiagnostics = true;
          diagnostics.push(
            styleDiagnostic({
              code: "E_STYLE_INVALID_CLASS_TARGET",
              title: "style class target must include its class selector",
              path,
              message: `Style Class "${className}" target must include .${cssEscapeIdentifier(className)} in the rightmost selector.`,
              help: ["Write the target as a CSS selector such as p.title or .card .title."],
            }),
          );
          return;
        }

        if (isTargetedDefinition(definition) && !rightmostSelectorNamesAuthoredTag(selector)) {
          hasTargetDiagnostics = true;
          diagnostics.push(
            styleDiagnostic({
              code: "E_STYLE_CLASS_TARGET_REQUIRES_TAG",
              title: "style class target is not part of the public authoring API",
              path,
              message: `Style Class "${className}" target is not part of the public authoring API unless it names an authored tag.`,
              help: [
                "Use a tag-qualified public StyleSheet selector such as p.title, div.card, or img.logo.",
              ],
            }),
          );
          return;
        }

        const tag = selector.parts.at(-1)?.tag;
        if (
          isTargetedDefinition(definition) &&
          tag !== undefined &&
          !validateTargetedStyleForTag({ definition, path, tag, diagnostics })
        ) {
          hasTargetDiagnostics = true;
          return;
        }

        collectSelectorConditionClassNames(className, selector).forEach((name) =>
          selectorConditionClassNames.add(name),
        );
        selectors.push({ text: selectorText, selector });
      });

      const list = classes.get(className) ?? [];
      classes.set(className, [
        ...list,
        {
          className,
          definition,
          stylesheetIndex,
          ruleIndex: ruleIndex++,
          path,
          selectors,
          hasTargetDiagnostics,
        },
      ]);
    });
  });

  return { classes, selectorConditionClassNames };
}

export function resolveClassMatches(
  node: SemanticNode,
  entity: StyleEntity,
  registry: StyleClassRegistry,
  context: SelectorContext,
  diagnostics: Diagnostic[],
): MatchedClass[] {
  const classRefs = entity.authored.classRefs ?? [];
  const activeClassNames = new Set(classRefs.map((ref) => ref.name));
  const matched: MatchedClass[] = [];

  [...activeClassNames].forEach((className) => {
    const registrations = registry.classes.get(className);
    if (!registrations || registrations.length === 0) {
      if (!registry.selectorConditionClassNames.has(className)) {
        diagnostics.push(
          styleDiagnostic({
            severity: "warning",
            code: "E_STYLE_UNKNOWN_CLASS",
            title: "unknown style class",
            path: node.origin.path,
            message: `Style Class "${className}" is referenced but is not defined in this source.`,
            help: ["Register a stylesheet with deck.useStyles() on the same Deck source."],
          }),
        );
      }
      return;
    }

    const before = matched.length;
    let hasTargetDiagnostics = false;
    registrations.forEach((registration) => {
      hasTargetDiagnostics ||= registration.hasTargetDiagnostics;

      registration.selectors.forEach(({ selector, text }) => {
        if (!selectorMatches(className, selector, node, activeClassNames, context)) {
          return;
        }

        matched.push({
          registration,
          selector: text,
          specificity: selector.specificity,
          style: styleObjectFor(registration.definition),
        });
      });
    });

    if (matched.length === before && !hasTargetDiagnostics) {
      diagnostics.push(
        styleDiagnostic({
          code: "E_STYLE_TARGET_MISMATCH",
          title: "style class target does not match element",
          path: node.origin.path,
          message: `Style Class "${className}" is defined but no target matches this element.`,
          help: ["Adjust the class target selector or move the className to a matching element."],
        }),
      );
    }
  });

  return matched.sort((left, right) => {
    const specificity = compareSpecificity(left.specificity, right.specificity);
    return specificity || left.registration.ruleIndex - right.registration.ruleIndex;
  });
}

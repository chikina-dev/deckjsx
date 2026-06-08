import { diagnostic, type Diagnostic } from "../diagnostics";
import type { SemanticNode, StyleEntity } from "../graph";
import type {
  StyleClassDefinition,
  StyleSheet,
  StyleTargetSelector,
  TargetedStyleClassDefinition,
} from "./stylesheet";
import type { StyleDeclaration } from "./types";
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

type RegisteredClass = {
  readonly className: string;
  readonly definition: StyleClassDefinition;
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
  definition: StyleClassDefinition,
): definition is TargetedStyleClassDefinition {
  return "style" in definition && typeof definition.style === "object" && definition.style !== null;
}

function styleObjectFor(definition: StyleClassDefinition): StyleDeclaration {
  return isTargetedDefinition(definition) ? definition.style : definition;
}

function targetsFor(definition: StyleClassDefinition): readonly StyleTargetSelector[] | undefined {
  if (!isTargetedDefinition(definition) || definition.target === undefined) {
    return undefined;
  }

  return typeof definition.target === "string" ? [definition.target] : definition.target;
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
  stylesheets: readonly StyleSheet[] | undefined,
  diagnostics: Diagnostic[],
): StyleClassRegistry {
  const classes = new Map<string, RegisteredClass[]>();
  const selectorConditionClassNames = new Set<string>();
  let ruleIndex = 0;

  stylesheets?.forEach((stylesheet, stylesheetIndex) => {
    Object.entries(stylesheet.classes).forEach(([className, definition]) => {
      const path = `source:${sourceKey} > stylesheet[${stylesheetIndex}].classes.${className}`;
      const invalidReason = invalidClassNameReason(className);
      if (invalidReason) {
        diagnostics.push(
          styleDiagnostic({
            code: "E_STYLE_INVALID_CLASS_NAME",
            title: "invalid style class name",
            path,
            message: invalidReason,
          }),
        );
        return;
      }

      const targets = targetsFor(definition);
      const selectorTexts = targets === undefined ? [selectorFor(className, undefined)] : targets;
      let hasTargetDiagnostics = false;
      const selectors: RegisteredSelector[] = [];

      selectorTexts.forEach((selectorText) => {
        const selector = parseSelector(selectorText);
        if (!selector) {
          hasTargetDiagnostics = true;
          diagnostics.push(
            styleDiagnostic({
              code: "E_STYLE_UNSUPPORTED_SELECTOR",
              title: "unsupported stylesheet selector",
              path,
              message: `Selector "${selectorText}" is not supported.`,
              help: [
                "Use class, tag, compound tag/class, or descendant selectors such as .title, p.title, or .card .caption.",
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

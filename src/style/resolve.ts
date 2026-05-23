import type { StyleClassDefinition, StyleSheet, StyleTargetSelector } from "../authoring/index";
import { createDiagnostics, diagnostic, type Diagnostic, type Diagnostics } from "../diagnostics";
import type { ComposedAuthorRoot } from "../composition/types";
import type {
  SemanticAuthorGraph,
  SemanticNode,
  SourceOrigin,
  StyleClassRef,
  StyleEntity,
  StyleEntityId,
} from "../graph";

export type ResolvedStyleLayer = "default" | "theme" | "class" | "style";

export type ResolvedStyleSource =
  | { readonly layer: "default" }
  | { readonly layer: "theme" }
  | {
      readonly layer: "class";
      readonly className: string;
      readonly stylesheetIndex: number;
      readonly ruleIndex: number;
      readonly selector: string;
    }
  | { readonly layer: "style" };

export type ResolvedStyleProperty = {
  readonly value: unknown;
  readonly source: ResolvedStyleSource;
};

export type ResolvedStyle = {
  readonly style: Readonly<Record<string, unknown>>;
  readonly properties: Readonly<Record<string, ResolvedStyleProperty>>;
  readonly appliedClasses: readonly ResolvedStyleSource[];
};

export type ResolvedStyleMap = ReadonlyMap<StyleEntityId, ResolvedStyle>;

export type StyleResolutionResult = {
  readonly resolvedStyles: ResolvedStyleMap;
  readonly diagnostics: Diagnostics;
};

type Specificity = readonly [ids: number, classes: number, tags: number];

type RegisteredClass = {
  readonly className: string;
  readonly definition: StyleClassDefinition;
  readonly stylesheetIndex: number;
  readonly ruleIndex: number;
  readonly path: string;
};

type MatchedClass = {
  readonly registration: RegisteredClass;
  readonly selector: string;
  readonly specificity: Specificity;
  readonly style: Record<string, unknown>;
};

type ParsedSelector = {
  readonly tag?: string;
  readonly classes: readonly string[];
  readonly specificity: Specificity;
};

function sourceKeyFor(source: SourceOrigin | undefined): string {
  return !source || source.kind === "root" ? "root" : source.sourceIdentity;
}

function classesBySource(
  roots: readonly ComposedAuthorRoot[],
): ReadonlyMap<string, readonly StyleSheet[]> {
  const stylesheets = new Map<string, readonly StyleSheet[]>();

  roots.forEach((root) => {
    const key = sourceKeyFor(root.source);
    if (!stylesheets.has(key)) {
      stylesheets.set(key, root.stylesheets);
    }
  });

  return stylesheets;
}

function isTargetedDefinition(
  definition: StyleClassDefinition,
): definition is Extract<StyleClassDefinition, { readonly style: unknown }> {
  return (
    typeof definition === "object" &&
    definition !== null &&
    "style" in definition &&
    typeof (definition as { readonly style?: unknown }).style === "object" &&
    (definition as { readonly style?: unknown }).style !== null
  );
}

function styleObjectFor(definition: StyleClassDefinition): Record<string, unknown> {
  const style = isTargetedDefinition(definition) ? definition.style : definition;
  return style as Record<string, unknown>;
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

  if (name.includes("/")) {
    return "Style Class names must not contain /.";
  }

  return undefined;
}

function styleDiagnostic(input: {
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

function compareSpecificity(left: Specificity, right: Specificity): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function parseSelector(selector: string): ParsedSelector | undefined {
  const value = selector.trim();
  if (value.length === 0 || /[\s>+~#:[\],*]/.test(value)) {
    return undefined;
  }

  const tagMatch = value.match(/^[a-z][a-z0-9-]*/);
  const tag = tagMatch?.[0];
  const rest = tag ? value.slice(tag.length) : value;

  if (rest.length === 0) {
    return {
      ...(tag ? { tag } : {}),
      classes: [],
      specificity: [0, 0, tag ? 1 : 0],
    };
  }

  const classMatches = [...rest.matchAll(/\.([_a-zA-Z-][_a-zA-Z0-9-]*)/g)];
  const consumed = classMatches.map((match) => match[0]).join("");
  if (consumed !== rest || classMatches.length === 0) {
    return undefined;
  }

  return {
    ...(tag ? { tag } : {}),
    classes: classMatches.map((match) => match[1]),
    specificity: [0, classMatches.length, tag ? 1 : 0],
  };
}

function selectorFor(className: string, target: string | undefined): string {
  if (target === undefined) {
    return `.${className}`;
  }

  return target;
}

function effectiveSpecificity(className: string, selector: ParsedSelector): Specificity {
  const includesClassName = selector.classes.includes(className);
  return [
    selector.specificity[0],
    selector.specificity[1] + (includesClassName ? 0 : 1),
    selector.specificity[2],
  ];
}

function selectorMatches(
  className: string,
  selector: ParsedSelector,
  node: SemanticNode,
  activeClassNames: ReadonlySet<string>,
): boolean {
  if (!activeClassNames.has(className)) {
    return false;
  }

  if (selector.tag !== undefined && node.authoredTag !== selector.tag) {
    return false;
  }

  return selector.classes.every((name) => activeClassNames.has(name));
}

function registerStylesheets(
  sourceKey: string,
  stylesheets: readonly StyleSheet[] | undefined,
  diagnostics: Diagnostic[],
): Map<string, RegisteredClass[]> {
  const classes = new Map<string, RegisteredClass[]>();
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

      const list = classes.get(className) ?? [];
      classes.set(className, [
        ...list,
        { className, definition, stylesheetIndex, ruleIndex: ruleIndex++, path },
      ]);
    });
  });

  return classes;
}

function resolveClassMatches(
  node: SemanticNode,
  entity: StyleEntity,
  registry: ReadonlyMap<string, readonly RegisteredClass[]>,
  diagnostics: Diagnostic[],
): MatchedClass[] {
  const classRefs = entity.authored.classRefs ?? [];
  const activeClassNames = new Set(classRefs.map((ref) => ref.name));
  const matched: MatchedClass[] = [];

  [...activeClassNames].forEach((className) => {
    const registrations = registry.get(className);
    if (!registrations || registrations.length === 0) {
      diagnostics.push(
        styleDiagnostic({
          code: "E_STYLE_UNKNOWN_CLASS",
          title: "unknown style class",
          path: node.origin.path,
          message: `Style Class "${className}" is referenced but is not defined in this source.`,
          help: ["Register a stylesheet with deck.useStyles() on the same Deck source."],
        }),
      );
      return;
    }

    const before = matched.length;
    let hasSelectorDiagnostic = false;
    registrations.forEach((registration) => {
      const targets = targetsFor(registration.definition);
      const selectors = targets === undefined ? [undefined] : targets;

      selectors.forEach((target) => {
        const selectorText = selectorFor(className, target);
        const selector = parseSelector(selectorText);
        if (!selector) {
          hasSelectorDiagnostic = true;
          diagnostics.push(
            styleDiagnostic({
              code: "E_STYLE_UNSUPPORTED_SELECTOR",
              title: "unsupported stylesheet selector",
              path: registration.path,
              message: `Selector "${selectorText}" is not supported in v0.4.0.`,
              help: [
                "Use a simple class selector such as .title or a compound selector such as p.title.",
              ],
            }),
          );
          return;
        }

        if (!selectorMatches(className, selector, node, activeClassNames)) {
          return;
        }

        matched.push({
          registration,
          selector: selectorText,
          specificity: effectiveSpecificity(className, selector),
          style: styleObjectFor(registration.definition),
        });
      });
    });

    if (matched.length === before && !hasSelectorDiagnostic) {
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

function applyProperties(
  style: Record<string, unknown>,
  source: ResolvedStyleSource,
  properties: Record<string, ResolvedStyleProperty>,
): void {
  Object.entries(style).forEach(([key, value]) => {
    properties[key] = { value, source };
  });
}

function resolvedStyleFor(
  node: SemanticNode,
  entity: StyleEntity,
  registry: ReadonlyMap<string, readonly RegisteredClass[]>,
  diagnostics: Diagnostic[],
): ResolvedStyle {
  const properties: Record<string, ResolvedStyleProperty> = {};
  const appliedClasses: ResolvedStyleSource[] = [];

  const matchedClasses = resolveClassMatches(node, entity, registry, diagnostics);
  matchedClasses.forEach((match) => {
    const source: ResolvedStyleSource = {
      layer: "class",
      className: match.registration.className,
      stylesheetIndex: match.registration.stylesheetIndex,
      ruleIndex: match.registration.ruleIndex,
      selector: match.selector,
    };
    appliedClasses.push(source);
    applyProperties(match.style, source, properties);
  });

  if (typeof entity.authored.style === "object" && entity.authored.style !== null) {
    applyProperties(
      entity.authored.style as Record<string, unknown>,
      { layer: "style" },
      properties,
    );
  }

  return {
    style: Object.fromEntries(
      Object.entries(properties).map(([key, property]) => [key, property.value]),
    ),
    properties,
    appliedClasses,
  };
}

function nodeByStyleRef(graph: SemanticAuthorGraph): ReadonlyMap<StyleEntityId, SemanticNode> {
  const nodes = new Map<StyleEntityId, SemanticNode>();
  graph.nodes.forEach((node) => {
    if (node.styleRef) {
      nodes.set(node.styleRef, node);
    }
  });
  return nodes;
}

export function resolveStyles(
  graph: SemanticAuthorGraph,
  roots: readonly ComposedAuthorRoot[],
): StyleResolutionResult {
  const diagnostics: Diagnostic[] = [];
  const stylesheets = classesBySource(roots);
  const registries = new Map<string, Map<string, RegisteredClass[]>>();
  const nodes = nodeByStyleRef(graph);
  const resolvedStyles = new Map<StyleEntityId, ResolvedStyle>();

  stylesheets.forEach((sourceStylesheets, sourceKey) => {
    registries.set(sourceKey, registerStylesheets(sourceKey, sourceStylesheets, diagnostics));
  });

  graph.styles.forEach((entity, id) => {
    const node = nodes.get(id);
    if (!node) {
      return;
    }

    const sourceKey = sourceKeyFor(node.origin.source);
    let registry = registries.get(sourceKey);
    if (!registry) {
      registry = registerStylesheets(sourceKey, stylesheets.get(sourceKey), diagnostics);
      registries.set(sourceKey, registry);
    }

    resolvedStyles.set(id, resolvedStyleFor(node, entity, registry, diagnostics));
  });

  return {
    resolvedStyles,
    diagnostics: createDiagnostics(diagnostics),
  };
}

export function classRefsToNames(
  classRefs: readonly StyleClassRef[] | undefined,
): readonly string[] {
  return classRefs?.map((ref) => ref.name) ?? [];
}

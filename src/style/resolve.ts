import type { StyleClassDefinition, StyleSheet, StyleTargetSelector } from "../authoring/index";
import { isAuthoredTag } from "../authoring/tags";
import { createDiagnostics, diagnostic, type Diagnostic, type Diagnostics } from "../diagnostics";
import type { ComposedAuthorRoot } from "../composition/types";
import type {
  GraphNodeId,
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
  readonly selectors: readonly RegisteredSelector[];
  readonly hasTargetDiagnostics: boolean;
};

type RegisteredSelector = {
  readonly text: string;
  readonly selector: ParsedSelector;
};

type StyleClassRegistry = {
  readonly classes: ReadonlyMap<string, readonly RegisteredClass[]>;
  readonly selectorConditionClassNames: ReadonlySet<string>;
};

type MatchedClass = {
  readonly registration: RegisteredClass;
  readonly selector: string;
  readonly specificity: Specificity;
  readonly style: Record<string, unknown>;
};

type SelectorPart = {
  readonly tag?: string;
  readonly classes: readonly string[];
};

type ParsedSelector = {
  readonly parts: readonly SelectorPart[];
  readonly specificity: Specificity;
};

type SelectorContext = {
  readonly graph: SemanticAuthorGraph;
  readonly parentById: ReadonlyMap<GraphNodeId, GraphNodeId>;
  readonly classNamesByNodeId: ReadonlyMap<GraphNodeId, ReadonlySet<string>>;
};

const EMPTY_CLASS_NAMES: ReadonlySet<string> = new Set();

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

function compareSpecificity(left: Specificity, right: Specificity): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function addSpecificity(left: Specificity, right: Specificity): Specificity {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function isHexDigit(value: string | undefined): boolean {
  return value !== undefined && /^[0-9a-fA-F]$/.test(value);
}

function isSelectorDelimiter(value: string | undefined): boolean {
  return value === undefined || /[\s.#:[\]>+~*,/]/.test(value);
}

function decodeEscape(input: string, start: number): { value: string; next: number } | undefined {
  const next = input[start + 1];
  if (next === undefined || next === "\n" || next === "\r" || next === "\f") {
    return undefined;
  }

  if (!isHexDigit(next)) {
    return { value: next, next: start + 2 };
  }

  let index = start + 1;
  let hex = "";
  while (index < input.length && hex.length < 6 && isHexDigit(input[index])) {
    hex += input[index];
    index += 1;
  }

  if (/\s/.test(input[index] ?? "")) {
    index += 1;
  }

  const codePoint = Number.parseInt(hex, 16);
  if (codePoint === 0 || codePoint > 0x10ffff) {
    return { value: "\uFFFD", next: index };
  }

  return { value: String.fromCodePoint(codePoint), next: index };
}

function parseClassIdentifier(
  input: string,
  start: number,
): { value: string; next: number } | undefined {
  let index = start;
  let value = "";

  while (index < input.length && !isSelectorDelimiter(input[index])) {
    if (input[index] === "\\") {
      const escaped = decodeEscape(input, index);
      if (!escaped) {
        return undefined;
      }

      value += escaped.value;
      index = escaped.next;
      continue;
    }

    value += input[index];
    index += 1;
  }

  return value.length === 0 ? undefined : { value, next: index };
}

function cssEscapeIdentifier(value: string): string {
  let escaped = "";
  const firstCodePoint = value.codePointAt(0);
  let position = 0;

  for (const char of value) {
    const codePoint = char.codePointAt(0);

    if (codePoint === undefined) {
      continue;
    }

    if (codePoint === 0x0000) {
      escaped += "\uFFFD";
      position += 1;
      continue;
    }

    if (
      (codePoint >= 0x0001 && codePoint <= 0x001f) ||
      codePoint === 0x007f ||
      (position === 0 && codePoint >= 0x0030 && codePoint <= 0x0039) ||
      (position === 1 && codePoint >= 0x0030 && codePoint <= 0x0039 && firstCodePoint === 0x002d)
    ) {
      escaped += `\\${codePoint.toString(16)} `;
      position += 1;
      continue;
    }

    if (position === 0 && value === "-" && codePoint === 0x002d) {
      escaped += `\\${char}`;
      position += 1;
      continue;
    }

    if (
      codePoint >= 0x0080 ||
      codePoint === 0x002d ||
      codePoint === 0x005f ||
      (codePoint >= 0x0030 && codePoint <= 0x0039) ||
      (codePoint >= 0x0041 && codePoint <= 0x005a) ||
      (codePoint >= 0x0061 && codePoint <= 0x007a)
    ) {
      escaped += char;
      position += 1;
      continue;
    }

    escaped += `\\${char}`;
    position += 1;
  }

  return escaped;
}

function parseSelectorPart(
  value: string,
): { part: SelectorPart; specificity: Specificity } | undefined {
  if (value.length === 0) {
    return undefined;
  }

  const tagMatch = value.match(/^[a-z][a-z0-9-]*/);
  const tag = tagMatch?.[0];
  if (tag !== undefined && !isAuthoredTag(tag)) {
    return undefined;
  }

  const rest = tag ? value.slice(tag.length) : value;

  if (rest.length === 0) {
    return {
      part: {
        ...(tag ? { tag } : {}),
        classes: [],
      },
      specificity: [0, 0, tag ? 1 : 0],
    };
  }

  const classes: string[] = [];
  let index = 0;
  while (index < rest.length) {
    if (rest[index] !== ".") {
      return undefined;
    }

    const parsedClass = parseClassIdentifier(rest, index + 1);
    if (!parsedClass) {
      return undefined;
    }

    classes.push(parsedClass.value);
    index = parsedClass.next;
  }

  return {
    part: {
      ...(tag ? { tag } : {}),
      classes,
    },
    specificity: [0, classes.length, tag ? 1 : 0],
  };
}

function parseSelector(selector: string): ParsedSelector | undefined {
  const value = selector.trim();
  if (value.length === 0) {
    return undefined;
  }

  const parsedParts = splitSelectorParts(value).map(parseSelectorPart);
  const parts: SelectorPart[] = [];
  let specificity: Specificity = [0, 0, 0];

  for (const parsedPart of parsedParts) {
    if (parsedPart === undefined) {
      return undefined;
    }

    parts.push(parsedPart.part);
    specificity = addSpecificity(specificity, parsedPart.specificity);
  }

  if (parts.length === 0) {
    return undefined;
  }

  return {
    parts,
    specificity,
  };
}

function splitSelectorParts(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let index = 0;

  while (index < value.length) {
    const char = value[index];

    if (/\s/.test(char)) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      index += 1;
      continue;
    }

    if (char !== "\\") {
      current += char;
      index += 1;
      continue;
    }

    const next = value[index + 1];
    current += char;

    if (isHexDigit(next)) {
      let hexIndex = index + 1;
      let hexLength = 0;
      while (hexIndex < value.length && hexLength < 6 && isHexDigit(value[hexIndex])) {
        current += value[hexIndex];
        hexIndex += 1;
        hexLength += 1;
      }

      if (/\s/.test(value[hexIndex] ?? "")) {
        current += value[hexIndex];
        hexIndex += 1;
      }

      index = hexIndex;
      continue;
    }

    if (next !== undefined) {
      current += next;
      index += 2;
      continue;
    }

    index += 1;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

function selectorFor(className: string, target: string | undefined): string {
  if (target === undefined) {
    return `.${cssEscapeIdentifier(className)}`;
  }

  return target;
}

function rightmostSelectorHasClass(selector: ParsedSelector, className: string): boolean {
  return selector.parts.at(-1)?.classes.includes(className) ?? false;
}

function collectSelectorConditionClassNames(
  className: string,
  selector: ParsedSelector,
): readonly string[] {
  return selector.parts.flatMap((part, index) =>
    index === selector.parts.length - 1
      ? part.classes.filter((name) => name !== className)
      : part.classes,
  );
}

function classNamesFor(node: SemanticNode, context: SelectorContext): ReadonlySet<string> {
  return context.classNamesByNodeId.get(node.id) ?? EMPTY_CLASS_NAMES;
}

function selectorPartMatches(
  part: SelectorPart,
  node: SemanticNode,
  context: SelectorContext,
): boolean {
  if (part.tag !== undefined && node.authoredTag !== part.tag) {
    return false;
  }

  const activeClassNames = classNamesFor(node, context);
  return part.classes.every((name) => activeClassNames.has(name));
}

function ancestorMatches(
  parts: readonly SelectorPart[],
  node: SemanticNode,
  context: SelectorContext,
): boolean {
  let parentId = context.parentById.get(node.id);

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    let matched = false;

    while (parentId !== undefined) {
      const parent = context.graph.nodes.get(parentId);
      parentId = context.parentById.get(parentId);

      if (!parent) {
        continue;
      }

      if (selectorPartMatches(part, parent, context)) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      return false;
    }
  }

  return true;
}

function selectorMatches(
  className: string,
  selector: ParsedSelector,
  node: SemanticNode,
  activeClassNames: ReadonlySet<string>,
  context: SelectorContext,
): boolean {
  if (!activeClassNames.has(className)) {
    return false;
  }

  const targetPart = selector.parts.at(-1);
  if (!targetPart || !selectorPartMatches(targetPart, node, context)) {
    return false;
  }

  return ancestorMatches(selector.parts.slice(0, -1), node, context);
}

function registerStylesheets(
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
              message: `Selector "${selectorText}" is not supported in v0.4.1.`,
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

function resolveClassMatches(
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
  registry: StyleClassRegistry,
  context: SelectorContext,
  diagnostics: Diagnostic[],
): ResolvedStyle {
  const properties: Record<string, ResolvedStyleProperty> = {};
  const appliedClasses: ResolvedStyleSource[] = [];

  const matchedClasses = resolveClassMatches(node, entity, registry, context, diagnostics);
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

function parentMapFor(graph: SemanticAuthorGraph): ReadonlyMap<GraphNodeId, GraphNodeId> {
  const parentById = new Map<GraphNodeId, GraphNodeId>();

  graph.nodes.forEach((node) => {
    const childIds =
      "children" in node ? node.children : "inlineChildren" in node ? node.inlineChildren : [];

    childIds.forEach((childId) => {
      parentById.set(childId, node.id);
    });
  });

  return parentById;
}

function classNamesByNodeIdFor(
  graph: SemanticAuthorGraph,
): ReadonlyMap<GraphNodeId, ReadonlySet<string>> {
  const classNamesByNodeId = new Map<GraphNodeId, ReadonlySet<string>>();

  graph.nodes.forEach((node) => {
    const classRefs = node.styleRef
      ? graph.styles.get(node.styleRef)?.authored.classRefs
      : undefined;
    classNamesByNodeId.set(node.id, new Set(classRefs?.map((ref) => ref.name) ?? []));
  });

  return classNamesByNodeId;
}

export function resolveStyles(
  graph: SemanticAuthorGraph,
  roots: readonly ComposedAuthorRoot[],
): StyleResolutionResult {
  const diagnostics: Diagnostic[] = [];
  const stylesheets = classesBySource(roots);
  const registries = new Map<string, StyleClassRegistry>();
  const nodes = nodeByStyleRef(graph);
  const selectorContext: SelectorContext = {
    graph,
    parentById: parentMapFor(graph),
    classNamesByNodeId: classNamesByNodeIdFor(graph),
  };
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

    resolvedStyles.set(id, resolvedStyleFor(node, entity, registry, selectorContext, diagnostics));
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

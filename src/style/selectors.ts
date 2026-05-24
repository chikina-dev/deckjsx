import { isAuthoredTag } from "../authoring/tags";
import type { GraphNodeId, SemanticAuthorGraph, SemanticNode } from "../graph";

export type Specificity = readonly [ids: number, classes: number, tags: number];

type SelectorPart = {
  readonly tag?: string;
  readonly classes: readonly string[];
};

export type ParsedSelector = {
  readonly parts: readonly SelectorPart[];
  readonly specificity: Specificity;
};

export type SelectorContext = {
  readonly graph: SemanticAuthorGraph;
  readonly parentById: ReadonlyMap<GraphNodeId, GraphNodeId>;
  readonly classNamesByNodeId: ReadonlyMap<GraphNodeId, ReadonlySet<string>>;
};

const EMPTY_CLASS_NAMES: ReadonlySet<string> = new Set();

export function compareSpecificity(left: Specificity, right: Specificity): number {
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

export function cssEscapeIdentifier(value: string): string {
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

export function parseSelector(selector: string): ParsedSelector | undefined {
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

export function selectorFor(className: string, target: string | undefined): string {
  if (target === undefined) {
    return `.${cssEscapeIdentifier(className)}`;
  }

  return target;
}

export function rightmostSelectorHasClass(selector: ParsedSelector, className: string): boolean {
  return selector.parts.at(-1)?.classes.includes(className) ?? false;
}

export function collectSelectorConditionClassNames(
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

export function selectorMatches(
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

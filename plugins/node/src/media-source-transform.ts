const DECKJSX_AUTHORING_METADATA_IMPORT =
  'import { authoringMetadata as __deckjsxAuthoringMetadata } from "deckjsx/integration";';

export function isDeckjsxTransformableModule(id: string): boolean {
  return /\.[cm]?[jt]sx(?:\?.*)?$/.test(id) && !/(?:^|\/)node_modules\//.test(id);
}

export function transformDeckjsxMediaSourceOrigins(code: string, id: string): string | undefined {
  if (!isDeckjsxTransformableModule(id)) {
    return undefined;
  }

  const transformed = transformMediaSourceOriginProps(code, id);
  return transformed === code ? undefined : `${DECKJSX_AUTHORING_METADATA_IMPORT}\n${transformed}`;
}

function skipQuotedLiteral(code: string, start: number, quote: "'" | '"' | "`"): number {
  let escaped = false;

  for (let index = start + 1; index < code.length; index += 1) {
    const char = code[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
  }

  return code.length;
}

function jsxStringAttributeValue(attributes: string, name: string): string | undefined {
  const attribute = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*"([^"]*)"\\s*\\}|\\{\\s*'([^']*)'\\s*\\})`,
  );
  const match = attribute.exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? match?.[4];
}

function isLocalMediaPath(value: string): boolean {
  return (
    !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value) && !value.startsWith("//") && !value.startsWith("#")
  );
}

function mediaOriginField(input: {
  readonly field: string;
  readonly importer: string;
  readonly source: string | undefined;
}): string | undefined {
  if (!input.source || !isLocalMediaPath(input.source)) {
    return undefined;
  }

  return `${input.field}: { importer: ${JSON.stringify(input.importer)}, source: ${JSON.stringify(input.source)} }`;
}

function transformMediaSourceOriginProps(code: string, id: string): string {
  let output = "";
  let cursor = 0;
  let index = 0;

  while (index < code.length) {
    const char = code[index]!;
    const next = code[index + 1];

    if (char === "/" && next === "/") {
      const lineEnd = code.indexOf("\n", index + 2);
      index = lineEnd < 0 ? code.length : lineEnd + 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const blockEnd = code.indexOf("*/", index + 2);
      index = blockEnd < 0 ? code.length : blockEnd + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      index = skipQuotedLiteral(code, index, char);
      continue;
    }

    const tag = char === "<" ? readJsxStartTag(code, index) : undefined;
    if (!tag) {
      index += 1;
      continue;
    }

    const replacement = transformJsxStartTag(tag, code, id);
    if (replacement !== tag.match) {
      output += code.slice(cursor, index);
      output += replacement;
      cursor = tag.end;
    }
    index = tag.end;
  }

  return output ? output + code.slice(cursor) : code;
}

type JsxStartTag = {
  readonly match: string;
  readonly tag: string;
  readonly attributes: string;
  readonly closing: string;
  readonly start: number;
  readonly end: number;
};

function readJsxStartTag(code: string, start: number): JsxStartTag | undefined {
  const tagMatch = /^<([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\b/.exec(code.slice(start));
  if (!tagMatch?.[1]) {
    return undefined;
  }

  let quote: "'" | '"' | undefined;
  let braceDepth = 0;
  for (let index = start + tagMatch[0].length; index < code.length; index += 1) {
    const char = code[index]!;
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "{") {
      braceDepth += 1;
      continue;
    }
    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (char !== ">" || braceDepth > 0) {
      continue;
    }

    const end = index + 1;
    let closingStart = index;
    if (code[index - 1] === "/") {
      closingStart = index - 1;
    }
    while (closingStart > start && /\s/.test(code[closingStart - 1] ?? "")) {
      closingStart -= 1;
    }
    const tagEnd = start + tagMatch[0].length;
    return {
      match: code.slice(start, end),
      tag: tagMatch[1],
      attributes: code.slice(tagEnd, closingStart),
      closing: code.slice(closingStart, end),
      start,
      end,
    };
  }

  return undefined;
}

function sourceSpanFor(code: string, offset: number, id: string): string {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset; index += 1) {
    if (code[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return `{ file: ${JSON.stringify(id)}, line: ${line}, column: ${column} }`;
}

function componentProvenanceField(input: JsxStartTag, code: string, id: string): string {
  return `componentProvenance: { stack: [{ name: ${JSON.stringify(input.tag)}, moduleId: ${JSON.stringify(id)}, sourceSpan: ${sourceSpanFor(code, input.start, id)} }] }`;
}

function transformJsxStartTag(input: JsxStartTag, code: string, id: string): string {
  if (
    input.attributes.includes("__deckjsxAuthoringMetadata") ||
    input.attributes.includes("__deckjsxMediaSourceOrigins")
  ) {
    return input.match;
  }
  const isMediaIntrinsic = input.tag === "img" || input.tag === "video";
  const isComponent = /^[A-Z]/.test(input.tag);
  if (!isMediaIntrinsic && !isComponent) {
    return input.match;
  }

  const mediaFields = [
    mediaOriginField({
      field: "src",
      importer: id,
      source: jsxStringAttributeValue(input.attributes, "src"),
    }),
    input.tag === "video" || isComponent
      ? mediaOriginField({
          field: "poster",
          importer: id,
          source: jsxStringAttributeValue(input.attributes, "poster"),
        })
      : undefined,
  ].filter((field): field is string => field !== undefined);

  const fields = [
    mediaFields.length > 0 ? `mediaSourceOrigins: { ${mediaFields.join(", ")} }` : undefined,
    isComponent ? componentProvenanceField(input, code, id) : undefined,
  ].filter((field): field is string => field !== undefined);

  if (fields.length === 0) {
    return input.match;
  }

  return `<${input.tag} {...__deckjsxAuthoringMetadata({ ${fields.join(", ")} })}${input.attributes}${input.closing}`;
}

const DECKJSX_RENDER_INTEGRATION_IMPORT =
  'import { mediaSourceOrigins as __deckjsxMediaSourceOrigins } from "deckjsx/integration";';
const DECKJSX_MEDIA_ORIGIN_IMPORT =
  'import { mediaSourceOrigins as __deckjsxMediaSourceOrigins } from "deckjsx/integration";';
const VITE_RENDER_INTEGRATION_IMPORT =
  'import { withViteRenderIntegration as __deckjsxViteRenderIntegration } from "virtual:deckjsx/vite";';

export type ViteLoaderTransformOptions = {
  readonly root: string;
  readonly publicDir?: string;
  readonly base?: string;
  readonly aliases?: readonly { readonly find: string; readonly replacement: string }[];
  readonly resolverToken?: string;
  readonly changedModuleIds?: readonly string[];
};

export function isDeckjsxTransformableModule(id: string): boolean {
  return /\.[cm]?[jt]sx?(?:\?.*)?$/.test(id) && !/(?:^|\/)node_modules\//.test(id);
}

export function canTransformDeckRenderCalls(code: string): boolean {
  return findNextCodeToken(code, ".render(", 0) >= 0 && findNextCodeToken(code, "pptx(", 0) >= 0;
}

function moduleProjectIntegrationOptions(
  input: {
    readonly id: string;
  } & ViteLoaderTransformOptions,
): string {
  const importer = JSON.stringify(input.id);
  const root = JSON.stringify(input.root);
  const publicDir = input.publicDir ? `, publicDir: ${JSON.stringify(input.publicDir)}` : "";
  const base = input.base ? `, base: ${JSON.stringify(input.base)}` : "";
  const aliases = input.aliases?.length ? `, aliases: ${JSON.stringify(input.aliases)}` : "";
  const resolverToken = input.resolverToken
    ? `, resolverToken: ${JSON.stringify(input.resolverToken)}`
    : "";
  const changedModuleIds = input.changedModuleIds?.length
    ? `, changedModuleIds: [${input.changedModuleIds.map((id) => JSON.stringify(id)).join(", ")}]`
    : "";
  return `{ importer: ${importer}, root: ${root}${publicDir}${base}${aliases}${resolverToken}${changedModuleIds} }`;
}

function transformDeckRenderCallsCode(
  code: string,
  id: string,
  input: ViteLoaderTransformOptions,
): string {
  let output = "";
  let cursor = 0;
  let searchStart = 0;

  while (searchStart < code.length) {
    const renderMember = findNextCodeToken(code, ".render(", searchStart);
    if (renderMember < 0) {
      break;
    }
    const renderOpen = renderMember + ".render".length;
    const pptxStart = skipIgnorable(code, renderOpen + 1);
    if (!isIdentifierCall(code, pptxStart, "pptx")) {
      searchStart = renderOpen + 1;
      continue;
    }
    const pptxOpen = pptxStart + "pptx".length;
    const pptxClose = findMatchingCloseParen(code, pptxOpen);
    if (pptxClose < 0) {
      searchStart = renderOpen + 1;
      continue;
    }

    const renderClose = skipIgnorable(code, pptxClose + 1);
    if (code[renderClose] !== ")") {
      searchStart = renderOpen + 1;
      continue;
    }

    output += code.slice(cursor, pptxStart);
    output += `__deckjsxViteRenderIntegration(${code.slice(pptxStart, pptxClose + 1)}, ${moduleProjectIntegrationOptions({ ...input, id })})`;
    cursor = pptxClose + 1;
    searchStart = renderClose + 1;
  }

  return output ? output + code.slice(cursor) : code;
}

function isIdentifierCall(code: string, start: number, name: string): boolean {
  return (
    code.slice(start, start + name.length) === name &&
    code[start + name.length] === "(" &&
    !/[\w$]/.test(code[start - 1] ?? "")
  );
}

function skipWhitespace(code: string, start: number): number {
  let index = start;
  while (/\s/.test(code[index] ?? "")) {
    index += 1;
  }
  return index;
}

function skipIgnorable(code: string, start: number): number {
  let index = skipWhitespace(code, start);

  while (index < code.length) {
    if (code[index] === "/" && code[index + 1] === "/") {
      index = code.indexOf("\n", index + 2);
      if (index < 0) {
        return code.length;
      }
      index = skipWhitespace(code, index + 1);
      continue;
    }
    if (code[index] === "/" && code[index + 1] === "*") {
      const close = code.indexOf("*/", index + 2);
      index = close < 0 ? code.length : close + 2;
      index = skipWhitespace(code, index);
      continue;
    }
    return index;
  }

  return index;
}

function findNextCodeToken(code: string, token: string, start: number): number {
  let index = start;

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
    if (code.startsWith(token, index)) {
      return index;
    }
    index += 1;
  }

  return -1;
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

function findMatchingCloseParen(code: string, openIndex: number): number {
  let depth = 0;
  let quote: "'" | '"' | "`" | undefined;
  let escaped = false;

  for (let index = openIndex; index < code.length; index += 1) {
    const char = code[index]!;
    const next = code[index + 1];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      const lineEnd = code.indexOf("\n", index + 2);
      index = lineEnd < 0 ? code.length : lineEnd;
      continue;
    }
    if (char === "/" && next === "*") {
      const blockEnd = code.indexOf("*/", index + 2);
      index = blockEnd < 0 ? code.length : blockEnd + 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function jsxStringAttributeValue(attributes: string, name: string): string | undefined {
  const attribute = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*"([^"]*)"\\s*\\}|\\{\\s*'([^']*)'\\s*\\})`,
  );
  const match = attribute.exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? match?.[4];
}

function isLocalMediaPath(value: string): boolean {
  return value.startsWith(".") || value.startsWith("/");
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

    const replacement = transformJsxStartTag(tag, id);
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
      end,
    };
  }

  return undefined;
}

function transformJsxStartTag(input: JsxStartTag, id: string): string {
  if (input.attributes.includes("__deckjsxMediaSourceOrigins")) {
    return input.match;
  }
  const isMediaIntrinsic = input.tag === "img" || input.tag === "video";
  const isComponent = /^[A-Z]/.test(input.tag);
  if (!isMediaIntrinsic && !isComponent) {
    return input.match;
  }

  const fields = [
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
  if (fields.length === 0) {
    return input.match;
  }

  return `<${input.tag} {...__deckjsxMediaSourceOrigins({ ${fields.join(", ")} })}${input.attributes}${input.closing}`;
}

export function transformDeckjsxModule(
  code: string,
  id: string,
  input: ViteLoaderTransformOptions,
): string | undefined {
  if (!isDeckjsxTransformableModule(id)) {
    return undefined;
  }

  const renderTransformed = canTransformDeckRenderCalls(code)
    ? transformDeckRenderCallsCode(code, id, input)
    : code;
  const transformed = transformMediaSourceOriginProps(renderTransformed, id);
  if (transformed === code) {
    return undefined;
  }

  const renderChanged = renderTransformed !== code;
  const imports = renderChanged
    ? [DECKJSX_RENDER_INTEGRATION_IMPORT, VITE_RENDER_INTEGRATION_IMPORT]
    : [DECKJSX_MEDIA_ORIGIN_IMPORT];
  return `${imports.join("\n")}\n${transformed}`;
}

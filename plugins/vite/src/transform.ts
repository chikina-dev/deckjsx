const DECKJSX_RENDER_INTEGRATION_IMPORT =
  'import { withIntegrationContext, mediaSourceOrigins as __deckjsxMediaSourceOrigins } from "deckjsx/integration";';
const DECKJSX_MEDIA_ORIGIN_IMPORT =
  'import { mediaSourceOrigins as __deckjsxMediaSourceOrigins } from "deckjsx/integration";';
const VITE_LOADER_IMPORT =
  'import { createViteAssetLoader as __deckjsxCreateViteAssetLoader } from "@deckjsx/vite";';

export function isDeckjsxTransformableModule(id: string): boolean {
  return /\.[cm]?[jt]sx?(?:\?.*)?$/.test(id) && !/(?:^|\/)node_modules\//.test(id);
}

export function canTransformDeckRenderCalls(code: string): boolean {
  return code.includes(".render(") && code.includes("pptx(");
}

function moduleIntegrationContext(input: {
  readonly id: string;
  readonly root: string;
  readonly publicDir?: string;
  readonly changedModuleIds?: readonly string[];
}): string {
  const importer = JSON.stringify(input.id);
  const root = JSON.stringify(input.root);
  const publicDir = input.publicDir ? `, publicDir: ${JSON.stringify(input.publicDir)}` : "";
  const changedModuleIds = input.changedModuleIds?.length
    ? `, hmrInvalidation: { importer: ${importer}, changedModuleIds: [${input.changedModuleIds.map((id) => JSON.stringify(id)).join(", ")}] }`
    : "";
  return `{ assetLoaders: [__deckjsxCreateViteAssetLoader({ root: ${root}${publicDir} })], mediaSourceOrigin: { importer: ${importer}, source: ${importer} }${changedModuleIds} }`;
}

function transformDeckRenderCallsCode(
  code: string,
  id: string,
  input: {
    readonly root: string;
    readonly publicDir?: string;
    readonly changedModuleIds?: readonly string[];
  },
): string {
  const pattern = /(\b[A-Za-z_$][\w$]*\.render\()\s*pptx\(/g;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(code)) !== null) {
    const matchedText = match[0];
    const renderPrefix = match[1]!;
    const pptxStart = match.index + matchedText.lastIndexOf("pptx(");
    const pptxOpen = pptxStart + "pptx".length;
    const pptxClose = findMatchingCloseParen(code, pptxOpen);
    if (pptxClose < 0) {
      continue;
    }

    const renderClose = skipWhitespace(code, pptxClose + 1);
    if (code[renderClose] !== ")") {
      continue;
    }

    output += code.slice(cursor, match.index);
    output += `${renderPrefix}withIntegrationContext(${code.slice(pptxStart, pptxClose + 1)}, ${moduleIntegrationContext({ ...input, id })})`;
    output += code.slice(pptxClose + 1, renderClose + 1);
    cursor = renderClose + 1;
    pattern.lastIndex = cursor;
  }

  return output ? output + code.slice(cursor) : code;
}

function skipWhitespace(code: string, start: number): number {
  let index = start;
  while (/\s/.test(code[index] ?? "")) {
    index += 1;
  }
  return index;
}

function findMatchingCloseParen(code: string, openIndex: number): number {
  let depth = 0;
  let quote: "'" | '"' | "`" | undefined;
  let escaped = false;

  for (let index = openIndex; index < code.length; index += 1) {
    const char = code[index]!;
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

type JsxElementMatchGroups = {
  readonly tag?: string;
  readonly attributes?: string;
  readonly closing?: string;
};

function jsxElementMatchGroups(args: readonly unknown[]): JsxElementMatchGroups | undefined {
  const value = args.at(-1);
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const groups = value as Record<string, unknown>;
  return {
    ...(typeof groups.tag === "string" ? { tag: groups.tag } : {}),
    ...(typeof groups.attributes === "string" ? { attributes: groups.attributes } : {}),
    ...(typeof groups.closing === "string" ? { closing: groups.closing } : {}),
  };
}

function transformMediaSourceOriginProps(code: string, id: string): string {
  return code.replace(
    /<(?<tag>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\b(?<attributes>[^<>]*?)(?<closing>\s*\/?>)/g,
    (match: string, ...args: unknown[]) => {
      const groups = jsxElementMatchGroups(args);
      const tag = groups?.tag;
      const attributes = groups?.attributes ?? "";
      const closing = groups?.closing ?? "";
      if (!tag || attributes.includes("__deckjsxMediaSourceOrigins")) {
        return match;
      }
      const isMediaIntrinsic = tag === "img" || tag === "video";
      const isComponent = /^[A-Z]/.test(tag);
      if (!isMediaIntrinsic && !isComponent) {
        return match;
      }

      const fields = [
        mediaOriginField({
          field: "src",
          importer: id,
          source: jsxStringAttributeValue(attributes, "src"),
        }),
        tag === "video" || isComponent
          ? mediaOriginField({
              field: "poster",
              importer: id,
              source: jsxStringAttributeValue(attributes, "poster"),
            })
          : undefined,
      ].filter((field): field is string => field !== undefined);
      if (fields.length === 0) {
        return match;
      }

      return `<${tag} {...__deckjsxMediaSourceOrigins({ ${fields.join(", ")} })}${attributes}${closing}`;
    },
  );
}

export function transformDeckjsxModule(
  code: string,
  id: string,
  input: {
    readonly root: string;
    readonly publicDir?: string;
    readonly changedModuleIds?: readonly string[];
  },
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
    ? [DECKJSX_RENDER_INTEGRATION_IMPORT, VITE_LOADER_IMPORT]
    : [DECKJSX_MEDIA_ORIGIN_IMPORT];
  return `${imports.join("\n")}\n${transformed}`;
}

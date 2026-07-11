import { parseAst } from "rolldown/parseAst";

const AUTHORING_METADATA_MODULE = "deckjsx/integration";
const AUTHORING_METADATA_EXPORT = "authoringMetadata";
const AUTHORING_METADATA_LOCAL = "__deckjsxAuthoringMetadata";

type AstNode = {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
};

type TextEdit = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

export function isDeckjsxTransformableModule(id: string): boolean {
  return /\.[cm]?[jt]sx(?:\?.*)?$/.test(id) && !/(?:^|\/)node_modules\//.test(id);
}

export function transformDeckjsxMediaSourceOrigins(code: string, id: string): string | undefined {
  if (!isDeckjsxTransformableModule(id)) {
    return undefined;
  }

  const filename = id.replace(/\?.*$/, "");
  const program = parseAst(
    code,
    { lang: parserLanguage(filename), sourceType: "module" },
    filename,
  );
  const nodes = collectAstNodes(program);
  const importedMetadataBindings = authoringMetadataBindings(nodes);
  const metadataBinding =
    importedMetadataBindings.values().next().value ?? uniqueMetadataBinding(nodes);
  const edits: TextEdit[] = [];

  for (const node of nodes) {
    if (node.type !== "JSXOpeningElement") {
      continue;
    }
    const edit = mediaMetadataEdit({
      code,
      id,
      input: node,
      metadataBindings: importedMetadataBindings,
      metadataBinding,
    });
    if (edit) {
      edits.push(edit);
    }
  }

  if (edits.length === 0) {
    return undefined;
  }
  if (importedMetadataBindings.size === 0) {
    const importOffset = importInsertionOffset(program);
    edits.push({
      start: importOffset,
      end: importOffset,
      text: `${importOffset === 0 ? "" : "\n"}import { ${AUTHORING_METADATA_EXPORT} as ${metadataBinding} } from ${JSON.stringify(AUTHORING_METADATA_MODULE)};\n`,
    });
  }
  return applyTextEdits(code, edits);
}

function parserLanguage(filename: string): "js" | "jsx" | "ts" | "tsx" {
  if (/tsx$/i.test(filename)) {
    return "tsx";
  }
  if (/jsx$/i.test(filename)) {
    return "jsx";
  }
  if (/ts$/i.test(filename)) {
    return "ts";
  }
  return "js";
}

function collectAstNodes(root: unknown): AstNode[] {
  const nodes: AstNode[] = [];
  const pending: unknown[] = [root];
  const visited = new Set<object>();

  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || visited.has(value)) {
      continue;
    }
    visited.add(value);
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    if (isAstNode(value)) {
      nodes.push(value);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "parent") {
        pending.push(child);
      }
    }
  }
  return nodes;
}

function isAstNode(value: object): value is AstNode {
  return (
    "type" in value &&
    typeof value.type === "string" &&
    "start" in value &&
    typeof value.start === "number" &&
    "end" in value &&
    typeof value.end === "number"
  );
}

function authoringMetadataBindings(nodes: readonly AstNode[]): Set<string> {
  const bindings = new Set<string>();
  for (const node of nodes) {
    if (
      node.type !== "ImportDeclaration" ||
      stringLiteralValue(node.source) !== AUTHORING_METADATA_MODULE
    ) {
      continue;
    }
    for (const specifier of astNodeArray(node.specifiers)) {
      if (
        specifier.type === "ImportSpecifier" &&
        identifierName(specifier.imported) === AUTHORING_METADATA_EXPORT
      ) {
        const local = identifierName(specifier.local);
        if (local) {
          bindings.add(local);
        }
      }
    }
  }
  return bindings;
}

function uniqueMetadataBinding(nodes: readonly AstNode[]): string {
  const identifiers = new Set(
    nodes
      .filter((node) => node.type === "Identifier" || node.type === "JSXIdentifier")
      .map((node) => identifierName(node))
      .filter((name): name is string => name !== undefined),
  );
  let candidate = AUTHORING_METADATA_LOCAL;
  for (let suffix = 2; identifiers.has(candidate); suffix += 1) {
    candidate = `${AUTHORING_METADATA_LOCAL}${suffix}`;
  }
  return candidate;
}

function mediaMetadataEdit(input: {
  readonly code: string;
  readonly id: string;
  readonly input: AstNode;
  readonly metadataBindings: ReadonlySet<string>;
  readonly metadataBinding: string;
}): TextEdit | undefined {
  const tag = jsxElementName(input.input.name);
  if (!tag) {
    return undefined;
  }
  const attributes = astNodeArray(input.input.attributes);
  if (
    hasAuthoringMetadata(attributes, input.metadataBindings) ||
    attributes.some(
      (attribute) =>
        attribute.type === "JSXAttribute" &&
        identifierName(attribute.name) === "__deckjsxMediaSourceOrigins",
    )
  ) {
    return undefined;
  }

  const isMediaIntrinsic = tag === "img" || tag === "video";
  const isComponent = /^[A-Z]/.test(tag);
  if (!isMediaIntrinsic && !isComponent) {
    return undefined;
  }

  const mediaFields = [
    mediaOriginField({
      field: "src",
      importer: input.id,
      source: jsxStringAttributeValue(attributes, "src"),
    }),
    tag === "video" || isComponent
      ? mediaOriginField({
          field: "poster",
          importer: input.id,
          source: jsxStringAttributeValue(attributes, "poster"),
        })
      : undefined,
  ].filter((field): field is string => field !== undefined);
  const fields = [
    mediaFields.length > 0 ? `mediaSourceOrigins: { ${mediaFields.join(", ")} }` : undefined,
    isComponent
      ? `componentProvenance: { stack: [{ name: ${JSON.stringify(tag)}, moduleId: ${JSON.stringify(input.id)}, sourceSpan: ${sourceSpanFor(input.code, input.input.start, input.id)} }] }`
      : undefined,
  ].filter((field): field is string => field !== undefined);
  if (fields.length === 0) {
    return undefined;
  }

  const name = astNode(input.input.name);
  const typeArguments = astNode(input.input.typeArguments);
  const offset = typeArguments?.end ?? name?.end;
  return offset === undefined
    ? undefined
    : {
        start: offset,
        end: offset,
        text: ` {...${input.metadataBinding}({ ${fields.join(", ")} })}`,
      };
}

function hasAuthoringMetadata(
  attributes: readonly AstNode[],
  metadataBindings: ReadonlySet<string>,
): boolean {
  return attributes.some((attribute) => {
    if (attribute.type !== "JSXSpreadAttribute") {
      return false;
    }
    const argument = astNode(attribute.argument);
    const callee = argument?.type === "CallExpression" ? astNode(argument.callee) : undefined;
    return callee?.type === "Identifier" && metadataBindings.has(identifierName(callee) ?? "");
  });
}

function jsxStringAttributeValue(attributes: readonly AstNode[], name: string): string | undefined {
  const attribute = attributes.find(
    (candidate) => candidate.type === "JSXAttribute" && identifierName(candidate.name) === name,
  );
  const value = astNode(attribute?.value);
  if (!value) {
    return undefined;
  }
  if (value.type === "Literal") {
    return stringLiteralValue(value);
  }
  const expression =
    value.type === "JSXExpressionContainer" ? astNode(value.expression) : undefined;
  return expression?.type === "Literal" ? stringLiteralValue(expression) : undefined;
}

function jsxElementName(value: unknown): string | undefined {
  const node = astNode(value);
  if (!node) {
    return undefined;
  }
  if (node.type === "JSXIdentifier") {
    return identifierName(node);
  }
  if (node.type === "JSXMemberExpression") {
    const object = jsxElementName(node.object);
    const property = jsxElementName(node.property);
    return object && property ? `${object}.${property}` : undefined;
  }
  if (node.type === "JSXNamespacedName") {
    const namespace = jsxElementName(node.namespace);
    const name = jsxElementName(node.name);
    return namespace && name ? `${namespace}:${name}` : undefined;
  }
  return undefined;
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

function importInsertionOffset(program: ReturnType<typeof parseAst>): number {
  let offset = program.hashbang?.end ?? 0;
  for (const statement of program.body) {
    if (statement.type !== "ExpressionStatement" || typeof statement.directive !== "string") {
      break;
    }
    offset = statement.end;
  }
  return offset;
}

function applyTextEdits(code: string, edits: readonly TextEdit[]): string {
  let output = code;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return output;
}

function astNode(value: unknown): AstNode | undefined {
  return value && typeof value === "object" && isAstNode(value) ? value : undefined;
}

function astNodeArray(value: unknown): AstNode[] {
  return Array.isArray(value)
    ? value.map(astNode).filter((node): node is AstNode => node !== undefined)
    : [];
}

function identifierName(value: unknown): string | undefined {
  const node = astNode(value);
  return node && typeof node.name === "string" ? node.name : undefined;
}

function stringLiteralValue(value: unknown): string | undefined {
  const node = astNode(value);
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

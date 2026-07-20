import path from "node:path";
import type { Diagnostic } from "deckjsx";
import { rolldown, type OutputChunk } from "rolldown";
import { parseAst } from "rolldown/parseAst";
import { isDeckjsxRuntimeExternalId } from "./dev-executor";

export type EntryWriteAnalysis =
  | {
      readonly ok: true;
      readonly reachesWrite: boolean;
      readonly outputs: ReadonlySet<string>;
    }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

export async function analyzeEntryWrites(file: string, cwd: string): Promise<EntryWriteAnalysis> {
  const generated = await generateEntryAnalysis(file, cwd);
  if (!generated.ok) return generated;
  return parseEntryWrites(generated.code, cwd, file);
}

function parseEntryWrites(code: string, cwd: string, file: string): EntryWriteAnalysis {
  try {
    return { ok: true, ...analyzeGeneratedWrites(code, cwd) };
  } catch (error) {
    return { ok: false, diagnostic: analysisDiagnostic(file, error) };
  }
}

async function generateEntryAnalysis(
  file: string,
  cwd: string,
): Promise<
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly diagnostic: Diagnostic }
> {
  let bundle: Awaited<ReturnType<typeof rolldown>> | undefined;
  try {
    bundle = await rolldown({
      input: file,
      cwd,
      platform: "node",
      preserveEntrySignatures: false,
      external: isDeckjsxRuntimeExternalId,
    });
    const generated = await bundle.generate({
      format: "esm",
      codeSplitting: false,
      sourcemap: false,
    });
    const chunk = generated.output.find((item): item is OutputChunk => item.type === "chunk");
    return { ok: true, code: chunk?.code ?? "" };
  } catch (error) {
    return { ok: false, diagnostic: analysisDiagnostic(file, error) };
  } finally {
    await bundle?.close();
  }
}

type AstNode = { readonly type: string; readonly [key: string]: unknown };

function analyzeGeneratedWrites(
  code: string,
  cwd: string,
): { readonly reachesWrite: boolean; readonly outputs: ReadonlySet<string> } {
  const nodes = collectAstNodes(
    parseAst(code, { lang: "js", sourceType: "module" }) as unknown as AstNode,
  );
  const bindings = collectWriteBindings(nodes);
  const outputs = new Set<string>();
  let reachesWrite = false;
  for (const node of nodes) {
    if (node.type !== "CallExpression" || !isWriteCallee(node.callee, bindings)) continue;
    reachesWrite = true;
    const output = staticString(astNodeArray(node.arguments)[1]);
    if (output === undefined) continue;
    outputs.add(normalizePath(output));
    outputs.add(normalizePath(path.resolve(cwd, output)));
  }
  return { reachesWrite, outputs };
}

type WriteBindings = {
  readonly direct: ReadonlySet<string>;
  readonly namespaces: ReadonlySet<string>;
};

function collectWriteBindings(nodes: readonly AstNode[]): WriteBindings {
  const direct = new Set<string>();
  const namespaces = new Set<string>();
  for (const node of nodes) collectImportBindings(node, direct, namespaces);
  collectDerivedBindings(nodes, direct, namespaces);
  return { direct, namespaces };
}

function collectImportBindings(node: AstNode, direct: Set<string>, namespaces: Set<string>): void {
  if (!isDeckjsxNodeImport(node)) return;
  for (const specifier of astNodeArray(node.specifiers)) {
    const local = identifierName(specifier.local);
    if (!local) continue;
    if (specifier.type === "ImportSpecifier" && identifierName(specifier.imported) === "write") {
      direct.add(local);
    } else {
      namespaces.add(local);
    }
  }
}

function isDeckjsxNodeImport(node: AstNode): boolean {
  return node.type === "ImportDeclaration" && stringLiteral(node.source) === "@deckjsx/node";
}

function collectDerivedBindings(
  nodes: readonly AstNode[],
  direct: Set<string>,
  namespaces: Set<string>,
): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.type !== "VariableDeclarator" || !isNamespaceSource(node.init, namespaces)) continue;
      const id = astNode(node.id);
      const local = identifierName(id);
      if (local && !namespaces.has(local)) {
        namespaces.add(local);
        changed = true;
      }
      if (id?.type !== "ObjectPattern") continue;
      for (const property of astNodeArray(id.properties)) {
        if (property.type !== "Property" || identifierName(property.key) !== "write") continue;
        const binding = identifierName(property.value);
        if (binding && !direct.has(binding)) {
          direct.add(binding);
          changed = true;
        }
      }
    }
  }
}

function isNamespaceSource(value: unknown, namespaces: ReadonlySet<string>): boolean {
  const node = astNode(value);
  const identifier = identifierName(node);
  if (identifier && namespaces.has(identifier)) return true;
  if (node?.type === "MemberExpression") {
    const object = identifierName(node.object);
    return Boolean(object && namespaces.has(object) && identifierName(node.property) === "default");
  }
  if (node?.type !== "CallExpression") return false;
  return (
    Boolean(identifierName(node.callee)?.endsWith("require")) &&
    stringLiteral(astNodeArray(node.arguments)[0]) === "@deckjsx/node"
  );
}

function isWriteCallee(value: unknown, bindings: WriteBindings): boolean {
  const node = astNode(value);
  const direct = identifierName(node);
  if (direct && bindings.direct.has(direct)) return true;
  if (node?.type !== "MemberExpression") return false;
  const object = identifierName(node.object);
  return Boolean(
    object && bindings.namespaces.has(object) && identifierName(node.property) === "write",
  );
}

function staticString(value: unknown): string | undefined {
  const node = astNode(value);
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type !== "TemplateLiteral" || astNodeArray(node.expressions).length > 0)
    return undefined;
  const cooked = astNode(astNodeArray(node.quasis)[0]?.value)?.cooked;
  return typeof cooked === "string" ? cooked : undefined;
}

function collectAstNodes(root: AstNode): readonly AstNode[] {
  const output: AstNode[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = astNode(value);
    if (!node) return;
    output.push(node);
    for (const [key, child] of Object.entries(node)) if (key !== "parent") visit(child);
  };
  visit(root);
  return output;
}

function astNode(value: unknown): AstNode | undefined {
  return typeof value === "object" && value !== null && "type" in value
    ? (value as AstNode)
    : undefined;
}

function astNodeArray(value: unknown): readonly AstNode[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const node = astNode(item);
    return node ? [node] : [];
  });
}

function identifierName(value: unknown): string | undefined {
  const node = astNode(value);
  return node?.type === "Identifier" && typeof node.name === "string" ? node.name : undefined;
}

function stringLiteral(value: unknown): string | undefined {
  const node = astNode(value);
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function analysisDiagnostic(file: string, error: unknown): Diagnostic {
  return {
    severity: "error",
    code: "E_CONFIG_ENTRY_ANALYSIS_FAILED",
    title: "Entry Execution analysis failed",
    message: error instanceof Error ? error.message : String(error),
    labels: [{ message: "source could not be analyzed", path: file, sourceSpan: { file } }],
  };
}

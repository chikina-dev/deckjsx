import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rolldown, type OutputChunk, type Plugin as RolldownPlugin } from "rolldown";

const CONFIG_MARKER = Symbol.for("deckjsx.node.configDefinition");

export type LoadedConfigModule = {
  readonly definition: unknown;
  readonly marked: boolean;
  readonly watchFiles: readonly string[];
};

export function markConfigDefinition<T extends object>(definition: T): T {
  Object.defineProperty(definition, CONFIG_MARKER, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return definition;
}

export async function loadConfigModule(
  configPath: string,
  cwd: string,
): Promise<LoadedConfigModule> {
  const bundle = await createConfigBundle(configPath, cwd);
  try {
    return await generateConfigModule(bundle);
  } finally {
    await bundle.close();
  }
}

async function createConfigBundle(configPath: string, cwd: string) {
  return rolldown({
    input: configPath,
    cwd,
    platform: "node",
    transform: { define: { "import.meta.url": JSON.stringify(pathToFileURL(configPath).href) } },
    plugins: [externalConfigPackages(configPath)],
  });
}

async function generateConfigModule(
  bundle: Awaited<ReturnType<typeof rolldown>>,
): Promise<LoadedConfigModule> {
  const generated = await bundle.generate({
    format: "esm",
    codeSplitting: false,
    sourcemap: false,
  });
  const chunk = generated.output.find((item): item is OutputChunk => item.type === "chunk");
  if (!chunk) throw new Error("Rolldown did not generate a config module.");
  const module = await importGeneratedConfig(chunk.code);
  return {
    definition: module.default,
    marked: isMarked(module.default),
    watchFiles: [...new Set([...(await bundle.watchFiles), ...chunk.moduleIds])],
  };
}

async function importGeneratedConfig(code: string): Promise<{ readonly default?: unknown }> {
  return import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}#deckjsx-config-${Date.now()}`
  ) as Promise<{ readonly default?: unknown }>;
}

function isMarked(value: unknown): boolean {
  return (
    ((typeof value === "object" && value !== null) || typeof value === "function") &&
    (value as { readonly [CONFIG_MARKER]?: true })[CONFIG_MARKER] === true
  );
}

function externalConfigPackages(configPath: string): RolldownPlugin {
  return {
    name: "@deckjsx/node/config-externals",
    async resolveId(source) {
      if (source.startsWith(".") || path.isAbsolute(source)) return undefined;
      if (source.startsWith("node:")) return { id: source, external: true };
      return {
        id: pathToFileURL(resolvePackageImport(source, path.dirname(configPath))).href,
        external: true,
      };
    },
  };
}

function resolvePackageImport(specifier: string, fromDirectory: string): string {
  const parentUrl = pathToFileURL(path.join(fromDirectory, "deckjsx.config.ts")).href;
  const resolved = resolveWithNode(specifier, parentUrl, fromDirectory);
  if (!resolved.startsWith("file:")) {
    throw new Error(`Package import ${JSON.stringify(specifier)} resolved to ${resolved}.`);
  }
  return fileURLToPath(resolved);
}

function resolveWithNode(specifier: string, parentUrl: string, fromDirectory: string): string {
  try {
    return import.meta.resolve(specifier, parentUrl);
  } catch (error) {
    throw new Error(
      `Cannot resolve package import ${JSON.stringify(specifier)} from ${fromDirectory}.`,
      { cause: error },
    );
  }
}

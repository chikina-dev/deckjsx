import { access } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic } from "deckjsx";
import type { DeckPlugin } from "deckjsx/integration";
import { isDeckPlugin, mergePluginSlots } from "deckjsx/plugin-validation";
import { loadConfigModule, markConfigDefinition } from "./config-module-loader";

export type DeckjsxConfigContext = {
  readonly environment: string;
};

export type DeckjsxConfigInput = {
  readonly extends?: DeckjsxConfigDefinition | readonly DeckjsxConfigDefinition[];
  readonly entry?: null | string | readonly string[];
  readonly output?: null | string | readonly string[];
  readonly plugins?: readonly DeckPlugin[];
};

export type DeckjsxConfigFactory = (
  context: DeckjsxConfigContext,
) => DeckjsxConfigInput | Promise<DeckjsxConfigInput>;

export type DeckjsxConfigDefinition = DeckjsxConfigInput | DeckjsxConfigFactory;

export type ResolvedDeckjsxConfig = {
  readonly packageRoot: string;
  readonly configPath?: string;
  readonly environment: string;
  readonly entry: null | readonly string[];
  readonly output: null | readonly string[];
  readonly plugins: readonly DeckPlugin[];
  readonly watchFiles: readonly string[];
};

export type DeckjsxResolveResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly Diagnostic[] }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Diagnostic[];
      readonly watchFiles?: readonly string[];
      readonly watchDirectories?: readonly string[];
    };

export function defineConfig<TDefinition extends DeckjsxConfigDefinition>(
  definition: TDefinition,
): TDefinition {
  if ((typeof definition === "object" && definition !== null) || typeof definition === "function") {
    markConfigDefinition(definition);
  }
  return definition;
}

export async function resolveConfig(
  input: {
    readonly cwd?: string;
    readonly environment?: string;
  } = {},
): Promise<DeckjsxResolveResult<ResolvedDeckjsxConfig>> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const packageResult = await resolveHostPackageBoundary(cwd);
  if (!packageResult.ok) {
    return packageResult;
  }
  const packageRoot = packageResult.value;
  const environment = input.environment ?? process.env.NODE_ENV ?? "development";
  const configPath = path.join(packageRoot, "deckjsx.config.ts");
  if (!(await exists(configPath))) {
    return {
      ok: true,
      value: {
        packageRoot,
        environment,
        entry: null,
        output: null,
        plugins: Object.freeze([]),
        watchFiles: Object.freeze([path.join(packageRoot, "package.json")]),
      },
      diagnostics: [],
    };
  }

  return resolveConfigFile({ configPath, packageRoot, environment });
}

async function resolveConfigFile(input: {
  readonly configPath: string;
  readonly packageRoot: string;
  readonly environment: string;
}): Promise<DeckjsxResolveResult<ResolvedDeckjsxConfig>> {
  const loaded = await loadDefinition(input.configPath, input.packageRoot);
  if (!loaded.ok) return configLoadFailure(input.configPath, loaded.error);

  const evaluated = await evaluateDefinition(loaded.definition, input.environment);
  if (!evaluated.ok) return configLoadFailure(input.configPath, evaluated.error);

  const diagnostics = defineConfigDiagnostics(loaded.marked, input.configPath);
  const shapeDiagnostics = validateConfigInput(evaluated.value, input.configPath);
  const watchFiles = Object.freeze([...new Set([input.configPath, ...loaded.watchFiles])].sort());
  if (shapeDiagnostics.some((item) => item.severity === "error")) {
    return {
      ok: false,
      diagnostics: [...diagnostics, ...shapeDiagnostics],
      watchFiles,
    };
  }

  return {
    ok: true,
    value: {
      packageRoot: input.packageRoot,
      configPath: input.configPath,
      environment: input.environment,
      entry: normalizeHint(evaluated.value.entry),
      output: normalizeHint(evaluated.value.output),
      plugins: Object.freeze(normalizeConfigPlugins(evaluated.value.plugins ?? [])),
      watchFiles,
    },
    diagnostics,
  };
}

type DefinitionLoadResult =
  | {
      readonly ok: true;
      readonly definition: DeckjsxConfigDefinition;
      readonly marked: boolean;
      readonly watchFiles: readonly string[];
    }
  | { readonly ok: false; readonly error: unknown };

async function loadDefinition(
  configPath: string,
  packageRoot: string,
): Promise<DefinitionLoadResult> {
  try {
    const loaded = await loadConfigModule(configPath, packageRoot);
    if (!isConfigDefinition(loaded.definition)) {
      throw new Error("deckjsx.config.ts must default export a config object or callback.");
    }
    return { ok: true, ...loaded, definition: loaded.definition };
  } catch (error) {
    return { ok: false, error };
  }
}

async function evaluateDefinition(
  definition: DeckjsxConfigDefinition,
  environment: string,
): Promise<
  | { readonly ok: true; readonly value: DeckjsxConfigInput }
  | { readonly ok: false; readonly error: unknown }
> {
  try {
    return {
      ok: true,
      value: await resolveDefinition(definition, { environment }, new Set()),
    };
  } catch (error) {
    return { ok: false, error };
  }
}

function defineConfigDiagnostics(marked: boolean, configPath: string): readonly Diagnostic[] {
  if (marked) return [];
  return [
    diagnostic(
      "warning",
      "W_CONFIG_DEFINE_CONFIG_MISSING",
      "deckjsx.config.ts should use defineConfig(...)",
      configPath,
    ),
  ];
}

function configLoadFailure(
  configPath: string,
  error: unknown,
): DeckjsxResolveResult<ResolvedDeckjsxConfig> {
  return {
    ok: false,
    diagnostics: [
      diagnostic(
        "error",
        "E_CONFIG_LOAD_FAILED",
        "deckjsx.config.ts could not be resolved",
        configPath,
        errorMessage(error),
      ),
    ],
  };
}

async function resolveDefinition(
  definition: DeckjsxConfigDefinition,
  context: DeckjsxConfigContext,
  active: Set<DeckjsxConfigDefinition>,
): Promise<DeckjsxConfigInput> {
  if (active.has(definition)) {
    throw new Error("deckjsx config extends contains a cycle.");
  }
  active.add(definition);
  try {
    const own = typeof definition === "function" ? await definition(context) : definition;
    if (!isRecord(own)) {
      throw new Error("deckjsx config definition must resolve to an object.");
    }
    const bases =
      own.extends === undefined ? [] : Array.isArray(own.extends) ? own.extends : [own.extends];
    let merged: DeckjsxConfigInput = {};
    for (const base of bases) {
      merged = mergeConfigInputs(merged, await resolveDefinition(base, context, active));
    }
    return mergeConfigInputs(merged, own);
  } finally {
    active.delete(definition);
  }
}

function mergeConfigInputs(
  base: DeckjsxConfigInput,
  child: DeckjsxConfigInput,
): DeckjsxConfigInput {
  const { extends: _baseExtends, ...baseFields } = base;
  const { extends: _childExtends, ...childFields } = child;
  return {
    ...baseFields,
    ...childFields,
    ...(child.entry !== undefined
      ? { entry: child.entry }
      : base.entry !== undefined
        ? { entry: base.entry }
        : {}),
    ...(child.output !== undefined
      ? { output: child.output }
      : base.output !== undefined
        ? { output: base.output }
        : {}),
    plugins: mergePluginSlots(base.plugins ?? [], child.plugins ?? []),
  };
}

export async function resolveHostPackageBoundary(
  cwd: string,
): Promise<DeckjsxResolveResult<string>> {
  let current = cwd;
  while (true) {
    const packagePath = path.join(current, "package.json");
    if (await exists(packagePath)) {
      return { ok: true, value: current, diagnostics: [] };
    }
    if (await exists(path.join(current, "deckjsx.config.ts"))) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            "error",
            "E_CONFIG_PACKAGE_MISSING",
            "deckjsx.config.ts must be beside package.json",
            path.join(current, "deckjsx.config.ts"),
          ),
        ],
      };
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return {
        ok: false,
        diagnostics: [
          diagnostic("error", "E_CONFIG_PACKAGE_NOT_FOUND", "No package.json was found", cwd),
        ],
      };
    }
    current = parent;
  }
}

function validateConfigInput(value: DeckjsxConfigInput, file: string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const knownKeys = new Set(["entry", "output", "plugins"]);
  for (const key of Object.keys(value)) {
    if (!knownKeys.has(key)) diagnostics.push(invalidField(key, file));
  }
  if (!isHint(value.entry)) diagnostics.push(invalidField("entry", file));
  if (!isHint(value.output)) diagnostics.push(invalidField("output", file));
  if (value.plugins !== undefined && !Array.isArray(value.plugins)) {
    diagnostics.push(invalidField("plugins", file));
  } else if (value.plugins?.some((plugin) => !isDeckPlugin(plugin))) {
    diagnostics.push(invalidField("plugins", file));
  }
  return diagnostics;
}

function invalidField(field: string, file: string): Diagnostic {
  return diagnostic("error", "E_CONFIG_INVALID", `deckjsx config ${field} is invalid`, file);
}

function normalizeConfigPlugins(plugins: readonly DeckPlugin[]): DeckPlugin[] {
  return mergePluginSlots([], plugins);
}

function normalizeHint(value: DeckjsxConfigInput["entry"]): null | readonly string[] {
  if (value === undefined || value === null) return null;
  return Object.freeze(typeof value === "string" ? [value] : [...value]);
}

function isHint(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function isConfigDefinition(value: unknown): value is DeckjsxConfigDefinition {
  return typeof value === "function" || isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function diagnostic(
  severity: "error" | "warning",
  code: string,
  title: string,
  file: string,
  message?: string,
): Diagnostic {
  return {
    severity,
    code,
    title,
    ...(message ? { message } : {}),
    labels: [{ message: title, path: file, sourceSpan: { file } }],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

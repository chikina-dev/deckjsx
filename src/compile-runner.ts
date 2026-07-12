import {
  COMPOSITION_SOURCE,
  compositionRevisionForSource,
  type CompositionSource,
} from "./composition/source";
import type { SourceContextValue } from "./composition/public";
import type { ComposedAuthorRoot } from "./composition/types";
import { resolveComposition } from "./composition/resolve";
import {
  withAuthoringRuntimeObservers,
  type AuthoringRuntimeObserver,
} from "./authoring-runtime-observer";
import { createDiagnostics, type Diagnostics } from "./diagnostics";
import { buildSemanticAuthorGraph } from "./graph";
import {
  applyPluginHooks,
  validateDeckPlugins,
  validDeckPlugins,
  type ValidatedPluginSnapshot,
} from "./plugin";
import { resultOk, stageSummary } from "./pipeline/stage";
import type { StageArtifactStatus } from "./pipeline/public";
import type { DefinedGraphInput } from "./pipeline/artifact-input";
import type { InternalCompileResult } from "./pipeline/compile-result";
import type { PresentStageArtifactStatus } from "./pipeline/results-public";
import { resolveStyles } from "./style/resolve";
import type { SlideTemplateSet } from "./templates";

function combineDiagnostics(...diagnostics: readonly Diagnostics[]): Diagnostics {
  return createDiagnostics(diagnostics.flatMap((item) => item.items));
}

function emptyDiagnostics(): Diagnostics {
  return createDiagnostics();
}

type CompileArtifactSink = {
  materializeComposition(
    roots: readonly ComposedAuthorRoot[] | undefined,
    diagnostics: Diagnostics,
  ): void;
  materializeGraphFromComposition(input: {
    readonly graph: DefinedGraphInput["graph"];
    readonly resolvedStyles: DefinedGraphInput["resolvedStyles"];
    readonly roots: readonly ComposedAuthorRoot[];
    readonly diagnostics: Diagnostics;
    readonly compositionRevision?: string;
  }): void;
};

function directPluginsForSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(source: CompositionSource<TSourceContext, TTemplates>) {
  return source[COMPOSITION_SOURCE]().plugins;
}

function projectedArtifactStatus(value: undefined, diagnostics: Diagnostics): "missing";
function projectedArtifactStatus<T>(value: T, diagnostics: Diagnostics): PresentStageArtifactStatus;
function projectedArtifactStatus<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): StageArtifactStatus;
function projectedArtifactStatus<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): StageArtifactStatus {
  if (value === undefined) {
    return "missing";
  }

  return diagnostics.hasErrors ? "partial" : "available";
}

type CompilePluginInput =
  | { readonly kind: "raw"; readonly plugins: readonly unknown[] }
  | { readonly kind: "validated"; readonly snapshot: ValidatedPluginSnapshot };

export function compileSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  source: CompositionSource<TSourceContext, TTemplates>,
  artifacts?: CompileArtifactSink,
  plugins: readonly unknown[] = directPluginsForSource(source),
  authoringRuntimeObservers?: readonly AuthoringRuntimeObserver[],
): InternalCompileResult {
  return compileSourceInternal(
    source,
    artifacts,
    { kind: "raw", plugins },
    authoringRuntimeObservers,
  );
}

export function compileSourceWithValidatedPlugins<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  source: CompositionSource<TSourceContext, TTemplates>,
  artifacts: CompileArtifactSink | undefined,
  plugins: ValidatedPluginSnapshot,
  authoringRuntimeObservers?: readonly AuthoringRuntimeObserver[],
): InternalCompileResult {
  return compileSourceInternal(
    source,
    artifacts,
    { kind: "validated", snapshot: plugins },
    authoringRuntimeObservers,
  );
}

function compileSourceInternal<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  source: CompositionSource<TSourceContext, TTemplates>,
  artifacts: CompileArtifactSink | undefined,
  pluginInput: CompilePluginInput,
  authoringRuntimeObservers?: readonly AuthoringRuntimeObserver[],
): InternalCompileResult {
  const pluginDiagnostics =
    pluginInput.kind === "raw"
      ? createDiagnostics(validateDeckPlugins(pluginInput.plugins))
      : emptyDiagnostics();
  const validPlugins =
    pluginInput.kind === "raw"
      ? validDeckPlugins(pluginInput.plugins)
      : pluginInput.snapshot.plugins;
  const beforeTree = applyPluginHooks(validPlugins, "beforeTree", {
    stage: "tree" as const,
    phase: "before" as const,
  });
  const beforeTreeDiagnostics = createDiagnostics(beforeTree.diagnostics);
  const composition = withAuthoringRuntimeObservers(authoringRuntimeObservers, () =>
    resolveComposition(source),
  );
  const afterTree = applyPluginHooks(validPlugins, "afterTree", {
    stage: "tree" as const,
    phase: "after" as const,
    roots: composition.roots ?? [],
  });
  const treeDiagnostics = combineDiagnostics(
    pluginDiagnostics,
    beforeTreeDiagnostics,
    composition.diagnostics,
    createDiagnostics(afterTree.diagnostics),
  );
  const roots = afterTree.context.roots;

  if (treeDiagnostics.hasErrors) {
    artifacts?.materializeComposition(roots, treeDiagnostics);

    return {
      ok: false,
      diagnostics: treeDiagnostics,
      stages: {
        compile: stageSummary("compile", treeDiagnostics, "missing"),
      },
    };
  }

  const beforeGraph = applyPluginHooks(validPlugins, "beforeGraph", {
    stage: "graph" as const,
    phase: "before" as const,
    roots,
  });
  const graphRoots = beforeGraph.context.roots;
  const beforeGraphDiagnostics = createDiagnostics(beforeGraph.diagnostics);
  const result = buildSemanticAuthorGraph(graphRoots);
  const styleResult = result.graph ? resolveStyles(result.graph, graphRoots) : undefined;
  const afterGraph = applyPluginHooks(validPlugins, "afterGraph", {
    stage: "graph" as const,
    phase: "after" as const,
    roots: graphRoots,
    ...(result.graph ? { graph: result.graph } : {}),
    ...(styleResult ? { resolvedStyles: styleResult.resolvedStyles } : {}),
  });
  const graph = afterGraph.context.graph;
  const resolvedStyles = afterGraph.context.resolvedStyles;
  const diagnostics = combineDiagnostics(
    treeDiagnostics,
    beforeGraphDiagnostics,
    result.diagnostics,
    styleResult?.diagnostics ?? emptyDiagnostics(),
    createDiagnostics(afterGraph.diagnostics),
  );
  artifacts?.materializeComposition(graphRoots, treeDiagnostics);
  if (graph && resolvedStyles) {
    artifacts?.materializeGraphFromComposition({
      graph,
      resolvedStyles,
      roots: graphRoots,
      diagnostics,
      compositionRevision: compositionRevisionForSource(source),
    });
  }

  if (!graph || !resolvedStyles) {
    return {
      ok: resultOk(diagnostics),
      diagnostics,
      stages: {
        compile: stageSummary("compile", diagnostics, "missing"),
      },
    };
  }

  return {
    ok: resultOk(diagnostics),
    diagnostics,
    stages: {
      compile: stageSummary("compile", diagnostics, projectedArtifactStatus(graph, diagnostics)),
    },
    graph,
    resolvedStyles,
  };
}

export function defineGraphForSource<
  TSourceContext extends SourceContextValue | void,
  TTemplates extends SlideTemplateSet,
>(
  source: CompositionSource<TSourceContext, TTemplates>,
  graph: DefinedGraphInput["graph"],
): DefinedGraphInput {
  const composition = resolveComposition(source);
  const styleResult = resolveStyles(graph, composition.roots ?? []);
  return {
    graph,
    resolvedStyles: styleResult.resolvedStyles,
    diagnostics: combineDiagnostics(composition.diagnostics, styleResult.diagnostics),
    compositionRevision: compositionRevisionForSource(source),
  };
}

import type { CompileResultWithGraph, CompileResultWithoutGraph } from "./results-public";
import type { SemanticAuthorGraph } from "../graph/types";
import type { ResolvedStyleMap } from "../style/resolve";

export type InternalCompileResult = InternalCompileResultWithGraph | CompileResultWithoutGraph;

export type InternalCompileResultWithGraph = Omit<
  CompileResultWithGraph,
  "graph" | "resolvedStyles"
> & {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
};

import type { Diagnostics } from "../diagnostics";
import type { SemanticAuthorGraph } from "../graph";
import type { ResolvedStyleMap } from "../style/resolve";

export type DefinedGraphInput = {
  readonly graph: SemanticAuthorGraph;
  readonly resolvedStyles: ResolvedStyleMap;
  readonly diagnostics: Diagnostics;
  readonly compositionRevision?: string;
};

export type DefinedProjectionInput = {
  readonly projection: unknown;
  readonly diagnostics: Diagnostics;
};

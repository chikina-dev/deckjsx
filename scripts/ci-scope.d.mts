export type CiScope = {
  readonly benchmark: boolean;
  readonly core: boolean;
  readonly docsOnly: boolean;
  readonly node: boolean;
};

export function classifyCiScope(changedPaths: readonly string[]): CiScope;

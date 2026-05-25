import { createDiagnostics, diagnostic, type Diagnostics } from "../diagnostics";
import type { GraphNodeId, SourceOrigin } from "../graph";
import type { PptxContentTypesPayload } from "./pptx-manifest";
import type { PackagePartId, PptxPackageModel, PptxPackagePart } from "./pptx";

export type ProjectionArtifact<TProjection> = {
  readonly projection: TProjection;
  readonly diagnostics: Diagnostics;
};

export type PptxProjectionArtifact = ProjectionArtifact<PptxPackageModel> & {
  readonly partsById: ReadonlyMap<PackagePartId, PptxPackagePart>;
  readonly partsBySourceKey: ReadonlyMap<string, readonly PackagePartId[]>;
  readonly partsByGraphNodeId: ReadonlyMap<GraphNodeId, readonly PackagePartId[]>;
  readonly packageDependencies: PackageDependencySnapshot;
};

export type PackageDependencySnapshot = {
  readonly dependenciesByPartId: ReadonlyMap<PackagePartId, readonly PackagePartId[]>;
  readonly dependentsByPartId: ReadonlyMap<PackagePartId, readonly PackagePartId[]>;
};

const ROOT_SOURCE_ARTIFACT_KEY = "deck:root";

function appendIndexValue<TKey, TValue>(
  index: Map<TKey, TValue[]>,
  key: TKey,
  value: TValue,
): void {
  const values = index.get(key) ?? [];
  values.push(value);
  index.set(key, values);
}

function sourceKeyFor(source: SourceOrigin | undefined): string {
  return !source || source.kind === "root" ? ROOT_SOURCE_ARTIFACT_KEY : source.sourceIdentity;
}

export function projectionShapeDiagnostics(projection: PptxPackageModel): Diagnostics {
  const issues = [];
  const candidate = projection as unknown as {
    version?: unknown;
    format?: unknown;
    size?: { widthEmu?: unknown; heightEmu?: unknown };
    parts?: unknown;
    slides?: unknown;
  };

  if (candidate.version !== "0.6") {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_DEFINE_PROJECTION_VERSION",
        title: "projection version is not supported",
        message: 'defineProjection() expects a Pptx Package Model with version "0.6".',
        labels: [
          {
            path: "projection.version",
            message: `received ${String(candidate.version)}`,
            severity: "primary",
          },
        ],
      }),
    );
  }

  if (candidate.format !== "pptx") {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_DEFINE_PROJECTION_FORMAT",
        title: "projection format is not pptx",
        message: "defineProjection() currently accepts only Pptx Package Model artifacts.",
        labels: [
          {
            path: "projection.format",
            message: `received ${String(candidate.format)}`,
            severity: "primary",
          },
        ],
      }),
    );
  }

  if (
    typeof candidate.size?.widthEmu !== "number" ||
    typeof candidate.size?.heightEmu !== "number"
  ) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_DEFINE_PROJECTION_SIZE",
        title: "projection size is invalid",
        message: "projection.size must contain numeric widthEmu and heightEmu values.",
        labels: [{ path: "projection.size", message: "expected widthEmu and heightEmu" }],
      }),
    );
  }

  if (!Array.isArray(candidate.parts)) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_DEFINE_PROJECTION_PARTS",
        title: "projection parts are invalid",
        message: "projection.parts must be an array of package parts.",
        labels: [{ path: "projection.parts", message: "expected array" }],
      }),
    );
  }

  if (!Array.isArray(candidate.slides)) {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_DEFINE_PROJECTION_SLIDES",
        title: "projection slides are invalid",
        message: "projection.slides must be an array of slide parts.",
        labels: [{ path: "projection.slides", message: "expected array" }],
      }),
    );
  }

  return createDiagnostics(issues);
}

export function pptxProjectionArtifact(
  projection: PptxPackageModel,
  diagnostics: Diagnostics,
): PptxProjectionArtifact {
  const parts = safeProjectionParts(projection);

  return {
    projection,
    diagnostics,
    partsById: new Map(parts.map((part) => [part.id, part])),
    partsBySourceKey: partsBySourceKey(parts),
    partsByGraphNodeId: partsByGraphNodeId(parts),
    packageDependencies: packageDependencySnapshot(parts),
  };
}

function safeProjectionParts(projection: PptxPackageModel): readonly PptxPackagePart[] {
  const candidate = projection as unknown as { parts?: unknown };
  return Array.isArray(candidate.parts) ? (candidate.parts as PptxPackagePart[]) : [];
}

function partsBySourceKey(
  parts: readonly PptxPackagePart[],
): ReadonlyMap<string, readonly PackagePartId[]> {
  const index = new Map<string, PackagePartId[]>();

  parts.forEach((part) => {
    appendIndexValue(index, sourceKeyFor(part.origin?.source), part.id);
  });

  return index;
}

function partsByGraphNodeId(
  parts: readonly PptxPackagePart[],
): ReadonlyMap<GraphNodeId, readonly PackagePartId[]> {
  const index = new Map<GraphNodeId, PackagePartId[]>();

  parts.forEach((part) => {
    part.origin?.graphNodeIds?.forEach((graphNodeId) => {
      appendIndexValue(index, graphNodeId, part.id);
    });
  });

  return index;
}

function packageDependencySnapshot(parts: readonly PptxPackagePart[]): PackageDependencySnapshot {
  const dependenciesByPartId = new Map<PackagePartId, PackagePartId[]>();
  const dependentsByPartId = new Map<PackagePartId, PackagePartId[]>();
  const partsByPath = new Map(parts.map((part) => [normalizedPartPath(part.path), part]));

  parts.forEach((part) => {
    dependenciesByPartId.set(part.id, dependenciesByPartId.get(part.id) ?? []);
    dependentsByPartId.set(part.id, dependentsByPartId.get(part.id) ?? []);

    part.relationships?.forEach((relationship) => {
      appendIndexValue(dependenciesByPartId, part.id, relationship.targetPartId);
      appendIndexValue(dependentsByPartId, relationship.targetPartId, part.id);
    });

    if (isContentTypesPayload(part.payload)) {
      part.payload.overrides.forEach((override) => {
        const target = partsByPath.get(normalizedPartPath(override.partName));
        if (!target || target.id === part.id) {
          return;
        }

        appendIndexValue(dependenciesByPartId, part.id, target.id);
        appendIndexValue(dependentsByPartId, target.id, part.id);
      });
    }
  });

  return {
    dependenciesByPartId,
    dependentsByPartId,
  };
}

function normalizedPartPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function isContentTypesPayload(value: unknown): value is PptxContentTypesPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { defaults?: unknown }).defaults) &&
    Array.isArray((value as { overrides?: unknown }).overrides)
  );
}

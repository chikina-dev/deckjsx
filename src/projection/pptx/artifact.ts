import { createDiagnostics, diagnostic, type Diagnostics } from "../../diagnostics";
import type { AssetEntityId, GraphNodeId, SourceOrigin } from "../../graph";
import type {
  PackagePartId,
  PptxPackageModel,
  PptxPackageModelCandidate,
  PptxPackagePartCandidate,
} from "./model";
import { isPptxSlidePart } from "./model";
import { packagePartFingerprint } from "./fingerprint";
import {
  packageDependencyEdges,
  type PackageDependencyEdge,
  type PackageDependencyReason,
} from "./package-parts";

export type ProjectionArtifact<TProjection> = {
  readonly projection: TProjection;
  readonly diagnostics: Diagnostics;
};

type PptxProjectionPart<TProjection extends PptxPackageModelCandidate> = TProjection extends {
  readonly parts: readonly (infer TPart)[];
}
  ? Extract<TPart, PptxPackagePartCandidate>
  : PptxPackagePartCandidate;

export type PptxProjectionArtifact<
  TProjection extends PptxPackageModelCandidate = PptxPackageModel,
> = ProjectionArtifact<TProjection> & {
  readonly partsById: ReadonlyMap<PackagePartId, PptxProjectionPart<TProjection>>;
  readonly partsBySourceKey: ReadonlyMap<string, readonly PackagePartId[]>;
  readonly partsByGraphNodeId: ReadonlyMap<GraphNodeId, readonly PackagePartId[]>;
  readonly slideProjectionFingerprints: ReadonlyMap<
    GraphNodeId,
    SlideProjectionFingerprintSnapshot
  >;
  readonly slidePackagePartFingerprints: ReadonlyMap<
    PackagePartId,
    SlidePackagePartFingerprintSnapshot
  >;
  readonly packageDependencies: PackageDependencySnapshot;
};

export type { PackageDependencyEdge, PackageDependencyReason };

export type SlidePackagePartFingerprintSnapshot = {
  readonly slidePartId: PackagePartId;
  readonly slideId: string;
  readonly name?: string;
  readonly fingerprint: string;
  readonly graphNodeIds: readonly GraphNodeId[];
};

export type SlideProjectionFingerprintSnapshot = {
  readonly slideNodeId: GraphNodeId;
  readonly fingerprint: string;
  readonly graphNodeIds: readonly GraphNodeId[];
  readonly assetEntityIds: readonly AssetEntityId[];
};

export type PackageDependencySnapshot = {
  readonly edges: readonly PackageDependencyEdge[];
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

function appendUniqueIndexValue<TKey, TValue>(
  index: Map<TKey, TValue[]>,
  key: TKey,
  value: TValue,
): void {
  const values = index.get(key) ?? [];
  if (values.includes(value)) {
    return;
  }

  values.push(value);
  index.set(key, values);
}

function sourceKeyFor(source: SourceOrigin | undefined): string {
  return !source || source.kind === "root" ? ROOT_SOURCE_ARTIFACT_KEY : source.sourceIdentity;
}

export function projectionShapeDiagnostics(projection: PptxPackageModelCandidate): Diagnostics {
  const issues = [];

  if (projection.format !== "pptx") {
    issues.push(
      diagnostic({
        severity: "error",
        code: "E_DEFINE_PROJECTION_FORMAT",
        title: "projection format is not pptx",
        message: "defineProjection() currently accepts only Pptx Package Model artifacts.",
        labels: [
          {
            path: "projection.format",
            message: `received ${String(projection.format)}`,
            severity: "primary",
          },
        ],
      }),
    );
  }

  if (
    typeof projection.size.widthEmu !== "number" ||
    typeof projection.size.heightEmu !== "number"
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

  if (!Array.isArray(projection.parts)) {
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

  if (!Array.isArray(projection.slides)) {
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
  projection: PptxPackageModelCandidate,
  diagnostics: Diagnostics,
  options: {
    readonly slideProjectionFingerprints?: ReadonlyMap<
      GraphNodeId,
      SlideProjectionFingerprintSnapshot
    >;
  } = {},
): PptxProjectionArtifact<PptxPackageModelCandidate> {
  const parts = safeProjectionParts(projection);

  return {
    projection,
    diagnostics,
    partsById: new Map(parts.map((part) => [part.id, part])),
    partsBySourceKey: partsBySourceKey(parts),
    partsByGraphNodeId: partsByGraphNodeId(parts),
    slideProjectionFingerprints: options.slideProjectionFingerprints ?? new Map(),
    slidePackagePartFingerprints: slidePackagePartFingerprints(parts),
    packageDependencies: packageDependencySnapshot(parts),
  };
}

function safeProjectionParts(
  projection: PptxPackageModelCandidate,
): readonly PptxPackagePartCandidate[] {
  return Array.isArray(projection.parts) ? projection.parts : [];
}

function partsBySourceKey(
  parts: readonly PptxPackagePartCandidate[],
): ReadonlyMap<string, readonly PackagePartId[]> {
  const index = new Map<string, PackagePartId[]>();

  parts.forEach((part) => {
    appendIndexValue(index, sourceKeyFor(part.origin?.source), part.id);
  });

  return index;
}

function partsByGraphNodeId(
  parts: readonly PptxPackagePartCandidate[],
): ReadonlyMap<GraphNodeId, readonly PackagePartId[]> {
  const index = new Map<GraphNodeId, PackagePartId[]>();

  parts.forEach((part) => {
    part.origin?.graphNodeIds?.forEach((graphNodeId) => {
      appendIndexValue(index, graphNodeId, part.id);
    });
  });

  return index;
}

function slidePackagePartFingerprints(
  parts: readonly PptxPackagePartCandidate[],
): ReadonlyMap<PackagePartId, SlidePackagePartFingerprintSnapshot> {
  const index = new Map<PackagePartId, SlidePackagePartFingerprintSnapshot>();

  parts.forEach((part) => {
    if (!isPptxSlidePart(part)) {
      return;
    }

    index.set(part.id, {
      slidePartId: part.id,
      slideId: part.payload.slideId,
      ...(part.payload.name ? { name: part.payload.name } : {}),
      fingerprint: part.fingerprint ?? packagePartFingerprint(part),
      graphNodeIds: part.origin?.graphNodeIds ?? [],
    });
  });

  return index;
}

function packageDependencySnapshot(
  parts: readonly PptxPackagePartCandidate[],
): PackageDependencySnapshot {
  const edges = packageDependencyEdges(parts);
  const dependenciesByPartId = new Map<PackagePartId, PackagePartId[]>();
  const dependentsByPartId = new Map<PackagePartId, PackagePartId[]>();
  parts.forEach((part) => {
    dependenciesByPartId.set(part.id, []);
    dependentsByPartId.set(part.id, []);
  });
  edges.forEach((edge) => {
    appendUniqueIndexValue(dependenciesByPartId, edge.ownerPartId, edge.targetPartId);
    appendUniqueIndexValue(dependentsByPartId, edge.targetPartId, edge.ownerPartId);
  });

  return {
    edges,
    dependenciesByPartId,
    dependentsByPartId,
  };
}

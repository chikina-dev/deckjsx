import type {
  PackagePartId,
  PptxPackagePart,
  PptxPackagePartCandidate,
  PptxPackagePartDependencyFingerprint,
  PptxRelationship,
} from "./model";

export type PptxPackagePartWithFingerprints<TPart extends PptxPackagePart> = TPart & {
  readonly fingerprint: string;
  readonly dependencyFingerprints?: readonly PptxPackagePartDependencyFingerprint[];
};

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

export function fingerprintString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function packagePartFingerprint(part: PptxPackagePartCandidate): string {
  return fingerprintString(
    stableJson({
      id: part.id,
      category: part.category,
      requirement: part.requirement,
      kind: part.kind,
      orderKey: part.orderKey,
      path: part.path,
      relationships: part.relationships,
      payload: part.payload,
    }),
  );
}

function relationshipsFor(part: PptxPackagePart): readonly PptxRelationship[] {
  if (part.relationships) {
    return part.relationships;
  }

  return part.kind === "relationships" ? (part.payload?.relationships ?? []) : [];
}

function ownerPathForRelationshipPart(part: PptxPackagePart): string | undefined {
  if (
    part.kind !== "relationships" ||
    part.path === "_rels/.rels" ||
    !part.path.endsWith(".rels")
  ) {
    return undefined;
  }

  const marker = "/_rels/";
  const markerIndex = part.path.lastIndexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const ownerDirectory = part.path.slice(0, markerIndex);
  const ownerFile = part.path.slice(markerIndex + marker.length, -".rels".length);
  return ownerDirectory ? `${ownerDirectory}/${ownerFile}` : ownerFile;
}

function uniqueDependencyFingerprints(
  dependencies: readonly PptxPackagePartDependencyFingerprint[],
): readonly PptxPackagePartDependencyFingerprint[] {
  const byPartId = new Map<PackagePartId, PptxPackagePartDependencyFingerprint>();
  for (const dependency of dependencies) {
    byPartId.set(dependency.packagePartId, dependency);
  }
  return [...byPartId.values()];
}

export function withPackagePartFingerprints<TPart extends PptxPackagePart>(
  parts: readonly TPart[],
): readonly PptxPackagePartWithFingerprints<TPart>[] {
  const partsWithFingerprint = parts.map((part) => ({
    ...part,
    fingerprint: packagePartFingerprint(part),
  }));
  const fingerprintById = new Map(partsWithFingerprint.map((part) => [part.id, part.fingerprint]));
  const partByPath = new Map(partsWithFingerprint.map((part) => [part.path, part]));
  const relationshipPartByOwnerPartId = new Map<
    PackagePartId,
    (typeof partsWithFingerprint)[number]
  >();

  for (const part of partsWithFingerprint) {
    const ownerPath = ownerPathForRelationshipPart(part);
    const ownerPart = ownerPath ? partByPath.get(ownerPath) : undefined;
    if (ownerPart) {
      relationshipPartByOwnerPartId.set(ownerPart.id, part);
    }
  }

  return partsWithFingerprint.map((part): PptxPackagePartWithFingerprints<TPart> => {
    const targetDependencyFingerprints = relationshipsFor(part).flatMap((relationship) => {
      const targetPartId = relationship.targetPartId;
      const fingerprint = targetPartId ? fingerprintById.get(targetPartId) : undefined;
      return targetPartId && fingerprint ? [{ packagePartId: targetPartId, fingerprint }] : [];
    });
    const ownerRelationshipPart = relationshipPartByOwnerPartId.get(part.id);
    const ownerRelationshipFingerprint = ownerRelationshipPart
      ? fingerprintById.get(ownerRelationshipPart.id)
      : undefined;
    const ownerRelationshipDependency =
      ownerRelationshipPart && ownerRelationshipFingerprint
        ? [
            {
              packagePartId: ownerRelationshipPart.id,
              fingerprint: ownerRelationshipFingerprint,
            },
          ]
        : [];
    const dependencyFingerprints = uniqueDependencyFingerprints([
      ...targetDependencyFingerprints,
      ...ownerRelationshipDependency,
    ]);

    return dependencyFingerprints.length > 0 ? { ...part, dependencyFingerprints } : part;
  });
}

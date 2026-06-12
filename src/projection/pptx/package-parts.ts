import type {
  PackagePartId,
  PptxContentTypesPayload,
  PptxPackagePart,
  PptxPackagePartCandidate,
  PptxPackagePartOrderGroup,
  PptxPackagePartOrderKey,
  PptxPackagePartRequirementCondition,
  PptxPackagePartRequirementStatus,
  PptxPackagePartRequirement,
  PptxRelationship,
  PptxSerializedIdentity,
} from "./model";

export type PackageDependencyReason =
  | "contentTypeOverride"
  | "dependencyFingerprint"
  | "requirementDependency"
  | "relationshipTarget";

export type PackageDependencyEdge = {
  readonly ownerPartId: PackagePartId;
  readonly ownerPath: string;
  readonly targetPartId: PackagePartId;
  readonly targetPath: string;
  readonly reason: PackageDependencyReason;
  readonly relationshipId?: PptxSerializedIdentity;
  readonly relationshipType?: string;
  readonly contentType?: string;
  readonly fingerprint?: string;
  readonly requirementStatus?: PptxPackagePartRequirementStatus;
  readonly requirementCondition?: PptxPackagePartRequirementCondition;
};

function packagePartOrderGroup(part: PptxPackagePartCandidate): PptxPackagePartOrderGroup {
  if (part.path === "[Content_Types].xml") {
    return "contentTypes";
  }
  if (part.path === "_rels/.rels") {
    return "rootRelationships";
  }
  if (part.path.startsWith("docProps/")) {
    return "documentProperties";
  }
  if (part.kind === "presentation") {
    return "presentation";
  }
  if (part.path === "ppt/_rels/presentation.xml.rels") {
    return "presentationRelationships";
  }
  if (part.kind === "theme") {
    return "theme";
  }
  if (part.kind === "slide-master") {
    return "slideMaster";
  }
  if (part.kind === "relationships" && part.path.startsWith("ppt/slideMasters/_rels/")) {
    return "slideMasterRelationships";
  }
  if (part.kind === "slide-layout") {
    return "slideLayout";
  }
  if (part.kind === "relationships" && part.path.startsWith("ppt/slideLayouts/_rels/")) {
    return "slideLayoutRelationships";
  }
  if (part.kind === "view-properties") {
    return "viewProperties";
  }
  if (part.kind === "presentation-properties") {
    return "presentationProperties";
  }
  if (part.kind === "table-styles") {
    return "tableStyles";
  }
  if (part.kind === "slide") {
    return "slide";
  }
  if (part.kind === "relationships" && part.path.startsWith("ppt/slides/_rels/")) {
    return "slideRelationships";
  }
  if (part.kind === "media") {
    return "media";
  }
  return "other";
}

const PACKAGE_PART_ORDER_GROUP_ORDER = {
  contentTypes: 0,
  rootRelationships: 10,
  documentProperties: 20,
  presentation: 30,
  presentationRelationships: 40,
  theme: 50,
  slideMaster: 60,
  slideMasterRelationships: 61,
  slideLayout: 70,
  slideLayoutRelationships: 71,
  viewProperties: 75,
  presentationProperties: 76,
  tableStyles: 77,
  slide: 80,
  slideRelationships: 81,
  media: 90,
  other: 900,
} satisfies Record<PptxPackagePartOrderGroup, number>;

function packagePartOrderKey(
  part: PptxPackagePartCandidate,
  sequence: number,
): PptxPackagePartOrderKey {
  const group = packagePartOrderGroup(part);
  const groupOrder = PACKAGE_PART_ORDER_GROUP_ORDER[group];
  return {
    group,
    groupOrder,
    sequence,
    path: part.path,
    value: `${String(groupOrder).padStart(3, "0")}:${String(sequence).padStart(6, "0")}:${part.path}`,
  };
}

export function withPackagePartOrderKeys<TPart extends PptxPackagePartCandidate>(
  parts: readonly TPart[],
): readonly (TPart & { readonly orderKey: PptxPackagePartOrderKey })[] {
  return parts.map((part, index): TPart & { readonly orderKey: PptxPackagePartOrderKey } => ({
    ...part,
    orderKey: packagePartOrderKey(part, index),
  }));
}

export function relationshipTargets(part: PptxPackagePartCandidate): readonly PptxRelationship[] {
  if (part.relationships) {
    return part.relationships;
  }

  return part.kind === "relationships" ? (part.payload?.relationships ?? []) : [];
}

function normalizedPartPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function contentTypesPayload(part: PptxPackagePartCandidate): PptxContentTypesPayload | undefined {
  if (part.kind !== "content-types") {
    return undefined;
  }

  const payload = part.payload;
  if (!Array.isArray(payload?.defaults) || !Array.isArray(payload.overrides)) {
    return undefined;
  }

  return {
    defaults: payload.defaults,
    overrides: payload.overrides,
  };
}

export function packageDependencyEdges(
  parts: readonly PptxPackagePartCandidate[],
): readonly PackageDependencyEdge[] {
  const partsById = new Map(parts.map((part) => [part.id, part]));
  const partsByPath = new Map(parts.map((part) => [normalizedPartPath(part.path), part]));
  const edges: PackageDependencyEdge[] = [];
  const seen = new Set<string>();

  parts.forEach((part) => {
    const appendEdge = (edge: Omit<PackageDependencyEdge, "ownerPartId" | "ownerPath">): void => {
      const target = partsById.get(edge.targetPartId);
      if (!target || edge.targetPartId === part.id) {
        return;
      }

      const dependency = {
        ownerPartId: part.id,
        ownerPath: part.path,
        ...edge,
        targetPath: edge.targetPath || target.path,
      };
      const key = [
        dependency.ownerPartId,
        dependency.targetPartId,
        dependency.reason,
        dependency.relationshipId ?? "",
        dependency.contentType ?? "",
        dependency.fingerprint ?? "",
        dependency.requirementStatus ?? "",
        dependency.requirementCondition ?? "",
      ].join("\u0000");
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      edges.push(dependency);
    };

    relationshipTargets(part).forEach((relationship) => {
      if (!relationship.targetPartId) {
        return;
      }

      appendEdge({
        targetPartId: relationship.targetPartId,
        targetPath: relationship.targetPath,
        reason: "relationshipTarget",
        relationshipId: relationship.id,
        relationshipType: relationship.type,
      });
    });

    const contentTypes = contentTypesPayload(part);
    if (contentTypes) {
      contentTypes.overrides.forEach((override) => {
        const target = partsByPath.get(normalizedPartPath(override.partName));
        if (!target) {
          return;
        }

        appendEdge({
          targetPartId: target.id,
          targetPath: target.path,
          reason: "contentTypeOverride",
          contentType: override.contentType,
        });
      });
    }

    part.dependencyFingerprints?.forEach((dependency) => {
      const target = partsById.get(dependency.packagePartId);
      if (!target) {
        return;
      }

      appendEdge({
        targetPartId: dependency.packagePartId,
        targetPath: target.path,
        reason: "dependencyFingerprint",
        fingerprint: dependency.fingerprint,
      });
    });

    const requirement = part.requirement;
    if (requirement?.dependencies) {
      requirement.dependencies.forEach((dependencyPartId) => {
        const target = partsById.get(dependencyPartId);
        if (!target) {
          return;
        }

        appendEdge({
          targetPartId: dependencyPartId,
          targetPath: target.path,
          reason: "requirementDependency",
          requirementStatus: requirement.status,
          ...(requirement.condition ? { requirementCondition: requirement.condition } : {}),
        });
      });
    }
  });

  return edges;
}

function normalizePackagePartRequirement(
  requirement: PptxPackagePartRequirement,
): PptxPackagePartRequirement {
  return {
    ...requirement,
    required: requirement.required,
    condition: requirement.condition ?? "explicit",
  };
}

function packagePartRequirement(
  part: PptxPackagePart,
  relationshipPartIdsByTargetPartId: ReadonlyMap<PackagePartId, readonly PackagePartId[]>,
): PptxPackagePartRequirement {
  if (part.requirement) {
    return normalizePackagePartRequirement(part.requirement);
  }

  if (part.kind === "media") {
    const dependencies = [...new Set(relationshipPartIdsByTargetPartId.get(part.id) ?? [])];
    return {
      status: "conditional",
      required: dependencies.length > 0,
      condition: "referencedByRelationship",
      reason: "required because a drawing relationship references this media part",
      ...(dependencies.length > 0 ? { dependencies } : {}),
    };
  }

  if (part.kind === "relationships") {
    const dependencies = relationshipTargets(part).flatMap((relationship) =>
      relationship.targetPartId ? [relationship.targetPartId] : [],
    );
    const uniqueDependencies = [...new Set(dependencies)];
    return {
      status: "conditional",
      required: uniqueDependencies.length > 0,
      condition: "hasRelationships",
      reason: "required because the owning package part has relationships",
      ...(uniqueDependencies.length > 0 ? { dependencies: uniqueDependencies } : {}),
    };
  }

  return {
    status: "required",
    required: true,
    condition: "minimalPackage",
    reason: "required for the minimal PPTX package generated by deckjsx",
  };
}

export function withPackagePartRequirements<TPart extends PptxPackagePart>(
  parts: readonly TPart[],
): readonly (TPart & { readonly requirement: PptxPackagePartRequirement })[] {
  const relationshipPartIdsByTargetPartId = new Map<PackagePartId, PackagePartId[]>();

  for (const part of parts) {
    if (part.kind !== "relationships") {
      continue;
    }

    for (const relationship of relationshipTargets(part)) {
      if (!relationship.targetPartId) {
        continue;
      }

      const existing = relationshipPartIdsByTargetPartId.get(relationship.targetPartId) ?? [];
      relationshipPartIdsByTargetPartId.set(relationship.targetPartId, [...existing, part.id]);
    }
  }

  return parts.map((part): TPart & { readonly requirement: PptxPackagePartRequirement } => ({
    ...part,
    requirement: packagePartRequirement(part, relationshipPartIdsByTargetPartId),
  }));
}

import { createDiagnostics, diagnostic, type Diagnostics } from "../diagnostics";
import type { PackagePartId, PptxPackageModel, PptxPackagePart } from "./pptx";
import type { PptxContentTypesPayload } from "./pptx-manifest";

const REQUIRED_PACKAGE_PATHS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/core.xml",
  "ppt/presentation.xml",
  "ppt/_rels/presentation.xml.rels",
  "ppt/theme/theme1.xml",
  "ppt/slideMasters/slideMaster1.xml",
  "ppt/slideLayouts/slideLayout1.xml",
  "ppt/viewProps.xml",
  "ppt/presProps.xml",
] as const;

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

function packagePartsFor(projection: PptxPackageModel): readonly PptxPackagePart[] {
  const candidate = projection as unknown as { parts?: unknown };
  return Array.isArray(candidate.parts) ? (candidate.parts as PptxPackagePart[]) : [];
}

export function validatePptxPackageModel(projection: PptxPackageModel): Diagnostics {
  const issues = [];
  const parts = packagePartsFor(projection);
  const partsById = new Map<PackagePartId, PptxPackagePart>();
  const partsByPath = new Map<string, PptxPackagePart>();
  const partIds = new Set<PackagePartId>();

  for (const part of parts) {
    const partPath = normalizedPartPath(part.path);

    if (partIds.has(part.id)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_DUPLICATE_PART_ID",
          title: "pptx package part identity is duplicated",
          message: "Pptx Package Model parts must have unique Package Part Identity values.",
          labels: [{ path: `projection.parts.${part.id}`, message: "duplicate part id" }],
        }),
      );
      continue;
    }

    partIds.add(part.id);
    partsById.set(part.id, part);

    if (partsByPath.has(partPath)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_DUPLICATE_PART_PATH",
          title: "pptx package part path is duplicated",
          message: "Pptx Package Model parts must have unique normalized package paths.",
          labels: [{ path: `projection.parts.${partPath}`, message: "duplicate part path" }],
        }),
      );
      continue;
    }

    partsByPath.set(partPath, part);
  }

  for (const requiredPath of REQUIRED_PACKAGE_PATHS) {
    if (!partsByPath.has(requiredPath)) {
      issues.push(
        diagnostic({
          severity: "error",
          code: "E_PPTX_PACKAGE_MISSING_REQUIRED_PART",
          title: "pptx package is missing a required part",
          message: `Pptx Package Model is missing ${requiredPath}.`,
          labels: [{ path: "projection.parts", message: `missing ${requiredPath}` }],
        }),
      );
    }
  }

  for (const part of parts) {
    part.relationships?.forEach((relationship) => {
      const targetPart = partsById.get(relationship.targetPartId);
      if (!targetPart) {
        issues.push(
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_BROKEN_RELATIONSHIP",
            title: "pptx package relationship target is missing",
            message: `Relationship ${relationship.id} points to a missing package part.`,
            labels: [
              {
                path: `projection.parts.${part.id}.relationships.${relationship.id}`,
                message: `missing target ${relationship.targetPartId}`,
              },
            ],
          }),
        );
        return;
      }

      if (normalizedPartPath(relationship.targetPath) !== normalizedPartPath(targetPart.path)) {
        issues.push(
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_RELATIONSHIP_TARGET_PATH_MISMATCH",
            title: "pptx package relationship target path does not match target part",
            message: `Relationship ${relationship.id} targetPath does not match its target package part path.`,
            labels: [
              {
                path: `projection.parts.${part.id}.relationships.${relationship.id}.targetPath`,
                message: `expected ${targetPart.path}, received ${relationship.targetPath}`,
              },
            ],
          }),
        );
      }
    });

    if (!isContentTypesPayload(part.payload)) {
      continue;
    }

    part.payload.overrides.forEach((override) => {
      const targetPath = normalizedPartPath(override.partName);
      if (!partsByPath.has(targetPath)) {
        issues.push(
          diagnostic({
            severity: "error",
            code: "E_PPTX_PACKAGE_BROKEN_CONTENT_TYPE_OVERRIDE",
            title: "pptx content type override target is missing",
            message: `Content type override points to a missing package part: ${override.partName}.`,
            labels: [
              {
                path: `projection.parts.${part.id}.payload.overrides`,
                message: `missing ${override.partName}`,
              },
            ],
          }),
        );
      }
    });
  }

  return createDiagnostics(issues);
}

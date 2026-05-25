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
  const partIds = new Set<PackagePartId>();
  const partPaths = new Set(parts.map((part) => normalizedPartPath(part.path)));

  for (const part of parts) {
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
  }

  for (const requiredPath of REQUIRED_PACKAGE_PATHS) {
    if (!partPaths.has(requiredPath)) {
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
      if (!partsById.has(relationship.targetPartId)) {
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
      }
    });

    if (!isContentTypesPayload(part.payload)) {
      continue;
    }

    part.payload.overrides.forEach((override) => {
      const targetPath = normalizedPartPath(override.partName);
      if (!partPaths.has(targetPath)) {
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

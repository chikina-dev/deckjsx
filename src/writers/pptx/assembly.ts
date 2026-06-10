import { createDiagnostics, diagnostic, type Diagnostics } from "../../diagnostics";
import type {
  RenderAssemblyExpectedEntrySummary,
  RenderAssemblyFinalEntrySummary,
  RenderAssemblyBuildSummary,
  RenderAssemblyPlanEntrySummary,
  RenderAssemblyReasonDetails,
  RenderInspectionSummary,
} from "../../pipeline";
import type { PptxPackageBuildArtifact } from "../../pipeline-artifacts";
import type { PptxPackagePart } from "../../projection/pptx/model";
import { packagePartOrderKey } from "./package-part";
import type { PptxZipEntry } from "./zip";

export type PptxExpectedAssemblyEntry = RenderAssemblyExpectedEntrySummary & {
  readonly part: PptxPackagePart;
};

export type PptxAssemblyPlanEntry = RenderAssemblyPlanEntrySummary & {
  readonly bytes?: Uint8Array;
  readonly buildArtifact?: PptxPackageBuildArtifact;
};

export function emptyAssemblySummary(): RenderInspectionSummary {
  return {
    assembly: {
      entries: [],
      entryCount: 0,
      rebuiltCount: 0,
      reusedCount: 0,
      missingCount: 0,
      failedCount: 0,
    },
  };
}

export { packagePartOrderKey as orderKeyValue } from "./package-part";

function buildSummary(artifact: PptxPackageBuildArtifact): RenderAssemblyBuildSummary {
  return {
    partFingerprint: artifact.partFingerprint,
    writerFingerprint: artifact.writerFingerprint,
    ...(artifact.emitterFingerprint ? { emitterFingerprint: artifact.emitterFingerprint } : {}),
    dependencyFingerprintCount: artifact.dependencyFingerprints?.length ?? 0,
    ...(artifact.dependencyFingerprints?.length
      ? { dependencyFingerprints: artifact.dependencyFingerprints }
      : {}),
    ...(artifact.mediaByteFingerprint
      ? { mediaByteFingerprint: artifact.mediaByteFingerprint }
      : {}),
    ...(artifact.mediaByteFingerprintSource
      ? { mediaByteFingerprintSource: artifact.mediaByteFingerprintSource }
      : {}),
    diagnosticCodes: artifact.diagnostics.items.map((item) => item.code),
  };
}

function reasonDetailsForEntry(input: {
  final: RenderAssemblyFinalEntrySummary;
  build?: RenderAssemblyBuildSummary;
  previousBuild?: RenderAssemblyBuildSummary;
  buildArtifact?: PptxPackageBuildArtifact;
  previousBuildArtifact?: PptxPackageBuildArtifact;
}): RenderAssemblyReasonDetails | undefined {
  if (input.final.reasonDetails) {
    return input.final.reasonDetails;
  }

  switch (input.final.reason) {
    case "buildArtifactFingerprintMatched":
      return input.build
        ? { kind: "buildArtifactFingerprintMatched", matchedBuild: input.build }
        : undefined;
    case "dependencyFingerprintChanged":
      return {
        kind: "dependencyFingerprintChanged",
        dependencyFingerprints: {
          previous: input.previousBuild?.dependencyFingerprints,
          current: input.build?.dependencyFingerprints,
        },
      };
    case "emitterFingerprintChanged":
      return {
        kind: "emitterFingerprintChanged",
        emitterFingerprint: {
          previous: input.previousBuild?.emitterFingerprint,
          current: input.build?.emitterFingerprint,
        },
      };
    case "mediaBytesChanged":
      return {
        kind: "mediaBytesChanged",
        mediaByteFingerprint: {
          previous: input.previousBuild?.mediaByteFingerprint,
          current: input.build?.mediaByteFingerprint,
        },
        mediaByteFingerprintSource: {
          previous: input.previousBuild?.mediaByteFingerprintSource,
          current: input.build?.mediaByteFingerprintSource,
        },
      };
    case "missingArtifact":
      return {
        kind: "missingArtifact",
        ...(input.build ? { currentBuild: input.build } : {}),
      };
    case "orderKeyChanged":
      return {
        kind: "orderKeyChanged",
        orderKey: {
          previous: input.previousBuildArtifact?.orderKey,
          current: input.buildArtifact?.orderKey,
        },
      };
    case "packagePartIdChanged":
      return {
        kind: "packagePartIdChanged",
        packagePartId: {
          previous: input.previousBuildArtifact?.packagePartId,
          current: input.buildArtifact?.packagePartId,
        },
      };
    case "partEmitterFailed":
    case "mediaEmitterFailed":
      return {
        kind: input.final.reason,
        ...(input.final.message ? { message: input.final.message } : {}),
      };
    case "partEmitterReturnedNoBytes":
    case "mediaBytesMissing":
      return { kind: input.final.reason };
    case "partFingerprintChanged":
      return {
        kind: "partFingerprintChanged",
        partFingerprint: {
          previous: input.previousBuild?.partFingerprint,
          current: input.build?.partFingerprint,
        },
      };
    case "pathChanged":
      return {
        kind: "pathChanged",
        path: {
          previous: input.previousBuildArtifact?.path,
          current: input.buildArtifact?.path,
        },
      };
    case "writerFingerprintChanged":
      return {
        kind: "writerFingerprintChanged",
        writerFingerprint: {
          previous: input.previousBuild?.writerFingerprint,
          current: input.build?.writerFingerprint,
        },
      };
    default:
      return input.final.reason ? { kind: "custom", reason: input.final.reason } : undefined;
  }
}

function partRequirement(part: PptxPackagePart): {
  readonly required: boolean;
  readonly requirement: "conditional" | "optional" | "required";
  readonly requirementCondition?: string;
  readonly requirementDependencies?: readonly string[];
  readonly reason?: string;
} {
  const projectedRequirement = part.requirement;
  if (!projectedRequirement) {
    throw new Error(`Package part ${part.id} must carry projected requirement metadata.`);
  }

  return {
    requirement: projectedRequirement.status,
    required: projectedRequirement.required,
    ...(projectedRequirement.condition
      ? { requirementCondition: projectedRequirement.condition }
      : {}),
    ...(projectedRequirement.dependencies?.length
      ? {
          requirementDependencies: projectedRequirement.dependencies.map(
            (dependency) => dependency,
          ),
        }
      : {}),
    ...(projectedRequirement.reason ? { reason: projectedRequirement.reason } : {}),
  };
}

export function expectedAssemblyEntryForPart(part: PptxPackagePart): PptxExpectedAssemblyEntry {
  const requirement = partRequirement(part);
  return {
    part,
    path: part.path,
    packagePartId: part.id,
    orderKey: packagePartOrderKey(part),
    requirement: requirement.requirement,
    required: requirement.required,
    ...(requirement.requirementCondition
      ? { requirementCondition: requirement.requirementCondition }
      : {}),
    ...(requirement.requirementDependencies
      ? { requirementDependencies: requirement.requirementDependencies }
      : {}),
    ...(requirement.reason ? { requirementReason: requirement.reason } : {}),
  };
}

export function assemblyPlanEntry(input: {
  expected: PptxExpectedAssemblyEntry;
  final: RenderAssemblyFinalEntrySummary;
  bytes?: Uint8Array;
  buildArtifact?: PptxPackageBuildArtifact;
  previousBuildArtifact?: PptxPackageBuildArtifact;
}): PptxAssemblyPlanEntry {
  const build = input.buildArtifact ? buildSummary(input.buildArtifact) : undefined;
  const previousBuild = input.previousBuildArtifact
    ? buildSummary(input.previousBuildArtifact)
    : undefined;
  const reasonDetails = reasonDetailsForEntry({
    final: input.final,
    ...(build ? { build } : {}),
    ...(previousBuild ? { previousBuild } : {}),
    ...(input.buildArtifact ? { buildArtifact: input.buildArtifact } : {}),
    ...(input.previousBuildArtifact ? { previousBuildArtifact: input.previousBuildArtifact } : {}),
  });
  const final = reasonDetails ? { ...input.final, reasonDetails } : input.final;

  return {
    path: input.expected.path,
    packagePartId: input.expected.packagePartId,
    ...(input.expected.orderKey ? { orderKey: input.expected.orderKey } : {}),
    requirement: input.expected.requirement,
    required: input.expected.required,
    ...(input.expected.requirementCondition
      ? { requirementCondition: input.expected.requirementCondition }
      : {}),
    ...(input.expected.requirementDependencies
      ? { requirementDependencies: input.expected.requirementDependencies }
      : {}),
    ...(input.expected.requirementReason
      ? { requirementReason: input.expected.requirementReason }
      : {}),
    status: input.final.status,
    ...(input.final.byteLength !== undefined ? { byteLength: input.final.byteLength } : {}),
    ...(input.final.reason ? { reason: input.final.reason } : {}),
    ...(reasonDetails ? { reasonDetails } : {}),
    ...(input.final.message ? { message: input.final.message } : {}),
    expected: {
      path: input.expected.path,
      packagePartId: input.expected.packagePartId,
      ...(input.expected.orderKey ? { orderKey: input.expected.orderKey } : {}),
      requirement: input.expected.requirement,
      required: input.expected.required,
      ...(input.expected.requirementCondition
        ? { requirementCondition: input.expected.requirementCondition }
        : {}),
      ...(input.expected.requirementDependencies
        ? { requirementDependencies: input.expected.requirementDependencies }
        : {}),
      ...(input.expected.requirementReason
        ? { requirementReason: input.expected.requirementReason }
        : {}),
    },
    final,
    ...(build ? { build } : {}),
    ...(previousBuild ? { previousBuild } : {}),
    ...(input.bytes ? { bytes: input.bytes } : {}),
    ...(input.buildArtifact ? { buildArtifact: input.buildArtifact } : {}),
  };
}

export function assemblySummary(plan: readonly PptxAssemblyPlanEntry[]): RenderInspectionSummary {
  return {
    assembly: {
      entries: plan.map((entry) => ({
        path: entry.path,
        ...(entry.packagePartId ? { packagePartId: entry.packagePartId } : {}),
        ...(entry.orderKey ? { orderKey: entry.orderKey } : {}),
        status: entry.status,
        requirement: entry.requirement,
        required: entry.required,
        ...(entry.requirementCondition ? { requirementCondition: entry.requirementCondition } : {}),
        ...(entry.requirementDependencies
          ? { requirementDependencies: entry.requirementDependencies }
          : {}),
        ...(entry.requirementReason ? { requirementReason: entry.requirementReason } : {}),
        ...(entry.byteLength !== undefined ? { byteLength: entry.byteLength } : {}),
        ...(entry.reason ? { reason: entry.reason } : {}),
        ...(entry.reasonDetails ? { reasonDetails: entry.reasonDetails } : {}),
        ...(entry.message ? { message: entry.message } : {}),
        expected: entry.expected,
        final: entry.final,
        ...(entry.build ? { build: entry.build } : {}),
        ...(entry.previousBuild ? { previousBuild: entry.previousBuild } : {}),
      })),
      entryCount: plan.length,
      rebuiltCount: plan.filter((entry) => entry.status === "rebuilt").length,
      reusedCount: plan.filter((entry) => entry.status === "reused").length,
      missingCount: plan.filter((entry) => entry.status === "missing").length,
      failedCount: plan.filter((entry) => entry.status === "failed").length,
    },
  };
}

export function assemblyDiagnostics(plan: readonly PptxAssemblyPlanEntry[]): Diagnostics {
  const unavailableRequiredEntries = plan.filter(
    (entry) => (entry.status === "missing" || entry.status === "failed") && entry.required,
  );
  if (unavailableRequiredEntries.length === 0) {
    return createDiagnostics();
  }

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_RENDER_PACKAGE_ASSEMBLY_FAILED",
      title: "pptx package assembly has unavailable required entries",
      message:
        "Render could not assemble a complete PPTX package because one or more required package entries were missing or failed to build.",
      labels: unavailableRequiredEntries.map((entry) => ({
        path: entry.path,
        message: `${entry.requirement} package entry ${entry.status === "failed" ? "failed" : "is missing"}: ${entry.reason ?? (entry.status === "failed" ? "packageEntryFailed" : "missingRequiredEntry")}`,
        severity: "primary",
      })),
      notes: unavailableRequiredEntries.map((entry) =>
        [
          `path=${entry.path}`,
          entry.packagePartId ? `packagePartId=${entry.packagePartId}` : undefined,
          `status=${entry.status}`,
          `requirement=${entry.requirement}`,
          `required=${entry.required}`,
          entry.requirementCondition ? `condition=${entry.requirementCondition}` : undefined,
          entry.requirementDependencies?.length
            ? `dependencies=${entry.requirementDependencies.join(",")}`
            : undefined,
          entry.requirementReason ? `requirementReason=${entry.requirementReason}` : undefined,
          `reason=${entry.reason ?? (entry.status === "failed" ? "packageEntryFailed" : "missingRequiredEntry")}`,
          entry.message ? `message=${entry.message}` : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      ),
      help: [
        "Inspect render.summary.assembly.entries to see the evaluated package requirement, build status, and rebuild or missing reason for each ZIP entry.",
      ],
    }),
  ]);
}

export function zipEntriesFromAssemblyPlan(plan: readonly PptxAssemblyPlanEntry[]): PptxZipEntry[] {
  const entries: PptxZipEntry[] = [];
  for (const entry of plan) {
    if (entry.status === "missing" || entry.status === "failed" || !entry.bytes) {
      continue;
    }
    entries.push({
      path: entry.path,
      bytes: entry.bytes,
    });
  }
  return entries;
}

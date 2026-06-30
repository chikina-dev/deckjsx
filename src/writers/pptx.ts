import { createDiagnostics, diagnostic, type Diagnostics } from "../diagnostics";
import type {
  InspectionDetailLevel,
  OutputFormat,
  RenderInspectionSummary,
  RenderedArtifact,
} from "../pipeline/public";
import {
  PATCH_MANIFEST_PATH,
  PATCH_MANIFEST_VERSION,
  RENDER_PATCH_PLAN_KIND,
  patchManifestFromParts,
  type RenderPatchPlan,
  type RenderPatchPlanPart,
} from "../patchable-pptx";
import type { AssetArtifact, PptxPackageBuildArtifact } from "../pipeline/artifacts";
import type {
  PackagePartId,
  PptxMediaPartPayload,
  PptxPackageModel,
} from "../projection/pptx/model";
import { validatePptxPackageModel } from "../projection/pptx/validation";
import {
  assemblyDiagnostics,
  assemblyPlanEntry,
  assemblySummary,
  emptyAssemblySummary,
  expectedAssemblyEntryForPart,
  orderKeyValue,
  type PptxAssemblyPlanEntry,
  zipEntriesFromAssemblyPlan,
} from "./pptx/assembly";
import {
  buildArtifactForPart,
  buildArtifactReuseDecision,
  buildReasonFromReuseDecision,
  fingerprintBytes,
} from "./pptx/build";
import { emitPartBytes } from "./pptx/emit";
import {
  mediaBytes,
  mediaDiagnostics,
  mediaLoadFingerprint,
  mediaMetadataFingerprint,
  mediaPartArtifact,
  mediaPartPayload,
} from "./pptx/media";
import { createCollectingPptxZipSink } from "./pptx/sinks";
import { slideBytes } from "./pptx/slide-xml";
import { writePptxZipEntriesToSink } from "./pptx/zip";

export type PptxWriterOptions = {
  readonly inspection?: InspectionDetailLevel;
};

type PptxWriterResult = {
  readonly diagnostics: Diagnostics;
  readonly artifact?: RenderedArtifact<"pptx">;
  readonly patchPlan?: RenderPatchPlan;
  readonly summary?: RenderInspectionSummary;
};

export type PptxWriterContext = {
  readonly assetsById?: ReadonlyMap<
    NonNullable<PptxMediaPartPayload["assetEntityId"]>,
    AssetArtifact
  >;
  readonly pptxBuildArtifactsByPartId?: ReadonlyMap<PackagePartId, PptxPackageBuildArtifact>;
  readonly onBuildArtifacts?: (artifacts: readonly PptxPackageBuildArtifact[]) => void;
};

export type PptxMediaAssetLoadRequirement = {
  readonly assetEntityId: NonNullable<PptxMediaPartPayload["assetEntityId"]>;
  readonly packagePartPath: string;
  readonly source: PptxMediaPartPayload["source"];
  readonly sourceField: AssetArtifact["sourceField"];
};

const PATCH_MANIFEST_PART_ID = "deckjsx:patch-manifest";
const PATCH_RESERVE_MARKER = "deckjsx-patch-reserve:";
const PATCH_MANIFEST_RESERVE_MIN_BYTES = 16 * 1024;
const PATCH_RESERVE_MIN_BYTES = 16 * 1024;
const PATCH_RESERVE_SLIDE_MIN_BYTES = 64 * 1024;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

type PatchableXmlBytes = {
  readonly bytes: Uint8Array;
  readonly logicalByteLength: number;
  readonly reservedCapacity: number;
};

function isXmlPatchablePath(path: string): boolean {
  return path.endsWith(".xml") || path.endsWith(".rels");
}

function isXmlPatchablePart(part: PptxPackageModel["parts"][number]): boolean {
  return part.kind !== "media" && isXmlPatchablePath(part.path);
}

function reserveCapacityForPart(
  part: PptxPackageModel["parts"][number],
  logicalByteLength: number,
) {
  if (!isXmlPatchablePart(part)) {
    return 0;
  }

  return part.kind === "slide"
    ? Math.max(PATCH_RESERVE_SLIDE_MIN_BYTES, logicalByteLength * 3)
    : Math.max(PATCH_RESERVE_MIN_BYTES, logicalByteLength * 2);
}

function patchReserveComment(capacity: number): Uint8Array {
  return TEXT_ENCODER.encode(`\n<!--${PATCH_RESERVE_MARKER}${".".repeat(capacity)}-->`);
}

function stripPatchReserve(bytes: Uint8Array): PatchableXmlBytes {
  const text = TEXT_DECODER.decode(bytes);
  const markerIndex = text.lastIndexOf(`\n<!--${PATCH_RESERVE_MARKER}`);
  if (markerIndex < 0) {
    return {
      bytes,
      logicalByteLength: bytes.byteLength,
      reservedCapacity: 0,
    };
  }

  const reserveStart = markerIndex + `\n<!--${PATCH_RESERVE_MARKER}`.length;
  const reserveEnd = text.indexOf("-->", reserveStart);
  if (reserveEnd < 0) {
    return {
      bytes,
      logicalByteLength: bytes.byteLength,
      reservedCapacity: 0,
    };
  }

  const logicalText = text.slice(0, markerIndex);
  const reserveText = text.slice(reserveStart, reserveEnd);
  return {
    bytes: TEXT_ENCODER.encode(logicalText),
    logicalByteLength: TEXT_ENCODER.encode(logicalText).byteLength,
    reservedCapacity: TEXT_ENCODER.encode(reserveText).byteLength,
  };
}

function patchableBytesForPart(input: {
  readonly part: PptxPackageModel["parts"][number];
  readonly bytes: Uint8Array;
}): PatchableXmlBytes {
  if (!isXmlPatchablePart(input.part)) {
    return {
      bytes: input.bytes,
      logicalByteLength: input.bytes.byteLength,
      reservedCapacity: 0,
    };
  }

  const stripped = stripPatchReserve(input.bytes);
  const reservedCapacity = reserveCapacityForPart(input.part, stripped.logicalByteLength);
  const reserve = patchReserveComment(reservedCapacity);
  const bytes = new Uint8Array(stripped.bytes.byteLength + reserve.byteLength);
  bytes.set(stripped.bytes, 0);
  bytes.set(reserve, stripped.bytes.byteLength);
  return {
    bytes,
    logicalByteLength: stripped.logicalByteLength,
    reservedCapacity,
  };
}

function patchPlanPartForEntry(entry: PptxAssemblyPlanEntry): RenderPatchPlanPart | undefined {
  if (!entry.packagePartId || !entry.bytes || !entry.build?.partFingerprint) {
    return undefined;
  }

  const xml = isXmlPatchablePath(entry.path) ? stripPatchReserve(entry.bytes) : undefined;
  return {
    packagePartId: entry.packagePartId,
    path: entry.path,
    patchableKind: isXmlPatchablePath(entry.path) ? "xml" : "media",
    reservedCapacity: xml?.reservedCapacity ?? 0,
    logicalByteLength: xml?.logicalByteLength ?? entry.bytes.byteLength,
    storedByteLength: entry.bytes.byteLength,
    fingerprint:
      entry.path.endsWith(".xml") || entry.path.endsWith(".rels")
        ? xml
          ? (fingerprintBytes(xml.bytes) ?? entry.build.partFingerprint)
          : entry.build.partFingerprint
        : (entry.build.mediaByteFingerprint ?? entry.build.partFingerprint),
    ...(entry.status === "rebuilt" || entry.status === "reused"
      ? { buildStatus: entry.status }
      : {}),
    ...(entry.reason ? { buildReason: entry.reason } : {}),
  };
}

function renderPatchPlan(plan: readonly PptxAssemblyPlanEntry[]): RenderPatchPlan {
  const parts = plan.flatMap((entry) => {
    const part = patchPlanPartForEntry(entry);
    return part ? [part] : [];
  });
  const manifestLogicalBytes = patchManifestLogicalBytes(parts);
  const manifestStoredByteLength =
    manifestLogicalBytes.byteLength + PATCH_MANIFEST_RESERVE_MIN_BYTES;

  return {
    kind: RENDER_PATCH_PLAN_KIND,
    version: PATCH_MANIFEST_VERSION,
    manifestPath: PATCH_MANIFEST_PATH,
    parts: [
      ...parts,
      {
        packagePartId: PATCH_MANIFEST_PART_ID,
        path: PATCH_MANIFEST_PATH,
        patchableKind: "manifest",
        reservedCapacity: PATCH_MANIFEST_RESERVE_MIN_BYTES,
        logicalByteLength: manifestLogicalBytes.byteLength,
        storedByteLength: manifestStoredByteLength,
        fingerprint: fingerprintBytes(manifestLogicalBytes) ?? "fnv1a32:00000000",
        buildStatus: "rebuilt",
        buildReason: "missingArtifact",
      },
    ],
  };
}

function patchManifestLogicalBytes(parts: readonly RenderPatchPlanPart[]): Uint8Array {
  const manifest = patchManifestFromParts(parts);
  return TEXT_ENCODER.encode(`${JSON.stringify(manifest, null, 2)}\n`);
}

function patchManifestBytes(patchPlan: RenderPatchPlan): Uint8Array {
  const logical = patchManifestLogicalBytes(patchPlan.parts);
  const bytes = new Uint8Array(logical.byteLength + PATCH_MANIFEST_RESERVE_MIN_BYTES);
  bytes.set(logical, 0);
  bytes.fill(0x20, logical.byteLength);
  return bytes;
}

export function pptxMediaAssetLoadRequirements(input: {
  readonly projection: PptxPackageModel;
  readonly assetsById?: ReadonlyMap<
    NonNullable<PptxMediaPartPayload["assetEntityId"]>,
    AssetArtifact
  >;
  readonly buildArtifactsByPartId?: ReadonlyMap<PackagePartId, PptxPackageBuildArtifact>;
}): readonly PptxMediaAssetLoadRequirement[] {
  return input.projection.parts.flatMap((part) => {
    if (part.kind !== "media") {
      return [];
    }

    let payload: PptxMediaPartPayload;
    try {
      payload = mediaPartPayload(part);
    } catch {
      return [];
    }

    if (!payload.assetEntityId) {
      return [];
    }

    const projectedMediaFingerprint = mediaMetadataFingerprint(part);
    if (projectedMediaFingerprint) {
      const reuse = buildArtifactReuseDecision({
        part,
        mediaByteFingerprint: projectedMediaFingerprint,
        buildArtifactsByPartId: input.buildArtifactsByPartId,
      });
      if (reuse.artifact) {
        return [];
      }
    }

    return [
      {
        assetEntityId: payload.assetEntityId,
        packagePartPath: part.path,
        source: payload.source,
        sourceField: input.assetsById?.get(payload.assetEntityId)?.sourceField ?? "src",
      },
    ];
  });
}

function renderPackageValidationDiagnostics(validation: Diagnostics): Diagnostics {
  if (!validation.hasErrors) {
    return createDiagnostics();
  }

  return createDiagnostics([
    diagnostic({
      severity: "error",
      code: "E_RENDER_PACKAGE_VALIDATION_FAILED",
      title: "pptx package model cannot be rendered",
      message:
        "Render could not start PPTX package assembly because the projected package model failed pre-render consistency validation.",
      labels: validation.items.flatMap((item) =>
        item.labels.map((label) => ({
          ...label,
          severity: label.severity ?? "primary",
        })),
      ),
      notes: validation.items.map((item) =>
        [
          `code=${item.code}`,
          `title=${item.title}`,
          item.message ? `message=${item.message}` : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      ),
      help: [
        "Inspect the Pptx Package Model through deckjsx/inspect or fix the defined projection before calling render.",
      ],
    }),
  ]);
}

export async function renderPptxPackage(
  projection: PptxPackageModel,
  options: PptxWriterOptions = {},
  context?: PptxWriterContext,
): Promise<PptxWriterResult> {
  const validationDiagnostics = renderPackageValidationDiagnostics(
    validatePptxPackageModel(projection),
  );
  if (validationDiagnostics.hasErrors) {
    return { diagnostics: validationDiagnostics, summary: emptyAssemblySummary() };
  }

  const diagnostics: Diagnostics[] = [];
  const plan: PptxAssemblyPlanEntry[] = [];
  const buildArtifacts: PptxPackageBuildArtifact[] = [];
  const orderedParts = [...projection.parts].sort((a, b) =>
    orderKeyValue(a).localeCompare(orderKeyValue(b)),
  );

  for (const part of orderedParts) {
    let partBytes: Uint8Array | undefined;
    let mediaByteFingerprint: string | undefined;
    let mediaByteFingerprintSource:
      | "byteHash"
      | "loadedAssetHash"
      | "projectedMetadataHash"
      | undefined;
    const expected = expectedAssemblyEntryForPart(part);
    const projectedMediaFingerprint =
      part.kind === "media" ? mediaMetadataFingerprint(part) : undefined;
    const reusable =
      part.kind === "media" && !projectedMediaFingerprint
        ? undefined
        : buildArtifactReuseDecision({
            part,
            ...(projectedMediaFingerprint
              ? { mediaByteFingerprint: projectedMediaFingerprint }
              : {}),
            buildArtifactsByPartId: context?.pptxBuildArtifactsByPartId,
          });

    if (reusable?.artifact) {
      plan.push(
        assemblyPlanEntry({
          expected,
          final: {
            status: "reused",
            byteLength: reusable.artifact.bytes.byteLength,
            reason: reusable.reason,
          },
          bytes: reusable.artifact.bytes,
          buildArtifact: reusable.artifact,
        }),
      );
      continue;
    }

    try {
      if (part.kind === "media") {
        const mediaDiagnostic = mediaDiagnostics(part, context);
        if (mediaDiagnostic) {
          if (expected.required) {
            diagnostics.push(mediaDiagnostic);
          }
          plan.push(
            assemblyPlanEntry({
              expected,
              final: { status: "missing", reason: "mediaBytesMissing" },
            }),
          );
          continue;
        }

        const source = mediaPartPayload(part).source;
        const mediaArtifact = mediaPartArtifact(part, context);
        partBytes = mediaBytes(source, mediaArtifact);
        const loadedMediaFingerprint = mediaLoadFingerprint(mediaArtifact);
        mediaByteFingerprint =
          projectedMediaFingerprint ?? loadedMediaFingerprint ?? fingerprintBytes(partBytes);
        mediaByteFingerprintSource = projectedMediaFingerprint
          ? "projectedMetadataHash"
          : loadedMediaFingerprint
            ? "loadedAssetHash"
            : mediaByteFingerprint
              ? "byteHash"
              : undefined;
      } else {
        partBytes = emitPartBytes(part, projection, { slideBytes });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      plan.push(
        assemblyPlanEntry({
          expected,
          final: {
            status: "failed",
            reason: part.kind === "media" ? "mediaEmitterFailed" : "partEmitterFailed",
            message,
          },
        }),
      );
      continue;
    }

    if (!partBytes) {
      plan.push(
        assemblyPlanEntry({
          expected,
          final: {
            status: "missing",
            reason: part.requirement?.reason ?? "partEmitterReturnedNoBytes",
          },
        }),
      );
      continue;
    }

    const patchableBytes = patchableBytesForPart({ part, bytes: partBytes });
    const reuse = buildArtifactReuseDecision({
      part,
      mediaByteFingerprint,
      buildArtifactsByPartId: context?.pptxBuildArtifactsByPartId,
    });
    const buildArtifact =
      reuse.artifact ??
      buildArtifactForPart({
        part,
        bytes: patchableBytes.bytes,
        reason: buildReasonFromReuseDecision(reusable ?? reuse),
        mediaByteFingerprint,
        mediaByteFingerprintSource,
      });
    if (!reuse.artifact) {
      buildArtifacts.push(buildArtifact);
    }

    plan.push(
      assemblyPlanEntry({
        expected,
        final: {
          status: reuse.artifact ? "reused" : "rebuilt",
          byteLength: buildArtifact.bytes.byteLength,
          reason: reuse.reason,
        },
        bytes: buildArtifact.bytes,
        buildArtifact,
        ...(!reuse.artifact && (reusable ?? reuse).previousArtifact
          ? { previousBuildArtifact: (reusable ?? reuse).previousArtifact }
          : {}),
      }),
    );
  }

  const combinedDiagnostics = createDiagnostics(
    diagnostics.flatMap((item) => item.items).concat(assemblyDiagnostics(plan).items),
  );
  context?.onBuildArtifacts?.(buildArtifacts);
  if (combinedDiagnostics.hasErrors) {
    return { diagnostics: combinedDiagnostics, summary: assemblySummary(plan) };
  }

  const sink = createCollectingPptxZipSink();
  const patchPlan = renderPatchPlan(plan);
  const patchManifestEntry = {
    path: PATCH_MANIFEST_PATH,
    bytes: patchManifestBytes(patchPlan),
  };

  try {
    writePptxZipEntriesToSink([...zipEntriesFromAssemblyPlan(plan), patchManifestEntry], sink);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      diagnostics: createDiagnostics([
        diagnostic({
          severity: "error",
          code: "E_RENDER_PACKAGE_ASSEMBLY_FAILED",
          title: "pptx zip assembly failed",
          message: "Render could not assemble the final PPTX ZIP from the current Assembly Plan.",
          labels: [{ path: "render.assembly.zip", message }],
          notes: ["reason=zipSourceFailed"],
          help: [
            "Inspect render.summary.assembly.entries to confirm every required package entry was available before ZIP emission.",
          ],
        }),
      ]),
      summary: assemblySummary(plan),
    };
  }

  const bytes = sink.bytes();

  return {
    diagnostics: combinedDiagnostics,
    patchPlan,
    summary: assemblySummary(plan),
    artifact: {
      format: "pptx" satisfies OutputFormat,
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: "pptx",
      bytes,
    },
  };
}

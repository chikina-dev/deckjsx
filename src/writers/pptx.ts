import { createDiagnostics, diagnostic, type Diagnostics } from "../diagnostics";
import type {
  InspectionDetailLevel,
  OutputFormat,
  RenderInspectionSummary,
  RenderedArtifact,
} from "../pipeline";
import type { AssetArtifact, PptxPackageBuildArtifact } from "../pipeline-artifacts";
import type { PptxCompressionMode } from "../pptx-options";
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
import {
  createCollectingPptxZipSink,
  createCollectingPptxZipSinkWithSideEffect,
  type PptxZipSink,
} from "./pptx/sinks";
import { slideBytes } from "./pptx/slide-xml";
import { writePptxZipEntriesToSink } from "./pptx/zip";

export type PptxWriterOptions = {
  readonly compression?: PptxCompressionMode;
  readonly inspection?: InspectionDetailLevel;
};

type PptxWriterResult = {
  readonly diagnostics: Diagnostics;
  readonly artifact?: RenderedArtifact<"pptx">;
  readonly summary?: RenderInspectionSummary;
  readonly outputSideEffect?: {
    readonly path: string;
    readonly failure?: {
      readonly message: string;
    };
  };
};

export type PptxWriterContext = {
  readonly assetsById?: ReadonlyMap<
    NonNullable<PptxMediaPartPayload["assetEntityId"]>,
    AssetArtifact
  >;
  readonly pptxBuildArtifactsByPartId?: ReadonlyMap<PackagePartId, PptxPackageBuildArtifact>;
  readonly onBuildArtifacts?: (artifacts: readonly PptxPackageBuildArtifact[]) => void;
  readonly outputSink?: {
    readonly path: string;
    readonly sink: PptxZipSink;
  };
};

export type PptxMediaAssetLoadRequirement = {
  readonly assetEntityId: NonNullable<PptxMediaPartPayload["assetEntityId"]>;
  readonly packagePartPath: string;
  readonly source: PptxMediaPartPayload["source"];
};

export function pptxMediaAssetLoadRequirements(input: {
  readonly projection: PptxPackageModel;
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

    const reuse = buildArtifactReuseDecision({
      part,
      mediaByteFingerprint,
      buildArtifactsByPartId: context?.pptxBuildArtifactsByPartId,
    });
    const buildArtifact =
      reuse.artifact ??
      buildArtifactForPart({
        part,
        bytes: partBytes,
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

  const sideEffectSink = context?.outputSink
    ? createCollectingPptxZipSinkWithSideEffect(context.outputSink.sink)
    : undefined;
  const sink = sideEffectSink ?? createCollectingPptxZipSink();
  let outputSideEffectError: unknown;

  try {
    writePptxZipEntriesToSink(zipEntriesFromAssemblyPlan(plan), sink, {
      compression: options.compression,
    });
    outputSideEffectError = sideEffectSink?.sideEffectError();
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
          notes: [`reason=zipSourceFailed compression=${options.compression ?? "fast"}`],
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
    summary: assemblySummary(plan),
    ...(context?.outputSink
      ? {
          outputSideEffect: {
            path: context.outputSink.path,
            ...(outputSideEffectError
              ? { failure: { message: errorMessage(outputSideEffectError) } }
              : {}),
          },
        }
      : {}),
    artifact: {
      format: "pptx" satisfies OutputFormat,
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: "pptx",
      bytes,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

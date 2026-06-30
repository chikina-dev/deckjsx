import { createDiagnostics } from "@/src/diagnostics";
import type { PptxPackageBuildArtifact, PptxPackageBuildReason } from "@/src/pipeline/artifacts";
import type { PackagePartId, PptxPackagePart } from "@/src/projection/pptx/model";
import { packagePartOrderKey } from "./package-part";

const PPTX_WRITER_FINGERPRINT = "deckjsx:pptx-writer:0.8-bootstrap";

const PPTX_EMITTER_FINGERPRINTS: Record<PptxPackagePart["kind"], string> = {
  "content-types": "deckjsx:pptx-emitter:content-types:0.8-bootstrap",
  "document-properties": "deckjsx:pptx-emitter:document-properties:0.8-bootstrap",
  media: "deckjsx:pptx-emitter:media-copy:0.8-bootstrap",
  "notes-master": "deckjsx:pptx-emitter:notes-master:0.8-bootstrap",
  "notes-slide": "deckjsx:pptx-emitter:notes-slide:0.8-bootstrap",
  presentation: "deckjsx:pptx-emitter:presentation:0.8-bootstrap",
  "presentation-properties": "deckjsx:pptx-emitter:presentation-properties:0.8-bootstrap",
  relationships: "deckjsx:pptx-emitter:relationships:0.8-bootstrap",
  slide: "deckjsx:pptx-emitter:slide:0.8-generated-strokes",
  "slide-layout": "deckjsx:pptx-emitter:slide-layout:0.8-chunk-skeleton",
  "slide-master": "deckjsx:pptx-emitter:slide-master:0.8-chunk-skeleton",
  "table-styles": "deckjsx:pptx-emitter:table-styles:0.8-bootstrap",
  theme: "deckjsx:pptx-emitter:theme:0.8-bootstrap",
  "view-properties": "deckjsx:pptx-emitter:view-properties:0.8-bootstrap",
};

const PPTX_DOCUMENT_PROPERTY_EMITTER_FINGERPRINTS = {
  app: "deckjsx:pptx-emitter:docprops-app:0.8-bootstrap",
  core: "deckjsx:pptx-emitter:docprops-core:0.8-bootstrap",
} as const;

const PPTX_RELATIONSHIP_EMITTER_FINGERPRINTS = {
  generic: "deckjsx:pptx-emitter:relationships-generic:0.8-target-base",
  presentation: "deckjsx:pptx-emitter:relationships-presentation:0.8-target-base",
  root: "deckjsx:pptx-emitter:relationships-root:0.8-target-base",
  slide: "deckjsx:pptx-emitter:relationships-slide:0.8-target-base",
  slideLayout: "deckjsx:pptx-emitter:relationships-slide-layout:0.8-target-base",
  slideMaster: "deckjsx:pptx-emitter:relationships-slide-master:0.8-target-base",
} as const;

type BuildArtifactReuseDecision = {
  readonly artifact?: PptxPackageBuildArtifact;
  readonly previousArtifact?: PptxPackageBuildArtifact;
  readonly reason: "buildArtifactFingerprintMatched" | PptxPackageBuildReason;
};

export function fingerprintBytes(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes) {
    return undefined;
  }

  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function emitterFingerprintForPart(part: PptxPackagePart): string {
  if (part.kind === "relationships") {
    if (part.path === "_rels/.rels") {
      return PPTX_RELATIONSHIP_EMITTER_FINGERPRINTS.root;
    }
    if (part.path === "ppt/_rels/presentation.xml.rels") {
      return PPTX_RELATIONSHIP_EMITTER_FINGERPRINTS.presentation;
    }
    if (part.path.startsWith("ppt/slides/_rels/")) {
      return PPTX_RELATIONSHIP_EMITTER_FINGERPRINTS.slide;
    }
    if (part.path.startsWith("ppt/slideLayouts/_rels/")) {
      return PPTX_RELATIONSHIP_EMITTER_FINGERPRINTS.slideLayout;
    }
    if (part.path.startsWith("ppt/slideMasters/_rels/")) {
      return PPTX_RELATIONSHIP_EMITTER_FINGERPRINTS.slideMaster;
    }
    return PPTX_RELATIONSHIP_EMITTER_FINGERPRINTS.generic;
  }

  if (part.kind === "document-properties") {
    return part.path.endsWith("/app.xml")
      ? PPTX_DOCUMENT_PROPERTY_EMITTER_FINGERPRINTS.app
      : PPTX_DOCUMENT_PROPERTY_EMITTER_FINGERPRINTS.core;
  }

  return PPTX_EMITTER_FINGERPRINTS[part.kind];
}

function stableJson(value: unknown): string {
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

function partFingerprint(part: PptxPackagePart): string {
  if (part.fingerprint) {
    return part.fingerprint;
  }

  throw new Error(`Package part ${part.id} must carry a projected package part fingerprint.`);
}

export function buildArtifactReuseDecision(input: {
  part: PptxPackagePart;
  mediaByteFingerprint?: string;
  buildArtifactsByPartId?: ReadonlyMap<PackagePartId, PptxPackageBuildArtifact>;
}): BuildArtifactReuseDecision {
  const artifact = input.buildArtifactsByPartId?.get(input.part.id);
  const mediaByteFingerprint = input.part.kind === "media" ? input.mediaByteFingerprint : undefined;

  if (!artifact) {
    return { reason: "missingArtifact" };
  }

  if (artifact.packagePartId !== input.part.id) {
    return { previousArtifact: artifact, reason: "packagePartIdChanged" };
  }

  if (artifact.path !== input.part.path) {
    return { previousArtifact: artifact, reason: "pathChanged" };
  }

  if (artifact.orderKey !== packagePartOrderKey(input.part)) {
    return { previousArtifact: artifact, reason: "orderKeyChanged" };
  }

  if (artifact.partFingerprint !== partFingerprint(input.part)) {
    return { previousArtifact: artifact, reason: "partFingerprintChanged" };
  }

  if (
    stableJson(artifact.dependencyFingerprints ?? []) !==
    stableJson(input.part.dependencyFingerprints ?? [])
  ) {
    return { previousArtifact: artifact, reason: "dependencyFingerprintChanged" };
  }

  if (artifact.writerFingerprint !== PPTX_WRITER_FINGERPRINT) {
    return { previousArtifact: artifact, reason: "writerFingerprintChanged" };
  }

  if (artifact.emitterFingerprint !== emitterFingerprintForPart(input.part)) {
    return { previousArtifact: artifact, reason: "emitterFingerprintChanged" };
  }

  if (artifact.mediaByteFingerprint !== mediaByteFingerprint) {
    return { previousArtifact: artifact, reason: "mediaBytesChanged" };
  }

  return { artifact, reason: "buildArtifactFingerprintMatched" };
}

export function buildReasonFromReuseDecision(
  decision: BuildArtifactReuseDecision,
): PptxPackageBuildReason {
  if (decision.reason === "buildArtifactFingerprintMatched") {
    throw new Error("matched build artifacts should be reused instead of rebuilt");
  }
  return decision.reason;
}

export function buildArtifactForPart(input: {
  part: PptxPackagePart;
  bytes: Uint8Array;
  reason: PptxPackageBuildReason;
  mediaByteFingerprint?: string;
  mediaByteFingerprintSource?: "byteHash" | "loadedAssetHash" | "projectedMetadataHash";
}): PptxPackageBuildArtifact {
  const diagnostics = createDiagnostics();
  const partFingerprintValue = partFingerprint(input.part);
  const writerFingerprint = PPTX_WRITER_FINGERPRINT;
  const emitterFingerprint = emitterFingerprintForPart(input.part);
  return {
    packagePartId: input.part.id,
    path: input.part.path,
    orderKey: packagePartOrderKey(input.part),
    bytes: input.bytes,
    partFingerprint: partFingerprintValue,
    ...(input.part.dependencyFingerprints
      ? { dependencyFingerprints: input.part.dependencyFingerprints }
      : {}),
    writerFingerprint,
    emitterFingerprint,
    ...(input.mediaByteFingerprint ? { mediaByteFingerprint: input.mediaByteFingerprint } : {}),
    ...(input.mediaByteFingerprintSource
      ? { mediaByteFingerprintSource: input.mediaByteFingerprintSource }
      : {}),
    buildNotes: [
      {
        kind: "packagePartBytesBuilt",
        reason: input.reason,
        partKind: input.part.kind,
        byteLength: input.bytes.byteLength,
        partFingerprint: partFingerprintValue,
        writerFingerprint,
        emitterFingerprint,
        dependencyFingerprintCount: input.part.dependencyFingerprints?.length ?? 0,
        ...(input.mediaByteFingerprint ? { mediaByteFingerprint: input.mediaByteFingerprint } : {}),
        ...(input.mediaByteFingerprintSource
          ? { mediaByteFingerprintSource: input.mediaByteFingerprintSource }
          : {}),
        diagnosticCodes: diagnostics.items.map((item) => item.code),
      },
    ],
    diagnostics,
  };
}

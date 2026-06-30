import type * as I from "deckjsx/inspect";

declare const projectSummary: I.ProjectInspectionSummary;

projectSummary.pptx.packageParts satisfies readonly I.ProjectInspectionPartSummary[];
projectSummary.pptx.relationshipCount satisfies number;
projectSummary.pptx.packageDependencyCount satisfies number;
projectSummary.relationships satisfies readonly I.ProjectInspectionRelationshipSummary[];
projectSummary.relationships[0]?.ownerPartId satisfies I.PackagePartId | undefined;
projectSummary.relationships[0]?.ownerPath satisfies string | undefined;
projectSummary.relationships[0]?.target satisfies string | undefined;
projectSummary.relationships[0]?.targetPath satisfies string | undefined;
projectSummary.relationships[0]?.targetPartId satisfies I.PackagePartId | undefined;
projectSummary.relationships[0]?.targetMode satisfies "external" | undefined;
projectSummary.packageDependencies satisfies readonly I.ProjectInspectionPackageDependencySummary[];
projectSummary.packageDependencies[0]?.ownerPartId satisfies I.PackagePartId | undefined;
projectSummary.packageDependencies[0]?.ownerPath satisfies string | undefined;
projectSummary.packageDependencies[0]?.targetPartId satisfies I.PackagePartId | undefined;
projectSummary.packageDependencies[0]?.targetPath satisfies string | undefined;
projectSummary.packageDependencies[0]?.reason satisfies
  | I.ProjectInspectionPackageDependencyReason
  | undefined;
projectSummary.packageDependencies[0]?.relationshipId satisfies
  | I.PptxSerializedIdentity
  | undefined;
projectSummary.packageDependencies[0]?.relationshipType satisfies string | undefined;
projectSummary.packageDependencies[0]?.contentType satisfies string | undefined;
projectSummary.packageDependencies[0]?.fingerprint satisfies string | undefined;
projectSummary.packageDependencies[0]?.requirementStatus satisfies
  | I.PptxPackagePartRequirement["status"]
  | undefined;
projectSummary.packageDependencies[0]?.requirementCondition satisfies
  | NonNullable<I.PptxPackagePartRequirement["condition"]>
  | undefined;
// @ts-expect-error package dependency summaries expose projected dependency facts, not bytes.
void projectSummary.packageDependencies[0]?.bytes;
// @ts-expect-error package dependency summaries do not expose writer build artifacts.
void projectSummary.packageDependencies[0]?.buildArtifact;
projectSummary.parts[0]?.hasStructuredPayload satisfies boolean | undefined;
projectSummary.parts[0]?.payloadKind satisfies string | undefined;
projectSummary.parts[0]?.requirement satisfies I.PptxPackagePartRequirement | undefined;
projectSummary.parts[0]?.orderKey satisfies I.PptxPackagePartOrderKey | undefined;
projectSummary.parts[0]?.fingerprint satisfies string | undefined;
projectSummary.parts[0]?.dependencyFingerprintCount satisfies number | undefined;
projectSummary.media[0]?.partPath satisfies string | undefined;
projectSummary.media[0]?.metadata satisfies I.PptxMediaMetadata | undefined;
// @ts-expect-error media inspection summaries expose metadata, not loaded bytes.
void projectSummary.media[0]?.bytes;
// @ts-expect-error media inspection summaries do not expose authored/resolved source payloads.
void projectSummary.media[0]?.source;
projectSummary.filtered satisfies readonly I.ProjectInspectionFilteredRecord[];
projectSummary.unsupportedSemantics satisfies readonly I.ProjectInspectionUnsupportedSemanticRecord[];
projectSummary.details satisfies I.ProjectInspectionDetails | undefined;
projectSummary.details?.composedPaintOrder satisfies
  | readonly I.ProjectInspectionComposedPaintOrderSlideView[]
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0] satisfies
  | I.ProjectInspectionComposedPaintOrderEntry
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.source satisfies
  | "backgroundLayer"
  | "drawingNode"
  | "generatedStroke"
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.order satisfies number | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.siblingPath satisfies
  | readonly number[]
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.generatedStroke satisfies
  | I.PptxGeneratedStrokeLayer
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.generatedLayerIndex satisfies
  | number
  | undefined;
projectSummary.details?.composedPaintOrder[0]?.entries[0]?.backgroundLayerIndex satisfies
  | number
  | undefined;
projectSummary.details?.effectiveProjectedStyles satisfies
  | readonly I.ProjectInspectionEffectiveProjectedStyleSlideView[]
  | undefined;
projectSummary.details?.effectiveProjectedStyles[0]?.entries[0] satisfies
  | I.ProjectInspectionEffectiveProjectedStyleEntry
  | undefined;
projectSummary.details?.effectiveProjectedStyles[0]?.entries[0]?.values satisfies
  | I.ProjectInspectionResolvedValues
  | undefined;
projectSummary.details?.effectiveProjectedStyles[0]?.entries[0]?.values.textStyle satisfies
  | NonNullable<I.ProjectInspectionResolvedValues["textStyle"]>
  | undefined;
projectSummary.details?.packageDependencyInvalidation satisfies
  | I.ProjectInspectionPackageDependencyInvalidationView
  | undefined;
projectSummary.details?.packageDependencyInvalidation.entries[0] satisfies
  | I.ProjectInspectionPackageDependencyInvalidationEntry
  | undefined;
projectSummary.details?.packageDependencyInvalidation.entries[0]?.dependencies satisfies
  | readonly I.ProjectInspectionPackageDependencySummary[]
  | undefined;
projectSummary.details?.packageDependencyInvalidation.entries[0]?.dependents satisfies
  | readonly I.ProjectInspectionPackageDependencySummary[]
  | undefined;
projectSummary.details?.packageDependencyInvalidation.entries[0]?.dependencyReasons satisfies
  | readonly I.ProjectInspectionPackageDependencyReason[]
  | undefined;
projectSummary.details?.packageDependencyInvalidation.entries[0]?.dependentReasons satisfies
  | readonly I.ProjectInspectionPackageDependencyReason[]
  | undefined;
projectSummary.details?.paintFallbackAggregation satisfies
  | I.ProjectInspectionPaintFallbackAggregationView
  | undefined;
projectSummary.details?.paintFallbackAggregation.entries[0] satisfies
  | I.ProjectInspectionPaintFallbackAggregationEntry
  | undefined;
projectSummary.details?.paintFallbackAggregation.entries[0]?.feature satisfies
  | I.PptxUnsupportedSemanticFeature
  | undefined;
projectSummary.details?.paintFallbackAggregation.entries[0]?.fallbackStrategy satisfies
  | I.PptxUnsupportedFallbackStrategy
  | undefined;
projectSummary.details?.paintFallbackAggregation.entries[0]?.count satisfies number | undefined;
projectSummary.details?.paintFallbackAggregation.entries[0]?.recordIndexes satisfies
  | readonly number[]
  | undefined;
projectSummary.details?.themeProjections satisfies
  | I.ProjectInspectionThemeProjectionView
  | undefined;
projectSummary.details?.themeProjections.entries[0] satisfies
  | I.ProjectInspectionThemeProjectionEntry
  | undefined;
projectSummary.details?.themeProjections.entries[0]?.valueGroupFingerprints[0] satisfies
  | I.PptxThemeValueGroupFingerprint
  | undefined;
projectSummary.details?.themeProjections.entries[0]?.defaultStyleDecisions[0] satisfies
  | I.PptxThemeDefaultStyleDecision
  | undefined;
projectSummary.details?.themeProjections.entries[0]?.referenceSerialization[0] satisfies
  | I.PptxThemeReferenceSerializationChoice
  | undefined;
// @ts-expect-error detailed composed paint order entries are byte-free inspection records.
void projectSummary.details?.composedPaintOrder[0]?.entries[0]?.bytes;
// @ts-expect-error detailed composed paint order entries do not expose writer build artifacts.
void projectSummary.details?.composedPaintOrder[0]?.entries[0]?.buildArtifact;
// @ts-expect-error effective projected style entries are derived inspection records, not media stores.
void projectSummary.details?.effectiveProjectedStyles[0]?.entries[0]?.bytes;
// @ts-expect-error effective projected style entries do not expose writer build artifacts.
void projectSummary.details?.effectiveProjectedStyles[0]?.entries[0]?.buildArtifact;
// @ts-expect-error package dependency invalidation entries are byte-free inspection records.
void projectSummary.details?.packageDependencyInvalidation.entries[0]?.bytes;
// @ts-expect-error package dependency invalidation entries do not expose writer build artifacts.
void projectSummary.details?.packageDependencyInvalidation.entries[0]?.buildArtifact;
// @ts-expect-error paint fallback aggregation entries are byte-free inspection records.
void projectSummary.details?.paintFallbackAggregation.entries[0]?.bytes;
// @ts-expect-error paint fallback aggregation entries do not expose writer build artifacts.
void projectSummary.details?.paintFallbackAggregation.entries[0]?.buildArtifact;
// @ts-expect-error theme projection detail entries are byte-free inspection records.
void projectSummary.details?.themeProjections.entries[0]?.bytes;
// @ts-expect-error theme projection detail entries do not expose writer build artifacts.
void projectSummary.details?.themeProjections.entries[0]?.buildArtifact;
projectSummary.slides[0]?.backgroundLayers satisfies
  | readonly I.ProjectInspectionBackgroundLayerSummary[]
  | undefined;
projectSummary.slides[0]?.elements[0]?.emissionTarget satisfies I.PptxEmissionTarget | undefined;
projectSummary.slides[0]?.elements[0]?.paintOrderIndex satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.paintOrder satisfies I.PptxPaintOrderInput | undefined;
projectSummary.slides[0]?.elements[0]?.zIndex satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.opacity satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.rotation satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.flipH satisfies boolean | undefined;
projectSummary.slides[0]?.elements[0]?.flipV satisfies boolean | undefined;
projectSummary.slides[0]?.elements[0]?.visibility satisfies I.PptxVisibility | undefined;
projectSummary.slides[0]?.elements[0]?.measurement satisfies I.PptxMeasurement | undefined;
projectSummary.slides[0]?.elements[0]?.clip satisfies I.PptxClip | undefined;
projectSummary.slides[0]?.elements[0]?.backgroundLayers satisfies
  | readonly I.ProjectInspectionBackgroundLayerSummary[]
  | undefined;
projectSummary.slides[0]?.elements[0]?.edgeStrokes satisfies
  | I.PptxTextElement["edgeStrokes"]
  | undefined;
projectSummary.slides[0]?.elements[0]?.outline satisfies I.PptxTextElement["outline"] | undefined;
projectSummary.slides[0]?.elements[0]?.generatedStrokes satisfies
  | readonly I.PptxGeneratedStrokeLayer[]
  | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.opacity satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.rotation satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.flipH satisfies boolean | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.flipV satisfies boolean | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.zIndex satisfies number | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.measurement satisfies
  | I.PptxMeasurement
  | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.clip satisfies I.PptxClip | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.backgroundLayers satisfies
  | readonly I.ProjectInspectionBackgroundLayerSummary[]
  | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.edgeStrokes satisfies
  | I.PptxTextElement["edgeStrokes"]
  | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.outline satisfies
  | I.PptxTextElement["outline"]
  | undefined;
projectSummary.slides[0]?.elements[0]?.resolvedValues?.generatedStrokes satisfies
  | readonly I.PptxGeneratedStrokeLayer[]
  | undefined;
projectSummary.slides[0]?.elements[0]?.layoutAnchor satisfies I.PptxLayoutAnchor | undefined;

declare const filteredRecord: I.ProjectInspectionFilteredRecord;
filteredRecord.reason satisfies I.ProjectInspectionFilteredReason;
filteredRecord.reason satisfies "displayNone";
filteredRecord.graphNodeId satisfies I.GraphNodeId;
filteredRecord.slidePartId satisfies I.PackagePartId | undefined;
filteredRecord.textPreview satisfies string | undefined;

declare const unsupportedSemanticRecord: I.ProjectInspectionUnsupportedSemanticRecord;
unsupportedSemanticRecord.elementId satisfies string;
unsupportedSemanticRecord.slidePartId satisfies I.PackagePartId;
unsupportedSemanticRecord.feature satisfies I.PptxUnsupportedSemanticFeature;
unsupportedSemanticRecord.paintOrder satisfies I.PptxPaintOrderInput | undefined;

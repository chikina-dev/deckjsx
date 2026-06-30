import { isPptxPackageModel, isPptxPackagePart } from "deckjsx/inspect";
import type * as I from "deckjsx/inspect";

declare const defaultThemePartId: I.PackagePartId;
declare const defaultSlideMasterPartId: I.PackagePartId;
declare const defaultSlideLayoutPartId: I.PackagePartId;
declare const oneSlidePartId: I.PackagePartId;
declare const graphTextId: I.GraphNodeId;
declare const supportPart: I.PptxSupportPart;
declare const packagePartCandidate: I.PptxPackagePartCandidate;

const themePayload = {
  kind: "theme",
  name: "deckjsx",
  editable: true,
  projection: {
    id: "pptx:theme-projection:default",
    purpose: "default",
    source: "deckjsx-default",
    trace: {
      supportMappings: [
        {
          source: "deckjsx-default",
          projectedAs: "themeSupport",
          groups: ["colorScheme", "fontScheme", "formatScheme"],
        },
      ],
      wholeThemeMappings: [
        {
          source: "deckjsx-default",
          projectedAs: "themePart",
          purpose: "default",
          themePartId: defaultThemePartId,
          groups: ["colorScheme", "fontScheme", "formatScheme", "themeDefaults"],
          fingerprint: "fnv1a32:22222222",
        },
      ],
      valueGroupFingerprints: [
        {
          group: "themeDefaults",
          source: "themeDefault",
          projectedAs: "themeProjectionTrace",
          fingerprint: "fnv1a32:33333333",
          itemCount: 1,
        },
      ],
      defaultStyleDecisions: [
        {
          source: "themeDefault",
          graphNodeId: graphTextId,
          authoredTag: "p",
          defaultKey: "p",
          property: "zIndex",
          resolvedValue: 10,
          decision: "projectDrawingMetadata",
          projectedAs: "drawingMetadata",
          reason: "z-index is drawing metadata",
        },
      ],
      concreteDrawingProperties: [
        {
          graphNodeId: graphTextId,
          authoredTag: "p",
          defaultKey: "p",
          property: "color",
          projectedAs: "concreteDrawingProperty",
          resolvedValue: "#111111",
        },
      ],
      unprojected: [
        {
          source: "themeDefault",
          graphNodeId: graphTextId,
          authoredTag: "p",
          defaultKey: "p",
          property: "filter",
          projectedAs: "unprojected",
          resolvedValue: "blur(2px)",
          reason: "filter fallback is not a theme projection",
        },
      ],
      effectiveInheritance: [
        {
          source: "themeDefault",
          graphNodeId: graphTextId,
          authoredTag: "p",
          defaultKey: "p",
          property: "color",
          projectedAs: "concreteDrawingProperty",
          resolvedValue: "#111111",
          themePartId: defaultThemePartId,
          slideMasterPartId: defaultSlideMasterPartId,
          slideLayoutPartId: defaultSlideLayoutPartId,
          slidePartId: oneSlidePartId,
          inheritedThrough: ["themePart", "slideMaster", "slideLayout", "slide", "drawing"],
          reason: "Theme Default won resolved style resolution.",
        },
      ],
      referenceSerialization: [
        {
          source: "themeDefault",
          graphNodeId: graphTextId,
          authoredTag: "p",
          defaultKey: "p",
          property: "color",
          resolvedValue: "#2563EB",
          currentSerialization: "srgbClr",
          decision: "deferThemeReferenceSerialization",
          candidate: { kind: "schemeColor", value: "accent1", themePartId: defaultThemePartId },
          reason: "concrete color output with theme candidate",
        },
      ],
    },
  },
  colorScheme: { name: "deckjsx", colors: { accent1: "2563EB" } },
  fontScheme: { name: "deckjsx", majorLatin: "Aptos Display", minorLatin: "Aptos" },
  formatScheme: { name: "deckjsx" },
} satisfies I.PptxThemePartPayload;
themePayload.projection.trace.wholeThemeMappings[0] satisfies
  | I.PptxThemeWholeThemeMapping
  | undefined;
themePayload.projection.trace.valueGroupFingerprints[0] satisfies
  | I.PptxThemeValueGroupFingerprint
  | undefined;
themePayload.projection.trace.valueGroupFingerprints[0]?.group satisfies
  | I.PptxThemeValueGroup
  | undefined;
themePayload.projection.trace.defaultStyleDecisions[0] satisfies
  | I.PptxThemeDefaultStyleDecision
  | undefined;
themePayload.projection.trace.defaultStyleDecisions[0]?.decision satisfies
  | I.PptxThemeDefaultStyleDecisionKind
  | undefined;
themePayload.projection.trace.defaultStyleDecisions[0]?.projectedAs satisfies
  | I.PptxThemeDefaultStyleProjectionTarget
  | undefined;
themePayload.projection.trace.effectiveInheritance[0] satisfies
  | I.PptxThemeEffectiveInheritanceTrace
  | undefined;
themePayload.projection.trace.effectiveInheritance[0]?.inheritedThrough[0] satisfies
  | I.PptxThemeEffectiveInheritanceStep
  | undefined;
themePayload.projection.trace.referenceSerialization[0] satisfies
  | I.PptxThemeReferenceSerializationChoice
  | undefined;
themePayload.projection.trace.referenceSerialization[0]?.candidate satisfies
  | I.PptxThemeReferenceCandidate
  | undefined;
themePayload.projection.trace.referenceSerialization[0]?.currentSerialization satisfies
  | I.PptxThemeReferenceSerializationKind
  | undefined;
themePayload.projection.trace.referenceSerialization[0]?.decision satisfies
  | I.PptxThemeReferenceSerializationDecision
  | undefined;
void themePayload;

const emptySupportPayload = {
  kind: "view-properties",
  editable: true,
  settings: {},
} satisfies I.PptxEmptySupportPartPayload;
void emptySupportPayload;

const packageModel = {
  format: "pptx",
  size: { widthEmu: 9144000, heightEmu: 5143500 },
  parts: [supportPart],
  slides: [],
} satisfies I.PptxPackageModel;
packageModel.parts[0]?.payload satisfies I.PptxPackagePart["payload"] | undefined;
void packageModel;

const packageModelCandidate = {
  format: "pptx",
  size: { widthEmu: 9144000, heightEmu: 5143500 },
  parts: [packagePartCandidate],
  slides: [],
} satisfies I.PptxPackageModelCandidate;

if (isPptxPackagePart(packageModelCandidate.parts[0]!)) {
  packageModelCandidate.parts[0].payload satisfies I.PptxPackagePart["payload"];
}

if (isPptxPackageModel(packageModelCandidate)) {
  packageModelCandidate.parts[0]?.payload satisfies I.PptxPackagePart["payload"] | undefined;
}

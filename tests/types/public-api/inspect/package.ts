import {
  isPptxContentTypesPart,
  isPptxMediaPart,
  isPptxRelationshipsPart,
  isPptxSlidePart,
  isPptxSupportPart,
} from "deckjsx/inspect";
import type * as I from "deckjsx/inspect";

declare const chartMediaPartId: I.PackagePartId;
declare const chartAssetId: I.AssetEntityId;
declare const defaultThemePartId: I.PackagePartId;
declare const presentationPartId: I.PackagePartId;
declare const defaultSupportSlideMasterPartId: I.PackagePartId;
declare const firstSlidePartId: I.PackagePartId;
declare const relationshipId: I.PptxSerializedIdentity;

const packagePartRequirement = {
  status: "conditional",
  required: true,
  reason: "media relationship exists",
  condition: "referencedByRelationship",
  dependencies: [chartMediaPartId],
} satisfies I.PptxPackagePartRequirement;
void packagePartRequirement;

const dependencyFingerprint = {
  packagePartId: defaultThemePartId,
  fingerprint: "fnv1a32:00000000",
} satisfies I.PptxPackagePartDependencyFingerprint;
void dependencyFingerprint;

const packagePartOrderKey = {
  group: "presentation",
  groupOrder: 30,
  sequence: 4,
  path: "ppt/presentation.xml",
  value: "030:000004:ppt/presentation.xml",
} satisfies I.PptxPackagePartOrderKey;
void packagePartOrderKey;

const relationship = {
  id: relationshipId,
  target: "ppt/slides/slide1.xml",
  targetPath: "ppt/slides/slide1.xml",
  type: "slide",
} satisfies I.PptxRelationship;
void relationship;

const mediaMetadata = {
  mediaType: "image/png",
  extension: "png",
  widthPx: 640,
  heightPx: 360,
  byteLength: 4096,
  hash: "sha256:stable-media",
} satisfies I.PptxMediaMetadata;
void mediaMetadata;

const mediaPayload = {
  source: { kind: "path", path: "/public/chart.png" },
  sources: [{ kind: "path", path: "/public/chart.png" }],
  assetEntityId: chartAssetId,
  assetEntityIds: [chartAssetId],
  allocationKey: "hash:sha256:stable-media:png",
  metadata: mediaMetadata,
} satisfies I.PptxMediaPartPayload;
void mediaPayload;

const mediaPart = {
  id: chartMediaPartId,
  category: "authored-content",
  kind: "media",
  path: "ppt/media/media1.png",
  payload: mediaPayload,
} satisfies I.PptxMediaPart;
mediaPart.payload.metadata satisfies I.PptxMediaMetadata | undefined;
void mediaPart;

const knownPackagePart = mediaPart satisfies I.PptxKnownPackagePart;
if (isPptxMediaPart(knownPackagePart)) {
  knownPackagePart.payload satisfies I.PptxMediaPartPayload;
  knownPackagePart.payload.metadata satisfies I.PptxMediaMetadata | undefined;
}

const broadMediaPart = mediaPart satisfies I.PptxPackagePart;
if (isPptxMediaPart(broadMediaPart)) {
  broadMediaPart.payload satisfies I.PptxMediaPartPayload;
  broadMediaPart.payload.sources[0]?.kind satisfies "data" | "path" | "url" | undefined;
}

const packagePart = {
  id: presentationPartId,
  category: "support",
  kind: "presentation",
  path: "ppt/presentation.xml",
  requirement: { status: "required", required: true, reason: "presentation root" },
  orderKey: packagePartOrderKey,
  fingerprint: "fnv1a32:11111111",
  dependencyFingerprints: [dependencyFingerprint],
  relationships: [relationship],
} satisfies I.PptxPackagePartCandidate;
const packagePartCandidate: I.PptxPackagePartCandidate = packagePart;
packagePartCandidate.payload satisfies I.PptxPackagePartCandidate["payload"];
void packagePart;

function defaultTextStyleLevel<Level extends 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9>(level: Level) {
  return {
    level,
    marginLeftEmu: (level - 1) * 457200,
    alignment: "l",
    defaultTabSizeEmu: 914400,
    fontSizePt: 18,
    colorThemeReference: "tx1",
    latinTypeface: "+mn-lt",
    eastAsianTypeface: "+mn-ea",
    complexScriptTypeface: "+mn-cs",
  } as const;
}

const defaultTextStyle = {
  source: "themeProjection",
  levels: [
    defaultTextStyleLevel(1),
    defaultTextStyleLevel(2),
    defaultTextStyleLevel(3),
    defaultTextStyleLevel(4),
    defaultTextStyleLevel(5),
    defaultTextStyleLevel(6),
    defaultTextStyleLevel(7),
    defaultTextStyleLevel(8),
    defaultTextStyleLevel(9),
  ],
} as const;

const supportPart = {
  id: presentationPartId,
  category: "support",
  kind: "presentation",
  path: "ppt/presentation.xml",
  payload: {
    kind: "presentation",
    size: { widthEmu: 9144000, heightEmu: 5143500 },
    slideMasterIds: [{ slideMasterPartId: defaultSupportSlideMasterPartId, id: "2147483648" }],
    slidePartIds: [firstSlidePartId],
    defaultTextStyle,
  },
} satisfies I.PptxSupportPart;
supportPart.payload.kind satisfies "presentation";
void supportPart;

const broadSupportPart = supportPart satisfies I.PptxPackagePart;
if (isPptxSupportPart(broadSupportPart)) {
  broadSupportPart.payload satisfies I.PptxSupportPart["payload"];
  broadSupportPart.payload.kind satisfies "presentation";
}

const contentTypesPart = {
  id: "pptx:content-types" as I.PackagePartId,
  category: "manifest",
  kind: "content-types",
  path: "[Content_Types].xml",
  payload: {
    defaults: [
      {
        extension: "rels",
        contentType: "application/vnd.openxmlformats-package.relationships+xml",
      },
    ],
    overrides: [
      {
        partName: "/ppt/presentation.xml",
        contentType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
      },
    ],
  },
} satisfies I.PptxPackagePart;

if (isPptxContentTypesPart(contentTypesPart)) {
  contentTypesPart.payload satisfies I.PptxContentTypesPayload;
  contentTypesPart.payload.defaults[0]?.extension satisfies string | undefined;
}

const relationshipsPart = {
  id: "pptx:root-relationships" as I.PackagePartId,
  category: "manifest",
  kind: "relationships",
  path: "_rels/.rels",
  payload: { relationships: [relationship] },
} satisfies I.PptxPackagePart;

if (isPptxRelationshipsPart(relationshipsPart)) {
  relationshipsPart.payload satisfies I.PptxRelationshipsPayload;
  relationshipsPart.payload.relationships[0]?.id satisfies I.PptxRelationship["id"] | undefined;
}

declare const broadSlidePart: I.PptxPackagePart;
if (isPptxSlidePart(broadSlidePart)) {
  broadSlidePart satisfies I.PptxSlidePart;
  broadSlidePart.payload.drawing satisfies I.PptxSlideDrawing;
}

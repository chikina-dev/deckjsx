import type {
  PptxCoreDocumentPropertiesPart,
  PptxExtendedDocumentPropertiesPart,
  PptxPackageModel,
  PptxPackagePart,
  PptxPresentationPart,
  PptxPresentationPropertiesPart,
  PptxRelationship,
  PptxSlideLayoutPart,
  PptxSlideMasterPart,
  PptxThemePartPayload,
  PptxThemePart,
  PptxViewPropertiesPart,
} from "../../projection/pptx/model";
import { relationshipOwnerPath } from "./package-xml";
import { XmlChunkWriter } from "./xml-writer";

const PRESENTATION_ML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const DRAWING_ML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MIN_PRESENTATION_SLIDE_ID = 256;
const MAX_PRESENTATION_SLIDE_ID = 2147483647;
const MIN_PRESENTATION_SLIDE_MASTER_ID = 2147483648;
const MIN_SLIDE_MASTER_LAYOUT_ID = 2147483649;
const MAX_OOXML_UNSIGNED_INT_ID = 4294967295;
const THEME_COLOR_KEYS = [
  "dk1",
  "lt1",
  "dk2",
  "lt2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
] as const;
const PROJECTED_RGB_COLOR_PATTERN = /^[0-9A-Fa-f]{6}$/;

type PptxDocumentPropertiesPart =
  | PptxCoreDocumentPropertiesPart
  | PptxExtendedDocumentPropertiesPart;

function emu(value: number | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`PPTX support XML requires finite ${path}.`);
  }

  return Math.round(value);
}

function relationshipPayload(part: PptxPackagePart | undefined): readonly PptxRelationship[] {
  return part?.kind === "relationships" ? (part.payload?.relationships ?? []) : [];
}

function relationshipsForOwner(
  projection: PptxPackageModel | undefined,
  ownerPath: string | undefined,
): readonly PptxRelationship[] {
  if (!projection || !ownerPath) {
    return [];
  }

  const relationshipPart = projection.parts.find(
    (part) => part.kind === "relationships" && relationshipOwnerPath(part.path) === ownerPath,
  );
  return relationshipPayload(relationshipPart);
}

function relationshipIdForTarget(
  relationships: readonly PptxRelationship[],
  input: { readonly type: string; readonly targetPartId?: string; readonly targetPath?: string },
): string | undefined {
  return relationships.find(
    (relationship) =>
      relationship.type === input.type &&
      (input.targetPartId === undefined || relationship.targetPartId === input.targetPartId) &&
      (input.targetPath === undefined || relationship.targetPath === input.targetPath),
  )?.id;
}

function requireRelationshipIdForTarget(
  relationships: readonly PptxRelationship[],
  input: {
    readonly ownerPath: string;
    readonly type: string;
    readonly targetPartId?: string;
    readonly targetPath?: string;
    readonly label: string;
  },
): string {
  const id = relationshipIdForTarget(relationships, input);
  if (!id) {
    const target = input.targetPartId ?? input.targetPath ?? input.type;
    throw new Error(
      `${input.label} must reference projected relationship id for ${target} from ${input.ownerPath}.`,
    );
  }

  return id;
}

function requireSupportPartPath(
  part: PptxPackagePart | undefined,
  label: "Presentation support XML" | "Slide master support XML",
): string {
  if (typeof part?.path !== "string" || part.path.length === 0) {
    throw new Error(`${label} requires projected package part path.`);
  }

  return part.path;
}

function requirePresentationSlideId(
  slide: PptxPackageModel["slides"][number] | undefined,
  slidePartId: string,
): number {
  const value = slide?.payload.slideId;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error(
      `Presentation support XML requires projected numeric slide id for ${slidePartId}.`,
    );
  }

  const numeric = Number.parseInt(value, 10);
  if (
    !Number.isSafeInteger(numeric) ||
    numeric < MIN_PRESENTATION_SLIDE_ID ||
    numeric > MAX_PRESENTATION_SLIDE_ID
  ) {
    throw new Error(
      `Presentation support XML requires projected numeric slide id for ${slidePartId}.`,
    );
  }

  return numeric;
}

function requireProjectedSupportNumericId(input: {
  readonly value: string;
  readonly path: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
}): string {
  const value = input.value;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${input.label} requires projected numeric ${input.path}.`);
  }

  const numeric = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(numeric) || numeric < input.min || numeric > input.max) {
    throw new Error(`${input.label} requires projected numeric ${input.path}.`);
  }

  return value;
}

export function presentationXml(part: PptxPresentationPart, projection: PptxPackageModel): string {
  return new TextDecoder().decode(presentationBytes(part, projection));
}

export function presentationBytes(
  part: PptxPresentationPart,
  projection: PptxPackageModel,
): Uint8Array {
  const payload = part.payload;
  const ownerPath = requireSupportPartPath(part, "Presentation support XML");
  const presentationRelationships = relationshipsForOwner(projection, ownerPath);
  const slidePartIds = payload.slidePartIds;
  const size = payload.size;
  const writer = new XmlChunkWriter()
    .declaration()
    .open("p:presentation", {
      "xmlns:a": DRAWING_ML_NS,
      "xmlns:r": REL_NS,
      "xmlns:p": PRESENTATION_ML_NS,
    })
    .open("p:sldMasterIdLst");

  payload.slideMasterIds.forEach((slideMasterId, index) => {
    writer.empty("p:sldMasterId", {
      id: requireProjectedSupportNumericId({
        value: slideMasterId.id,
        path: `slideMasterIds.${index}.id`,
        label: "Presentation support XML",
        min: MIN_PRESENTATION_SLIDE_MASTER_ID,
        max: MAX_OOXML_UNSIGNED_INT_ID,
      }),
      "r:id": requireRelationshipIdForTarget(presentationRelationships, {
        ownerPath,
        type: "slideMaster",
        targetPartId: slideMasterId.slideMasterPartId,
        label: "Presentation support XML",
      }),
    });
  });

  writer.close("p:sldMasterIdLst").open("p:sldIdLst");

  slidePartIds.forEach((slidePartId) => {
    const slide = projection.slides.find((candidate) => candidate.id === slidePartId);
    writer.empty("p:sldId", {
      id: requirePresentationSlideId(slide, slidePartId),
      "r:id": requireRelationshipIdForTarget(presentationRelationships, {
        ownerPath,
        type: "slide",
        targetPartId: slidePartId,
        targetPath: slide?.path,
        label: "Presentation support XML",
      }),
    });
  });

  return writer
    .close("p:sldIdLst")
    .empty("p:sldSz", {
      cx: emu(size.widthEmu, "presentation.size.widthEmu"),
      cy: emu(size.heightEmu, "presentation.size.heightEmu"),
      type: "custom",
    })
    .empty("p:notesSz", {
      cx: emu(size.widthEmu, "presentation.size.widthEmu"),
      cy: emu(size.heightEmu, "presentation.size.heightEmu"),
    })
    .close("p:presentation")
    .bytes();
}

export function themeXml(part: PptxThemePart): string {
  return new TextDecoder().decode(themeBytes(part));
}

function themeColor(writer: XmlChunkWriter, name: string, value: string): void {
  writer.open(`a:${name}`).empty("a:srgbClr", { val: value }).close(`a:${name}`);
}

function requireThemeText(value: string, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Theme support payload must include ${path}.`);
  }

  return value;
}

function requireThemeColor(payload: PptxThemePartPayload, key: string): string {
  const value = payload.colorScheme.colors[key];
  if (typeof value !== "string" || !PROJECTED_RGB_COLOR_PATTERN.test(value)) {
    throw new Error(`Theme support payload must include valid colorScheme.colors.${key}.`);
  }

  return value;
}

export function themeBytes(part: PptxThemePart): Uint8Array {
  const payload = part.payload;
  const writer = new XmlChunkWriter()
    .declaration()
    .open("a:theme", { "xmlns:a": DRAWING_ML_NS, name: requireThemeText(payload.name, "name") })
    .open("a:themeElements")
    .open("a:clrScheme", {
      name: requireThemeText(payload.colorScheme.name, "colorScheme.name"),
    });

  for (const name of THEME_COLOR_KEYS) {
    themeColor(writer, name, requireThemeColor(payload, name));
  }

  return writer
    .close("a:clrScheme")
    .open("a:fontScheme", { name: requireThemeText(payload.fontScheme.name, "fontScheme.name") })
    .open("a:majorFont")
    .empty("a:latin", {
      typeface: requireThemeText(payload.fontScheme.majorLatin, "fontScheme.majorLatin"),
    })
    .close("a:majorFont")
    .open("a:minorFont")
    .empty("a:latin", {
      typeface: requireThemeText(payload.fontScheme.minorLatin, "fontScheme.minorLatin"),
    })
    .close("a:minorFont")
    .close("a:fontScheme")
    .open("a:fmtScheme", {
      name: requireThemeText(payload.formatScheme.name, "formatScheme.name"),
    })
    .open("a:fillStyleLst")
    .open("a:solidFill")
    .empty("a:schemeClr", { val: "phClr" })
    .close("a:solidFill")
    .close("a:fillStyleLst")
    .open("a:lnStyleLst")
    .open("a:ln", { w: 9525 })
    .open("a:solidFill")
    .empty("a:schemeClr", { val: "phClr" })
    .close("a:solidFill")
    .close("a:ln")
    .close("a:lnStyleLst")
    .open("a:effectStyleLst")
    .open("a:effectStyle")
    .empty("a:effectLst")
    .close("a:effectStyle")
    .close("a:effectStyleLst")
    .open("a:bgFillStyleLst")
    .open("a:solidFill")
    .empty("a:schemeClr", { val: "phClr" })
    .close("a:solidFill")
    .close("a:bgFillStyleLst")
    .close("a:fmtScheme")
    .close("a:themeElements")
    .empty("a:objectDefaults")
    .empty("a:extraClrSchemeLst")
    .close("a:theme")
    .bytes();
}

function emptyShapeTree(writer: XmlChunkWriter): XmlChunkWriter {
  return writer
    .open("p:spTree")
    .open("p:nvGrpSpPr")
    .empty("p:cNvPr", {
      id: 1,
      name: "",
    })
    .empty("p:cNvGrpSpPr")
    .empty("p:nvPr")
    .close("p:nvGrpSpPr")
    .open("p:grpSpPr")
    .open("a:xfrm")
    .empty("a:off", { x: 0, y: 0 })
    .empty("a:ext", { cx: 0, cy: 0 })
    .empty("a:chOff", {
      x: 0,
      y: 0,
    })
    .empty("a:chExt", { cx: 0, cy: 0 })
    .close("a:xfrm")
    .close("p:grpSpPr")
    .close("p:spTree");
}

function colorMapOverride(writer: XmlChunkWriter): XmlChunkWriter {
  return writer.open("p:clrMapOvr").empty("a:masterClrMapping").close("p:clrMapOvr");
}

export function slideMasterXml(part: PptxSlideMasterPart, projection: PptxPackageModel): string {
  return new TextDecoder().decode(slideMasterBytes(part, projection));
}

export function slideMasterBytes(
  part: PptxSlideMasterPart,
  projection: PptxPackageModel,
): Uint8Array {
  const payload = part.payload;
  const ownerPath = requireSupportPartPath(part, "Slide master support XML");
  const relationships = relationshipsForOwner(projection, ownerPath);
  const writer = new XmlChunkWriter()
    .declaration()
    .open("p:sldMaster", {
      "xmlns:a": DRAWING_ML_NS,
      "xmlns:r": REL_NS,
      "xmlns:p": PRESENTATION_ML_NS,
    })
    .open("p:cSld");

  emptyShapeTree(writer);

  writer.close("p:cSld").empty("p:clrMap", payload.colorMap).open("p:sldLayoutIdLst");

  payload.slideLayoutIds.forEach((slideLayoutId, index) => {
    writer.empty("p:sldLayoutId", {
      id: requireProjectedSupportNumericId({
        value: slideLayoutId.id,
        path: `slideLayoutIds.${index}.id`,
        label: "Slide master support XML",
        min: MIN_SLIDE_MASTER_LAYOUT_ID,
        max: MAX_OOXML_UNSIGNED_INT_ID,
      }),
      "r:id": requireRelationshipIdForTarget(relationships, {
        ownerPath,
        type: "slideLayout",
        targetPartId: slideLayoutId.slideLayoutPartId,
        label: "Slide master support XML",
      }),
    });
  });

  return writer
    .close("p:sldLayoutIdLst")
    .open("p:txStyles")
    .empty("p:titleStyle")
    .empty("p:bodyStyle")
    .empty("p:otherStyle")
    .close("p:txStyles")
    .close("p:sldMaster")
    .bytes();
}

export function slideLayoutXml(part: PptxSlideLayoutPart): string {
  return new TextDecoder().decode(slideLayoutBytes(part));
}

export function slideLayoutBytes(part: PptxSlideLayoutPart): Uint8Array {
  const payload = part.payload;
  const writer = new XmlChunkWriter()
    .declaration()
    .open("p:sldLayout", {
      "xmlns:a": DRAWING_ML_NS,
      "xmlns:r": REL_NS,
      "xmlns:p": PRESENTATION_ML_NS,
      type: payload.layoutType,
      preserve: payload.preserve ? 1 : undefined,
    })
    .open("p:cSld", { name: payload.name });

  emptyShapeTree(writer);

  writer.close("p:cSld");
  colorMapOverride(writer);
  return writer.close("p:sldLayout").bytes();
}

export function corePropertiesXml(
  part: PptxDocumentPropertiesPart,
  projection: PptxPackageModel,
): string {
  return new TextDecoder().decode(corePropertiesBytes(part, projection));
}

export function corePropertiesBytes(
  part: PptxDocumentPropertiesPart,
  projection: PptxPackageModel,
): Uint8Array {
  void projection;
  const payload = part.payload;
  if (payload.propertyKind !== "core") {
    throw new Error("Core document properties XML requires a core properties payload.");
  }
  if (typeof payload.meta !== "object" || payload.meta === null) {
    throw new Error("Core document properties parts must carry projected core metadata.");
  }

  const meta = payload.meta;
  const writer = new XmlChunkWriter().declaration().open("cp:coreProperties", {
    "xmlns:cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "xmlns:dc": "http://purl.org/dc/elements/1.1/",
    "xmlns:dcterms": "http://purl.org/dc/terms/",
    "xmlns:dcmitype": "http://purl.org/dc/dcmitype/",
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
  });

  if (meta.title) {
    writer.element("dc:title", {}, meta.title);
  }
  if (meta.subject) {
    writer.element("dc:subject", {}, meta.subject);
  }
  if (meta.author) {
    writer.element("dc:creator", {}, meta.author);
  }

  return writer.close("cp:coreProperties").bytes();
}

export function appPropertiesBytes(
  part: PptxDocumentPropertiesPart,
  projection: PptxPackageModel,
): Uint8Array {
  void projection;
  const payload = part.payload;
  if (payload.propertyKind !== "extended") {
    throw new Error("Extended document properties XML requires an extended properties payload.");
  }

  return new XmlChunkWriter()
    .declaration()
    .open("Properties", {
      xmlns: "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
      "xmlns:vt": "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes",
    })
    .element("Application", {}, payload.application)
    .element("PresentationFormat", {}, "Custom")
    .element("Slides", {}, payload.slideCount)
    .element("Notes", {}, 0)
    .element("HiddenSlides", {}, 0)
    .close("Properties")
    .bytes();
}

export function appPropertiesXml(
  part: PptxDocumentPropertiesPart,
  projection: PptxPackageModel,
): string {
  return new TextDecoder().decode(appPropertiesBytes(part, projection));
}

export function emptyPresentationPropertiesBytes(
  part: PptxPresentationPropertiesPart | PptxViewPropertiesPart,
  fallbackKind: "presentation-properties" | "view-properties",
): Uint8Array {
  const payload = part.payload;
  if (payload.kind !== fallbackKind) {
    throw new Error(`${fallbackKind} parts must carry a structured ${fallbackKind} payload.`);
  }

  return payload.kind === "view-properties"
    ? new XmlChunkWriter()
        .declaration()
        .empty("p:viewPr", { "xmlns:p": PRESENTATION_ML_NS, "xmlns:a": DRAWING_ML_NS })
        .bytes()
    : new XmlChunkWriter()
        .declaration()
        .empty("p:presentationPr", { "xmlns:p": PRESENTATION_ML_NS })
        .bytes();
}

export function emptyPresentationPropertiesXml(
  part: PptxPresentationPropertiesPart | PptxViewPropertiesPart,
  fallbackKind: "presentation-properties" | "view-properties",
): string {
  return new TextDecoder().decode(emptyPresentationPropertiesBytes(part, fallbackKind));
}

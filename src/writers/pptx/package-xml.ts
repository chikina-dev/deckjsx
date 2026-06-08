import type {
  PptxContentTypesPart,
  PptxContentTypesPayload,
  PptxRelationshipsPart,
  PptxRelationshipsPayload,
  PptxRelationship,
} from "../../projection/pptx/model";
import { XmlChunkWriter } from "./xml-writer";

export { relationshipOwnerPath } from "../../projection/pptx/relationships";

const RELATIONSHIP_TYPES: Record<string, string> = {
  coreProperties:
    "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  extendedProperties:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
  image: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
  hyperlink: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
  officeDocument:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  presentationProperties:
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps",
  slide: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
  slideLayout: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
  slideMaster: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster",
  theme: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
  viewProperties: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps",
};
const RELATIONSHIP_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const CUSTOM_RELATIONSHIP_TYPE_PROTOCOLS = ["http:", "https:"] as const;

function isValidRelationshipType(type: string): boolean {
  if (RELATIONSHIP_TYPES[type]) {
    return true;
  }

  try {
    const url = new URL(type);
    return CUSTOM_RELATIONSHIP_TYPE_PROTOCOLS.some((protocol) => protocol === url.protocol);
  } catch {
    return false;
  }
}

export function relationshipsXml(
  relationships: readonly PptxRelationship[],
  _ownerPath?: string,
): string {
  return new TextDecoder().decode(relationshipsBytes(relationships, _ownerPath));
}

export function relationshipsBytes(
  relationships: readonly PptxRelationship[],
  _ownerPath?: string,
): Uint8Array {
  const writer = new XmlChunkWriter().declaration().open("Relationships", {
    xmlns: "http://schemas.openxmlformats.org/package/2006/relationships",
  });

  for (const relationship of relationships) {
    if (!RELATIONSHIP_ID_PATTERN.test(relationship.id)) {
      throw new Error("Relationship XML requires a valid relationship id.");
    }
    if (!isValidRelationshipType(relationship.type)) {
      throw new Error("Relationship XML requires a valid relationship type.");
    }
    if (typeof relationship.target !== "string" || relationship.target.length === 0) {
      throw new Error("Relationship XML requires a projected relationship target.");
    }

    writer.empty("Relationship", {
      Id: relationship.id,
      Type: RELATIONSHIP_TYPES[relationship.type] ?? relationship.type,
      Target: relationship.target,
      TargetMode: relationship.targetMode === "external" ? "External" : undefined,
    });
  }

  return writer.close("Relationships").bytes();
}

export function contentTypesPayload(part: PptxContentTypesPart): PptxContentTypesPayload {
  return part.payload;
}

export function relationshipsPayload(part: PptxRelationshipsPart): PptxRelationshipsPayload {
  return part.payload;
}

export function contentTypesBytes(part: PptxContentTypesPart): Uint8Array {
  const payload = contentTypesPayload(part);
  const writer = new XmlChunkWriter().declaration().open("Types", {
    xmlns: "http://schemas.openxmlformats.org/package/2006/content-types",
  });

  for (const item of payload.defaults) {
    writer.empty("Default", { Extension: item.extension, ContentType: item.contentType });
  }

  for (const item of payload.overrides) {
    writer.empty("Override", { PartName: item.partName, ContentType: item.contentType });
  }

  return writer.close("Types").bytes();
}

export function contentTypesXml(part: PptxContentTypesPart): string {
  return new TextDecoder().decode(contentTypesBytes(part));
}

import type {
  PptxPackageModel,
  PptxPackagePartCandidate,
  PptxSlidePart,
} from "@/src/projection/pptx/model";
import {
  isPptxContentTypesPart,
  isPptxRelationshipsPart,
  isPptxSlidePart,
  isPptxSupportPart,
} from "@/src/projection/pptx/model";
import { contentTypesBytes, relationshipOwnerPath, relationshipsBytes } from "./package-xml";
import {
  appPropertiesBytes,
  corePropertiesBytes,
  emptyPresentationPropertiesBytes,
  presentationBytes,
  slideLayoutBytes,
  slideMasterBytes,
  tableStylesBytes,
  themeBytes,
} from "./support-xml";

export type PptxSlidePartEmitter = (
  slide: PptxSlidePart,
  projection: PptxPackageModel,
) => Uint8Array;

function requireContentTypesPart(part: PptxPackagePartCandidate) {
  if (!isPptxContentTypesPart(part)) {
    throw new Error("Content type package parts must carry a structured content-types payload.");
  }
  return part;
}

function requireRelationshipsPart(part: PptxPackagePartCandidate) {
  if (!isPptxRelationshipsPart(part)) {
    throw new Error("Relationship package parts must carry a structured relationships payload.");
  }
  return part;
}

function requireSlidePart(part: PptxPackagePartCandidate) {
  if (!isPptxSlidePart(part)) {
    throw new Error("Slide package parts must carry a structured slide payload.");
  }
  return part;
}

function requireSupportPart(part: PptxPackagePartCandidate) {
  if (!isPptxSupportPart(part)) {
    throw new Error(supportPayloadMessage(part));
  }
  return part;
}

function supportPayloadMessage(part: PptxPackagePartCandidate): string {
  switch (part.kind) {
    case "document-properties":
      return part.path.endsWith("/app.xml")
        ? "Extended document properties parts must carry a structured extended properties payload."
        : "Core document properties parts must carry a structured core properties payload.";
    case "presentation":
      return "Presentation support parts must carry a structured presentation payload.";
    case "presentation-properties":
      return "presentation-properties parts must carry a structured presentation-properties payload.";
    case "slide-layout":
      return "Slide layout support parts must carry a structured slide-layout payload.";
    case "slide-master":
      return "Slide master support parts must carry a structured slide-master payload.";
    case "table-styles":
      return "table-styles parts must carry a structured table-styles payload.";
    case "theme":
      return "Theme support parts must carry a structured theme payload.";
    case "view-properties":
      return "view-properties parts must carry a structured view-properties payload.";
    case "notes-master":
      return "notes-master support parts must carry a structured notes-master payload.";
    case "notes-slide":
      return "notes-slide support parts must carry a structured notes-slide payload.";
    default:
      return `${part.kind} support parts must carry a structured support payload.`;
  }
}

export function emitPartBytes(
  part: PptxPackagePartCandidate,
  projection: PptxPackageModel,
  emitters: { readonly slideBytes: PptxSlidePartEmitter },
): Uint8Array | undefined {
  switch (part.kind) {
    case "content-types":
      return contentTypesBytes(requireContentTypesPart(part));
    case "relationships": {
      const relationshipPart = requireRelationshipsPart(part);
      return relationshipsBytes(
        relationshipPart.payload.relationships,
        relationshipOwnerPath(relationshipPart.path),
      );
    }
    case "document-properties": {
      const supportPart = requireSupportPart(part);
      if (supportPart.kind !== "document-properties") {
        return undefined;
      }
      return supportPart.payload.propertyKind === "extended"
        ? appPropertiesBytes(supportPart, projection)
        : corePropertiesBytes(supportPart, projection);
    }
    case "presentation": {
      const supportPart = requireSupportPart(part);
      return supportPart.kind === "presentation"
        ? presentationBytes(supportPart, projection)
        : undefined;
    }
    case "slide":
      return emitters.slideBytes(requireSlidePart(part), projection);
    case "theme": {
      const supportPart = requireSupportPart(part);
      return supportPart.kind === "theme" ? themeBytes(supportPart) : undefined;
    }
    case "slide-master": {
      const supportPart = requireSupportPart(part);
      return supportPart.kind === "slide-master"
        ? slideMasterBytes(supportPart, projection)
        : undefined;
    }
    case "slide-layout": {
      const supportPart = requireSupportPart(part);
      return supportPart.kind === "slide-layout" ? slideLayoutBytes(supportPart) : undefined;
    }
    case "view-properties": {
      const supportPart = requireSupportPart(part);
      return supportPart.kind === "view-properties"
        ? emptyPresentationPropertiesBytes(supportPart, "view-properties")
        : undefined;
    }
    case "presentation-properties": {
      const supportPart = requireSupportPart(part);
      return supportPart.kind === "presentation-properties"
        ? emptyPresentationPropertiesBytes(supportPart, "presentation-properties")
        : undefined;
    }
    case "table-styles": {
      const supportPart = requireSupportPart(part);
      return supportPart.kind === "table-styles" ? tableStylesBytes(supportPart) : undefined;
    }
    case "media":
    case "notes-master":
    case "notes-slide":
      return undefined;
  }
}

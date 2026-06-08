import type {
  PackagePartId,
  PptxPackagePart,
  PptxRelationship,
  PptxSerializedIdentity,
  PptxSlidePart,
  PptxContentTypeDefault,
  PptxContentTypeOverride,
  PptxContentTypesPayload,
  PptxRelationshipsPayload,
} from "./model";
import { projectedRelationshipTarget } from "./relationships";
export type {
  PptxContentTypeDefault,
  PptxContentTypeOverride,
  PptxContentTypesPayload,
  PptxRelationshipsPayload,
} from "./model";

type PptxManifestParts = {
  readonly contentTypes: PptxPackagePart;
  readonly rootRelationships: PptxPackagePart;
  readonly presentationPart: PptxPackagePart;
  readonly presentationRelationships: PptxPackagePart;
  readonly themePart: PptxPackagePart;
  readonly slideMasterPart: PptxPackagePart;
  readonly slideMasterRelationships: PptxPackagePart;
  readonly slideLayoutPart: PptxPackagePart;
  readonly slideLayoutRelationships: PptxPackagePart;
  readonly slideLayoutParts?: readonly PptxPackagePart[];
  readonly slideLayoutRelationshipParts?: readonly PptxPackagePart[];
  readonly documentPropertiesPart: PptxPackagePart;
  readonly extendedDocumentPropertiesPart: PptxPackagePart;
  readonly viewPropertiesPart: PptxPackagePart;
  readonly presentationPropertiesPart: PptxPackagePart;
};

type BuildPptxManifestInput = PptxManifestParts & {
  readonly slides: readonly PptxSlidePart[];
  readonly mediaParts: readonly PptxPackagePart[];
  readonly serializedId: (value: string) => PptxSerializedIdentity;
};

function relationship(input: {
  readonly id: PptxSerializedIdentity;
  readonly ownerPath: string;
  readonly targetPartId: PackagePartId;
  readonly targetPath: string;
  readonly type: string;
}): PptxRelationship {
  return {
    id: input.id,
    target: projectedRelationshipTarget({
      ownerPath: input.ownerPath,
      targetPath: input.targetPath,
    }),
    targetPartId: input.targetPartId,
    targetPath: input.targetPath,
    type: input.type,
  };
}

function mediaDefaults(mediaParts: readonly PptxPackagePart[]): PptxContentTypeDefault[] {
  const defaults = new Map<string, PptxContentTypeDefault>();

  for (const part of mediaParts) {
    const extension = part.path.split(".").pop();
    if (!extension || defaults.has(extension)) {
      continue;
    }

    defaults.set(extension, {
      extension,
      contentType: mediaContentType(extension),
    });
  }

  return [...defaults.values()];
}

function mediaContentType(extension: string): string {
  switch (extension.toLowerCase()) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function override(part: PptxPackagePart, contentType: string): PptxContentTypeOverride {
  return {
    partName: `/${part.path}`,
    contentType,
  };
}

export function buildPptxManifest(input: BuildPptxManifestInput): PptxManifestParts {
  const slideLayoutParts = input.slideLayoutParts ?? [input.slideLayoutPart];
  const slideLayoutRelationshipParts = input.slideLayoutRelationshipParts ?? [
    input.slideLayoutRelationships,
  ];
  const rootRelationships = [
    relationship({
      id: input.serializedId("rId1"),
      ownerPath: "",
      targetPartId: input.presentationPart.id,
      targetPath: input.presentationPart.path,
      type: "officeDocument",
    }),
    relationship({
      id: input.serializedId("rId2"),
      ownerPath: "",
      targetPartId: input.documentPropertiesPart.id,
      targetPath: input.documentPropertiesPart.path,
      type: "coreProperties",
    }),
    relationship({
      id: input.serializedId("rId3"),
      ownerPath: "",
      targetPartId: input.extendedDocumentPropertiesPart.id,
      targetPath: input.extendedDocumentPropertiesPart.path,
      type: "extendedProperties",
    }),
  ];
  const presentationRelationships = [
    relationship({
      id: input.serializedId("rId1"),
      ownerPath: input.presentationPart.path,
      targetPartId: input.slideMasterPart.id,
      targetPath: input.slideMasterPart.path,
      type: "slideMaster",
    }),
    relationship({
      id: input.serializedId("rId2"),
      ownerPath: input.presentationPart.path,
      targetPartId: input.themePart.id,
      targetPath: input.themePart.path,
      type: "theme",
    }),
    relationship({
      id: input.serializedId("rId3"),
      ownerPath: input.presentationPart.path,
      targetPartId: input.viewPropertiesPart.id,
      targetPath: input.viewPropertiesPart.path,
      type: "viewProperties",
    }),
    relationship({
      id: input.serializedId("rId4"),
      ownerPath: input.presentationPart.path,
      targetPartId: input.presentationPropertiesPart.id,
      targetPath: input.presentationPropertiesPart.path,
      type: "presentationProperties",
    }),
    ...input.slides.map((slide, index) =>
      relationship({
        id: input.serializedId(`rId${index + 5}`),
        ownerPath: input.presentationPart.path,
        targetPartId: slide.id,
        targetPath: slide.path,
        type: "slide",
      }),
    ),
  ];
  const slideMasterRelationships = [
    ...slideLayoutParts.map((slideLayoutPart, index) =>
      relationship({
        id: input.serializedId(`rId${index + 1}`),
        ownerPath: input.slideMasterPart.path,
        targetPartId: slideLayoutPart.id,
        targetPath: slideLayoutPart.path,
        type: "slideLayout",
      }),
    ),
    relationship({
      id: input.serializedId(`rId${slideLayoutParts.length + 1}`),
      ownerPath: input.slideMasterPart.path,
      targetPartId: input.themePart.id,
      targetPath: input.themePart.path,
      type: "theme",
    }),
  ];
  const slideLayoutRelationshipPayloads = slideLayoutRelationshipParts.map((_, index) => [
    relationship({
      id: input.serializedId("rId1"),
      ownerPath: slideLayoutParts[index]?.path ?? input.slideLayoutPart.path,
      targetPartId: input.slideMasterPart.id,
      targetPath: input.slideMasterPart.path,
      type: "slideMaster",
    }),
  ]);
  const contentTypes: PptxContentTypesPayload = {
    defaults: [
      {
        extension: "rels",
        contentType: "application/vnd.openxmlformats-package.relationships+xml",
      },
      { extension: "xml", contentType: "application/xml" },
      ...mediaDefaults(input.mediaParts),
    ],
    overrides: [
      override(
        input.presentationPart,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
      ),
      override(
        input.slideMasterPart,
        "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
      ),
      ...slideLayoutParts.map((slideLayoutPart) =>
        override(
          slideLayoutPart,
          "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml",
        ),
      ),
      override(input.themePart, "application/vnd.openxmlformats-officedocument.theme+xml"),
      override(
        input.documentPropertiesPart,
        "application/vnd.openxmlformats-package.core-properties+xml",
      ),
      override(
        input.extendedDocumentPropertiesPart,
        "application/vnd.openxmlformats-officedocument.extended-properties+xml",
      ),
      override(
        input.viewPropertiesPart,
        "application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml",
      ),
      override(
        input.presentationPropertiesPart,
        "application/vnd.openxmlformats-officedocument.presentationml.presProps+xml",
      ),
      ...input.slides.map((slide) =>
        override(slide, "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"),
      ),
    ],
  };

  return {
    contentTypes: {
      ...input.contentTypes,
      payload: contentTypes,
    },
    rootRelationships: {
      ...input.rootRelationships,
      relationships: rootRelationships,
      payload: { relationships: rootRelationships } satisfies PptxRelationshipsPayload,
    },
    presentationPart: input.presentationPart,
    presentationRelationships: {
      ...input.presentationRelationships,
      relationships: presentationRelationships,
      payload: { relationships: presentationRelationships } satisfies PptxRelationshipsPayload,
    },
    themePart: input.themePart,
    slideMasterPart: input.slideMasterPart,
    slideMasterRelationships: {
      ...input.slideMasterRelationships,
      relationships: slideMasterRelationships,
      payload: { relationships: slideMasterRelationships } satisfies PptxRelationshipsPayload,
    },
    slideLayoutPart: input.slideLayoutPart,
    slideLayoutRelationships: {
      ...input.slideLayoutRelationships,
      relationships: slideLayoutRelationshipPayloads[0] ?? [],
      payload: {
        relationships: slideLayoutRelationshipPayloads[0] ?? [],
      } satisfies PptxRelationshipsPayload,
    },
    slideLayoutParts,
    slideLayoutRelationshipParts: slideLayoutRelationshipParts.map((part, index) => ({
      ...part,
      relationships: slideLayoutRelationshipPayloads[index] ?? [],
      payload: {
        relationships: slideLayoutRelationshipPayloads[index] ?? [],
      } satisfies PptxRelationshipsPayload,
    })),
    documentPropertiesPart: input.documentPropertiesPart,
    extendedDocumentPropertiesPart: input.extendedDocumentPropertiesPart,
    viewPropertiesPart: input.viewPropertiesPart,
    presentationPropertiesPart: input.presentationPropertiesPart,
  };
}

import type {
  PackagePartId,
  PptxPackagePart,
  PptxRelationship,
  PptxSerializedIdentity,
  PptxSlidePart,
} from "./pptx";

export type PptxContentTypeDefault = {
  readonly extension: string;
  readonly contentType: string;
};

export type PptxContentTypeOverride = {
  readonly partName: string;
  readonly contentType: string;
};

export type PptxContentTypesPayload = {
  readonly defaults: readonly PptxContentTypeDefault[];
  readonly overrides: readonly PptxContentTypeOverride[];
};

export type PptxRelationshipsPayload = {
  readonly relationships: readonly PptxRelationship[];
};

type PptxManifestParts = {
  readonly contentTypes: PptxPackagePart;
  readonly rootRelationships: PptxPackagePart;
  readonly presentationPart: PptxPackagePart;
  readonly presentationRelationships: PptxPackagePart;
  readonly themePart: PptxPackagePart;
  readonly slideMasterPart: PptxPackagePart;
  readonly slideLayoutPart: PptxPackagePart;
  readonly documentPropertiesPart: PptxPackagePart;
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
  readonly targetPartId: PackagePartId;
  readonly targetPath: string;
  readonly type: string;
}): PptxRelationship {
  return {
    id: input.id,
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
  const rootRelationships = [
    relationship({
      id: input.serializedId("rId1"),
      targetPartId: input.presentationPart.id,
      targetPath: input.presentationPart.path,
      type: "officeDocument",
    }),
    relationship({
      id: input.serializedId("rId2"),
      targetPartId: input.documentPropertiesPart.id,
      targetPath: input.documentPropertiesPart.path,
      type: "coreProperties",
    }),
  ];
  const presentationRelationships = [
    relationship({
      id: input.serializedId("rId1"),
      targetPartId: input.slideMasterPart.id,
      targetPath: input.slideMasterPart.path,
      type: "slideMaster",
    }),
    relationship({
      id: input.serializedId("rId2"),
      targetPartId: input.themePart.id,
      targetPath: input.themePart.path,
      type: "theme",
    }),
    relationship({
      id: input.serializedId("rId3"),
      targetPartId: input.viewPropertiesPart.id,
      targetPath: input.viewPropertiesPart.path,
      type: "viewProperties",
    }),
    relationship({
      id: input.serializedId("rId4"),
      targetPartId: input.presentationPropertiesPart.id,
      targetPath: input.presentationPropertiesPart.path,
      type: "presentationProperties",
    }),
    ...input.slides.map((slide, index) =>
      relationship({
        id: input.serializedId(`rId${index + 5}`),
        targetPartId: slide.id,
        targetPath: slide.path,
        type: "slide",
      }),
    ),
  ];
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
      override(
        input.slideLayoutPart,
        "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml",
      ),
      override(input.themePart, "application/vnd.openxmlformats-officedocument.theme+xml"),
      override(
        input.documentPropertiesPart,
        "application/vnd.openxmlformats-package.core-properties+xml",
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
    slideLayoutPart: input.slideLayoutPart,
    documentPropertiesPart: input.documentPropertiesPart,
    viewPropertiesPart: input.viewPropertiesPart,
    presentationPropertiesPart: input.presentationPropertiesPart,
  };
}

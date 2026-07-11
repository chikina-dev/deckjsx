export const PDF_SPECIFICATION_PROFILE = {
  emittedVersion: "1.7",
  referenceVersion: "ISO 32000-2:2020",
  compatibilityReference: "Adobe PDF 1.7",
  supports: {
    pages: true,
    contentStreams: true,
    resourceDictionaries: true,
    embeddedTrueTypeFonts: true,
    imageXObjects: true,
    transparency: true,
    blendModes: true,
    taggedPdf: false,
    incrementalUpdate: false,
  },
} as const;

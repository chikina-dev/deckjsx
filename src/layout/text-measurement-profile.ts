/** Named text-measurement policy selected by an output projection. */
export type TextMeasurementProfile = {
  readonly id: "presentation" | "pdfBuiltInHelvetica";
  readonly unregisteredFontWidthSafetyFactor: number;
};

export const PRESENTATION_TEXT_MEASUREMENT_PROFILE: TextMeasurementProfile = {
  id: "presentation",
  unregisteredFontWidthSafetyFactor: 1.15,
};

export const PDF_BUILT_IN_HELVETICA_TEXT_MEASUREMENT_PROFILE: TextMeasurementProfile = {
  id: "pdfBuiltInHelvetica",
  unregisteredFontWidthSafetyFactor: 1,
};

import { EMU_PER_INCH } from "@/src/index.ts";
import type {
  ProjectInspectionBackgroundLayerSummary,
  PptxBackgroundLayer,
  PptxPaintOrderInput,
} from "@/src/inspect.ts";
import { Deck, SAMPLE_SVG_DATA_URI, WIDE_SVG_DATA_URI } from "@/tests/helpers.ts";
export type BackgroundLayerExpectation =
  | PptxBackgroundLayer
  | ProjectInspectionBackgroundLayerSummary;
export type BackgroundLayerExpectationWithPaintOrder = BackgroundLayerExpectation & {
  readonly paintOrder?: PptxPaintOrderInput;
};
export function stripBackgroundLayerPaintOrder(
  layers: readonly BackgroundLayerExpectationWithPaintOrder[] | undefined,
): readonly Omit<BackgroundLayerExpectation, "paintOrder">[] | undefined {
  return layers?.map((layer) => {
    const { paintOrder: _paintOrder, ...withoutPaintOrder } = layer;
    return withoutPaintOrder;
  });
}

export { Deck, EMU_PER_INCH, SAMPLE_SVG_DATA_URI, WIDE_SVG_DATA_URI };
export type { PptxBackgroundLayer, PptxPaintOrderInput, ProjectInspectionBackgroundLayerSummary };

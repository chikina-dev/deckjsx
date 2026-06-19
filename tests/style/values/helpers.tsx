import { Deck, EMU_PER_INCH } from "../../../src/index.ts";
import type { PptxBackgroundLayer } from "../../../src/inspect.ts";
export const BACKGROUND_IMAGE_PATH = "/tmp/deckjsx-background.png";
export function stripBackgroundLayerPaintOrder(
  layers: readonly PptxBackgroundLayer[] | undefined,
): readonly Omit<PptxBackgroundLayer, "paintOrder">[] | undefined {
  return layers?.map((layer) => {
    const { paintOrder: _paintOrder, ...withoutPaintOrder } = layer;
    return withoutPaintOrder;
  });
}

export { Deck, EMU_PER_INCH };
export type { PptxBackgroundLayer };

import type { PptxPackageModel } from "../projection/pptx/model";
import type { PptxRenderOptions, WriterAdapter } from "./public";
import { pptxWriterContext } from "./context";
import { renderPptxPackage } from "../writers/pptx";

export type {
  PptxRenderOptions,
  RenderOptions,
  WriterAdapter,
  WriterAdapterResult,
  WriterRenderContext,
} from "./public";

/**
 * Create the built-in PPTX writer adapter.
 *
 * Pass the returned adapter to `deck.render(pptx())` when you want explicit PPTX rendering options.
 * Calling `deck.render()` without an adapter uses the same public writer target. The adapter only
 * consumes projected PPTX document models; authored JSX, style, Theme, and StyleSheet input remain
 * validated at the normal authoring boundary before render starts.
 *
 * @param options - PPTX render options such as inspection detail level.
 * @returns A Writer Adapter that renders projected PPTX models into `.pptx` artifact bytes.
 */
export function pptx(options: PptxRenderOptions = {}): WriterAdapter<PptxPackageModel, "pptx"> {
  return {
    kind: "deckjsx.writerAdapter",
    name: "pptx",
    projectionFormat: "pptx",
    format: "pptx",
    options,
    async render(projection, context) {
      return renderPptxPackage(projection, options, pptxWriterContext(context));
    },
  };
}

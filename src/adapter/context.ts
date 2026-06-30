import type { WriterRenderContext } from "./public";
import type { PptxWriterContext } from "../writers/pptx";

const writerRenderContexts = new WeakMap<WriterRenderContext, PptxWriterContext>();

export function createWriterRenderContext(context: PptxWriterContext): WriterRenderContext {
  const writerContext: WriterRenderContext = {
    kind: "deckjsx.writerRenderContext",
  };
  writerRenderContexts.set(writerContext, context);
  return writerContext;
}

export function pptxWriterContext(
  context: WriterRenderContext | undefined,
): PptxWriterContext | undefined {
  return context ? writerRenderContexts.get(context) : undefined;
}

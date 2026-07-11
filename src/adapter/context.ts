import type { WriterRenderContext } from "./public";
import type { PdfWriterContext } from "../writers/pdf";
import type { PptxWriterContext } from "../writers/pptx";

export type InternalWriterContext = PdfWriterContext & PptxWriterContext;

const writerRenderContexts = new WeakMap<WriterRenderContext, InternalWriterContext>();

export function createWriterRenderContext(context: InternalWriterContext): WriterRenderContext {
  const writerContext: WriterRenderContext = {
    kind: "deckjsx.writerRenderContext",
  };
  writerRenderContexts.set(writerContext, context);
  return writerContext;
}

export function writerContext(
  context: WriterRenderContext | undefined,
): InternalWriterContext | undefined {
  return context ? writerRenderContexts.get(context) : undefined;
}

export function pptxWriterContext(
  context: WriterRenderContext | undefined,
): PptxWriterContext | undefined {
  return writerContext(context);
}

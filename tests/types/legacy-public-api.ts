import { pptxgenjsBackend } from "deckjsx/legacy";
import type { BackendArtifact, CompileBackend, PresentationIR, SlideIR } from "deckjsx/legacy";

const slide = {
  id: "slide-1",
  name: "Legacy slide",
  nodes: [],
} satisfies SlideIR;
void slide;

const presentation = {
  version: "0.1",
  size: { widthEmu: 9_144_000, heightEmu: 5_143_500 },
  slides: [slide],
} satisfies PresentationIR;
void presentation;

const backend = pptxgenjsBackend();
backend satisfies CompileBackend;

const artifact = {
  kind: "buffer",
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  data: new Uint8Array(),
  extension: ".pptx",
} satisfies BackendArtifact;
void artifact;

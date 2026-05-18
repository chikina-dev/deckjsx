import { pptxgenjsBackend } from "./backends/pptxgenjs.js";
import type { BackendName } from "./authoring/index.js";
import type { CompileBackend } from "./ir/index.js";

export function resolveBackend(name: BackendName): CompileBackend {
  if (name === "pptxgenjs") {
    return pptxgenjsBackend();
  }

  throw new Error(`Backend "${name}" is not implemented yet.`);
}

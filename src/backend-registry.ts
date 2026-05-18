import { pptxgenjsBackend } from "./backends/pptxgenjs";
import type { BackendName } from "./authoring/index";
import type { CompileBackend } from "./ir/index";

export function resolveBackend(name: BackendName): CompileBackend {
  if (name === "pptxgenjs") {
    return pptxgenjsBackend();
  }

  throw new Error(`Backend "${name}" is not implemented yet.`);
}

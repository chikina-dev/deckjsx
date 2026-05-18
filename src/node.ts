import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveBackend } from "./backend-registry.js";
import type { OutputConfig } from "./authoring/index.js";
import type { PresentationIR } from "./ir/index.js";

export async function outputPresentation(
  presentation: PresentationIR,
  config: OutputConfig,
): Promise<void> {
  const backend = resolveBackend(config.backend);
  const artifact = await backend.emit(presentation);

  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, artifact.data);
}

import type { PptxPackagePart } from "@/src/projection/pptx/model";

export function packagePartOrderKey(part: PptxPackagePart): string {
  const value = part.orderKey?.value;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Package part ${part.id} must carry a deterministic order key.`);
  }

  return value;
}

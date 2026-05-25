import type { FrameIR } from "../layout/projected";

export type Frame = FrameIR;

export type Placement = {
  xEmu?: number;
  yEmu?: number;
  widthEmu?: number;
  heightEmu?: number;
};

export type ClipRect = Frame;

export function intersectClipRect(frame: Frame, clipRect: ClipRect | undefined): Frame | undefined {
  if (!clipRect) {
    return frame;
  }

  const x1 = Math.max(frame.xEmu, clipRect.xEmu);
  const y1 = Math.max(frame.yEmu, clipRect.yEmu);
  const x2 = Math.min(frame.xEmu + frame.widthEmu, clipRect.xEmu + clipRect.widthEmu);
  const y2 = Math.min(frame.yEmu + frame.heightEmu, clipRect.yEmu + clipRect.heightEmu);
  const widthEmu = x2 - x1;
  const heightEmu = y2 - y1;

  if (widthEmu <= 0 || heightEmu <= 0) {
    return undefined;
  }

  return {
    xEmu: x1,
    yEmu: y1,
    widthEmu,
    heightEmu,
  };
}

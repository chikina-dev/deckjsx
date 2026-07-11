import type { TextRunIR, TextStyleIR, TextTabStopIR } from "@/src/layout/projected";
import { EMU_PER_INCH } from "@/src/types";
import { pointToEmu, writeColor, writeHyperlink } from "./drawing-xml";
import { XmlChunkWriter } from "./xml-writer";

type TextBodyStyle = TextStyleIR & {
  readonly fit: NonNullable<TextStyleIR["fit"]>;
  readonly textDirection: NonNullable<TextStyleIR["textDirection"]>;
  readonly verticalAlign: NonNullable<TextStyleIR["verticalAlign"]>;
  readonly wrap: boolean;
};

function writeTextRunProperties(
  writer: XmlChunkWriter,
  style: TextStyleIR | undefined,
  opacity?: number,
  hyperlink?: { relationshipId?: string; tooltip?: string },
): void {
  writer.open("a:rPr", {
    sz:
      style?.fontSizePt === undefined
        ? undefined
        : Math.round(finiteNonNegativeNumber(style.fontSizePt, "text style.fontSizePt") * 100),
    b: textFontWeightBold(style?.fontWeight) ? 1 : undefined,
    i: style?.italic ? 1 : undefined,
    u: projectedUnderlineStyle(style),
    strike: style?.strike ? "sngStrike" : undefined,
    baseline: style?.superscript ? "30000" : style?.subscript ? "-40000" : undefined,
    spc:
      style?.charSpacing === undefined || style.charSpacing === 0
        ? undefined
        : Math.round(finiteNumber(style.charSpacing, "text style.charSpacing") * 100),
  });

  if (style?.color) {
    writer.open("a:solidFill");
    writeColor(writer, style.color, undefined, opacity);
    writer.close("a:solidFill");
  }
  if (style?.underlineColor) {
    writer.open("a:uFill").open("a:solidFill");
    writeColor(writer, style.underlineColor);
    writer.close("a:solidFill").close("a:uFill");
  }
  if (style?.fontFamily) {
    writer.empty("a:latin", { typeface: style.fontFamily });
  }
  writeHyperlink(writer, hyperlink?.relationshipId, hyperlink?.tooltip);
  writer.close("a:rPr");
}

function projectedUnderlineStyle(style: TextStyleIR | undefined): TextStyleIR["underlineStyle"] {
  if (!style?.underline) {
    return undefined;
  }
  if (!style.underlineStyle) {
    throw new Error("PPTX text XML requires projected text style.underlineStyle.");
  }

  return style.underlineStyle;
}

function writeParagraphProperties(writer: XmlChunkWriter, style: TextStyleIR | undefined): void {
  const listIndent =
    style?.list?.type === "bullet" || style?.list?.type === "number"
      ? optionalPointToEmu(style.list.indentPt, "text style.list.indentPt")
      : undefined;
  const textIndent = optionalPointToEmu(style?.textIndentPt, "text style.textIndentPt");
  const attributes: Record<string, string | number | boolean | undefined> = {
    algn: paragraphAlignment(style?.textAlign),
    rtl: style?.rtlMode ? 1 : undefined,
    ...(listIndent !== undefined
      ? {
          marL: listIndent,
          indent: textIndent === undefined ? -listIndent : textIndent - listIndent,
        }
      : textIndent !== undefined
        ? { indent: textIndent, marL: 0 }
        : {}),
  };

  writer.open("a:pPr", attributes);

  writeParagraphSpacing(writer, style);

  if (style?.tabStops?.length) {
    writer.open("a:tabLst");
    for (const [index, tabStop] of style.tabStops.entries()) {
      writer.empty("a:tab", {
        pos: Math.round(
          finiteNumber(tabStop.positionIn, `text style.tabStops.${index}.positionIn`) *
            EMU_PER_INCH,
        ),
        algn: tabStopAlignment(tabStop.alignment, index),
      });
    }
    writer.close("a:tabLst");
  }

  if (style?.list?.type === "bullet") {
    writer.empty("a:buChar", { char: bulletCharacter(style.list.characterCode) });
  } else if (style?.list?.type === "number") {
    writer.empty("a:buAutoNum", {
      type: numberListStyle(style.list.style),
      startAt:
        style.list.startAt === undefined
          ? undefined
          : finiteNonNegativeNumber(style.list.startAt, "text style.list.startAt"),
    });
  } else if (style?.list?.type === "none") {
    writer.empty("a:buNone");
  } else if (style?.list !== undefined) {
    throw new Error("PPTX text XML requires supported text style.list.type.");
  }

  writer.close("a:pPr");
}

function paragraphAlignment(
  value: TextStyleIR["textAlign"],
): "l" | "ctr" | "r" | "just" | undefined {
  if (value === "left") {
    return "l";
  }
  if (value === "center") {
    return "ctr";
  }
  if (value === "right") {
    return "r";
  }
  if (value === "justify") {
    return "just";
  }
  if (value !== undefined) {
    throw new Error("PPTX text XML requires supported text style.textAlign.");
  }
  return undefined;
}

function writeParagraphSpacing(writer: XmlChunkWriter, style: TextStyleIR | undefined): void {
  if (style?.lineSpacing !== undefined) {
    writer.open("a:lnSpc").empty("a:spcPts", {
      val: Math.round(finiteNonNegativeNumber(style.lineSpacing, "text style.lineSpacing") * 100),
    });
    writer.close("a:lnSpc");
  } else if (style?.lineSpacingMultiple !== undefined) {
    writer.open("a:lnSpc").empty("a:spcPct", {
      val: Math.round(
        finitePositiveNumber(style.lineSpacingMultiple, "text style.lineSpacingMultiple") * 100_000,
      ),
    });
    writer.close("a:lnSpc");
  }

  if (style?.paragraphSpacingBefore !== undefined && style.paragraphSpacingBefore !== 0) {
    writer.open("a:spcBef").empty("a:spcPts", {
      val: Math.round(
        finiteNonNegativeNumber(style.paragraphSpacingBefore, "text style.paragraphSpacingBefore") *
          100,
      ),
    });
    writer.close("a:spcBef");
  }

  if (style?.paragraphSpacingAfter !== undefined && style.paragraphSpacingAfter !== 0) {
    writer.open("a:spcAft").empty("a:spcPts", {
      val: Math.round(
        finiteNonNegativeNumber(style.paragraphSpacingAfter, "text style.paragraphSpacingAfter") *
          100,
      ),
    });
    writer.close("a:spcAft");
  }
}

function bulletCharacter(characterCode: string): string {
  if (!/^[0-9A-Fa-f]+$/.test(characterCode)) {
    throw new Error("PPTX text XML requires valid text style.list.characterCode.");
  }

  const codePoint = Number.parseInt(characterCode, 16);
  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0x20 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    throw new Error("PPTX text XML requires valid text style.list.characterCode.");
  }

  return String.fromCodePoint(codePoint);
}

export function writeTextBody(
  writer: XmlChunkWriter,
  text: string,
  runs: readonly TextRunIR[] | undefined,
  style: TextBodyStyle,
  opacity?: number,
  hyperlink?: { relationshipId?: string; tooltip?: string },
): void {
  requireTextValue(text, "text content.text");
  writer.open("p:txBody").open("a:bodyPr", {
    wrap: textWrap(style.wrap),
    vert: textDirection(style.textDirection),
    anchor: textBodyAnchor(style.verticalAlign),
    ...textBodyInsets(style.paddingPt),
  });

  writeTextFit(writer, style);

  writer.close("a:bodyPr").empty("a:lstStyle").open("a:p");

  writeParagraphProperties(writer, style);

  for (const run of runs && runs.length > 0 ? runs : [{ text, style }]) {
    requireTextValue(run.text, "text content.run.text");
    writer.open("a:r");
    writeTextRunProperties(writer, run.style ?? style, opacity, hyperlink);
    writer.element("a:t", {}, run.text);
    writer.close("a:r");
  }

  writer.close("a:p").close("p:txBody");
}

function textWrap(value: boolean | undefined): "none" | "square" {
  if (value === true) {
    return "square";
  }
  if (value === false) {
    return "none";
  }
  throw new Error("PPTX text XML requires projected text style.wrap.");
}

function textBodyAnchor(value: TextStyleIR["verticalAlign"]): "t" | "ctr" | "b" | undefined {
  if (value === "top") {
    return "t";
  }
  if (value === "middle") {
    return "ctr";
  }
  if (value === "bottom") {
    return "b";
  }
  if (value !== undefined) {
    throw new Error("PPTX text XML requires supported text style.verticalAlign.");
  }
  throw new Error("PPTX text XML requires projected text style.verticalAlign.");
}

function textBodyInsets(value: TextStyleIR["paddingPt"]): {
  tIns: number;
  rIns: number;
  bIns: number;
  lIns: number;
} {
  if (!value) {
    return { tIns: 0, rIns: 0, bIns: 0, lIns: 0 };
  }

  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("PPTX text XML requires text style.paddingPt to contain four values.");
  }

  const [top, right, bottom, left] = value;
  return {
    tIns: textBodyInsetToEmu(top, "text style.paddingPt.0"),
    rIns: textBodyInsetToEmu(right, "text style.paddingPt.1"),
    bIns: textBodyInsetToEmu(bottom, "text style.paddingPt.2"),
    lIns: textBodyInsetToEmu(left, "text style.paddingPt.3"),
  };
}

function textBodyInsetToEmu(value: number | undefined, path: string): number {
  return pointToEmu(finiteNonNegativeNumber(value ?? 0, path)) ?? 0;
}

function writeTextFit(writer: XmlChunkWriter, style: TextBodyStyle): void {
  if (style.fit === "shrink") {
    writer.empty("a:normAutofit");
  } else if (style.fit === "resize") {
    writer.empty("a:spAutoFit");
  } else if (style.fit === "none") {
    return;
  } else if (style.fit !== undefined) {
    throw new Error("PPTX text XML requires supported text style.fit.");
  } else {
    throw new Error("PPTX text XML requires projected text style.fit.");
  }
}

function finiteNumber(value: number | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`PPTX text XML requires finite ${path}.`);
  }

  return value;
}

function finiteNonNegativeNumber(value: number | undefined, path: string): number {
  const number = finiteNumber(value, path);
  if (number < 0) {
    throw new Error(`PPTX text XML requires non-negative ${path}.`);
  }

  return number;
}

function finitePositiveNumber(value: number | undefined, path: string): number {
  const number = finiteNumber(value, path);
  if (number <= 0) {
    throw new Error(`PPTX text XML requires positive ${path}.`);
  }

  return number;
}

function optionalPointToEmu(value: number | undefined, path: string): number | undefined {
  return value === undefined ? undefined : pointToEmu(finiteNumber(value, path));
}

function requireTextValue(value: string, path: string): void {
  if (typeof value !== "string") {
    throw new Error(`PPTX text XML requires string ${path}.`);
  }
}

function textFontWeightBold(value: TextStyleIR["fontWeight"]): boolean {
  if (value === undefined || value === "normal") {
    return false;
  }
  if (value === "bold") {
    return true;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 1 || value > 1000) {
      throw new Error("PPTX text XML requires text style.fontWeight between 1 and 1000.");
    }
    return value >= 600;
  }
  throw new Error("PPTX text XML requires supported text style.fontWeight.");
}

function textDirection(value: TextStyleIR["textDirection"]): "horz" | "vert" | "vert270" {
  if (value === "horz" || value === "vert" || value === "vert270") {
    return value;
  }
  if (value === undefined) {
    throw new Error("PPTX text XML requires projected text style.textDirection.");
  }
  throw new Error("PPTX text XML requires supported text style.textDirection.");
}

function tabStopAlignment(
  value: TextTabStopIR["alignment"],
  index: number,
): "l" | "r" | "ctr" | "dec" | undefined {
  if (value === undefined || value === "l" || value === "r" || value === "ctr" || value === "dec") {
    return value;
  }
  throw new Error(`PPTX text XML requires supported text style.tabStops.${index}.alignment.`);
}

function numberListStyle(
  value: Extract<TextStyleIR["list"], { type: "number" }>["style"],
): "arabicPeriod" | "alphaLcPeriod" | "alphaUcPeriod" | "romanLcPeriod" | "romanUcPeriod" {
  if (
    value === "arabicPeriod" ||
    value === "alphaLcPeriod" ||
    value === "alphaUcPeriod" ||
    value === "romanLcPeriod" ||
    value === "romanUcPeriod"
  ) {
    return value;
  }
  throw new Error("PPTX text XML requires supported text style.list.style.");
}

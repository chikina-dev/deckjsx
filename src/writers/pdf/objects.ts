import { pdfTextEncodingIsSupported, pdfWinAnsiByte } from "../../projection/pdf/text-encoding";

const PDF_NAME_DELIMITERS = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%", "#"]);
const UTF8_ENCODER = new TextEncoder();

export type PdfIndirectObject = {
  readonly id: number;
  readonly body: string | Uint8Array;
};

export function pdfNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  const normalized = value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return normalized === "-0" ? "0" : normalized;
}

export function pdfName(name: string): string {
  const source = name.length > 0 ? name : "Unnamed";
  let encoded = "";

  for (const character of source) {
    const code = character.charCodeAt(0);
    if (code < 0x21 || code > 0x7e || PDF_NAME_DELIMITERS.has(character)) {
      for (const byte of UTF8_ENCODER.encode(character)) {
        encoded += `#${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    } else {
      encoded += character;
    }
  }

  return `/${encoded}`;
}

function pdfOctalEscape(byte: number): string {
  return `\\${byte.toString(8).padStart(3, "0")}`;
}

export function pdfString(value: string): string {
  let encoded = "";

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    const byte =
      codePoint !== undefined && ((codePoint >= 0x00 && codePoint < 0x20) || codePoint === 0x7f)
        ? codePoint
        : (pdfWinAnsiByte(character) ?? 0x3f);
    if (byte === 0x5c) {
      encoded += "\\\\";
    } else if (byte === 0x28) {
      encoded += "\\(";
    } else if (byte === 0x29) {
      encoded += "\\)";
    } else if (byte < 0x20 || byte > 0x7e) {
      encoded += pdfOctalEscape(byte);
    } else {
      encoded += String.fromCharCode(byte);
    }
  }

  return encoded;
}

export function pdfLiteralString(value: string): string {
  return `(${pdfString(value)})`;
}

function pdfUtf16BeHexContent(value: string): string {
  let encoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        encoded += codeUnit.toString(16).toUpperCase().padStart(4, "0");
        encoded += nextCodeUnit.toString(16).toUpperCase().padStart(4, "0");
        index += 1;
      } else {
        encoded += "FFFD";
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      encoded += "FFFD";
    } else {
      encoded += codeUnit.toString(16).toUpperCase().padStart(4, "0");
    }
  }
  return encoded;
}

function pdfUtf16BeHexString(value: string): string {
  return `<FEFF${pdfUtf16BeHexContent(value)}>`;
}

export function pdfUtf16BeHex(value: string): string {
  return `<${pdfUtf16BeHexContent(value)}>`;
}

export function pdfTextString(value: string): string {
  if (pdfTextEncodingIsSupported(value)) {
    return pdfLiteralString(value);
  }

  return pdfUtf16BeHexString(value);
}

const PDF_NAME_DELIMITERS = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%", "#"]);

export type PdfIndirectObject = {
  readonly id: number;
  readonly body: string;
};

export function pdfNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export function pdfName(name: string): string {
  const source = name.length > 0 ? name : "Unnamed";
  let encoded = "";

  for (const character of source) {
    const code = character.charCodeAt(0);
    if (code < 0x21 || code > 0x7e || PDF_NAME_DELIMITERS.has(character)) {
      encoded += `#${code.toString(16).toUpperCase().padStart(2, "0")}`;
    } else {
      encoded += character;
    }
  }

  return `/${encoded}`;
}

export function pdfString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

export function pdfLiteralString(value: string): string {
  return `(${pdfString(value)})`;
}

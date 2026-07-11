const WIN_ANSI_SPECIAL_CODE_POINTS_BY_BYTE = new Map<number, number>([
  [0x80, 0x20ac],
  [0x82, 0x201a],
  [0x83, 0x0192],
  [0x84, 0x201e],
  [0x85, 0x2026],
  [0x86, 0x2020],
  [0x87, 0x2021],
  [0x88, 0x02c6],
  [0x89, 0x2030],
  [0x8a, 0x0160],
  [0x8b, 0x2039],
  [0x8c, 0x0152],
  [0x8e, 0x017d],
  [0x91, 0x2018],
  [0x92, 0x2019],
  [0x93, 0x201c],
  [0x94, 0x201d],
  [0x95, 0x2022],
  [0x96, 0x2013],
  [0x97, 0x2014],
  [0x98, 0x02dc],
  [0x99, 0x2122],
  [0x9a, 0x0161],
  [0x9b, 0x203a],
  [0x9c, 0x0153],
  [0x9e, 0x017e],
  [0x9f, 0x0178],
]);

const WIN_ANSI_SPECIAL_BYTES_BY_CODE_POINT = new Map(
  [...WIN_ANSI_SPECIAL_CODE_POINTS_BY_BYTE].map(([byte, codePoint]) => [codePoint, byte]),
);

export function pdfWinAnsiCodePoint(byte: number): number | undefined {
  if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
    return undefined;
  }
  if ((byte >= 0x20 && byte <= 0x7e) || byte >= 0xa0) {
    return byte;
  }
  return WIN_ANSI_SPECIAL_CODE_POINTS_BY_BYTE.get(byte);
}

export function pdfWinAnsiByte(character: string): number | undefined {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return undefined;
  }

  if (codePoint >= 0x20 && codePoint <= 0x7e) {
    return codePoint;
  }

  if (codePoint >= 0xa0 && codePoint <= 0xff) {
    return codePoint;
  }

  return WIN_ANSI_SPECIAL_BYTES_BY_CODE_POINT.get(codePoint);
}

export function pdfTextEncodingIsSupported(value: string): boolean {
  for (const character of value) {
    if (pdfWinAnsiByte(character) === undefined) {
      return false;
    }
  }

  return true;
}

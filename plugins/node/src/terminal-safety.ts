export function escapeTerminalControlSequences(value: string): string {
  let escaped = "";
  let lastSafeIndex = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (!isTerminalControlCodePoint(codePoint)) {
      continue;
    }
    escaped += value.slice(lastSafeIndex, index);
    escaped += `\\x${codePoint.toString(16).padStart(2, "0")}`;
    lastSafeIndex = index + 1;
  }
  return lastSafeIndex === 0 ? value : escaped + value.slice(lastSafeIndex);
}

function isTerminalControlCodePoint(codePoint: number): boolean {
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}

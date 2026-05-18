export function normalizeHue(value: string): number | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.endsWith("turn")) {
    return Number.parseFloat(trimmed.slice(0, -4)) * 360;
  }

  if (trimmed.endsWith("rad")) {
    return (Number.parseFloat(trimmed.slice(0, -3)) * 180) / Math.PI;
  }

  if (trimmed.endsWith("deg")) {
    return Number.parseFloat(trimmed.slice(0, -3));
  }

  return Number.parseFloat(trimmed);
}

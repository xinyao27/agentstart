// Why: Ghostty allows colors with or without the leading hash.
export const HEX_COLOR_RE = /^#?([0-9a-fA-F]{3}){1,2}$/

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

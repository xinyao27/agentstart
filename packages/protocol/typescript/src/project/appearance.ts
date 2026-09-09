export const REPO_COLORS = [
  '#737373',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#8b5cf6',
  '#ec4899'
] as const

export const DEFAULT_REPO_BADGE_COLOR = REPO_COLORS[0]

const HEX_COLOR_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function normalizeRepoBadgeColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const match = value.trim().match(HEX_COLOR_PATTERN)
  if (!match) {
    return null
  }

  const rawHex = match[1].toLowerCase()
  const hex =
    rawHex.length === 3
      ? rawHex
          .split('')
          .map((part) => part + part)
          .join('')
      : rawHex
  const normalized = `#${hex}`
  return REPO_COLORS.find((repoColor) => repoColor === normalized) ?? normalized
}

export function resolveRepoBadgeColor(value: unknown): string {
  return normalizeRepoBadgeColor(value) ?? DEFAULT_REPO_BADGE_COLOR
}

import { clamp01, round } from './color-values'

// Why: free dragging, colored presets, and grayscale presets use different
// lightness rules even though they share one normalized pad coordinate system.
export type ThemeGradientDotMode = 'wheel' | 'tint' | 'grayscale'

export type ThemeGradientHarmony =
  | 'floating'
  | 'complementary'
  | 'singleAnalogous'
  | 'splitComplementary'
  | 'analogous'
  | 'triadic'

// Why: unit coordinates keep persisted themes stable when the picker is rendered at another size.
export type ThemeGradientDot = {
  x: number
  y: number
  mode: ThemeGradientDotMode
  lightness: number
}

export type ThemeGradientTheme = {
  dots: ThemeGradientDot[]
  harmony: ThemeGradientHarmony
  opacity: number
  texture: number
}

export const THEME_GRADIENT_MAX_DOTS = 3

export const THEME_GRADIENT_OPACITY_RANGE = { min: 0.25, max: 0.9 }

export const DEFAULT_THEME_GRADIENT_OPACITY = 0.4

// Why: an empty dot collection is the persisted off-state, so disabling the theme needs no flag.
export function createEmptyThemeGradient(): ThemeGradientTheme {
  return { dots: [], harmony: 'floating', opacity: DEFAULT_THEME_GRADIENT_OPACITY, texture: 0 }
}

const DOT_MODES: readonly ThemeGradientDotMode[] = ['wheel', 'tint', 'grayscale']

const HARMONIES: readonly ThemeGradientHarmony[] = [
  'floating',
  'complementary',
  'singleAnalogous',
  'splitComplementary',
  'analogous',
  'triadic'
]

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDot(value: unknown): ThemeGradientDot | null {
  if (!isUnknownRecord(value)) {
    return null
  }
  const x = typeof value.x === 'number' ? value.x : Number.NaN
  const y = typeof value.y === 'number' ? value.y : Number.NaN
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  const mode = DOT_MODES.find((candidate) => candidate === value.mode) ?? 'wheel'
  const lightness = typeof value.lightness === 'number' ? value.lightness : 50
  return {
    x: round(clamp01(x), 4),
    y: round(clamp01(y), 4),
    mode,
    lightness: Math.min(100, Math.max(0, Math.round(lightness)))
  }
}

// Why: persisted themes arrive from disk and other clients, so no field is trusted at the boundary.
export function normalizeThemeGradient(value: unknown): ThemeGradientTheme | null {
  if (!isUnknownRecord(value)) {
    return null
  }
  const dots = Array.isArray(value.dots)
    ? value.dots
        .map(normalizeDot)
        .filter((dot): dot is ThemeGradientDot => dot !== null)
        .slice(0, THEME_GRADIENT_MAX_DOTS)
    : []
  if (dots.length === 0) {
    return null
  }
  const harmony = HARMONIES.find((candidate) => candidate === value.harmony) ?? 'floating'
  const opacity =
    typeof value.opacity === 'number' && Number.isFinite(value.opacity)
      ? Math.min(
          THEME_GRADIENT_OPACITY_RANGE.max,
          Math.max(THEME_GRADIENT_OPACITY_RANGE.min, round(value.opacity, 3))
        )
      : DEFAULT_THEME_GRADIENT_OPACITY
  const texture =
    typeof value.texture === 'number' && Number.isFinite(value.texture)
      ? round(clamp01(value.texture), 3)
      : 0
  return { dots, harmony, opacity, texture }
}

export function normalizeThemeGradientsByWorkspace(
  value: unknown
): Record<string, ThemeGradientTheme> {
  if (!isUnknownRecord(value)) {
    return {}
  }
  const next: Record<string, ThemeGradientTheme> = {}
  for (const [workspaceId, theme] of Object.entries(value)) {
    const normalized = normalizeThemeGradient(theme)
    if (normalized) {
      next[workspaceId] = normalized
    }
  }
  return next
}

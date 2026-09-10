import type { ThemeGradientTheme } from '@agentstart/protocol/settings/theme-gradient'

import { readableAccentColor } from './accent-color'
import { rgbToCss, rgbToHex, type Rgb } from './color-space'
import { primaryThemeGradientColor, themeGradientColors } from './pad-geometry'

export type ThemeGradientStyle = {
  backgroundImage: string
  accentColor: string
  surfaceAlpha: number
  tint: number
}

const GRADIENT_ROTATION_DEG = -45
const MAX_GRAIN_OPACITY = 0.35

function grainLayer(texture: number): string | null {
  if (texture <= 0) {
    return null
  }
  const opacity = Math.round(texture * MAX_GRAIN_OPACITY * 1000) / 1000
  // Why: inline SVG turbulence keeps the grain resolution-independent and
  // asset-free; the alpha is baked in because background layers take no opacity.
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg'>` +
    `<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#g)' opacity='${opacity}'/>` +
    `</svg>`
  // Why: percent-encode the whole document — `width='100%'` would otherwise read
  // as an escape sequence and corrupt the data URI.
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

function gradientLayers(colors: readonly Rgb[], opacity: number): string[] {
  const css = colors.map((color) => rgbToCss(color, opacity))
  if (css.length === 1) {
    return [`linear-gradient(${GRADIENT_ROTATION_DEG}deg, ${css[0]} 0%, ${css[0]} 100%)`]
  }
  if (css.length === 2) {
    return [
      `linear-gradient(${GRADIENT_ROTATION_DEG}deg, ${css[1]} 0%, transparent 100%)`,
      `linear-gradient(${GRADIENT_ROTATION_DEG + 180}deg, ${css[0]} 0%, transparent 100%)`
    ].toReversed()
  }
  return [
    `linear-gradient(-5deg, ${css[2]} 10%, transparent 80%)`,
    `radial-gradient(circle at 95% 0%, ${css[1]} 0%, transparent 75%)`,
    `radial-gradient(circle at 0% 0%, ${css[0]} 10%, transparent 70%)`
  ]
}

export function buildThemeGradientStyle(
  theme: ThemeGradientTheme,
  options: { isDarkMode: boolean }
): ThemeGradientStyle | null {
  const colors = themeGradientColors(theme)
  const primary = primaryThemeGradientColor(theme)
  if (colors.length === 0 || !primary) {
    return null
  }
  const layers = gradientLayers(colors, theme.opacity)
  const grain = grainLayer(theme.texture)
  return {
    backgroundImage: [...(grain ? [grain] : []), ...layers].join(', '),
    accentColor: rgbToHex(readableAccentColor(primary, options.isDarkMode, 30)),
    // Why: a stronger gradient needs a thinner sidebar to stay visible, but it
    // must never get transparent enough for sidebar text to compete with it.
    surfaceAlpha: Math.min(0.95, Math.max(0.62, 1 - theme.opacity * 0.45)),
    // Why: surfaces that host content stay opaque and only pick up a hint of the
    // hue, so dialogs and editors read as themed rather than washed out.
    tint: Math.round(theme.opacity * 12 * 10) / 10 / 100
  }
}

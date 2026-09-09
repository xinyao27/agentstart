import type { ThemeGradientTheme } from '@yiru/protocol/settings/theme-gradient'

import { hslToRgb, rgbToCss, rgbToHex, rgbToHsl, type Rgb } from './color-space'
import { primaryThemeGradientColor, themeGradientColors } from './pad-geometry'

export type ThemeGradientStyle = {
  backgroundImage: string
  accentColor: string
  surfaceAlpha: number
  tint: number
}

const GRADIENT_ROTATION_DEG = -45
const MAX_GRAIN_OPACITY = 0.35
const LIGHT_PRIMARY_FOREGROUND_REFERENCE: Rgb = [255, 255, 255]
const DARK_PRIMARY_FOREGROUND_REFERENCE: Rgb = [0, 0, 0]
const MIN_REFERENCE_CONTRAST_RATIO = 6
const ACCENT_LIGHTNESS_SEARCH_STEPS = 12

function relativeLuminance([red, green, blue]: Rgb): number {
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function toAccentColor(color: Rgb, isDarkMode: boolean): Rgb {
  const [hue, saturation, lightness] = rgbToHsl(color)
  const accentSaturation =
    saturation === 0 || isDarkMode ? saturation : Math.min(100, saturation + 30)
  // Why: canonical black/white references keep CSS as the token source; the
  // 6:1 margin remains readable with its near-black/near-white foregrounds.
  const foreground = isDarkMode
    ? DARK_PRIMARY_FOREGROUND_REFERENCE
    : LIGHT_PRIMARY_FOREGROUND_REFERENCE
  const candidate = hslToRgb([hue, accentSaturation, lightness])
  if (contrastRatio(candidate, foreground) >= MIN_REFERENCE_CONTRAST_RATIO) {
    return candidate
  }

  let unsafeLightness = lightness
  let safeLightness = isDarkMode ? 100 : 0
  for (let step = 0; step < ACCENT_LIGHTNESS_SEARCH_STEPS; step += 1) {
    const nextLightness = (unsafeLightness + safeLightness) / 2
    const nextColor = hslToRgb([hue, accentSaturation, nextLightness])
    if (contrastRatio(nextColor, foreground) >= MIN_REFERENCE_CONTRAST_RATIO) {
      safeLightness = nextLightness
    } else {
      unsafeLightness = nextLightness
    }
  }
  return hslToRgb([hue, accentSaturation, safeLightness])
}

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
    accentColor: rgbToHex(toAccentColor(primary, options.isDarkMode)),
    // Why: a stronger gradient needs a thinner sidebar to stay visible, but it
    // must never get transparent enough for sidebar text to compete with it.
    surfaceAlpha: Math.min(0.95, Math.max(0.62, 1 - theme.opacity * 0.45)),
    // Why: surfaces that host content stay opaque and only pick up a hint of the
    // hue, so dialogs and editors read as themed rather than washed out.
    tint: Math.round(theme.opacity * 12 * 10) / 10 / 100
  }
}

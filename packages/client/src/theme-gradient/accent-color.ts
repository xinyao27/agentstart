import { hslToRgb, rgbToHex, rgbToHsl, type Rgb } from './color-space'

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

export function readableAccentColor(color: Rgb, isDarkMode: boolean, saturationBoost = 0): Rgb {
  const [hue, saturation, lightness] = rgbToHsl(color)
  const accentSaturation =
    saturation === 0 || isDarkMode ? saturation : Math.min(100, saturation + saturationBoost)
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

export function systemAccentColor(value: string | null, isDarkMode: boolean): string | null {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
    return null
  }
  const color: Rgb = [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16)
  ]
  return rgbToHex(readableAccentColor(color, isDarkMode))
}

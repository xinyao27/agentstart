import { clamp01, round } from '@agentstart/protocol/settings/color-values'

/** Adapted from an MPL-2.0 gradient generator. */
export type Rgb = readonly [number, number, number]

export type Hsl = readonly [number, number, number]

function hueToChannel(p: number, q: number, offset: number): number {
  let t = offset
  if (t < 0) {
    t += 1
  }
  if (t > 1) {
    t -= 1
  }
  if (t < 1 / 6) {
    return p + (q - p) * 6 * t
  }
  if (t < 1 / 2) {
    return q
  }
  if (t < 2 / 3) {
    return p + (q - p) * (2 / 3 - t) * 6
  }
  return p
}

/** `hue` in degrees, `saturation`/`lightness` in percent. */
export function hslToRgb([hue, saturation, lightness]: Hsl): Rgb {
  const h = (((hue % 360) + 360) % 360) / 360
  const s = clamp01(saturation / 100)
  const l = clamp01(lightness / 100)
  if (s === 0) {
    const value = Math.round(l * 255)
    return [value, value, value]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hueToChannel(p, q, h + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, h) * 255),
    Math.round(hueToChannel(p, q, h - 1 / 3) * 255)
  ]
}

export function rgbToHsl([red, green, blue]: Rgb): Hsl {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let hue = 0
  if (delta !== 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6
    } else if (max === g) {
      hue = (b - r) / delta + 2
    } else {
      hue = (r - g) / delta + 4
    }
  }
  const lightness = (min + max) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  return [(hue * 60 + 360) % 360, saturation * 100, lightness * 100]
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`
}

export function rgbToCss([r, g, b]: Rgb, alpha = 1): string {
  if (alpha >= 1) {
    return `rgb(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)})`
  }
  return `rgba(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)}, ${round(alpha, 3)})`
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

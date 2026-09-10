import type {
  ThemeGradientDot,
  ThemeGradientHarmony,
  ThemeGradientTheme
} from '@agentstart/protocol/settings/theme-gradient'

import { hslToRgb, type Rgb } from './color-space'

const THEME_GRADIENT_HARMONY_ANGLES: Record<ThemeGradientHarmony, readonly number[]> = {
  floating: [],
  complementary: [180],
  singleAnalogous: [310],
  splitComplementary: [150, 210],
  analogous: [50, 310],
  triadic: [120, 240]
}

const CENTER = 0.5

type PolarPosition = { angle: number; distance: number }

function toPolar(dot: Pick<ThemeGradientDot, 'x' | 'y'>): PolarPosition {
  const deltaX = dot.x - CENTER
  const deltaY = dot.y - CENTER
  const angle = ((Math.atan2(deltaY, deltaX) * 180) / Math.PI + 360) % 360
  const distance = Math.min(1, Math.hypot(deltaX, deltaY) / CENTER)
  return { angle, distance }
}

function fromPolar({ angle, distance }: PolarPosition): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180
  const radius = Math.min(1, Math.max(0, distance)) * CENTER
  return { x: CENTER + radius * Math.cos(radians), y: CENTER + radius * Math.sin(radians) }
}

export function colorFromPadPosition(dot: ThemeGradientDot): Rgb {
  const { angle, distance } = toPolar(dot)
  if (dot.mode === 'grayscale') {
    return hslToRgb([0, 0, distance * 100])
  }
  if (dot.mode === 'tint') {
    return hslToRgb([angle, (1 - distance) * 100, dot.lightness])
  }
  // Why: distance doubles as the lightness ramp so a single drag walks the dot
  // from black at the center to white at the rim.
  return hslToRgb([angle, 90 + distance * 10, distance * 100])
}

export function themeGradientColors(theme: ThemeGradientTheme): Rgb[] {
  return theme.dots.map(colorFromPadPosition)
}

export function primaryThemeGradientColor(theme: ThemeGradientTheme): Rgb | null {
  const primary = theme.dots[0]
  return primary ? colorFromPadPosition(primary) : null
}

// Why: regenerating companions from the primary prevents positional drift after repeated moves.
export function applyHarmony(
  dots: readonly ThemeGradientDot[],
  harmony: ThemeGradientHarmony
): ThemeGradientDot[] {
  const primary = dots[0]
  if (!primary) {
    return []
  }
  const offsets = THEME_GRADIENT_HARMONY_ANGLES[harmony]
  if (offsets.length === 0) {
    return [primary]
  }
  const { angle, distance } = toPolar(primary)
  return [
    primary,
    ...offsets.map((offset) => ({
      ...fromPolar({ angle: (angle + offset) % 360, distance }),
      mode: primary.mode,
      lightness: primary.lightness
    }))
  ]
}

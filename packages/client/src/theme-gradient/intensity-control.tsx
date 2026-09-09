import { clamp01 } from '@yiru/protocol/settings/color-values'
import { THEME_GRADIENT_OPACITY_RANGE } from '@yiru/protocol/settings/theme-gradient'
import type React from 'react'
import { useId } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Slider } from '~renderer/ui/slider'

type ThemeGradientIntensityControlProps = {
  value: number
  onChange: (value: number) => void
}

type IntensityStyle = React.CSSProperties & {
  '--theme-intensity-thumb-height': string
  '--theme-intensity-thumb-width': string
}

const LINE_PATH = 'M 51.373 27.395 L 367.037 27.395'
const SINE_PATH =
  'M 51.373 27.395 C 60.14 -8.503 68.906 -8.503 77.671 27.395 C 86.438 63.293 95.205 63.293 103.971 27.395 C 112.738 -8.503 121.504 -8.503 130.271 27.395 C 139.037 63.293 147.803 63.293 156.57 27.395 C 165.335 -8.503 174.101 -8.503 182.868 27.395 C 191.634 63.293 200.4 63.293 209.167 27.395 C 217.933 -8.503 226.7 -8.503 235.467 27.395 C 244.233 63.293 252.999 63.293 261.765 27.395 C 270.531 -8.503 279.297 -8.503 288.064 27.395 C 296.83 63.293 305.596 63.293 314.363 27.395 C 323.13 -8.503 331.896 -8.503 340.662 27.395 M 314.438 27.395 C 323.204 -8.503 331.97 -8.503 340.737 27.395 C 349.503 63.293 358.27 63.293 367.037 27.395'
const REFERENCE_Y = 27.3

function minimumOpacity(): number {
  return navigator.userAgent.includes('Mac') ? 0.3 : THEME_GRADIENT_OPACITY_RANGE.min
}

function intensityProgress(value: number, min: number): number {
  return clamp01((value - min) / (THEME_GRADIENT_OPACITY_RANGE.max - min))
}

function interpolateY(value: number, progress: number): number {
  return REFERENCE_Y + (value - REFERENCE_Y) * progress
}

function wavePath(progress: number): string {
  if (progress <= 0.001) {
    return LINE_PATH
  }
  if (progress >= 0.999) {
    return SINE_PATH
  }
  return [...SINE_PATH.matchAll(/([MC])\s*([^MC]+)/g)]
    .flatMap((match) => {
      const command = match[1]
      const coordinates = match[2]?.trim().split(/\s+/).map(Number) ?? []
      if (command === 'M') {
        return [`M ${coordinates[0]} ${interpolateY(coordinates[1] ?? REFERENCE_Y, progress)}`]
      }
      const curves: string[] = []
      for (let index = 0; index < coordinates.length; index += 6) {
        curves.push(
          `C ${coordinates[index]} ${interpolateY(coordinates[index + 1] ?? REFERENCE_Y, progress)} ` +
            `${coordinates[index + 2]} ${interpolateY(coordinates[index + 3] ?? REFERENCE_Y, progress)} ` +
            `${coordinates[index + 4]} ${interpolateY(coordinates[index + 5] ?? REFERENCE_Y, progress)}`
        )
      }
      return curves
    })
    .join(' ')
}

export function ThemeGradientIntensityControl({
  value,
  onChange
}: ThemeGradientIntensityControlProps): React.JSX.Element {
  const gradientId = useId()
  const controlHeightClass = navigator.userAgent.includes('Mac') ? 'h-24' : 'h-20'
  const min = minimumOpacity()
  const progress = intensityProgress(value, min)
  const style: IntensityStyle = {
    '--theme-intensity-thumb-height': `${40 + progress * 15}px`,
    '--theme-intensity-thumb-width': `${10 + progress * 15}px`
  }

  return (
    <div
      data-theme-intensity
      className={`relative min-w-0 flex-1 ${controlHeightClass}`}
      style={style}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-[-1px] h-full w-[110%] -translate-y-1/2 scale-[1.2] overflow-visible"
        viewBox="0 -7.605 455 70"
        preserveAspectRatio="xMinYMid meet"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--theme-picker-wave-strong)" />
            <stop offset={`${progress * 100}%`} stopColor="var(--theme-picker-wave-strong)" />
            <stop offset={`${progress * 100}%`} stopColor="var(--theme-picker-wave-soft)" />
            <stop offset="100%" stopColor="var(--theme-picker-wave-soft)" />
          </linearGradient>
        </defs>
        <path
          d={wavePath(progress)}
          fill="none"
          stroke={progress <= 0.001 ? 'var(--theme-picker-wave-soft)' : `url(#${gradientId})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="8"
        />
      </svg>
      <Slider
        variant="theme-intensity"
        aria-label={translate('themeGradient.opacity', 'Intensity')}
        className="absolute inset-0 flex items-center px-[5px]"
        min={min}
        max={THEME_GRADIENT_OPACITY_RANGE.max}
        step={0.001}
        value={Math.max(min, value)}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
      />
    </div>
  )
}

import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type {
  ThemeGradientDot,
  ThemeGradientHarmony,
  ThemeGradientTheme
} from '@yiru/protocol/settings/theme-gradient'
import type React from 'react'
import { useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CirclesThree, Minus, Moon, Plus, Sparkle, Sun } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { rgbToCss } from './color-space'
import { applyHarmony, colorFromPadPosition } from './pad-geometry'

type ThemeGradientPadProps = {
  theme: ThemeGradientTheme
  themeMode: GlobalSettings['theme']
  onChange: (theme: ThemeGradientTheme) => void
  onThemeModeChange: (theme: GlobalSettings['theme']) => void
}

type ColorFieldButtonProps = {
  label: string
  icon: React.ReactNode
  disabled?: boolean
  isSelected?: boolean
  onClick: () => void
}

type IdentifiedThemeGradientDot = {
  identity: 'primary' | 'secondary' | 'tertiary'
  dot: ThemeGradientDot
  isPrimary: boolean
}

const KEYBOARD_STEP = 0.02

const TWO_COLOR_HARMONIES: readonly ThemeGradientHarmony[] = ['complementary', 'singleAnalogous']

const THREE_COLOR_HARMONIES: readonly ThemeGradientHarmony[] = [
  'splitComplementary',
  'analogous',
  'triadic'
]

function clampToColorField(position: { x: number; y: number }): { x: number; y: number } {
  const deltaX = position.x - 0.5
  const deltaY = position.y - 0.5
  const distance = Math.hypot(deltaX, deltaY)
  if (distance <= 0.5) {
    return position
  }
  const scale = 0.5 / distance
  return { x: 0.5 + deltaX * scale, y: 0.5 + deltaY * scale }
}

function movePrimaryDot(
  theme: ThemeGradientTheme,
  position: { x: number; y: number }
): ThemeGradientTheme {
  // Why: the first field press creates the primary color instead of leaving an
  // empty theme that cannot be manipulated.
  const primary = theme.dots[0] ?? { x: 0.5, y: 0.5, mode: 'wheel', lightness: 50 }
  const moved: ThemeGradientDot = {
    ...primary,
    ...clampToColorField(position),
    mode: 'wheel'
  }
  return { ...theme, dots: applyHarmony([moved], theme.harmony) }
}

function harmoniesForDotCount(dotCount: number): readonly ThemeGradientHarmony[] {
  if (dotCount === 2) {
    return TWO_COLOR_HARMONIES
  }
  if (dotCount === 3) {
    return THREE_COLOR_HARMONIES
  }
  return ['floating']
}

function identifyThemeGradientDots(
  dots: readonly ThemeGradientDot[]
): IdentifiedThemeGradientDot[] {
  const identifiedDots: IdentifiedThemeGradientDot[] = []
  const primary = dots[0]
  const secondary = dots[1]
  const tertiary = dots[2]
  if (primary) {
    identifiedDots.push({ identity: 'primary', dot: primary, isPrimary: true })
  }
  if (secondary) {
    identifiedDots.push({ identity: 'secondary', dot: secondary, isPrimary: false })
  }
  if (tertiary) {
    identifiedDots.push({ identity: 'tertiary', dot: tertiary, isPrimary: false })
  }
  return identifiedDots
}

function isColorFieldControlEvent(event: React.PointerEvent): boolean {
  return (
    event.target instanceof Element && event.target.closest('[data-color-field-control]') !== null
  )
}

function ColorFieldButton({
  label,
  icon,
  disabled = false,
  isSelected,
  onClick
}: ColorFieldButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            data-color-field-control
            data-theme-color-field-button
            type="button"
            variant="color-field"
            size="icon-palette-control"
            disabled={disabled}
            aria-label={label}
            aria-pressed={isSelected}
            onClick={onClick}
          >
            {icon}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ThemeGradientPad({
  theme,
  themeMode,
  onChange,
  onThemeModeChange
}: ThemeGradientPadProps): React.JSX.Element {
  const padRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const positionFromEvent = (event: React.PointerEvent): { x: number; y: number } => {
    const bounds = padRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      return { x: 0.5, y: 0.5 }
    }
    return clampToColorField({
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height
    })
  }

  const handlePointerDown = (event: React.PointerEvent) => {
    if (isColorFieldControlEvent(event)) {
      return
    }
    event.preventDefault()
    const isPrimaryDot =
      event.target instanceof Element &&
      event.target.closest('[data-theme-color-dot][data-primary="true"]') !== null
    if (!isPrimaryDot) {
      onChange(movePrimaryDot(theme, positionFromEvent(event)))
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragging) {
      return
    }
    onChange(movePrimaryDot(theme, positionFromEvent(event)))
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragging(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) {
      return
    }
    const primary = theme.dots[0]
    if (!primary) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onChange(movePrimaryDot(theme, { x: 0.5, y: 0.5 }))
      }
      return
    }
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -KEYBOARD_STEP],
      ArrowDown: [0, KEYBOARD_STEP],
      ArrowLeft: [-KEYBOARD_STEP, 0],
      ArrowRight: [KEYBOARD_STEP, 0]
    }
    const delta = deltas[event.key]
    if (!delta) {
      return
    }
    event.preventDefault()
    onChange(
      movePrimaryDot(theme, {
        x: primary.x + delta[0],
        y: primary.y + delta[1]
      })
    )
  }

  const addColor = (): void => {
    const nextHarmony = theme.dots.length === 1 ? 'complementary' : 'splitComplementary'
    onChange({
      ...theme,
      harmony: nextHarmony,
      dots: applyHarmony(theme.dots, nextHarmony)
    })
  }

  const removeColor = (): void => {
    if (theme.dots.length <= 1) {
      onChange({ ...theme, harmony: 'floating', dots: [] })
      return
    }
    const nextHarmony = theme.dots.length === 3 ? 'singleAnalogous' : 'floating'
    onChange({
      ...theme,
      harmony: nextHarmony,
      dots: applyHarmony(theme.dots, nextHarmony)
    })
  }

  const cycleHarmony = (): void => {
    const harmonies = harmoniesForDotCount(theme.dots.length)
    const currentIndex = harmonies.indexOf(theme.harmony)
    const harmony = harmonies[(currentIndex + 1) % harmonies.length] ?? harmonies[0]
    onChange({ ...theme, harmony, dots: applyHarmony(theme.dots, harmony) })
  }

  return (
    <div
      ref={padRef}
      data-theme-color-field
      data-dragging={dragging ? 'true' : undefined}
      role="application"
      tabIndex={0}
      aria-label={translate('themeGradient.pad.label', 'Theme color field')}
      className={cn(
        'relative aspect-square w-full max-w-[358px] cursor-crosshair overflow-hidden outline-none',
        'focus-visible:border-ring border border-transparent'
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      <div
        data-color-field-control
        className="absolute top-[15px] left-1/2 z-10 flex -translate-x-1/2 gap-[5px]"
      >
        <ColorFieldButton
          label={translate('themeGradient.scheme.system', 'Follow system appearance')}
          icon={<Sparkle />}
          isSelected={themeMode === 'system'}
          onClick={() => onThemeModeChange('system')}
        />
        <ColorFieldButton
          label={translate('themeGradient.scheme.light', 'Use light appearance')}
          icon={<Sun />}
          isSelected={themeMode === 'light'}
          onClick={() => onThemeModeChange('light')}
        />
        <ColorFieldButton
          label={translate('themeGradient.scheme.dark', 'Use dark appearance')}
          icon={<Moon />}
          isSelected={themeMode === 'dark'}
          onClick={() => onThemeModeChange('dark')}
        />
      </div>

      {theme.dots.length === 0 ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-semibold">
          {translate('themeGradient.pad.clickToAdd', 'Click to add a color')}
        </span>
      ) : null}

      {identifyThemeGradientDots(theme.dots).map(({ identity, dot, isPrimary }) => {
        return (
          <div
            data-theme-color-dot
            data-primary={isPrimary ? 'true' : undefined}
            data-dragging={isPrimary && dragging ? 'true' : undefined}
            key={identity}
            className={cn(
              'absolute z-[2]',
              isPrimary ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
            )}
            style={{
              left: `${dot.x * 100}%`,
              top: `${dot.y * 100}%`,
              width: isPrimary ? '38px' : '24px',
              height: isPrimary ? '38px' : '24px',
              borderWidth: isPrimary ? '6px' : '3px',
              background: rgbToCss(colorFromPadPosition(dot)),
              transform: 'translate(-50%, -50%)',
              zIndex: isPrimary ? 999 : 2
            }}
          />
        )
      })}

      <div
        data-color-field-control
        className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-[5px]"
      >
        <ColorFieldButton
          label={translate('themeGradient.colors.add', 'Add color')}
          icon={<Plus />}
          disabled={theme.dots.length === 0 || theme.dots.length >= 3}
          onClick={addColor}
        />
        <ColorFieldButton
          label={translate('themeGradient.colors.remove', 'Remove color')}
          icon={<Minus />}
          disabled={theme.dots.length === 0}
          onClick={removeColor}
        />
        <ColorFieldButton
          label={translate('themeGradient.colors.harmony', 'Change color harmony')}
          icon={<CirclesThree />}
          disabled={theme.dots.length < 2}
          onClick={cycleHarmony}
        />
      </div>
    </div>
  )
}

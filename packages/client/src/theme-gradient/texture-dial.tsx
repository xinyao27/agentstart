import { clamp01 } from '@agentstart/protocol/settings/color-values'
import type React from 'react'
import { useRef } from 'react'
import { translate } from '~renderer/i18n/i18n'

type ThemeGradientTextureDialProps = {
  value: number
  onChange: (value: number) => void
}

const DOT_COUNT = 16
const KEYBOARD_STEP = 1 / DOT_COUNT

function dialSize(): number {
  return navigator.userAgent.includes('Mac') ? 96 : 80
}

function snapTexture(value: number): number {
  const snapped = Math.round(clamp01(value) * DOT_COUNT) / DOT_COUNT
  return snapped === 1 ? 0 : snapped
}

function valueFromPointer(event: React.PointerEvent, dial: HTMLDivElement): number {
  const bounds = dial.getBoundingClientRect()
  const angle = Math.atan2(
    event.clientY - (bounds.top + bounds.height / 2),
    event.clientX - (bounds.left + bounds.width / 2)
  )
  return snapTexture(((angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2))
}

export function ThemeGradientTextureDial({
  value,
  onChange
}: ThemeGradientTextureDialProps): React.JSX.Element {
  const dialRef = useRef<HTMLDivElement | null>(null)
  const dialSizePx = dialSize()
  // Why: the reference treats rendered width as a radian phase; reducing that phase
  // to one turn preserves its platform-specific starting point without mixing units below.
  const sourceTickRotationOffsetRadians = dialSizePx % (Math.PI * 2)
  const rotation = value * 360 - 90
  const radians = (rotation * Math.PI) / 180
  const handleLeft = dialSizePx / 2 + Math.cos(radians) * (dialSizePx / 2) - 3
  const handleTop = dialSizePx / 2 + Math.sin(radians) * (dialSizePx / 2) - 6

  const updateFromPointer = (event: React.PointerEvent) => {
    const dial = dialRef.current
    if (dial) {
      onChange(valueFromPointer(event, dial))
    }
  }

  const handlePointerDown = (event: React.PointerEvent) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    updateFromPointer(event)
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateFromPointer(event)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      next = value + KEYBOARD_STEP
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      next = value - KEYBOARD_STEP
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = (DOT_COUNT - 1) / DOT_COUNT
    }
    if (next === null) {
      return
    }
    event.preventDefault()
    onChange(snapTexture(next))
  }

  return (
    <div
      ref={dialRef}
      data-theme-texture-dial
      role="slider"
      tabIndex={0}
      aria-label={translate('themeGradient.texture', 'Grain')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="focus-visible:ring-ring relative shrink-0 outline-none focus-visible:ring-1"
      style={{ width: `${dialSizePx}px`, height: `${dialSizePx}px` }}
      onKeyDown={handleKeyDown}
    >
      {Array.from({ length: DOT_COUNT }, (_unused, index) => {
        const dotAngle = (index / DOT_COUNT) * Math.PI * 2 + sourceTickRotationOffsetRadians
        const threshold = ((index + 4) % DOT_COUNT) / DOT_COUNT
        return (
          <span
            data-theme-texture-dot
            key={`texture-${index}`}
            aria-hidden="true"
            className="pointer-events-none absolute size-1 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${Math.cos(dotAngle) * 50 + 50}%`,
              top: `${Math.sin(dotAngle) * 50 + 50}%`,
              opacity: threshold <= value ? 1 : 0.4
            }}
          />
        )
      })}
      <span
        data-theme-texture-center
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 size-[60%] -translate-x-1/2 -translate-y-1/2 border"
      >
        <span data-theme-texture-grain className="absolute inset-0" style={{ opacity: value }} />
      </span>
      <span
        data-theme-texture-handle
        aria-hidden="true"
        className="absolute h-3 w-1.5 cursor-pointer transition-[height] duration-100 hover:h-3.5"
        style={{
          left: `${handleLeft}px`,
          top: `${handleTop}px`,
          transform: `rotate(${rotation + 90}deg)`
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      />
    </div>
  )
}

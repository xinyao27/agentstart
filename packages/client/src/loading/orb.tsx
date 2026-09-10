import {
  isLatticeVariant,
  isMorphVariant,
  isRingVariant,
  type AICSSLoaderVariant
} from '@agentstart/protocol/settings/loader'
import type { CSSProperties } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { getLatticeCells, getMorphDots, getRingDots } from '~renderer/loading/geometry'

import './orbs.css'

const ORB_STAGE_SIZE = 28
const ORB_INITIAL_SCALE = 20 / ORB_STAGE_SIZE

type LoaderOrbProps = {
  variant: AICSSLoaderVariant
}

type OrbStyle = CSSProperties & Record<`--${string}`, string | number>

function useOrbScale(elementRef: React.RefObject<HTMLSpanElement | null>): number {
  const [scale, setScale] = useState(ORB_INITIAL_SCALE)

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) {
      return
    }

    const updateScale = (): void => {
      const bounds = element.getBoundingClientRect()
      const size = Math.min(bounds.width, bounds.height)
      if (size <= 0) {
        return
      }
      const nextScale = size / ORB_STAGE_SIZE
      setScale((currentScale) =>
        Math.abs(currentScale - nextScale) < 0.001 ? currentScale : nextScale
      )
    }
    const observer = new ResizeObserver(updateScale)
    observer.observe(element)
    updateScale()
    return () => observer.disconnect()
  }, [elementRef])

  return scale
}

function customStyle(values: OrbStyle): OrbStyle {
  return values
}

function Lattice({
  variant
}: {
  variant: Extract<AICSSLoaderVariant, `S${number}`>
}): React.JSX.Element {
  const cells = getLatticeCells(variant)
  return (
    <span className="agentstart-loader-orb__lattice" data-variant={variant}>
      {cells.map((cell) => (
        <span
          key={cell.id}
          className="agentstart-loader-orb__cell"
          data-mid={cell.middle ? '' : undefined}
          data-still={cell.still ? '' : undefined}
          style={{
            left: cell.x * 6,
            top: cell.y * 6,
            animationDelay: `${cell.delayMs}ms`
          }}
        />
      ))}
    </span>
  )
}

function Lens({
  variant
}: {
  variant: Extract<AICSSLoaderVariant, `B${number}`>
}): React.JSX.Element {
  return (
    <span className="agentstart-loader-orb__lens" data-variant={variant}>
      <span className="agentstart-loader-orb__shape agentstart-loader-orb__shape-a" />
      <span className="agentstart-loader-orb__shape agentstart-loader-orb__shape-b" />
      <span className="agentstart-loader-orb__shape agentstart-loader-orb__shape-c" />
      {variant === 'B1' ? (
        <span className="agentstart-loader-orb__shape agentstart-loader-orb__shape-d" />
      ) : null}
    </span>
  )
}

function Ring({
  variant
}: {
  variant: Extract<AICSSLoaderVariant, `C${number}`>
}): React.JSX.Element {
  const dots = getRingDots(variant)
  return (
    <span className="agentstart-loader-orb__ring" data-variant={variant}>
      {dots.map((dot) => (
        <span
          key={dot.id}
          className="agentstart-loader-orb__ring-dot"
          style={customStyle({
            '--orb-rx': `${dot.x}px`,
            '--orb-ry': `${dot.y}px`,
            animationDelay: `${dot.delayMs}ms`
          })}
        />
      ))}
    </span>
  )
}

function Morph({
  variant
}: {
  variant: Extract<AICSSLoaderVariant, `M${number}`>
}): React.JSX.Element {
  const dots = getMorphDots(variant)
  return (
    <span className="agentstart-loader-orb__morph" data-variant={variant}>
      {dots.map((dot) => (
        <span
          key={dot.id}
          className="agentstart-loader-orb__morph-dot"
          style={customStyle({
            '--m-1': `${dot.points[0][0]}px, ${dot.points[0][1]}px`,
            '--m-2': `${dot.points[1][0]}px, ${dot.points[1][1]}px`,
            '--m-3': `${dot.points[2][0]}px, ${dot.points[2][1]}px`,
            '--m-4': `${dot.points[3][0]}px, ${dot.points[3][1]}px`,
            '--m-depth': dot.depth,
            animationDelay: `${dot.delayMs}ms`
          })}
        />
      ))}
    </span>
  )
}

function OrbGeometry({ variant }: LoaderOrbProps): React.JSX.Element {
  if (isLatticeVariant(variant)) {
    return <Lattice variant={variant} />
  }
  if (isRingVariant(variant)) {
    return <Ring variant={variant} />
  }
  if (isMorphVariant(variant)) {
    return <Morph variant={variant} />
  }
  return <Lens variant={variant} />
}

export function LoaderOrb({ variant }: LoaderOrbProps): React.JSX.Element {
  const glyphRef = useRef<HTMLSpanElement>(null)
  const scale = useOrbScale(glyphRef)

  return (
    <span className="agentstart-loader-orb" aria-hidden="true">
      <span
        ref={glyphRef}
        className="agentstart-loader-orb__glyph"
        style={customStyle({ '--orb-k': scale })}
      >
        <OrbGeometry variant={variant} />
      </span>
    </span>
  )
}

import * as React from 'react'

import { cn } from '../../../ui/class-names'

/**
 * ClaudeHeader — Claude Code's welcome box.
 *
 * The title-in-the-border is a real <fieldset>/<legend>, so it stays semantic
 * and inherits whatever background it sits on. The logo is Claude Code's own
 * pixel sprite, but drawn as a crisp SVG grid instead of quadrant-block glyphs
 * — no font seams, scales cleanly.
 *
 * Vendored from https://brainless.swerdlow.dev/r/claude-header.json. Two edits:
 * colours read the --claude-* variables in index.css so the box survives this
 * page's light theme, and passing no tips and no what's-new drops the second
 * column entirely — the demo pane is a few hundred pixels wide, and the two-up
 * grid does not fit there.
 */
const ROSE = 'var(--claude-rose)'
const GRAY = 'var(--claude-gray)'

// Claude's launch sprite as a 1-bit bitmap (decoded from the terminal glyphs).
const LOGO_BITS = [
  '000111111111111000',
  '000110111111011000',
  '011111111111111110',
  '000111111111111000',
  '000010100001010000'
]

export function ClaudeLogo({
  scale = 4,
  color = ROSE,
  className
}: {
  scale?: number
  color?: string
  className?: string
}) {
  const w = LOGO_BITS[0].length
  const h = LOGO_BITS.length
  // Terminal char cells are taller than wide, so each sprite pixel is stretched
  // vertically (PH) to keep the logo's proportions instead of looking squat.
  const PH = 2.4
  const rects: React.ReactElement[] = []
  LOGO_BITS.forEach((row, y) => {
    let x = 0
    while (x < w) {
      if (row[x] === '1') {
        let end = x
        while (end < w && row[end] === '1') {
          end += 1
        }
        rects.push(<rect key={`${x}-${y}`} x={x} y={y * PH} width={end - x} height={PH} />)
        x = end
      } else {
        x += 1
      }
    }
  })
  return (
    <svg
      aria-hidden
      width={w * scale}
      height={h * PH * scale}
      viewBox={`0 0 ${w} ${h * PH}`}
      shapeRendering="crispEdges"
      fill={color}
      className={className}
    >
      {rects}
    </svg>
  )
}

// Why: hoisted out of the parameter list because a literal default is a fresh
// array on every render, which the react lint rule rejects — the upstream file
// declares them inline.
const DEFAULT_TIPS = ['Ask Claude to create a new app or clone a repo']
const DEFAULT_WHATS_NEW = [
  'Added directory path suggestions to /cd',
  'Added a /doctor check that proposes trims'
]

export function ClaudeHeader({
  version = 'v2.1.206',
  user = 'Ben',
  model = 'Fable 5 with xhigh effort · Claude Max',
  org = "ben@freestyle.sh's Organization",
  cwd = '~/dev/brainless',
  tips = DEFAULT_TIPS,
  whatsNew = DEFAULT_WHATS_NEW,
  logoScale = 4,
  className
}: {
  version?: string
  user?: string
  model?: string
  org?: string
  cwd?: string
  tips?: string[]
  whatsNew?: string[]
  logoScale?: number
  className?: string
}) {
  const hasAside = tips.length > 0 || whatsNew.length > 0

  return (
    <fieldset
      className={cn(
        'min-w-0 rounded-[6px] border px-3 pt-1 pb-3.5 font-mono text-[13px] leading-[1.5] sm:px-4',
        className
      )}
      style={{ borderColor: ROSE, color: 'var(--claude-fg)' }}
    >
      <legend className="max-w-full truncate px-2" style={{ color: ROSE }}>
        Claude Code <span style={{ color: GRAY }}>{version}</span>
      </legend>

      <div
        className={cn(
          'grid min-w-0 gap-4',
          hasAside && 'sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1.1fr)]'
        )}
      >
        {/* left: identity */}
        <div className="flex min-w-0 flex-col items-center gap-2 py-1 text-center">
          <div className="font-semibold">Welcome back {user}!</div>
          <ClaudeLogo scale={logoScale} className="my-1.5" />
          <div className="min-w-0 space-y-0.5 break-words" style={{ color: GRAY }}>
            <div>{model}</div>
            {org ? <div>{org}</div> : null}
            <div>{cwd}</div>
          </div>
        </div>

        {hasAside ? (
          <>
            <div
              aria-hidden
              className="hidden sm:block"
              style={{ background: ROSE, opacity: 0.33 }}
            />

            {/* right: tips + what's new */}
            <div className="min-w-0 space-y-1">
              {tips.length > 0 ? (
                <>
                  <div className="font-semibold" style={{ color: ROSE }}>
                    Tips for getting started
                  </div>
                  {tips.map((t) => (
                    <div key={t} className="truncate">
                      {t}
                    </div>
                  ))}
                </>
              ) : null}
              {tips.length > 0 && whatsNew.length > 0 ? (
                <div className="my-1.5 h-px" style={{ background: ROSE }} />
              ) : null}
              {whatsNew.length > 0 ? (
                <>
                  <div className="font-semibold" style={{ color: ROSE }}>
                    What&apos;s new
                  </div>
                  {whatsNew.map((t) => (
                    <div key={t} className="truncate">
                      {t}
                    </div>
                  ))}
                  <div className="truncate italic" style={{ color: GRAY }}>
                    /release-notes for more
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </fieldset>
  )
}

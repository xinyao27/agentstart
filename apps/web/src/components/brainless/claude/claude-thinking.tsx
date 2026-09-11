import * as React from 'react'

import { cn } from '../../../ui/class-names'

/**
 * ClaudeThinking — Claude Code's "working" line.
 *
 * A pulsing sparkle glyph, a whimsical verb, and a live elapsed / interrupt
 * hint. The verb carries Claude's understated shimmer: a lighter highlight
 * drifts across the terracotta word like a gradient wave (done with
 * background-clip: text so the DOM text stays selectable and announced). The
 * whole line is a polite live region for screen readers.
 *
 * Vendored from https://brainless.swerdlow.dev/r/claude-thinking.json. Two
 * deliberate divergences, both so the component can sit inside this page:
 * colours come from the --claude-* variables in index.css rather than the
 * shipped dark-terminal constants, and the font stack and size moved out of the
 * inline style into classes, so `className` can shrink the line for the phone —
 * an inline style would outrank whatever the caller passes.
 */
// Captured cycle from claude/thinking frames: · ✢ ✳ ✶ ✻ ✽ ✻ ✶ ✳ ✢
const GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const VERBS = [
  'Thinking',
  'Levitating',
  'Schlepping',
  'Herding',
  'Percolating',
  'Noodling',
  'Conjuring'
]

const CLAUDE = 'var(--claude-rose)' // terracotta base
const HILITE = 'var(--claude-hilite)' // the highlight the wave carries
const DIM = 'var(--claude-dim)'

export function ClaudeThinking({
  running = true,
  verbs = VERBS,
  showTokens = true,
  className
}: {
  running?: boolean
  verbs?: string[]
  showTokens?: boolean
  className?: string
}) {
  const prefersReduced = usePrefersReducedMotion()
  const [glyph, setGlyph] = React.useState(0)
  const [verbIdx, setVerbIdx] = React.useState(0)
  const [secs, setSecs] = React.useState(0)

  React.useEffect(() => {
    if (!running || prefersReduced) {
      return
    }
    const id = setInterval(() => setGlyph((g) => (g + 1) % GLYPHS.length), 110)
    return () => clearInterval(id)
  }, [running, prefersReduced])

  React.useEffect(() => {
    if (!running) {
      return
    }
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  React.useEffect(() => {
    if (!running) {
      return
    }
    // Verbs change slowly, like the real thing — not every second.
    const id = setInterval(() => setVerbIdx((v) => (v + 1) % verbs.length), 5200)
    return () => clearInterval(id)
  }, [running, verbs.length])

  if (!running) {
    return null
  }

  const verb = verbs[verbIdx % verbs.length]
  const tokens = showTokens ? ` · ↑ ${Math.max(0, secs * 137)} tokens` : ''

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center gap-2 font-mono text-[13px]', className)}
    >
      <style>{`
        .cw-verb {
          background-image: linear-gradient(100deg, ${CLAUDE} 43%, ${HILITE} 50%, ${CLAUDE} 57%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          animation: cw-shine 2.8s linear infinite;
        }
        @keyframes cw-shine {
          from { background-position: 100% 0; }
          to   { background-position: -100% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cw-verb {
            animation: none;
            background-image: none;
            color: ${CLAUDE};
            -webkit-text-fill-color: ${CLAUDE};
          }
        }
      `}</style>
      <span aria-hidden style={{ color: CLAUDE, width: '1ch', display: 'inline-block' }}>
        {prefersReduced ? '✳' : GLYPHS[glyph]}
      </span>
      <span className="cw-verb">{verb}…</span>
      <span style={{ color: DIM }}>
        ({secs}s{tokens} · esc to interrupt)
      </span>
    </div>
  )
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  mediaQuery.addEventListener('change', onChange)
  return () => mediaQuery.removeEventListener('change', onChange)
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribeToReducedMotion, getReducedMotionSnapshot, () => false)
}

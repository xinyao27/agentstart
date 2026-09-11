import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { Controls } from './controls'
import type { DemoState } from './state'
import { frameIndexAt, stateAtFrame, TOTAL_MS } from './timeline'
import { WorkspaceWindow } from './workspace-window'

/**
 * Why: the window's min-content width used to propagate out to `main`, which then
 * grew past the viewport and sliced the page's prose at the right edge on every
 * phone in common use — and the mobile rendering is the one Google indexes.
 *
 * Three things cooperate to fix that without hiding any of the animation, which
 * is the whole point of the demo:
 *
 * - `--demo-zoom` (index.css) shrinks the window to fit, layout and all.
 * - The negative margin below the sm breakpoint cancels the body's side padding,
 *   buying back 48px so the zoom steps can stay as close to 1 as possible.
 * - The 343px floor holds the window at the width it settles to when nothing
 *   squeezes it, so zoom is the only thing that ever shrinks it. The window sets
 *   `min-w-0` on itself, so without a floor the panes squash instead. It has to be
 *   a pixel value: `min-width: min-content` resolves to the *unsquashed* intrinsic
 *   width of all that nowrap pane text, which measures 638-817px depending on the
 *   frame — far wider than the window ever renders.
 *
 *   That makes it a measured number, and it moves: it was 460px until the session
 *   view was rewritten. It is paired with the zoom steps in index.css and the two
 *   have to be re-measured together, which is what the scroll track below buys
 *   time for.
 * - `overflow-x-auto` is the safety net, and the reason both numbers are allowed to
 *   be approximate: if `zoom` is unsupported, or the demo's geometry outgrows what
 *   a step assumed, the demo scrolls in its own track and the page still never
 *   scrolls sideways.
 */
function DemoWindow({ state }: { state: DemoState }): React.JSX.Element {
  return (
    <div className="overflow-x-auto max-sm:-mx-6">
      <div className="flex min-w-[343px] [zoom:var(--demo-zoom,1)]">
        <WorkspaceWindow state={state} />
      </div>
    </div>
  )
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// Why: an empty subscribe never notifies, so this reads false while the
// prerendered markup is being matched and true on the pass right after — the
// effect-free way to gate browser-only rendering, which section 5 of AGENTS.md
// requires over the useState+useEffect form.
const neverNotifies = (): (() => void) => () => {}

function useHydrated(): boolean {
  return useSyncExternalStore(
    neverNotifies,
    () => true,
    () => false
  )
}

const ignoreStillControl = (): void => {}

/**
 * Why: the player cannot be prerendered as-is — a reduced-motion visitor opens
 * on the *last* frame, which no build-time render can know, and that is a
 * hydration mismatch. Both sides render the opening frame instead, so the markup
 * matches exactly, the demo is in the served HTML for crawlers to read, and the
 * swap to the live player costs no layout shift.
 */
export function Demo(): React.JSX.Element {
  return useHydrated() ? <DemoPlayer /> : <DemoStill />
}

function DemoStill(): React.JSX.Element {
  return (
    <div>
      <DemoWindow state={stateAtFrame(frameIndexAt(0))} />
      <Controls
        playing={false}
        elapsed={0}
        onToggle={ignoreStillControl}
        onSeek={ignoreStillControl}
        onReset={ignoreStillControl}
      />
    </div>
  )
}

function DemoPlayer(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef(0)
  const lastTickRef = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(() => (prefersReducedMotion() ? TOTAL_MS : 0))
  const [playing, setPlaying] = useState(false)

  // Why: the fold only has to rerun when a frame boundary is crossed, so
  // scrubbing at 60fps costs a comparison rather than a rebuild.
  const state = useMemo(() => stateAtFrame(frameIndexAt(elapsed)), [elapsed])

  const stop = useCallback(() => {
    setPlaying(false)
    lastTickRef.current = null
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [])

  const start = useCallback(() => {
    if (frameRef.current) {
      return
    }
    setPlaying(true)
    lastTickRef.current = null
    const tick = (timestamp: number): void => {
      const previous = lastTickRef.current
      lastTickRef.current = timestamp
      if (previous !== null) {
        const delta = timestamp - previous
        setElapsed((current) => (current + delta) % TOTAL_MS)
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          start()
        } else {
          stop()
        }
      },
      { threshold: 0.2 }
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      stop()
    }
  }, [start, stop])

  const handleToggle = useCallback(() => {
    if (frameRef.current) {
      stop()
    } else {
      start()
    }
  }, [start, stop])

  const handleSeek = useCallback(
    (ms: number) => {
      stop()
      setElapsed(Math.max(0, Math.min(ms, TOTAL_MS)))
    },
    [stop]
  )

  const handleReset = useCallback(() => {
    stop()
    setElapsed(0)
    start()
  }, [start, stop])

  return (
    <div ref={containerRef}>
      <DemoWindow state={state} />
      <Controls
        playing={playing}
        elapsed={elapsed}
        onToggle={handleToggle}
        onSeek={handleSeek}
        onReset={handleReset}
      />
    </div>
  )
}

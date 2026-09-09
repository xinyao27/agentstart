import { brandEphemeralSetupTerminalWorktreeId } from '@yiru/protocol/terminal/setup-identity'
import type { KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  PASTE_TERMINAL_TEXT_EVENT,
  type PasteTerminalTextDetail
} from '~renderer/constants/terminal'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'
import TerminalPane from '~renderer/terminal-pane/terminal-pane'
import { cn } from '~renderer/ui/class-names'

const ONBOARDING_INLINE_TERMINAL_WORKTREE_ID = 'onboarding-inline-terminal'
const AUTO_INSERT_DELAY_MS = 250
const READY_RETRY_MS = 100
// Why: PTY startup can fail before [data-pty-id] appears; cap polling so the
// setup panel does not leave a hidden retry timer alive forever.
export const READY_MAX_ATTEMPTS = 50
const PTY_TEXT_FALLBACK_MS = 750

type OnboardingInlineCommandTerminalProps = {
  command: string
  title: string
  description?: string
  ariaLabel: string
  terminalHeightPx?: number
  terminalTopMarginPx?: number
  descriptionPaddingClassName?: string
  autoScrollIntoView?: boolean
  worktreeId?: string
  shellOverride?: string
  onOpened?: () => void
  onInteracted?: (method: 'keyboard' | 'pointer', event?: KeyboardEvent<HTMLElement>) => void
  onTerminalExit?: () => void
}

/**
 * Inline pane that runs a one-off setup command (skill install, feature tip) in an
 * ephemeral floating-scoped terminal, auto-inserting the command once the PTY is ready.
 */
export function OnboardingInlineCommandTerminal({
  command,
  title,
  description,
  ariaLabel,
  terminalHeightPx = 280,
  terminalTopMarginPx = 20,
  descriptionPaddingClassName = 'px-4 py-3',
  autoScrollIntoView = true,
  worktreeId: worktreeIdProp = ONBOARDING_INLINE_TERMINAL_WORKTREE_ID,
  shellOverride,
  onOpened,
  onInteracted,
  onTerminalExit
}: OnboardingInlineCommandTerminalProps): React.JSX.Element {
  // Why: brand the id so a remote runtime resolves this ephemeral terminal to
  // its own home directory instead of rejecting the synthetic id.
  const worktreeId = (() => brandEphemeralSetupTerminalWorktreeId(worktreeIdProp))()
  const createTab = useAppStore((s) => s.createTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const setActiveTabForWorktree = useAppStore((s) => s.setActiveTabForWorktree)
  const setTabCustomTitle = useAppStore((s) => s.setTabCustomTitle)
  const prefersReducedMotion = (() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches)()
  const [tabId, setTabId] = useState<string | null>(null)
  // Why: starts at `prefersReducedMotion` so users opted out of motion never
  // see the slide-in frame; otherwise we flip to true after first paint so the
  // CSS transition has a starting state to interpolate from.
  const [entered, setEntered] = useState(prefersReducedMotion)
  const terminalSectionRef = useRef<HTMLElement>(null)
  const autoInsertedRef = useRef<string | null>(null)

  useEffect(() => {
    onOpened?.()
  }, [onOpened])

  useEffect(() => {
    let cancelled = false
    const tab = createTab(worktreeId, undefined, shellOverride, {
      activate: false,
      recordInteraction: false
    })
    setActiveTabForWorktree(worktreeId, tab.id)
    setTabCustomTitle(tab.id, title, { recordInteraction: false })
    queueMicrotask(() => {
      if (!cancelled) {
        setTabId(tab.id)
      }
    })
    return () => {
      cancelled = true
      // Why: inline setup panels can disappear after detection succeeds; close
      // the backing tab so installer shells do not keep running invisibly.
      closeTab(tab.id, { recordInteraction: false, reason: 'cleanup' })
    }
  }, [
    closeTab,
    createTab,
    setActiveTabForWorktree,
    setTabCustomTitle,
    shellOverride,
    title,
    worktreeId
  ])

  useEffect(() => {
    if (!autoScrollIntoView) {
      return undefined
    }
    if (prefersReducedMotion) {
      const scrollFrame = window.requestAnimationFrame(() => {
        terminalSectionRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' })
      })
      return () => window.cancelAnimationFrame(scrollFrame)
    }
    // Why: double rAF guarantees the browser commits the initial collapsed
    // styles before we flip to `entered`, so the height/opacity transition
    // actually plays instead of snapping straight to the final state.
    let enteredFrame: number | null = null
    const enterFrame = window.requestAnimationFrame(() => {
      enteredFrame = window.requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      window.cancelAnimationFrame(enterFrame)
      if (enteredFrame !== null) {
        window.cancelAnimationFrame(enteredFrame)
      }
    }
  }, [autoScrollIntoView, prefersReducedMotion])

  useEffect(() => {
    if (autoScrollIntoView) {
      return undefined
    }
    let enteredFrame: number | null = null
    const enterFrame = window.requestAnimationFrame(() => {
      enteredFrame = window.requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      window.cancelAnimationFrame(enterFrame)
      if (enteredFrame !== null) {
        window.cancelAnimationFrame(enteredFrame)
      }
    }
  }, [autoScrollIntoView])

  // Why: tracking scroll *during* the height transition is unavoidably
  // jumpy — ResizeObserver / rAF ticks land in pixel-sized chunks, and each
  // chunk reads as a step. Instead, let the section grow in place, then once
  // the height has nearly settled fire a single native smooth scroll. The
  // browser eases that scroll itself, which is the smoothest path available.
  useEffect(() => {
    if (!autoScrollIntoView || !entered || prefersReducedMotion) {
      return
    }
    const section = terminalSectionRef.current
    if (!section) {
      return
    }
    const scrollTimer = window.setTimeout(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 500)
    return () => window.clearTimeout(scrollTimer)
  }, [autoScrollIntoView, entered, prefersReducedMotion])

  const insertCommand = useEventCallback(() => {
    if (!tabId) {
      return
    }
    if (autoScrollIntoView) {
      terminalSectionRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'nearest'
      })
    }
    window.dispatchEvent(
      new CustomEvent<PasteTerminalTextDetail>(PASTE_TERMINAL_TEXT_EVENT, {
        detail: {
          tabId,
          text: command.trim()
        }
      })
    )
    focusTerminalTabSurface(tabId)
  })

  useEffect(() => {
    if (!tabId || autoInsertedRef.current === command) {
      return
    }
    let canceled = false
    let insertionTimer: number | null = null
    let retryTimer: number | null = null
    let ptyFirstSeenAt: number | null = null

    const scheduleInsert = (): void => {
      if (insertionTimer !== null) {
        return
      }
      insertionTimer = window.setTimeout(() => {
        if (!canceled) {
          autoInsertedRef.current = command
          insertCommand()
        }
      }, AUTO_INSERT_DELAY_MS)
    }

    const waitForTerminal = (attempt: number): void => {
      if (canceled) {
        return
      }
      const terminalElement = findTerminalTabElement(tabId)
      const hasPty = Boolean(terminalElement?.querySelector('[data-pty-id]'))
      if (terminalReadyForCommand(terminalElement)) {
        scheduleInsert()
        return
      }
      if (hasPty) {
        ptyFirstSeenAt ??= Date.now()
        // Why: GPU/canvas terminal renderers may not expose visible prompt text
        // in .xterm-rows. Once the PTY has settled briefly, paste the draft
        // instead of waiting on a DOM signal that may never arrive.
        if (Date.now() - ptyFirstSeenAt >= PTY_TEXT_FALLBACK_MS) {
          scheduleInsert()
          return
        }
      } else {
        ptyFirstSeenAt = null
      }
      const nextAttempt = getNextTerminalReadyRetryAttempt(attempt)
      if (nextAttempt !== null) {
        retryTimer = window.setTimeout(() => waitForTerminal(nextAttempt), READY_RETRY_MS)
      }
    }

    waitForTerminal(0)
    return () => {
      canceled = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
      if (insertionTimer !== null) {
        window.clearTimeout(insertionTimer)
      }
    }
  }, [command, insertCommand, tabId])

  // Why: grid 0fr → 1fr animates to the child's natural height without a
  // hardcoded max-height, so we don't leave dead space if the terminal
  // section's intrinsic size shifts. The inner section is positioned via the
  // grid row, so xterm.js measures its real container on mount.
  return (
    <div
      aria-hidden={!entered}
      className="grid transition-[grid-template-rows,opacity,margin-top] duration-[700ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
      style={{
        gridTemplateRows: entered ? '1fr' : '0fr',
        opacity: entered ? 1 : 0,
        marginTop: entered ? terminalTopMarginPx : 0
      }}
    >
      <section
        ref={terminalSectionRef}
        aria-label={ariaLabel}
        className="border-border bg-card min-h-0 overflow-hidden border"
      >
        {description ? (
          <div className={cn('border-b border-border', descriptionPaddingClassName)}>
            <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
          </div>
        ) : null}
        <div
          className="bg-background relative min-h-0"
          style={{ height: terminalHeightPx }}
          onKeyDownCapture={(event) => onInteracted?.('keyboard', event)}
          onPointerDownCapture={() => onInteracted?.('pointer')}
        >
          {tabId ? (
            <TerminalPane
              tabId={tabId}
              worktreeId={worktreeId}
              isActive
              isVisible
              showSplitButton={false}
              onPtyExit={() => {
                onTerminalExit?.()
                closeTab(tabId, { recordInteraction: false, reason: 'pty-exit' })
              }}
              onCloseTab={() => closeTab(tabId, { recordInteraction: false, reason: 'cleanup' })}
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-xs">
              <LoadingIndicator className="size-4" />
              {translate(
                'auto.components.onboarding.OnboardingInlineCommandTerminal.4123609efd',
                'Starting terminal...'
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function findTerminalTabElement(tabId: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>('[data-terminal-tab-id]')) {
    if (element.dataset.terminalTabId === tabId) {
      return element
    }
  }
  return null
}

export function getNextTerminalReadyRetryAttempt(attempt: number): number | null {
  return attempt < READY_MAX_ATTEMPTS ? attempt + 1 : null
}

function terminalReadyForCommand(element: HTMLElement | null): boolean {
  if (!element?.querySelector('[data-pty-id]')) {
    return false
  }
  // Why: pasting before the login shell renders a prompt can double-echo the
  // draft command. Visible terminal text is the least intrusive readiness signal.
  const renderedText = element.querySelector('.xterm-rows')?.textContent?.trim() ?? ''
  return renderedText.length > 0
}

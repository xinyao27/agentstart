import { keybindingMatchesAction, type KeybindingOverrides } from '@yiru/protocol/keybindings'
import { useEffect } from 'react'

import type { PaneManager } from './pane-manager/pane-manager'
import type { PtyTransport } from './pty/transport-types'
import { createTerminalPanePasteActions } from './terminal-pane-paste-actions'

type TerminalPanePasteInput = {
  containerRef: React.RefObject<HTMLDivElement | null>
  forceBracketedMultilineTextPaste: boolean
  isActive: boolean
  keybindings?: KeybindingOverrides
  managerRef: React.RefObject<PaneManager | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  tabId: string
  worktreeId: string
}

function getShortcutPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
}

function shouldSuppressNativePaste(event: KeyboardEvent, isMac: boolean): boolean {
  const key = event.key.toLowerCase()
  return (
    (isMac && key === 'v' && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) ||
    (!isMac && key === 'v' && event.ctrlKey && !event.metaKey && !event.altKey) ||
    (!isMac &&
      event.key === 'Insert' &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey)
  )
}

export function useTerminalPanePaste({
  containerRef,
  forceBracketedMultilineTextPaste,
  isActive,
  keybindings,
  managerRef,
  paneTransportsRef,
  tabId,
  worktreeId
}: TerminalPanePasteInput): void {
  useEffect(() => {
    if (!isActive) {
      return
    }
    const container = containerRef.current
    if (!container) {
      return
    }

    const shortcutPlatform = getShortcutPlatform()
    const isMac = shortcutPlatform === 'darwin'
    const { pasteFromClipboard } = createTerminalPanePasteActions({
      forceBracketedMultilineTextPaste,
      managerRef,
      paneTransportsRef,
      shortcutPlatform,
      tabId,
      worktreeId
    })
    const getActivePane = () => {
      const manager = managerRef.current
      return manager?.getActivePane() ?? manager?.getPanes()[0] ?? null
    }
    let suppressNextNativePaste = false
    let pasteSuppressionTimerId: number | null = null
    const suppressNativePasteOnce = (): void => {
      suppressNextNativePaste = true
      if (pasteSuppressionTimerId !== null) {
        window.clearTimeout(pasteSuppressionTimerId)
      }
      pasteSuppressionTimerId = window.setTimeout(() => {
        pasteSuppressionTimerId = null
        suppressNextNativePaste = false
      }, 0)
    }
    const onKeyPaste = (event: KeyboardEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-terminal-search-root]')) {
        return
      }
      const matchesPaste = keybindingMatchesAction(
        'terminal.paste',
        event,
        shortcutPlatform,
        keybindings,
        { context: 'terminal' }
      )
      if (!matchesPaste) {
        if (shouldSuppressNativePaste(event, isMac)) {
          // Why: bare Ctrl+V is readline's quote-insert on Windows/Linux. Suppress
          // Chromium's follow-up paste while leaving the original keydown for xterm.
          suppressNativePasteOnce()
        }
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const pane = getActivePane()
      if (!pane) {
        return
      }
      suppressNativePasteOnce()
      pasteFromClipboard({
        activeElementAtDispatch: document.activeElement,
        pane,
        source: 'keyboard'
      })
    }
    const onPaste = (event: ClipboardEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-terminal-search-root]')) {
        return
      }
      if (suppressNextNativePaste) {
        suppressNextNativePaste = false
        if (pasteSuppressionTimerId !== null) {
          window.clearTimeout(pasteSuppressionTimerId)
          pasteSuppressionTimerId = null
        }
        event.preventDefault()
        event.stopPropagation()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const pane = getActivePane()
      if (!pane) {
        return
      }
      pasteFromClipboard({
        activeElementAtDispatch: document.activeElement,
        pane,
        source: 'paste-event'
      })
    }
    container.addEventListener('keydown', onKeyPaste, { capture: true })
    container.addEventListener('paste', onPaste, { capture: true })
    return () => {
      if (pasteSuppressionTimerId !== null) {
        window.clearTimeout(pasteSuppressionTimerId)
      }
      container.removeEventListener('keydown', onKeyPaste, { capture: true })
      container.removeEventListener('paste', onPaste, { capture: true })
    }
  }, [
    containerRef,
    forceBracketedMultilineTextPaste,
    isActive,
    keybindings,
    managerRef,
    paneTransportsRef,
    tabId,
    worktreeId
  ])
}

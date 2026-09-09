import { parsePaneKey } from '@yiru/protocol/terminal/pane-identity'
import type { TerminalLayoutSnapshot } from '@yiru/protocol/workspace/session'

type NotificationPaneVisibilityState = {
  activeWorktreeId: string | null
  activeTabId: string | null
  terminalLayoutsByTabId?: Record<string, TerminalLayoutSnapshot>
}

export function isYiruWindowForegroundFocused(): boolean {
  if (typeof document === 'undefined') {
    return true
  }
  return document.visibilityState === 'visible' && document.hasFocus()
}

export function isVisibleForegroundPaneKey(
  state: NotificationPaneVisibilityState,
  worktreeId: string,
  paneKey: string
): boolean {
  if (!isYiruWindowForegroundFocused() || state.activeWorktreeId !== worktreeId) {
    return false
  }

  const parsed = parsePaneKey(paneKey)
  if (!parsed || state.activeTabId !== parsed.tabId) {
    return false
  }

  return state.terminalLayoutsByTabId?.[parsed.tabId]?.activeLeafId === parsed.leafId
}

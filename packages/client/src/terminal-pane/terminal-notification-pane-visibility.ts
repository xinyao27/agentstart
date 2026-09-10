import { parsePaneKey } from '@agentstart/protocol/terminal/pane-identity'
import type { TerminalLayoutSnapshot } from '@agentstart/protocol/workspace/session'

type NotificationPaneVisibilityState = {
  activeWorktreeId: string | null
  activeTabId: string | null
  terminalLayoutsByTabId?: Record<string, TerminalLayoutSnapshot>
}

export function isAgentStartWindowForegroundFocused(): boolean {
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
  if (!isAgentStartWindowForegroundFocused() || state.activeWorktreeId !== worktreeId) {
    return false
  }

  const parsed = parsePaneKey(paneKey)
  if (!parsed || state.activeTabId !== parsed.tabId) {
    return false
  }

  return state.terminalLayoutsByTabId?.[parsed.tabId]?.activeLeafId === parsed.leafId
}

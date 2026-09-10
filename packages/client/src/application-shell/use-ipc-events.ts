import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { focusRuntimeTerminalSurface } from '~renderer/runtime/sync-runtime-graph'
import type { AppState } from '~renderer/store/types'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'

import { subscribeAgentStatusState } from './ipc-events/agent-status'
import { subscribeMobileTerminalState } from './ipc-events/mobile-terminal-state'
import { subscribeWorkspaceEvents } from './ipc-events/workspaces'

export { isRuntimeEnvironmentActive } from './ipc-events/runtime-projects'

// Why: exported for terminal-create-shell-request.ts and
// terminal-reveal-shell-request.ts (Phase 5 slice S4b, terminal creation
// cluster) — the reverse-contract terminal create/reveal handlers need the
// same worktree-activation and focus helpers the removed inline
// `onCreateTerminal`/`onRequestTerminalCreate` listeners used, without
// duplicating their dependency on the runtime-terminal-surface focus path.
export function focusTerminalInitiatedTab(tabId: string, leafId?: string | null): void {
  if (!focusRuntimeTerminalSurface(tabId, leafId)) {
    focusTerminalTabSurface(tabId, leafId)
  }
}

export function activateTerminalInitiatedWorktree(store: AppState, worktreeId: string): void {
  store.setActiveView('terminal')
  store.setActiveWorktree(worktreeId)
  // Why: CLI/runtime terminal focus is user-visible worktree navigation, so it
  // must feed both Command Palette recency and the titlebar back/forward stack.
  store.markWorktreeVisited(worktreeId)
  if (!store.isNavigatingHistory) {
    store.recordWorktreeVisit(worktreeId)
  }
}

type BrowserSessionTabTarget =
  | { kind: 'unified-browser'; unifiedTabId: string; workspaceId: string; groupId: string }
  | { kind: 'fallback-browser'; workspaceId: string }

export function resolveBrowserSessionTabTarget(
  state: Pick<AppState, 'browserTabsByWorktree' | 'unifiedTabsByWorktree'>,
  worktreeId: string,
  tabId: string
): BrowserSessionTabTarget | null {
  const tab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find((item) => item.id === tabId)
  if (tab?.contentType === 'browser') {
    return {
      kind: 'unified-browser',
      unifiedTabId: tab.id,
      workspaceId: tab.entityId,
      groupId: tab.groupId
    }
  }
  const fallbackBrowser = (state.browserTabsByWorktree[worktreeId] ?? []).find(
    (workspace) => workspace.id === tabId
  )
  return fallbackBrowser ? { kind: 'fallback-browser', workspaceId: fallbackBrowser.id } : null
}

export function useIpcEvents(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    const unsubs: (() => void)[] = []
    unsubs.push(subscribeWorkspaceEvents(queryClient))
    unsubs.push(subscribeAgentStatusState())
    unsubs.push(subscribeMobileTerminalState())
    return () => {
      unsubs.forEach((fn) => fn())
    }
  }, [queryClient])
}

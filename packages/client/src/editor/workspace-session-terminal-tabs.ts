import type { WorkspaceSessionState } from '@yiru/protocol/workspace/session'
import type { TerminalTab } from '@yiru/protocol/workspace/tabs'

export function buildSanitizedTabsByWorktree(
  tabsByWorktree: Record<string, TerminalTab[]>
): WorkspaceSessionState['tabsByWorktree'] {
  // Why: pendingActivationSpawn is a transient renderer handoff; persisting it
  // can suppress the first legitimate PTY spawn after an interrupted save.
  return Object.fromEntries(
    Object.entries(tabsByWorktree).map(([worktreeId, tabs]) => [
      worktreeId,
      tabs.map((tab) => {
        const { pendingActivationSpawn: _unused, ...rest } = tab
        void _unused
        return rest
      })
    ])
  )
}

export function buildSanitizedTerminalLayoutsByTabId(
  tabsByWorktree: Record<string, TerminalTab[]>,
  terminalLayoutsByTabId: WorkspaceSessionState['terminalLayoutsByTabId']
): WorkspaceSessionState['terminalLayoutsByTabId'] {
  const persistedTabIds = new Set(
    Object.values(buildSanitizedTabsByWorktree(tabsByWorktree))
      .flat()
      .map((tab) => tab.id)
  )
  return Object.fromEntries(
    Object.entries(terminalLayoutsByTabId).filter(([tabId]) => persistedTabIds.has(tabId))
  )
}

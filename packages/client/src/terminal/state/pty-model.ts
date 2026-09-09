import type { TerminalTab } from '@yiru/protocol/workspace/tabs'

export function withTerminalTabPtyId(
  tabsByWorktree: Record<string, TerminalTab[]>,
  tabId: string,
  ptyId: string | null
): Record<string, TerminalTab[]> {
  for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
    const index = tabs.findIndex((tab) => tab.id === tabId)
    if (index === -1) {
      continue
    }
    if (tabs[index]?.ptyId === ptyId) {
      return tabsByWorktree
    }
    const nextTabs = [...tabs]
    nextTabs[index] = { ...nextTabs[index]!, ptyId }
    return { ...tabsByWorktree, [worktreeId]: nextTabs }
  }
  return tabsByWorktree
}

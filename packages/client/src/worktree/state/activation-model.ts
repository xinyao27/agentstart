import type { Tab } from '@yiru/protocol/workspace/tabs'

import type { AppState } from '../../store/types'

export function getActiveUnifiedTabForWorktree(
  state: AppState,
  worktreeId: string,
  reconciledActiveTabId: string | null
): Tab | null {
  const activeGroupId =
    state.activeGroupIdByWorktree[worktreeId] ?? state.groupsByWorktree[worktreeId]?.[0]?.id ?? null
  const activeGroup = activeGroupId
    ? (state.groupsByWorktree[worktreeId] ?? []).find((group) => group.id === activeGroupId)
    : null
  const activeUnifiedTabId = reconciledActiveTabId ?? activeGroup?.activeTabId ?? null
  return activeUnifiedTabId == null
    ? null
    : ((state.unifiedTabsByWorktree[worktreeId] ?? []).find(
        (tab) => tab.id === activeUnifiedTabId && (!activeGroup || tab.groupId === activeGroup.id)
      ) ?? null)
}

import type { Tab } from '@agentstart/protocol/workspace/tabs'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'

export function openGitGraphTab(worktreeId: string, targetGroupId?: string): Tab {
  const state = useAppStore.getState()
  const existing = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (tab) => tab.contentType === 'git-graph' && (!targetGroupId || tab.groupId === targetGroupId)
  )
  if (existing) {
    state.focusGroup(worktreeId, existing.groupId)
    state.activateTab(existing.id)
    state.setActiveTabType('editor')
    return existing
  }

  const tab = state.createUnifiedTab(worktreeId, 'git-graph', {
    entityId: `git-graph:${worktreeId}`,
    label: translate('auto.components.right.sidebar.SourceControl.e7f8a9b0c1', 'Git Graph'),
    ...(targetGroupId ? { targetGroupId } : {})
  })
  state.focusGroup(worktreeId, tab.groupId)
  state.setActiveTabType('editor')
  return tab
}

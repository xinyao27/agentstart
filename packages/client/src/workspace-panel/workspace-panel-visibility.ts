import { isFolderRepo } from '@agentstart/protocol/project/repository'
import { isWorkspaceBodyVisible } from '~renderer/application-shell/state/visible-surface'
import type { AppState } from '~renderer/store/types'

export function workspacePanelShowsPullRequestData(
  state: Pick<
    AppState,
    | 'activeGroupIdByWorktree'
    | 'activeWorktreeId'
    | 'groupsByWorktree'
    | 'repos'
    | 'unifiedTabsByWorktree'
    | 'workspacePanelOpen'
    | 'workspacePanelTab'
    | 'worktreesByRepo'
  >
): boolean {
  if (
    !isWorkspaceBodyVisible(state) ||
    !state.workspacePanelOpen ||
    state.workspacePanelTab !== 'source-control'
  ) {
    return false
  }

  const activeWorktree = Object.values(state.worktreesByRepo)
    .flat()
    .find((worktree) => worktree.id === state.activeWorktreeId)
  const activeRepo = activeWorktree
    ? state.repos.find((repo) => repo.id === activeWorktree.repoId)
    : null
  if (!activeRepo || isFolderRepo(activeRepo)) {
    return false
  }

  return true
}

import type { WorkspaceSpaceWorktreeValue as WorkspaceSpaceWorktree } from '@agentstart/protocol'
import { useNow } from '~renderer/dashboard/use-now'
import { getRepoMapFromState, getWorktreeMapFromState } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'

import {
  getWorkspaceDecisionDetails,
  type WorkspaceDecisionDetails
} from './workspace-space-decision'

export function useWorkspaceSpaceDecisions(
  worktrees: readonly WorkspaceSpaceWorktree[]
): Map<string, WorkspaceDecisionDetails> {
  const repoMap = useAppStore((state) => getRepoMapFromState(state))
  const worktreeMap = useAppStore((state) => getWorktreeMapFromState(state))
  const tabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const ptyIdsByTabId = useAppStore((state) => state.ptyIdsByTabId)
  const agentStatusByPaneKey = useAppStore((state) => state.agentStatusByPaneKey)
  const migrationUnsupportedByPtyId = useAppStore((state) => state.migrationUnsupportedByPtyId)
  const runtimePaneTitlesByTabId = useAppStore((state) => state.runtimePaneTitlesByTabId)
  const agentStatusEpoch = useAppStore((state) => state.agentStatusEpoch)
  const retainedAgentsByPaneKey = useAppStore((state) => state.retainedAgentsByPaneKey)
  const openFiles = useAppStore((state) => state.openFiles)
  const editorDrafts = useAppStore((state) => state.editorDrafts)
  const browserTabsByWorktree = useAppStore((state) => state.browserTabsByWorktree)
  const gitStatusByWorktree = useAppStore((state) => state.gitStatusByWorktree)
  const remoteStatusesByWorktree = useAppStore((state) => state.remoteStatusesByWorktree)
  const hostedReviewCache = useAppStore((state) => state.hostedReviewCache)
  const settings = useAppStore((state) => state.settings)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  // Why: active-agent freshness is time-based; the epoch crosses stale boundaries.
  void agentStatusEpoch
  const details = new Map<string, WorkspaceDecisionDetails>()
  const now = useNow(30_000)
  for (const worktree of worktrees) {
    details.set(
      worktree.worktreeId,
      getWorkspaceDecisionDetails(worktree, {
        repoMap,
        worktreeMap,
        tabsByWorktree,
        ptyIdsByTabId,
        agentStatusByPaneKey,
        migrationUnsupportedByPtyId,
        runtimePaneTitlesByTabId,
        retainedAgentsByPaneKey,
        openFiles,
        editorDrafts,
        browserTabsByWorktree,
        gitStatusByWorktree,
        remoteStatusesByWorktree,
        hostedReviewCache,
        settings,
        activeWorktreeId,
        now
      })
    )
  }
  return details
}

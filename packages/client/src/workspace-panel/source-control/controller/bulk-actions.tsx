import { useRef } from 'react'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { bulkStageRuntimeGitPaths, bulkUnstageRuntimeGitPaths } from '~renderer/runtime/git-client'
import { shouldForcePushWithLeaseForUpstream } from '~renderer/source-control/workflow/operation'
import { getStageAllPaths } from '~renderer/workspace-panel/discard-all-sequence'

import type {
  BranchCompareRemoteStatusSnapshot,
  BranchCompareStatusHeadSnapshot
} from '../compare-summary'
import type { SourceControlFileOpenController } from './file-open'

export function useSourceControlBulkActions(scope: SourceControlFileOpenController) {
  const {
    activeRepoSettings,
    activeWorktreeId,
    grouped,
    handleActionInvoke,
    isExecutingBulk,
    primaryAction,
    refreshActiveGitStatusAfterMutation,
    remoteStatus,
    remoteStatusForActions,
    runCreatePrIntent,
    setIsExecutingBulk,
    worktreePath
  } = scope
  const handleStageAllPaths = async (paths: readonly string[]) => {
    if (!worktreePath || isExecutingBulk || paths.length === 0) {
      return
    }
    setIsExecutingBulk(true)
    try {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      await bulkStageRuntimeGitPaths(
        {
          // Why: route staging by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        [...paths]
      )
      await refreshActiveGitStatusAfterMutation()
    } finally {
      setIsExecutingBulk(false)
    }
  }
  const handleUnstagePaths = async (paths: readonly string[]) => {
    if (!worktreePath || isExecutingBulk || paths.length === 0) {
      return
    }
    setIsExecutingBulk(true)
    try {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      await bulkUnstageRuntimeGitPaths(
        {
          // Why: route unstaging by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        [...paths]
      )
      await refreshActiveGitStatusAfterMutation()
    } finally {
      setIsExecutingBulk(false)
    }
  }
  const handleStageAllPrimary = async (): Promise<void> => {
    if (!worktreePath || isExecutingBulk) {
      return
    }
    const filePaths = [
      ...getStageAllPaths(grouped.unstaged, 'unstaged'),
      ...getStageAllPaths(grouped.untracked, 'untracked')
    ]
    if (filePaths.length === 0) {
      return
    }
    setIsExecutingBulk(true)
    try {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      await bulkStageRuntimeGitPaths(
        {
          // Why: route staging by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        filePaths
      )
      await refreshActiveGitStatusAfterMutation()
    } finally {
      setIsExecutingBulk(false)
    }
  }
  const handlePrimaryClick = (): void => {
    switch (primaryAction.kind) {
      case 'stage':
        void handleStageAllPrimary()
        return
      case 'push':
        // Why: the primary keeps kind `push` even when its label requires a lease
        // force; route that state explicitly without changing dropdown Push.
        handleActionInvoke(
          shouldForcePushWithLeaseForUpstream(remoteStatusForActions ?? remoteStatus)
            ? 'force_push'
            : 'push'
        )
        return
      case 'commit':
      case 'pull':
      case 'sync':
      case 'publish':
      case 'create_pr':
        handleActionInvoke(primaryAction.kind)
        return
      case 'create_pr_intent':
        void runCreatePrIntent()
    }
  }
  const branchCompareInFlightRef = useRef(false)
  const branchCompareRerunRef = useRef(false)
  const branchCompareRunPromiseRef = useRef<Promise<void> | null>(null)
  const branchCompareStatusHeadRef = useRef<BranchCompareStatusHeadSnapshot | null>(null)
  const branchCompareRemoteStatusRef = useRef<BranchCompareRemoteStatusSnapshot | null>(null)
  return {
    ...scope,
    handleStageAllPaths,
    handleUnstagePaths,
    handleStageAllPrimary,
    handlePrimaryClick,
    branchCompareInFlightRef,
    branchCompareRerunRef,
    branchCompareRunPromiseRef,
    branchCompareStatusHeadRef,
    branchCompareRemoteStatusRef
  }
}

export type SourceControlBulkActionsController = ReturnType<typeof useSourceControlBulkActions>

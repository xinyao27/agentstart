import { getConnectionId } from '~renderer/runtime/connection-context'
import { cancelRuntimeGenerateCommitMessage } from '~renderer/runtime/git-client'
import { isSyncPushStageError } from '~renderer/source-control/remote-error'
import { useAppStore } from '~renderer/store/state'
import { resolveCommitMessageGenerationCancel } from '~renderer/workspace-panel/commit-message-generation-state'
import {
  refreshSourceControlAfterRemoteAction,
  resolveRemoteActionError
} from '~renderer/workspace-panel/source-control/review/remote-action-state'
import {
  captureSourceControlRecoveryEntrySnapshot,
  type SourceControlActionError,
  type SourceControlRecoveryStatusEntry
} from '~renderer/workspace-panel/source-control/tree/action-error'

import type { SourceControlOperationTarget } from '../panel-types'
import type { SourceControlCommitGenerationController } from './commit-generation'
import type { RunRemoteActionResult } from './types'

export function useSourceControlRemoteActions(scope: SourceControlCommitGenerationController) {
  const {
    activeCommitMessageGenerationKey,
    activeRepoSettings,
    activeWorktree,
    activeWorktreeId,
    branchName,
    effectiveBaseRef,
    fastForwardBranch,
    fetchBranch,
    generateInFlightRef,
    grouped,
    pullBranch,
    pushBranch,
    rebaseFromBase,
    refreshActiveGitStatusAfterMutation,
    refreshBranchCompareRef,
    beginRemoteActionSequence,
    isCurrentRemoteActionSequence,
    setRemoteActionErrors,
    syncBranch,
    updateCommitMessageGenerationRecord,
    worktreePath
  } = scope
  const handleCancelGenerate = (): void => {
    if (!activeWorktreeId || !worktreePath || !activeCommitMessageGenerationKey) {
      return
    }
    if (!generateInFlightRef.current[activeWorktreeId]) {
      return
    }
    updateCommitMessageGenerationRecord(activeCommitMessageGenerationKey, (record) =>
      resolveCommitMessageGenerationCancel(record)
    )
    const connectionId = getConnectionId(activeWorktreeId) ?? undefined
    // Why: cancellation clears the spinner when the generation promise settles;
    // awaiting the kill here would only delay feedback.
    void cancelRuntimeGenerateCommitMessage({
      // Why: route the cancel by the repo OWNER host, not the focused runtime.
      settings: activeRepoSettings,
      worktreeId: activeWorktreeId,
      worktreePath,
      connectionId
    })
  }
  const runRemoteAction = async (
    kind: 'push' | 'force_push' | 'pull' | 'fast_forward' | 'sync' | 'fetch' | 'publish' | 'rebase',
    options?: {
      target?: SourceControlOperationTarget
      baseRef?: string | null
    }
  ): Promise<RunRemoteActionResult> => {
    const target =
      options?.target ??
      (activeWorktreeId && worktreePath
        ? {
            settings: activeRepoSettings,
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId: getConnectionId(activeWorktreeId) ?? undefined,
            pushTarget: activeWorktree?.pushTarget
          }
        : null)
    if (!target) {
      return { status: 'skipped' }
    }
    const sequence = beginRemoteActionSequence(target.worktreeId)
    const targetIsActiveWorktree = target.worktreeId === activeWorktreeId
    const recoveryEntrySnapshot = captureSourceControlRecoveryEntrySnapshot(
      targetIsActiveWorktree
        ? ([
            ...grouped.staged,
            ...grouped.unstaged,
            ...grouped.untracked
          ] satisfies SourceControlRecoveryStatusEntry[])
        : []
    )
    const failureBranchName = targetIsActiveWorktree ? branchName || null : null
    setRemoteActionErrors((prev) => ({ ...prev, [target.worktreeId]: null }))
    try {
      if (kind === 'publish') {
        await pushBranch(
          target.worktreeId,
          target.worktreePath,
          true,
          target.connectionId,
          target.pushTarget,
          { runtimeTargetSettings: target.settings }
        )
        return { status: 'ok' }
      }
      if (kind === 'push') {
        // Why: `push` must remain non-force; only explicit `force_push`
        // callers may use force-with-lease.
        await pushBranch(
          target.worktreeId,
          target.worktreePath,
          false,
          target.connectionId,
          target.pushTarget,
          { runtimeTargetSettings: target.settings }
        )
        return { status: 'ok' }
      }
      if (kind === 'force_push') {
        await pushBranch(
          target.worktreeId,
          target.worktreePath,
          false,
          target.connectionId,
          target.pushTarget,
          { forceWithLease: true, runtimeTargetSettings: target.settings }
        )
        return { status: 'ok' }
      }
      if (kind === 'pull') {
        await pullBranch(
          target.worktreeId,
          target.worktreePath,
          target.connectionId,
          target.pushTarget,
          {
            runtimeTargetSettings: target.settings
          }
        )
        return { status: 'ok' }
      }
      if (kind === 'fast_forward') {
        await fastForwardBranch(
          target.worktreeId,
          target.worktreePath,
          target.connectionId,
          target.pushTarget,
          { runtimeTargetSettings: target.settings }
        )
        return { status: 'ok' }
      }
      if (kind === 'fetch') {
        await fetchBranch(
          target.worktreeId,
          target.worktreePath,
          target.connectionId,
          target.pushTarget,
          {
            runtimeTargetSettings: target.settings
          }
        )
        return { status: 'ok' }
      }
      if (kind === 'rebase') {
        const baseRef = options?.baseRef ?? effectiveBaseRef
        if (!baseRef) {
          return { status: 'skipped' }
        }
        await rebaseFromBase(
          target.worktreeId,
          target.worktreePath,
          baseRef,
          target.connectionId,
          target.pushTarget,
          { runtimeTargetSettings: target.settings }
        )
        return { status: 'ok' }
      }
      await syncBranch(
        target.worktreeId,
        target.worktreePath,
        target.connectionId,
        target.pushTarget,
        {
          runtimeTargetSettings: target.settings
        }
      )
      if (isCurrentRemoteActionSequence(target.worktreeId, sequence)) {
        setRemoteActionErrors((prev) => ({ ...prev, [target.worktreeId]: null }))
      }
      return { status: 'ok' }
    } catch (error) {
      // Why: editor actions own the single toast path, while inline state keeps
      // dropdown-only failures visible after the menu closes.
      if (!isCurrentRemoteActionSequence(target.worktreeId, sequence)) {
        return { status: 'superseded' }
      }
      const actionError: SourceControlActionError = {
        kind,
        message: resolveRemoteActionError(kind, error),
        rawError: error instanceof Error ? error.message : String(error),
        syncPushStage: kind === 'sync' ? isSyncPushStageError(error) : false,
        branchName: failureBranchName,
        worktreePath: target.worktreePath,
        entriesSnapshot: recoveryEntrySnapshot.entries,
        entriesSnapshotTotalCount: recoveryEntrySnapshot.totalCount,
        sequence
      }
      setRemoteActionErrors((prev) => ({ ...prev, [target.worktreeId]: actionError }))
      return { status: 'failed', error: actionError }
    } finally {
      if (!options?.target) {
        refreshSourceControlAfterRemoteAction({
          refreshGitStatus: refreshActiveGitStatusAfterMutation,
          refreshBranchCompare: refreshBranchCompareRef.current,
          refreshGitHistory: () => useAppStore.getState().refreshGitGraph(target.worktreeId)
        })
      }
    }
  }
  return { ...scope, handleCancelGenerate, runRemoteAction }
}

export type SourceControlRemoteActionsController = ReturnType<typeof useSourceControlRemoteActions>

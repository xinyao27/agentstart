import { useEffect, useMemo, useRef } from 'react'
import { useSourceControlAi } from '~renderer/workspace-panel/source-control/ai/use-ai'
import { saveSessionCommitDrafts } from '~renderer/workspace-panel/source-control/commit/commit-draft-session'
import { clearRemoteActionErrorsForCompletedConflictOperations } from '~renderer/workspace-panel/source-control/review/remote-action-state'

import { createDefaultCollapsedSections } from '../panel-constants'
import type { SourceControlFileModelController } from './file-model'

export function useSourceControlLifecycle(scope: SourceControlFileModelController) {
  const {
    activeConnectionId,
    activeGroupId,
    activeRepo,
    activeRepoSettings,
    activeSourceControlLaunchPlatform,
    activeWorktreeId,
    commitDrafts,
    commitError,
    commitErrorsRef,
    commitInFlightRef,
    commitMessage,
    conflictOperation,
    conflictOperationsByWorktree,
    createPrIntentInFlightRef,
    createPrIntentRunTokenRef,
    generateInFlightRef,
    grouped,
    openSettingsPage,
    openSettingsTarget,
    previousConflictOperationsRef,
    pushRecovery,
    pruneRemoteActionSequences,
    setAbortOperationInFlightByWorktree,
    setBaseRefDialogOpen,
    setCollapsedSections,
    setCollapsedTreeDirs,
    setCommitErrors,
    setCommitInFlightByWorktree,
    setCreatePrIntentInFlightByWorktree,
    setCreatePrIntentNotices,
    setFilterExpanded,
    setFilterQuery,
    setGenerateErrors,
    setGenerateInFlightByWorktree,
    setIsClearingDiffComments,
    setIsExecutingBulk,
    setPendingDiffCommentsClear,
    setPendingDiscard,
    setRemoteActionErrors,
    unresolvedConflicts,
    updateCommitDrafts,
    updateRepo,
    updateSettings,
    worktreeMap,
    worktreePath
  } = scope
  const {
    sourceControlAiDiscoveryHostKey,
    sourceControlAiActionsVisible,
    resolvedCommitMessageAi,
    resolvedPrCreationDefaults,
    resolveConflictsComposerOpen,
    setResolveConflictsComposerOpen,
    commitGenerationDialogOpen,
    setCommitGenerationDialogOpen,
    pullRequestGenerationDialogOpen,
    setPullRequestGenerationDialogOpen,
    openCommitGenerationDialog,
    openPullRequestGenerationDialog,
    isLaunchingCommitFailureAgent,
    isLaunchingPushFailureAgent,
    resolveConflictsPrompt,
    commitFailureRecoveryPrompt,
    getLaunchActionRecipe,
    saveLaunchActionDefault,
    handleResolveConflictsWithAI,
    handleFixCommitFailureWithAI,
    handleFixPushFailureWithAI,
    handleSaveCommitMessageGenerationDefaults,
    handleSavePullRequestGenerationDefaults,
    openSourceControlAiSettings
  } = useSourceControlAi({
    settings: activeRepoSettings,
    activeRepo: activeRepo ?? null,
    activeWorktreeId,
    activeConnectionId,
    activeGroupId,
    activeSourceControlLaunchPlatform,
    conflictOperation,
    unresolvedConflicts,
    stagedEntries: grouped.staged,
    worktreePath,
    commitMessage,
    commitError,
    pushRecoveryPrompt: pushRecovery?.prompt ?? null,
    updateSettings,
    updateRepo,
    openSettingsTarget,
    openSettingsPage
  })
  const worktreeIds = useMemo(() => new Set(worktreeMap.keys()), [worktreeMap])
  const worktreeIdsKey = JSON.stringify([...worktreeIds].sort())
  const worktreeIdsRef = useRef(worktreeIds)
  useEffect(() => {
    worktreeIdsRef.current = worktreeIds
  }, [worktreeIds])
  useEffect(() => {
    if (sourceControlAiActionsVisible) {
      return
    }
    setResolveConflictsComposerOpen(false)
    setCommitGenerationDialogOpen(false)
    setPullRequestGenerationDialogOpen(false)
  }, [
    setCommitGenerationDialogOpen,
    setPullRequestGenerationDialogOpen,
    setResolveConflictsComposerOpen,
    sourceControlAiActionsVisible
  ])
  useEffect(() => {
    const pruneRecord = <T,>(prev: Record<string, T>): Record<string, T> => {
      let changed = false
      const next: Record<string, T> = {}
      for (const key of Object.keys(prev)) {
        if (worktreeIdsRef.current.has(key)) {
          next[key] = prev[key]
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    }
    updateCommitDrafts((prev) => pruneRecord(prev))
    commitErrorsRef.current = pruneRecord(commitErrorsRef.current)
    setCommitErrors((prev) => pruneRecord(prev))
    setRemoteActionErrors((prev) => pruneRecord(prev))
    setCommitInFlightByWorktree((prev) => pruneRecord(prev))
    setAbortOperationInFlightByWorktree((prev) => pruneRecord(prev))
    setGenerateInFlightByWorktree((prev) => pruneRecord(prev))
    setGenerateErrors((prev) => pruneRecord(prev))
    setCreatePrIntentInFlightByWorktree((prev) => pruneRecord(prev))
    setCreatePrIntentNotices((prev) => pruneRecord(prev))
    // Refs don't need setState — mutate in place to drop stale keys.
    for (const key of Object.keys(commitInFlightRef.current)) {
      if (!worktreeIdsRef.current.has(key)) {
        delete commitInFlightRef.current[key]
      }
    }
    pruneRemoteActionSequences(worktreeIdsRef.current)
    for (const key of Object.keys(generateInFlightRef.current)) {
      if (!worktreeIdsRef.current.has(key)) {
        delete generateInFlightRef.current[key]
      }
    }
    for (const key of Object.keys(createPrIntentInFlightRef.current)) {
      if (!worktreeIdsRef.current.has(key)) {
        delete createPrIntentInFlightRef.current[key]
        delete createPrIntentRunTokenRef.current[key]
      }
    }
  }, [
    commitErrorsRef,
    commitInFlightRef,
    createPrIntentInFlightRef,
    createPrIntentRunTokenRef,
    generateInFlightRef,
    pruneRemoteActionSequences,
    setAbortOperationInFlightByWorktree,
    setCommitErrors,
    setCommitInFlightByWorktree,
    setCreatePrIntentInFlightByWorktree,
    setCreatePrIntentNotices,
    setGenerateErrors,
    setGenerateInFlightByWorktree,
    setRemoteActionErrors,
    updateCommitDrafts,
    worktreeIdsKey
  ])
  useEffect(() => {
    saveSessionCommitDrafts(commitDrafts)
  }, [commitDrafts])
  useEffect(() => {
    // Why: once Git observes a terminal-finished conflict operation, its old
    // Source Control failure banner is stale.
    const previousConflictOperations = previousConflictOperationsRef.current
    setRemoteActionErrors((prev) =>
      clearRemoteActionErrorsForCompletedConflictOperations({
        remoteActionErrors: prev,
        previousConflictOperations,
        currentConflictOperations: conflictOperationsByWorktree
      })
    )
    previousConflictOperationsRef.current = conflictOperationsByWorktree
  }, [conflictOperationsByWorktree, previousConflictOperationsRef, setRemoteActionErrors])
  useEffect(() => {
    setFilterExpanded(false)
    setCollapsedSections(createDefaultCollapsedSections())
    setCollapsedTreeDirs(new Set())
    setBaseRefDialogOpen(false)
    setPendingDiscard(null)
    setPendingDiffCommentsClear(null)
    setIsClearingDiffComments(false)
    // Why: defaultBaseRef is repo-scoped; resetting it on a worktree switch can
    // replace a valid non-main default and leave branch compare unavailable.
    setFilterQuery('')
    setIsExecutingBulk(false)
    // Why: commit-in-flight state is per-worktree; resetting it here can
    // re-enable Commit when returning to a worktree whose commit still runs.
  }, [
    activeWorktreeId,
    setBaseRefDialogOpen,
    setCollapsedSections,
    setCollapsedTreeDirs,
    setFilterExpanded,
    setFilterQuery,
    setIsClearingDiffComments,
    setIsExecutingBulk,
    setPendingDiffCommentsClear,
    setPendingDiscard
  ])
  return {
    ...scope,
    sourceControlAiDiscoveryHostKey,
    sourceControlAiActionsVisible,
    resolvedCommitMessageAi,
    resolvedPrCreationDefaults,
    resolveConflictsComposerOpen,
    setResolveConflictsComposerOpen,
    commitGenerationDialogOpen,
    setCommitGenerationDialogOpen,
    pullRequestGenerationDialogOpen,
    setPullRequestGenerationDialogOpen,
    openCommitGenerationDialog,
    openPullRequestGenerationDialog,
    isLaunchingCommitFailureAgent,
    isLaunchingPushFailureAgent,
    resolveConflictsPrompt,
    commitFailureRecoveryPrompt,
    getLaunchActionRecipe,
    saveLaunchActionDefault,
    handleResolveConflictsWithAI,
    handleFixCommitFailureWithAI,
    handleFixPushFailureWithAI,
    handleSaveCommitMessageGenerationDefaults,
    handleSavePullRequestGenerationDefaults,
    openSourceControlAiSettings
  }
}

export type SourceControlLifecycleController = ReturnType<typeof useSourceControlLifecycle>

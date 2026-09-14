import { translate } from '~renderer/i18n/i18n'
import { bulkStageRuntimeGitPaths } from '~renderer/runtime/git-client'
import {
  createCreatePrIntentRunToken,
  createPrIntentGitStatusMatchesToken,
  getCreatePrIntentCommitFailureNoticeMessage,
  getCreatePrIntentStagePaths,
  prepareCreatePrIntentBeforeCommit
} from '~renderer/workspace-panel/source-control/review/create-pr-intent-flow'

import { readCommitDraftForWorktree, writeCommitDraftForWorktree } from '../panel-state'
import { finishCreateReviewIntent } from './create-review-intent-remote'
import type { SourceControlCreateReviewPrerequisitesController } from './create-review-prerequisites'

export function useSourceControlCreateReviewIntent(
  scope: SourceControlCreateReviewPrerequisitesController
) {
  const {
    activeRepo,
    activeWorktreeId,
    branchName,
    commitDraftsRef,
    commitErrorsRef,
    createPrIntentActiveTargetConflicts,
    createPrIntentInFlightRef,
    createPrIntentRunStillOwnsWorktree,
    createPrIntentRunTokenRef,
    effectiveBaseRef,
    entries,
    generateCommitMessageForCreatePrIntent,
    getCreatePrIntentOperationTarget,
    handleCommit,
    isCommitting,
    isCreatingPr,
    isExecutingBulk,
    isGenerating,
    isRemoteOperationActive,
    prGenerating,
    refreshGitStatusForCreatePrIntent,
    remoteStatus,
    runRemoteAction,
    setCreatePrIntentInFlightByWorktree,
    setCreatePrIntentNoticeForWorktree,
    setIsExecutingBulk,
    updateCommitDrafts,
    worktreePath
  } = scope
  const runCreatePrIntent = async (): Promise<void> => {
    if (
      !activeRepo ||
      !activeWorktreeId ||
      !worktreePath ||
      !branchName ||
      isExecutingBulk ||
      isCommitting ||
      isGenerating ||
      isRemoteOperationActive ||
      prGenerating ||
      isCreatingPr ||
      createPrIntentInFlightRef.current[activeWorktreeId]
    ) {
      return
    }

    const token = createCreatePrIntentRunToken({
      repoId: activeRepo.id,
      worktreeId: activeWorktreeId,
      worktreePath,
      branch: branchName,
      // Why: Create PR intent crosses async commit/push steps; the review
      // target must stay tied to the base selected when the run started.
      baseRef: effectiveBaseRef ?? null
    })
    const operationTarget = getCreatePrIntentOperationTarget(token)
    const runIsCurrent = (): boolean =>
      createPrIntentRunStillOwnsWorktree(token) && !createPrIntentActiveTargetConflicts(token)
    let abortedByStaleTarget = false
    const abortIfStale = (): boolean => {
      if (runIsCurrent()) {
        return false
      }
      abortedByStaleTarget = true
      return true
    }
    createPrIntentRunTokenRef.current[token.worktreeId] = token
    createPrIntentInFlightRef.current[token.worktreeId] = true
    setCreatePrIntentInFlightByWorktree((prev) => ({ ...prev, [token.worktreeId]: true }))
    setCreatePrIntentNoticeForWorktree(token.worktreeId, {
      tone: 'muted',
      message: translate(
        'auto.components.workspacePanel.SourceControl.d37e68f61d',
        'Preparing branch for review…'
      )
    })

    try {
      let latestStatusEntries = entries
      let latestUpstreamStatus = remoteStatus
      const refreshIntentSnapshot = async (): Promise<boolean> => {
        const refreshed = await refreshGitStatusForCreatePrIntent(token)
        if (!refreshed) {
          return false
        }
        // Why: strict status sees terminal checkouts before React state, so abort
        // before the intent mutates a newly checked-out branch.
        if (!createPrIntentGitStatusMatchesToken(token, refreshed.status)) {
          abortedByStaleTarget = true
          return false
        }
        if (abortIfStale()) {
          return false
        }
        latestStatusEntries = refreshed.status.entries
        latestUpstreamStatus = refreshed.upstreamStatus
        return true
      }
      const stageLatestIntentPaths = async (): Promise<boolean> => {
        const stagePaths = getCreatePrIntentStagePaths({
          unstaged: latestStatusEntries.filter((entry) => entry.area === 'unstaged'),
          untracked: latestStatusEntries.filter((entry) => entry.area === 'untracked')
        })
        if (stagePaths.length === 0) {
          return true
        }
        setIsExecutingBulk(true)
        try {
          await bulkStageRuntimeGitPaths(operationTarget, stagePaths)
        } finally {
          setIsExecutingBulk(false)
        }
        if (abortIfStale()) {
          return false
        }
        return refreshIntentSnapshot()
      }

      const preparationOutcome = await prepareCreatePrIntentBeforeCommit({
        refresh: refreshIntentSnapshot,
        readUpstreamStatus: () => latestUpstreamStatus,
        fastForward: async () => {
          setCreatePrIntentNoticeForWorktree(token.worktreeId, {
            tone: 'muted',
            message: translate(
              'auto.components.workspacePanel.SourceControl.createPrIntentFastForwarding',
              'Updating branch…'
            )
          })
          const result = await runRemoteAction('fast_forward', { target: operationTarget })
          return abortIfStale() ? { status: 'superseded' } : result
        },
        stage: stageLatestIntentPaths
      })
      if (preparationOutcome === 'remote_failed') {
        setCreatePrIntentNoticeForWorktree(token.worktreeId, {
          tone: 'destructive',
          message: translate(
            'auto.components.workspacePanel.SourceControl.createPrIntentRemoteFailed',
            'Could not update the remote branch. Retry Create PR.'
          )
        })
      }
      if (preparationOutcome !== 'ready') {
        return
      }

      const stagedEntries = latestStatusEntries.filter((entry) => entry.area === 'staged')
      if (stagedEntries.length > 0) {
        let message = readCommitDraftForWorktree(commitDraftsRef.current, token.worktreeId).trim()
        if (!message) {
          setCreatePrIntentNoticeForWorktree(token.worktreeId, {
            tone: 'muted',
            message: translate(
              'auto.components.workspacePanel.SourceControl.8d8f5c6c94',
              'Generating commit message…'
            )
          })
          const generated = await generateCommitMessageForCreatePrIntent(token)
          if (abortIfStale()) {
            return
          }
          if (!generated.ok || !generated.message) {
            setCreatePrIntentNoticeForWorktree(token.worktreeId, {
              tone: generated.reason === 'settings' ? 'muted' : 'destructive',
              message: translate(
                generated.reason === 'settings'
                  ? 'auto.components.workspacePanel.SourceControl.createPrIntentConfigureAi'
                  : 'auto.components.workspacePanel.SourceControl.createPrIntentGenerateFailed',
                generated.reason === 'settings'
                  ? 'Add a commit message or configure Source Control AI settings.'
                  : 'Could not generate a commit message. Add one and retry.'
              ),
              action: generated.reason === 'settings' ? 'settings' : undefined
            })
            return
          }
          const draftAfterGeneration = readCommitDraftForWorktree(
            commitDraftsRef.current,
            token.worktreeId
          ).trim()
          if (draftAfterGeneration) {
            setCreatePrIntentNoticeForWorktree(token.worktreeId, {
              tone: 'muted',
              message: translate(
                'auto.components.workspacePanel.SourceControl.fda060d6ce',
                'Review the commit message, then retry Create PR.'
              )
            })
            return
          }
          message = generated.message
          updateCommitDrafts((prev) => writeCommitDraftForWorktree(prev, token.worktreeId, message))
        }

        setCreatePrIntentNoticeForWorktree(token.worktreeId, {
          tone: 'muted',
          message: translate(
            'auto.components.workspacePanel.SourceControl.b75cb1fd0c',
            'Committing changes…'
          )
        })
        const committed = await handleCommit(message, {
          skipStagedSnapshotCheck: true,
          skipActiveConflictCheck: true,
          target: operationTarget
        })
        if (abortIfStale()) {
          return
        }
        if (!committed) {
          // Why: failed hooks may safely rewrite tracked files; re-stage those
          // outputs so a retry preserves the all-in commit intent.
          if (await refreshIntentSnapshot()) {
            await stageLatestIntentPaths()
          }
          if (abortIfStale()) {
            return
          }
          const commitFailure = commitErrorsRef.current[token.worktreeId] ?? null
          setCreatePrIntentNoticeForWorktree(token.worktreeId, {
            tone: 'destructive',
            message: getCreatePrIntentCommitFailureNoticeMessage(commitFailure, {
              fallback: translate(
                'auto.components.workspacePanel.SourceControl.createPrIntentCommitFailed',
                'Could not commit changes. Fix the issue, then retry Create PR.'
              ),
              withSummary: (summary) =>
                translate(
                  'auto.components.workspacePanel.SourceControl.createPrIntentCommitBlockedSummary',
                  'Commit blocked: {{value0}} Fix the issue, then retry Create PR.',
                  { value0: summary }
                )
            })
          })
          return
        }
        if (!(await refreshIntentSnapshot())) {
          return
        }
      }

      await finishCreateReviewIntent({
        abortIfStale,
        getLatestStatusEntries: () => latestStatusEntries,
        getLatestUpstreamStatus: () => latestUpstreamStatus,
        operationTarget,
        refreshIntentSnapshot,
        scope,
        token
      })
    } catch (error) {
      console.warn('[SourceControl] Create PR intent failed', error)
      if (!abortIfStale()) {
        setCreatePrIntentNoticeForWorktree(token.worktreeId, {
          tone: 'destructive',
          message: translate(
            'auto.components.workspacePanel.SourceControl.d7492cafce',
            'Could not refresh Source Control. Retry Create PR.'
          )
        })
      }
    } finally {
      if (createPrIntentRunTokenRef.current[token.worktreeId] === token) {
        createPrIntentInFlightRef.current[token.worktreeId] = false
        createPrIntentRunTokenRef.current[token.worktreeId] = null
        if (abortedByStaleTarget) {
          setCreatePrIntentNoticeForWorktree(token.worktreeId, null)
        }
        setCreatePrIntentInFlightByWorktree((prev) => ({
          ...prev,
          [token.worktreeId]: false
        }))
      }
    }
  }
  return { ...scope, runCreatePrIntent }
}

export type SourceControlCreateReviewIntentController = ReturnType<
  typeof useSourceControlCreateReviewIntent
>

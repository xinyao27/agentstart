import type { PRCheckRunDetails } from '@agentstart/protocol/hosted-review/review-types'
import { toast } from 'sonner'
import { startFixChecksAgent } from '~renderer/editor/fix-checks-agent-launch'
import { translate } from '~renderer/i18n/i18n'
import {
  buildFixBrokenChecksPrompt,
  getBrokenChecks,
  getCheckDetailsPromptKey
} from '~renderer/source-control/checks-fix-prompt'
import {
  buildPRCommentsResolutionPrompt,
  isResolvablePRCommentGroup
} from '~renderer/source-control/comments-resolution-prompt'
import { groupPRComments, type PRCommentGroup } from '~renderer/source-control/pr-comment-groups'

import { clearPRCommentsListSelection } from '../pr-comments-list-selection'
import { buildResolvePullRequestConflictsPrompt } from '../source-control'
import type { useChecksPanelCommentActionsState } from './comment-actions-controller'
import type { ChecksAgentComposerState } from './controller-types'

export function useChecksPanelAgentActions(context: useChecksPanelCommentActionsState) {
  const {
    activeConflictReview,
    activeReview,
    activeWorktreeId,
    activeWorktreePath,
    asyncResultKeyRef,
    checks,
    commentsRef,
    commentsSelectionClearTokenRef,
    fetchComments,
    fetchPRCheckDetails,
    handleResolve,
    isCurrentAsyncResult,
    isFixingChecksWithAI,
    pr,
    repo,
    resolveCommentsWithAIDisabledReason,
    setAgentComposerState,
    setCommentsSelectionClearRequest,
    setIsFixingChecksWithAI,
    sourceControlAiActionsVisible,
    stateRequestKey
  } = context

  const handleResolveConflictsWithAI = async (): Promise<void> => {
    if (!sourceControlAiActionsVisible || !activeWorktreeId || !activeConflictReview) {
      return
    }
    const conflictFiles = activeConflictReview.conflictSummary?.files ?? []
    setAgentComposerState({
      actionId: 'resolveConflicts',
      title: translate(
        'auto.components.right.sidebar.ChecksPanel.4ede779461',
        'Resolve Review Conflicts With AI'
      ),
      description: translate(
        'auto.components.right.sidebar.ChecksPanel.abf59262fb',
        'Review and edit the full command input before starting an agent.'
      ),
      prompt: buildResolvePullRequestConflictsPrompt({
        baseRef: activeConflictReview.conflictSummary?.baseRef,
        entries: conflictFiles.map((path) => ({ path })),
        worktreePath: activeWorktreePath ?? null
      }),
      launchSource: 'conflict_resolution'
    })
  }

  const handleResolveCommentsWithAI = (selectedGroups: PRCommentGroup[]): void => {
    if (
      !sourceControlAiActionsVisible ||
      !activeWorktreeId ||
      !activeReview ||
      !repo ||
      resolveCommentsWithAIDisabledReason
    ) {
      return
    }
    const selectedThreadIds = selectedGroups.flatMap((group) =>
      group.kind === 'thread' && isResolvablePRCommentGroup(group) ? [group.threadId] : []
    )
    if (selectedGroups.length === 0) {
      toast.message(
        translate(
          'auto.components.right.sidebar.ChecksPanel.f316a8ca2b',
          'No unresolved comments selected.'
        )
      )
      return
    }
    setAgentComposerState({
      actionId: 'resolveComments',
      title: translate(
        'auto.components.right.sidebar.ChecksPanel.d00ebdc402',
        'Resolve {{value0}} Comments With AI',
        { value0: 'PR' }
      ),
      description: translate(
        'auto.components.right.sidebar.ChecksPanel.ed3f79c031',
        'Review the prompt before starting an agent. Selected threads are marked resolved after launch.'
      ),
      prompt: buildPRCommentsResolutionPrompt({
        reviewNumber: activeReview.number,
        reviewTitle: activeReview.title,
        reviewUrl: activeReview.url,
        groups: selectedGroups,
        worktreePath: activeWorktreePath
      }),
      launchSource: 'task_page',
      commentResolution: {
        reviewContextKey: stateRequestKey,
        provider: activeReview.provider,
        selectedThreadIds,
        selectedGroups
      }
    })
  }

  const clearSentCommentSelection = (reviewContextKey: string): void => {
    clearPRCommentsListSelection(reviewContextKey)
    commentsSelectionClearTokenRef.current += 1
    setCommentsSelectionClearRequest({
      contextKey: reviewContextKey,
      token: commentsSelectionClearTokenRef.current
    })
  }

  const refreshCommentsAfterBulkResolve = async (): Promise<void> => {
    await fetchComments({ force: true })
  }

  const resolveSelectedThreadsAfterLaunch = async (
    resolution: NonNullable<ChecksAgentComposerState['commentResolution']>
  ) => {
    clearSentCommentSelection(resolution.reviewContextKey)
    let resolved = 0
    let skipped = Math.max(
      0,
      resolution.selectedGroups.length - resolution.selectedThreadIds.length
    )
    let failed = 0
    let attemptedThreadCount = 0
    if (resolution.selectedThreadIds.length === 0) {
      toast.success(
        translate(
          'auto.components.right.sidebar.ChecksPanel.3c3ad3a1d2',
          'Started the agent. No selected comments can be marked resolved on the host.'
        )
      )
      return
    }
    for (const threadId of resolution.selectedThreadIds) {
      if (asyncResultKeyRef.current !== resolution.reviewContextKey) {
        skipped += resolution.selectedThreadIds.length - attemptedThreadCount
        break
      }
      attemptedThreadCount += 1
      const currentGroup = groupPRComments(commentsRef.current).find(
        (group) => group.kind === 'thread' && group.threadId === threadId
      )
      if (!currentGroup || !isResolvablePRCommentGroup(currentGroup)) {
        skipped += 1
        continue
      }
      const ok = await handleResolve(threadId, true, { notifyOnFailure: false })
      if (ok) {
        resolved += 1
      } else {
        failed += 1
      }
    }

    if (asyncResultKeyRef.current === resolution.reviewContextKey) {
      await refreshCommentsAfterBulkResolve()
    }

    if (failed > 0) {
      toast.error(
        translate(
          'auto.components.right.sidebar.ChecksPanel.f273f2271c',
          'Started the agent. Marked {{value0}} resolved, skipped {{value1}}, failed {{value2}}.',
          { value0: resolved, value1: skipped, value2: failed }
        )
      )
      return
    }
    toast.success(
      translate(
        'auto.components.right.sidebar.ChecksPanel.aa95b81a3a',
        'Started the agent. Marked {{value0}} resolved, skipped {{value1}}, failed {{value2}}.',
        { value0: resolved, value1: skipped, value2: failed }
      )
    )
  }

  const handleFixChecksWithAI = async (): Promise<void> => {
    if (
      !sourceControlAiActionsVisible ||
      isFixingChecksWithAI ||
      !activeWorktreeId ||
      !activeReview ||
      !repo
    ) {
      return
    }
    const broken = getBrokenChecks(checks)
    if (broken.length === 0) {
      toast.message(
        translate(
          'auto.components.right.sidebar.ChecksPanel.5594400d73',
          'No broken checks to fix.'
        )
      )
      return
    }
    const requestKey = stateRequestKey
    setIsFixingChecksWithAI(true)
    try {
      const checkRunDetailsByCheckKey: Record<string, PRCheckRunDetails> = {}
      if (repo) {
        await Promise.all(
          broken.slice(0, 5).map(async (check, index) => {
            if (!check.checkRunId && !check.workflowRunId && !check.url) {
              return
            }
            try {
              const details = await fetchPRCheckDetails(
                repo.path,
                {
                  checkRunId: check.checkRunId,
                  workflowRunId: check.workflowRunId,
                  checkName: check.name,
                  url: check.url,
                  prRepo: pr?.prRepo ?? null
                },
                { repoId: repo.id }
              )
              if (details) {
                checkRunDetailsByCheckKey[getCheckDetailsPromptKey(check, index)] = details
              }
            } catch (error) {
              console.warn('[ChecksPanel] failed to load check details for AI fix prompt', error)
            }
          })
        )
      }
      if (!isCurrentAsyncResult(requestKey)) {
        return
      }
      const basePrompt = buildFixBrokenChecksPrompt({
        reviewNumber: activeReview.number,
        reviewTitle: activeReview.title,
        reviewUrl: activeReview.url,
        checks,
        checkRunDetailsByCheckKey
      })
      const started = await startFixChecksAgent({
        repoId: repo.id,
        basePrompt,
        worktreeId: activeWorktreeId,
        groupId: activeWorktreeId,
        launchSource: 'task_page'
      })
      if (started) {
        toast.success(
          translate(
            'auto.components.right.sidebar.ChecksPanel.2ef90c9819',
            'Started an AI agent for the broken checks.'
          )
        )
      }
    } finally {
      setIsFixingChecksWithAI(false)
    }
  }

  return {
    ...context,
    handleResolveConflictsWithAI,
    handleResolveCommentsWithAI,
    clearSentCommentSelection,
    refreshCommentsAfterBulkResolve,
    resolveSelectedThreadsAfterLaunch,
    handleFixChecksWithAI
  }
}

export type useChecksPanelAgentActionsState = ReturnType<typeof useChecksPanelAgentActions>

import { normalizeHostedReviewHeadRef } from '@agentstart/protocol/hosted-review/refs'
import { toast } from 'sonner'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { interpretSourceControlHostedReviewCreateResult } from '~renderer/source-control/workflow/review'

import { formatCreateError } from '../create-pull-request-review-copy'
import { clearPullRequestGenerationRequiresPushBeforeCreate } from '../pull-request-generation-state'
import { stripBaseRef } from '../use-create-pull-request-dialog-fields'
import type { useChecksPanelReviewCreationState } from './review-creation-actions'

export function useChecksPanelCreateReview(context: useChecksPanelReviewCreationState) {
  const {
    activePullRequestGenerationKey,
    activeWorktreeId,
    activeWorktreePath,
    branch,
    createComposerOpen,
    createHostedReview,
    createPrInFlightRef,
    createPrPushFirst,
    handlePullRequestCreated,
    hostedReviewCreateCopy,
    hostedReviewCreateProvider,
    hostedReviewCreation,
    panelContextKey,
    panelContextKeyRef,
    prBase,
    prBody,
    prCreationDefaults,
    prDraft,
    prGenerating,
    prTitle,
    pushBeforeCreatePullRequest,
    repo,
    setCreatePrError,
    setGitStatusRefreshNonce,
    setIsCreatingPr,
    updatePullRequestGenerationRecord
  } = context

  const handleCreatePullRequest = async (): Promise<void> => {
    if (!repo || !branch || !createComposerOpen || prGenerating || createPrInFlightRef.current) {
      return
    }

    const requestContextKey = panelContextKey
    const isCurrentCreateRequest = (): boolean =>
      panelContextKeyRef.current === requestContextKey &&
      createPrInFlightRef.current === requestContextKey
    const base = stripBaseRef(prBase).trim()
    const title = prTitle.trim()
    const worktreePath = activeWorktreePath ?? repo.path
    if (!title) {
      setCreatePrError(
        translate(
          'auto.components.right.sidebar.SourceControl.f3a8b2c1d0e5',
          'Enter a {{value0}} title.',
          {
            value0: hostedReviewCreateCopy.reviewLabel
          }
        )
      )
      return
    }
    if (!base || stripBaseRef(base).toLowerCase() === stripBaseRef(branch).toLowerCase()) {
      setCreatePrError(
        translate(
          'auto.components.right.sidebar.SourceControl.ae743199cd',
          'Choose a different base branch before creating a {{value0}}.',
          { value0: hostedReviewCreateCopy.reviewLabel }
        )
      )
      return
    }

    createPrInFlightRef.current = requestContextKey
    setIsCreatingPr(true)
    setCreatePrError(null)
    let pushed = false
    try {
      const shouldPushBeforeCreate =
        createPrPushFirst || hostedReviewCreation?.blockedReason === 'needs_push'
      if (shouldPushBeforeCreate) {
        const ok = await pushBeforeCreatePullRequest()
        if (!isCurrentCreateRequest()) {
          return
        }
        if (!ok) {
          setCreatePrError('Push failed. Resolve the push error, then try again.')
          return
        }
        pushed = true
      }
      const result = await createHostedReview(repo.path, {
        repoId: repo.id,
        provider: hostedReviewCreateProvider,
        base,
        head: normalizeHostedReviewHeadRef(branch),
        title,
        body: prBody,
        draft: prDraft,
        worktreePath,
        useTemplate: prCreationDefaults.useTemplate
      })
      if (!isCurrentCreateRequest()) {
        return
      }
      const outcome = interpretSourceControlHostedReviewCreateResult(result)
      if (outcome.kind === 'created') {
        await handlePullRequestCreated({
          number: outcome.number
        })
        if (prCreationDefaults.openAfterCreate) {
          openHttpLink(outcome.url, { worktreeId: activeWorktreeId })
        }
        if (activePullRequestGenerationKey) {
          updatePullRequestGenerationRecord(
            activePullRequestGenerationKey,
            clearPullRequestGenerationRequiresPushBeforeCreate
          )
        }
        return
      }
      if (outcome.kind === 'existing') {
        const number = outcome.number
        toast.success(
          number
            ? translate(
                'auto.components.right.sidebar.ChecksPanel.b6ce28da5b',
                '{{value0}} #{{value1}} is already open',
                { value0: hostedReviewCreateCopy.titleLabel, value1: number }
              )
            : translate(
                'auto.components.right.sidebar.ChecksPanel.cf9e69f3be',
                '{{value0}} is already open',
                { value0: hostedReviewCreateCopy.titleLabel }
              ),
          {
            action: {
              label: translate(
                'auto.components.right.sidebar.ChecksPanel.192e686e57',
                'Open on {{value0}}',
                { value0: hostedReviewCreateCopy.providerName }
              ),
              onClick: (event) => openHttpLink(outcome.url, { event, worktreeId: activeWorktreeId })
            }
          }
        )
        if (number) {
          await handlePullRequestCreated({
            number
          })
          if (activePullRequestGenerationKey) {
            updatePullRequestGenerationRecord(
              activePullRequestGenerationKey,
              clearPullRequestGenerationRequiresPushBeforeCreate
            )
          }
          return
        }
      }
      setCreatePrError(formatCreateError(outcome.error, pushed, hostedReviewCreateCopy.shortLabel))
    } catch (error) {
      if (!isCurrentCreateRequest()) {
        return
      }
      setCreatePrError(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.right.sidebar.SourceControl.e2b7a1c0d9f4',
              'Failed to create {{value0}}',
              { value0: hostedReviewCreateCopy.reviewLabel }
            )
      )
    } finally {
      if (createPrInFlightRef.current === requestContextKey) {
        createPrInFlightRef.current = null
        setIsCreatingPr(false)
        setGitStatusRefreshNonce((value) => value + 1)
      }
    }
  }

  return { ...context, handleCreatePullRequest }
}

export type useChecksPanelCreateReviewState = ReturnType<typeof useChecksPanelCreateReview>

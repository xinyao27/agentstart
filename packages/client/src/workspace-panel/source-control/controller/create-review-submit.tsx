import { normalizeHostedReviewHeadRef } from '@yiru/protocol/hosted-review/refs'
import type { HostedReviewCreationEligibility } from '@yiru/protocol/hosted-review/types'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { generateRuntimePullRequestFields } from '~renderer/runtime/git-client'
import { resolveCreateReviewDraftTitle } from '~renderer/workspace-panel/create-review-draft-title'
import { stripBaseRef } from '~renderer/workspace-panel/use-create-pull-request-dialog-fields'

import {
  createPrIntentRunTokenMatches,
  resolveCreatePrIntentReviewBase,
  type CreatePrIntentRunToken
} from '../create-pr-intent-flow'
import { hasConfiguredSourceControlTextGenerationDefaults } from '../text-generation-defaults'
import type { SourceControlCreateReviewController } from './create-review'

export function useSourceControlCreateReviewSubmit(scope: SourceControlCreateReviewController) {
  const {
    activeRepo,
    createHostedReview,
    createPrInFlightRef,
    createPrIntentActiveTargetConflicts,
    createPrIntentCurrentTargetRef,
    createPrIntentRunStillOwnsWorktree,
    getCreatePrIntentOperationTarget,
    handlePullRequestCreated,
    hostedReviewCreateCopy,
    prBase,
    prBody,
    resolvedPrCreationDefaults,
    setCreatePrInFlightByWorktree,
    setCreatePrIntentNoticeForWorktree,
    settings
  } = scope
  const createHostedReviewForCreatePrIntent = async (
    token: CreatePrIntentRunToken,
    eligibility: HostedReviewCreationEligibility
  ): Promise<boolean> => {
    if (!activeRepo || !token.branch || !eligibility.canCreate) {
      return false
    }

    const base = resolveCreatePrIntentReviewBase({
      currentBaseRef: token.baseRef,
      eligibilityDefaultBaseRef: eligibility.defaultBaseRef,
      composerBaseRef: prBase
    }).trim()
    if (!base || stripBaseRef(base).toLowerCase() === stripBaseRef(token.branch).toLowerCase()) {
      setCreatePrIntentNoticeForWorktree(token.worktreeId, {
        tone: 'destructive',
        message: translate(
          'auto.components.right.sidebar.SourceControl.ae743199cd',
          'Choose a different base branch before creating a {{value0}}.',
          { value0: hostedReviewCreateCopy.reviewLabel }
        )
      })
      return false
    }

    let fields = {
      base,
      title: resolveCreateReviewDraftTitle({
        branch: token.branch,
        eligibilityTitle: eligibility.title
      }),
      body: eligibility.body ?? prBody,
      draft: resolvedPrCreationDefaults.draft
    }

    if (
      hasConfiguredSourceControlTextGenerationDefaults({
        actionId: 'pullRequest',
        settings,
        repo: activeRepo
      })
    ) {
      setCreatePrIntentNoticeForWorktree(token.worktreeId, {
        tone: 'muted',
        message: translate(
          'auto.components.right.sidebar.SourceControl.createPrIntentGeneratingDetails',
          'Generating review details…'
        )
      })
      const target = getCreatePrIntentOperationTarget(token)
      try {
        const generated = await generateRuntimePullRequestFields(target, {
          ...fields,
          provider: eligibility.provider,
          useTemplate: resolvedPrCreationDefaults.useTemplate
        })
        if (generated.branchChangedByPreparation) {
          setCreatePrIntentNoticeForWorktree(token.worktreeId, {
            tone: 'muted',
            message: translate(
              'auto.components.right.sidebar.SourceControl.createPrIntentBranchChangedDuringDetails',
              'Branch changed while generating review details. Retry Create PR.'
            )
          })
          return false
        }
        if (generated.success) {
          fields = {
            // Why: Create PR intent auto-submits; generated details should
            // not retarget the review without user confirmation.
            base: fields.base,
            title: generated.fields.title.trim() || fields.title,
            body: generated.fields.body,
            draft: generated.fields.draft
          }
        }
      } catch (error) {
        console.warn('[SourceControl] Create PR intent detail generation failed', error)
      }
    }

    if (!createPrIntentRunStillOwnsWorktree(token) || createPrIntentActiveTargetConflicts(token)) {
      return false
    }
    const createPrIntentIsForeground = (): boolean =>
      createPrIntentRunTokenMatches(token, createPrIntentCurrentTargetRef.current)

    const title = fields.title.trim()
    if (!title) {
      setCreatePrIntentNoticeForWorktree(token.worktreeId, {
        tone: 'destructive',
        message: translate(
          'auto.components.right.sidebar.SourceControl.f3a8b2c1d0e5',
          'Enter a {{value0}} title.',
          { value0: hostedReviewCreateCopy.reviewLabel }
        )
      })
      return false
    }

    setCreatePrIntentNoticeForWorktree(token.worktreeId, {
      tone: 'muted',
      message: translate(
        'auto.components.right.sidebar.SourceControl.createPrIntentCreatingReview',
        'Creating review…'
      )
    })
    createPrInFlightRef.current[token.worktreeId] = true
    setCreatePrInFlightByWorktree((prev) => ({ ...prev, [token.worktreeId]: true }))
    try {
      const result = await createHostedReview(activeRepo.path, {
        repoId: activeRepo.id,
        provider: eligibility.provider,
        base: fields.base,
        head: normalizeHostedReviewHeadRef(token.branch),
        title,
        body: fields.body,
        draft: fields.draft,
        worktreePath: token.worktreePath,
        useTemplate: resolvedPrCreationDefaults.useTemplate
      })

      if (result.ok) {
        const openChecks = createPrIntentIsForeground()
        await handlePullRequestCreated(
          {
            provider: eligibility.provider,
            number: result.number,
            url: result.url
          },
          {
            repoPath: activeRepo.path,
            repoId: activeRepo.id,
            branch: token.branch,
            worktreeId: token.worktreeId,
            openChecks
          }
        )
        if (openChecks && resolvedPrCreationDefaults.openAfterCreate) {
          openHttpLink(result.url, { worktreeId: token.worktreeId })
        }
        setCreatePrIntentNoticeForWorktree(token.worktreeId, null)
        return true
      }

      if (result.existingReview?.number && result.existingReview.url) {
        const openChecks = createPrIntentIsForeground()
        await handlePullRequestCreated(
          {
            provider: eligibility.provider,
            number: result.existingReview.number,
            url: result.existingReview.url
          },
          {
            repoPath: activeRepo.path,
            repoId: activeRepo.id,
            branch: token.branch,
            worktreeId: token.worktreeId,
            openChecks
          }
        )
        setCreatePrIntentNoticeForWorktree(token.worktreeId, null)
        return true
      }

      setCreatePrIntentNoticeForWorktree(token.worktreeId, {
        tone: 'destructive',
        message: result.error
      })
      return false
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.right.sidebar.SourceControl.e2b7a1c0d9f4',
              'Failed to create {{value0}}',
              { value0: hostedReviewCreateCopy.reviewLabel }
            )
      setCreatePrIntentNoticeForWorktree(token.worktreeId, {
        tone: 'destructive',
        message
      })
      return false
    } finally {
      createPrInFlightRef.current[token.worktreeId] = false
      setCreatePrInFlightByWorktree((prev) => ({ ...prev, [token.worktreeId]: false }))
    }
  }
  return { ...scope, createHostedReviewForCreatePrIntent }
}

export type SourceControlCreateReviewSubmitController = ReturnType<
  typeof useSourceControlCreateReviewSubmit
>

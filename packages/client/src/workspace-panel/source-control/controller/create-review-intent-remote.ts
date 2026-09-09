import { translate } from '~renderer/i18n/i18n'
import { resolveSourceControlReviewRemoteStep } from '~renderer/source-control/workflow/review'

import type { CreatePrIntentRunToken } from '../create-pr-intent-flow'
import type { SourceControlCreateReviewPrerequisitesController } from './create-review-prerequisites'

export async function finishCreateReviewIntent({
  abortIfStale,
  getLatestStatusEntries,
  getLatestUpstreamStatus,
  operationTarget,
  refreshIntentSnapshot,
  scope,
  token
}: {
  abortIfStale: () => boolean
  getLatestStatusEntries: () => SourceControlCreateReviewPrerequisitesController['entries']
  getLatestUpstreamStatus: () => SourceControlCreateReviewPrerequisitesController['remoteStatus']
  operationTarget: ReturnType<
    SourceControlCreateReviewPrerequisitesController['getCreatePrIntentOperationTarget']
  >
  refreshIntentSnapshot: () => Promise<boolean>
  scope: SourceControlCreateReviewPrerequisitesController
  token: CreatePrIntentRunToken
}): Promise<void> {
  const {
    createHostedReviewForCreatePrIntent,
    readHostedReviewCreationEligibilityForIntent,
    refreshBranchCompareForCreatePrIntent,
    runRemoteAction,
    setCreatePrIntentNoticeForWorktree
  } = scope
  const branchAhead = await refreshBranchCompareForCreatePrIntent(token)
  if (abortIfStale()) {
    return
  }
  let eligibility = await readHostedReviewCreationEligibilityForIntent({
    token,
    hasUncommittedChanges: getLatestStatusEntries().length > 0,
    upstreamStatus: getLatestUpstreamStatus()
  })
  if (abortIfStale() || !eligibility) {
    return
  }
  if (eligibility.canCreate) {
    await createHostedReviewForCreatePrIntent(token, eligibility)
    abortIfStale()
    return
  }
  if (eligibility.blockedReason === 'existing_review') {
    setCreatePrIntentNoticeForWorktree(token.worktreeId, null)
    return
  }

  const remoteStep = resolveSourceControlReviewRemoteStep({
    upstreamStatus: getLatestUpstreamStatus(),
    hostedReviewCreation: eligibility,
    branchCommitsAhead: branchAhead,
    hasCurrentBranch: Boolean(token.branch)
  })
  if (remoteStep === 'blocked' || remoteStep === 'none') {
    setCreatePrIntentNoticeForWorktree(token.worktreeId, {
      tone: 'muted',
      message: translate(
        eligibility.blockedReason === 'needs_sync'
          ? 'auto.components.right.sidebar.SourceControl.createPrIntentNeedsSync'
          : 'auto.components.right.sidebar.SourceControl.createPrIntentBranchNotReady',
        eligibility.blockedReason === 'needs_sync'
          ? 'Sync this branch before creating a review.'
          : 'Branch is not ready to create a review yet.'
      )
    })
    return
  }

  setCreatePrIntentNoticeForWorktree(token.worktreeId, {
    tone: 'muted',
    message: translate(
      remoteStep === 'publish'
        ? 'auto.components.right.sidebar.SourceControl.createPrIntentPublishing'
        : remoteStep === 'force_push'
          ? 'auto.components.right.sidebar.SourceControl.createPrIntentForcePushing'
          : remoteStep === 'fast_forward'
            ? 'auto.components.right.sidebar.SourceControl.createPrIntentFastForwarding'
            : 'auto.components.right.sidebar.SourceControl.createPrIntentPushing',
      remoteStep === 'publish'
        ? 'Publishing branch…'
        : remoteStep === 'force_push'
          ? 'Force pushing with lease…'
          : remoteStep === 'fast_forward'
            ? 'Updating branch…'
            : 'Pushing commits…'
    )
  })
  const remoteResult = await runRemoteAction(remoteStep, {
    target: operationTarget,
    baseRef: token.baseRef
  })
  if (abortIfStale() || remoteResult.status === 'superseded') {
    return
  }
  if (remoteResult.status !== 'ok') {
    setCreatePrIntentNoticeForWorktree(token.worktreeId, {
      tone: 'destructive',
      message: translate(
        'auto.components.right.sidebar.SourceControl.createPrIntentRemoteFailed',
        'Could not update the remote branch. Retry Create PR.'
      )
    })
    return
  }
  if (!(await refreshIntentSnapshot())) {
    return
  }
  await refreshBranchCompareForCreatePrIntent(token)
  if (abortIfStale()) {
    return
  }
  eligibility = await readHostedReviewCreationEligibilityForIntent({
    token,
    hasUncommittedChanges: getLatestStatusEntries().length > 0,
    upstreamStatus: getLatestUpstreamStatus()
  })
  if (abortIfStale()) {
    return
  }
  if (eligibility?.canCreate) {
    await createHostedReviewForCreatePrIntent(token, eligibility)
    abortIfStale()
    return
  }
  setCreatePrIntentNoticeForWorktree(token.worktreeId, {
    tone: 'muted',
    message: translate(
      'auto.components.right.sidebar.SourceControl.995c5e67ec',
      'Review setup needs attention.'
    )
  })
}

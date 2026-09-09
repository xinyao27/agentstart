import { useEffect } from 'react'

import {
  hasPositiveHostedReviewNumberLink,
  hasResolvableHostedReviewPushTargetLink,
  hasUsableHostedReviewPushTarget,
  resolveHostedReviewActionUpstreamStatus,
  resolveHostedReviewStateForActions
} from '../hosted-review-push-target'
import { buildSourceControlManualReviewUrlFromContext } from '../manual-review-url'
import {
  buildLoadingHostedReviewCreationEligibility,
  resolveProvisionalHostedReviewProvider
} from '../primary-create-pr-intent-action'
import type { SourceControlStatusRefreshController } from './status-refresh'

export function useSourceControlHostedReviewState(scope: SourceControlStatusRefreshController) {
  const {
    activeRepo,
    activeWorktree,
    activeWorktreeId,
    branchName,
    compareBaseRef,
    ensureHostedReviewPushTarget,
    fallbackGitHubPRNumber,
    hostedReview,
    hostedReviewCreation,
    hostedReviewCreationProviderHint,
    setHostedReviewCreationProviderHint,
    hostedReviewCreationRequestState,
    hostedReviewEntry,
    isBranchVisible,
    isFolder,
    linkedGitHubPR,
    remoteStatus
  } = scope
  const manualReviewUrl = (() =>
    buildSourceControlManualReviewUrlFromContext({
      hostedReviewProvider: hostedReview?.provider ?? null,
      hostedReviewCreationProvider: hostedReviewCreation?.provider ?? null,
      linkedGitHubPR,
      fallbackGitHubPRNumber,
      baseRef: compareBaseRef,
      branchName,
      repoRemoteName: activeRepo?.gitRemoteIdentity?.remoteName ?? null,
      repoRemoteUrl: activeRepo?.gitRemoteIdentity?.remoteUrl ?? null,
      pushTarget: activeWorktree?.pushTarget ?? null,
      upstreamName: remoteStatus?.upstreamName ?? null
    }))()
  const shouldResolveHostedReviewCreation =
    isBranchVisible &&
    Boolean(activeRepo) &&
    !isFolder &&
    Boolean(branchName) &&
    branchName !== 'HEAD' &&
    Boolean(activeWorktreeId)
  const hostedReviewCreationRequestMatchesCurrent =
    hostedReviewCreationRequestState !== null &&
    activeRepo?.id === hostedReviewCreationRequestState.repoId &&
    activeWorktreeId === hostedReviewCreationRequestState.worktreeId &&
    branchName === hostedReviewCreationRequestState.branch
  const isHostedReviewCreationLoading =
    shouldResolveHostedReviewCreation &&
    hostedReviewCreationRequestMatchesCurrent &&
    hostedReviewCreationRequestState.status === 'loading' &&
    hostedReview === null
  const provisionalHostedReviewProvider = (() =>
    resolveProvisionalHostedReviewProvider({
      hostedReview,
      hostedReviewCreationState: hostedReviewCreation
        ? {
            repoId: activeRepo?.id ?? '',
            data: hostedReviewCreation
          }
        : null,
      activeRepoId: activeRepo?.id ?? null,
      linkedGitHubPR,
      fallbackGitHubPR: fallbackGitHubPRNumber
    }))()
  const hasConcreteProviderHint =
    hostedReview !== null ||
    hostedReviewCreation !== null ||
    linkedGitHubPR !== null ||
    fallbackGitHubPRNumber !== null
  if (hasConcreteProviderHint) {
    const nextProviderHint = {
      repoId: activeRepo?.id ?? null,
      worktreeId: activeWorktreeId ?? null,
      branch: branchName,
      provider: provisionalHostedReviewProvider
    }
    if (
      hostedReviewCreationProviderHint.repoId !== nextProviderHint.repoId ||
      hostedReviewCreationProviderHint.worktreeId !== nextProviderHint.worktreeId ||
      hostedReviewCreationProviderHint.branch !== nextProviderHint.branch ||
      hostedReviewCreationProviderHint.provider !== nextProviderHint.provider
    ) {
      setHostedReviewCreationProviderHint(nextProviderHint)
    }
  }
  const hostedReviewCreationForHeader = (() => {
    // Why: disable stale eligibility during preflight while retaining provider
    // copy from the previous safe snapshot.
    if (isHostedReviewCreationLoading) {
      const providerHint = hostedReviewCreationProviderHint
      const provider =
        providerHint.repoId === (activeRepo?.id ?? null) &&
        providerHint.worktreeId === (activeWorktreeId ?? null) &&
        providerHint.branch === branchName
          ? providerHint.provider
          : provisionalHostedReviewProvider
      return buildLoadingHostedReviewCreationEligibility(provider)
    }
    return hostedReviewCreation
  })()
  const hasHostedReviewLink = hasPositiveHostedReviewNumberLink({
    linkedGitHubPR,
    fallbackGitHubPR: fallbackGitHubPRNumber
  })
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — the SSH exclusion this used to gate on never fires.
  const isHostedReviewStateLoading = hasHostedReviewLink && hostedReviewEntry === undefined
  const hasResolvableReviewPushTargetLink = hasResolvableHostedReviewPushTargetLink({
    linkedGitHubPR,
    fallbackGitHubPR: fallbackGitHubPRNumber
  })
  useEffect(() => {
    // Why: resolving review heads can hit provider/SSH APIs, so keep it tied
    // to the visible Source Control branch view like the adjacent PR polling.
    if (!isBranchVisible || isFolder || !activeWorktreeId || activeWorktree?.pushTarget) {
      return
    }
    if (!hasResolvableReviewPushTargetLink) {
      return
    }
    void ensureHostedReviewPushTarget(activeWorktreeId)
  }, [
    activeWorktree?.pushTarget,
    activeWorktreeId,
    ensureHostedReviewPushTarget,
    hasResolvableReviewPushTargetLink,
    isBranchVisible,
    isFolder
  ])
  const canUseHostedReviewPushTarget = hasUsableHostedReviewPushTarget({
    pushTarget: activeWorktree?.pushTarget,
    upstreamStatus: remoteStatus,
    hasResolvableHostedReviewPushTargetLink: hasResolvableReviewPushTargetLink,
    branchName
  })
  const hostedReviewStateForActions = resolveHostedReviewStateForActions({
    hostedReviewState: hostedReview?.state ?? null,
    hasResolvableHostedReviewPushTargetLink: hasResolvableReviewPushTargetLink
  })
  const remoteStatusForActions: typeof remoteStatus = (() =>
    resolveHostedReviewActionUpstreamStatus({
      hasHostedReviewLink,
      hasResolvableHostedReviewPushTargetLink: hasResolvableReviewPushTargetLink,
      hostedReviewState: hostedReviewStateForActions,
      isHostedReviewStateLoading,
      canUseHostedReviewPushTarget,
      upstreamStatus: remoteStatus
    }))()
  return {
    ...scope,
    manualReviewUrl,
    shouldResolveHostedReviewCreation,
    hostedReviewCreationRequestMatchesCurrent,
    isHostedReviewCreationLoading,
    provisionalHostedReviewProvider,
    hostedReviewCreationForHeader,
    hasHostedReviewLink,
    isHostedReviewStateLoading,
    hasResolvableReviewPushTargetLink,
    canUseHostedReviewPushTarget,
    hostedReviewStateForActions,
    remoteStatusForActions
  }
}

export type SourceControlHostedReviewStateController = ReturnType<
  typeof useSourceControlHostedReviewState
>

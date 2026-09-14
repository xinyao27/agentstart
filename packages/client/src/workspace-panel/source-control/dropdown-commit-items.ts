import { translate } from '~renderer/i18n/i18n'

import type { DropdownActionContext } from './dropdown-context'
import type { DropdownItem } from './dropdown-items'

export function resolveDropdownCommitItems(
  context: DropdownActionContext
): [DropdownItem, DropdownItem, DropdownItem] {
  const {
    behind,
    canCommit,
    canPushLinkedReviewWithoutUpstream,
    commitDisabledReason,
    globalBusy,
    hasOpenHostedReview,
    hasUpstream,
    publishBlockedByDetachedHead,
    publishBlockedByMergedPR,
    publishBlockedByPRLoading,
    pushBlockedByOpenHostedReviewTarget,
    shouldForcePushWithLease,
    upstreamLoading
  } = context
  const commitItem: DropdownItem = {
    kind: 'commit',
    label: translate(
      'auto.components.workspacePanel.source.control.dropdown.items.2b8e6595fd',
      'Commit'
    ),
    title: commitDisabledReason ?? 'Commit staged changes',
    disabled: !canCommit
  }
  const commitPushTitle = upstreamLoading
    ? 'Checking branch status…'
    : publishBlockedByPRLoading
      ? 'Checking PR status…'
      : publishBlockedByMergedPR
        ? 'PR is already merged'
        : publishBlockedByDetachedHead
          ? 'Check out a branch before pushing commits'
          : pushBlockedByOpenHostedReviewTarget
            ? 'Linked review branch target is unavailable'
            : !hasUpstream && !(hasOpenHostedReview && canPushLinkedReviewWithoutUpstream)
              ? 'Publish the branch first to push commits'
              : (commitDisabledReason ??
                (shouldForcePushWithLease
                  ? 'Commit staged changes and force push with lease'
                  : behind > 0
                    ? 'Commit staged changes and try to push'
                    : 'Commit staged changes and push'))
  const commitPushItem: DropdownItem = {
    kind: 'commit_push',
    label: shouldForcePushWithLease ? 'Commit & Force Push' : 'Commit & Push',
    title: commitPushTitle,
    disabled:
      globalBusy ||
      upstreamLoading ||
      (!hasUpstream && !(hasOpenHostedReview && canPushLinkedReviewWithoutUpstream)) ||
      publishBlockedByDetachedHead ||
      publishBlockedByPRLoading ||
      publishBlockedByMergedPR ||
      commitDisabledReason !== null
  }
  const commitSyncTitle = resolveCommitSyncTitle(context)
  const commitSyncItem: DropdownItem = {
    kind: 'commit_sync',
    label: translate(
      'auto.components.workspacePanel.source.control.dropdown.items.323bb614aa',
      'Commit & Sync'
    ),
    title: commitSyncTitle,
    disabled:
      globalBusy ||
      upstreamLoading ||
      !hasUpstream ||
      publishBlockedByDetachedHead ||
      shouldForcePushWithLease ||
      commitDisabledReason !== null
  }
  return [commitItem, commitPushItem, commitSyncItem]
}

function resolveCommitSyncTitle(context: DropdownActionContext): string {
  if (context.upstreamLoading) {
    return 'Checking branch status…'
  }
  if (context.publishBlockedByPRLoading) {
    return 'Checking PR status…'
  }
  if (context.publishBlockedByMergedPR) {
    return 'PR is already merged'
  }
  if (context.publishBlockedByDetachedHead) {
    return 'Check out a branch before syncing commits'
  }
  if (!context.hasUpstream) {
    return 'Publish the branch first to sync commits'
  }
  if (context.shouldForcePushWithLease) {
    return (
      context.commitDisabledReason ??
      'Use Commit & Force Push — remote only has older copies of local commits'
    )
  }
  return context.commitDisabledReason ?? 'Commit, then pull and push'
}

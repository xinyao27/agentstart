import { translate } from '~renderer/i18n/i18n'

import type { DropdownActionContext } from './dropdown-context'
import type { DropdownItem } from './dropdown-items'

export function resolveDropdownRemoteItems(context: DropdownActionContext): DropdownItem[] {
  const {
    ahead,
    behind,
    branchCommitsAhead,
    canPushUntrackedHostedReview,
    globalBusy,
    hasDirtyLocalChanges,
    hasUpstream,
    publishBlockedByDetachedHead,
    publishBlockedByMergedPR,
    publishBlockedByOpenHostedReview,
    publishBlockedByPRLoading,
    pushBlockedByOpenHostedReviewTarget,
    pushLabelCount,
    rebaseBaseRef,
    shouldForcePushWithLease,
    upstreamLoading,
    upstreamStatus
  } = context
  const pushItem: DropdownItem = {
    kind: 'push',
    label: formatCountLabel('Push', ahead),
    title: publishBlockedByDetachedHead
      ? 'Check out a branch before pushing commits'
      : pushBlockedByOpenHostedReviewTarget
        ? 'Linked review branch target is unavailable'
        : upstreamLoading
          ? 'Push this branch and set an upstream if needed'
          : canPushUntrackedHostedReview
            ? 'Push updates to the linked review branch'
            : !hasUpstream
              ? 'Push this branch and set an upstream if needed'
              : shouldForcePushWithLease
                ? 'Try a regular push; git may require force push'
                : behind > 0 && ahead > 0
                  ? 'Push local commits; git may require syncing first'
                  : ahead === 0
                    ? `Nothing to push${upstreamStatus?.upstreamName ? ` to ${upstreamStatus.upstreamName}` : ''}`
                    : describePushCount(ahead),
    // Why: explicit Push remains the non-force fallback even when force-with-lease is recommended.
    disabled: globalBusy || publishBlockedByDetachedHead || pushBlockedByOpenHostedReviewTarget
  }
  const forcePushItem: DropdownItem = {
    kind: 'force_push',
    label: formatCountLabel('Force Push', pushLabelCount),
    title: publishBlockedByDetachedHead
      ? 'Check out a branch before force pushing commits'
      : pushBlockedByOpenHostedReviewTarget
        ? 'Linked review branch target is unavailable'
        : upstreamLoading || !hasUpstream
          ? formatUnpublishedForcePushTitle(branchCommitsAhead)
          : pushLabelCount === 0
            ? `Nothing to force push${upstreamStatus?.upstreamName ? ` to ${upstreamStatus.upstreamName}` : ''}`
            : shouldForcePushWithLease
              ? formatForcePushTitle(branchCommitsAhead, upstreamStatus?.upstreamName)
              : formatManualForcePushTitle(pushLabelCount, behind, upstreamStatus?.upstreamName),
    disabled: globalBusy || publishBlockedByDetachedHead || pushBlockedByOpenHostedReviewTarget
  }
  const pullItem: DropdownItem = {
    kind: 'pull',
    label: formatCountLabel('Pull', behind),
    title: upstreamLoading
      ? 'Checking branch status…'
      : publishBlockedByPRLoading
        ? 'Checking PR status…'
        : publishBlockedByMergedPR
          ? 'PR is already merged'
          : publishBlockedByDetachedHead
            ? 'Check out a branch before pulling commits'
            : !hasUpstream
              ? 'Publish the branch first to pull commits'
              : shouldForcePushWithLease
                ? 'Nothing new to pull — remote only has older copies of local commits'
                : behind === 0
                  ? 'Nothing to pull'
                  : describePullCount(behind),
    disabled: globalBusy || upstreamLoading || !hasUpstream || publishBlockedByDetachedHead
  }
  const fastForwardItem: DropdownItem = {
    kind: 'fast_forward',
    label: formatCountLabel('Fast-forward', behind),
    title: upstreamLoading
      ? 'Checking branch status…'
      : publishBlockedByPRLoading
        ? 'Checking PR status…'
        : publishBlockedByMergedPR
          ? 'PR is already merged'
          : publishBlockedByDetachedHead
            ? 'Check out a branch before fast-forwarding'
            : !hasUpstream
              ? 'Publish the branch first to fast-forward'
              : shouldForcePushWithLease
                ? 'Nothing new to fast-forward — remote only has older copies of local commits'
                : behind === 0
                  ? 'Nothing to fast-forward'
                  : ahead > 0
                    ? 'Try a fast-forward pull; git may reject local commits'
                    : describeFastForwardCount(behind),
    disabled: globalBusy || upstreamLoading || !hasUpstream || publishBlockedByDetachedHead
  }
  const syncItem: DropdownItem = {
    kind: 'sync',
    label: formatSyncLabel('Sync', ahead, behind),
    title: upstreamLoading
      ? 'Checking branch status…'
      : publishBlockedByPRLoading
        ? 'Checking PR status…'
        : publishBlockedByMergedPR
          ? 'PR is already merged'
          : publishBlockedByDetachedHead
            ? 'Check out a branch before syncing commits'
            : !hasUpstream
              ? 'Publish the branch first to sync commits'
              : shouldForcePushWithLease
                ? 'Use Force Push — remote only has older copies of local commits'
                : ahead === 0 && behind === 0
                  ? 'Branch is up to date'
                  : describeSyncCounts(ahead, behind),
    disabled:
      globalBusy ||
      upstreamLoading ||
      !hasUpstream ||
      publishBlockedByDetachedHead ||
      shouldForcePushWithLease
  }
  const rebaseBaseLabel = rebaseBaseRef ? formatRebaseBaseRef(rebaseBaseRef) : null
  const hasRemoteBaseRef = rebaseBaseLabel?.includes('/') === true
  const rebaseItem: DropdownItem = {
    kind: 'rebase_base',
    label: rebaseBaseLabel ? `Rebase from ${rebaseBaseLabel}` : 'Rebase from Base',
    title:
      !rebaseBaseLabel || !hasRemoteBaseRef
        ? 'Choose a remote base branch to rebase from'
        : hasDirtyLocalChanges
          ? 'Try rebasing; git may require committing or stashing local changes first'
          : `Rebase current branch with latest commits from ${rebaseBaseLabel}`,
    disabled: globalBusy || !rebaseBaseRef || !hasRemoteBaseRef
  }
  const fetchItem: DropdownItem = {
    kind: 'fetch',
    label: translate(
      'auto.components.workspacePanel.source.control.dropdown.items.226b85a3a7',
      'Fetch'
    ),
    title: translate(
      'auto.components.workspacePanel.source.control.dropdown.items.04d709801d',
      'Fetch from remote without merging'
    ),
    disabled: globalBusy
  }
  const publishItem: DropdownItem = {
    kind: 'publish',
    label:
      publishBlockedByMergedPR || publishBlockedByPRLoading
        ? 'PR Status'
        : publishBlockedByOpenHostedReview
          ? 'Linked Review'
          : publishBlockedByDetachedHead
            ? 'No Branch'
            : 'Publish Branch',
    title: upstreamLoading
      ? 'Checking branch status…'
      : publishBlockedByPRLoading
        ? 'Checking PR status…'
        : publishBlockedByMergedPR
          ? 'PR is already merged'
          : publishBlockedByOpenHostedReview
            ? context.canPushLinkedReviewWithoutUpstream
              ? 'Linked review branch already exists'
              : 'Linked review branch target is unavailable'
            : publishBlockedByDetachedHead
              ? 'Check out a branch before publishing commits'
              : hasUpstream
                ? 'Branch is already published'
                : 'Publish this branch to origin',
    disabled:
      globalBusy ||
      upstreamLoading ||
      hasUpstream ||
      publishBlockedByPRLoading ||
      publishBlockedByMergedPR ||
      publishBlockedByOpenHostedReview ||
      publishBlockedByDetachedHead
  }
  return [
    pushItem,
    forcePushItem,
    pullItem,
    fastForwardItem,
    syncItem,
    rebaseItem,
    fetchItem,
    publishItem
  ]
}

function describePushCount(ahead: number): string {
  return `Push ${ahead} commit${ahead === 1 ? '' : 's'}`
}

function describePullCount(behind: number): string {
  return `Pull ${behind} commit${behind === 1 ? '' : 's'}`
}

function describeFastForwardCount(behind: number): string {
  return `Fast-forward ${behind} commit${behind === 1 ? '' : 's'}`
}

function describeSyncCounts(ahead: number, behind: number): string {
  return `Pull ${behind}, push ${ahead}`
}

function formatCountLabel(base: string, count: number): string {
  return count > 0 ? `${base} (${count})` : base
}

function formatSyncLabel(base: string, ahead: number, behind: number): string {
  return ahead === 0 && behind === 0 ? base : `${base} (↓${behind} ↑${ahead})`
}

function formatForcePushTitle(branchCommitsAhead: number | undefined, upstreamName?: string) {
  const countText =
    branchCommitsAhead && branchCommitsAhead > 0
      ? `${branchCommitsAhead} branch commit${branchCommitsAhead === 1 ? '' : 's'}`
      : 'this branch'
  return `Remote only has older copies of local commits. Force push ${countText} with lease to update ${upstreamName ?? 'the remote branch'}.`
}

function formatManualForcePushTitle(ahead: number, behind: number, upstreamName?: string): string {
  const commitText = ahead === 1 ? '1 local commit' : `${ahead} local commits`
  return behind > 0
    ? `Force push ${commitText} with lease to update ${upstreamName ?? 'the remote branch'} and replace remote-only commits.`
    : `Force push ${commitText} with lease to update ${upstreamName ?? 'the remote branch'}.`
}

function formatUnpublishedForcePushTitle(branchCommitsAhead: number | undefined): string {
  const countText =
    branchCommitsAhead && branchCommitsAhead > 0
      ? `${branchCommitsAhead} branch commit${branchCommitsAhead === 1 ? '' : 's'}`
      : 'this branch'
  return `Force push ${countText} with lease and set an upstream if needed.`
}

function formatRebaseBaseRef(baseRef: string): string {
  return baseRef.replace(/^refs\/remotes\//, '').replace(/^remotes\//, '')
}

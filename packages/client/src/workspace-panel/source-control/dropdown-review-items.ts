import { supportsHostedReviewCreation } from '@agentstart/protocol/hosted-review/creation-provider'
import {
  localizedHostedReviewCopy,
  resolveSupportedHostedReviewCopyProvider
} from '~renderer/i18n/hosted-review-localized-copy'
import { translate } from '~renderer/i18n/i18n'

import {
  canClickBlockedCreateReviewReason,
  resolveHostedReviewAuthInstruction
} from './create-review-blocked-action'
import type { DropdownActionContext } from './dropdown-context'
import type { DropdownItem } from './dropdown-items'

export function resolveDropdownReviewItems(
  context: DropdownActionContext
): [DropdownItem, DropdownItem] {
  const { hostedReviewCreation, globalBusy, shouldForcePushWithLease, upstreamLoading } = context
  const copy = {
    ...localizedHostedReviewCopy(
      resolveSupportedHostedReviewCopyProvider(hostedReviewCreation?.provider)
    ),
    authInstruction: resolveHostedReviewAuthInstruction(hostedReviewCreation?.provider ?? 'github')
  }
  const blockedHint = resolveCreateReviewBlockedHint(context, copy)
  const createItem: DropdownItem = {
    kind: 'create_pr',
    label: translate(
      'auto.components.right.sidebar.source.control.dropdown.items.9e779995dd',
      'Create {{value0}}',
      { value0: copy.shortLabel }
    ),
    title: hostedReviewCreation?.canCreate
      ? `Create a ${copy.reviewLabel} for this branch`
      : blockedHint,
    hint: hostedReviewCreation?.canCreate ? undefined : blockedHint,
    disabled:
      globalBusy ||
      !supportsHostedReviewCreation(hostedReviewCreation?.provider) ||
      (!hostedReviewCreation?.canCreate &&
        !canClickBlockedCreateReviewReason(hostedReviewCreation?.blockedReason))
  }
  const canPushAndCreate =
    !globalBusy &&
    !upstreamLoading &&
    supportsHostedReviewCreation(hostedReviewCreation?.provider) &&
    (hostedReviewCreation.blockedReason === 'needs_push' ||
      (hostedReviewCreation.blockedReason === 'needs_sync' && shouldForcePushWithLease))
  const pushCreateItem: DropdownItem = {
    kind: 'push_create_pr',
    label: shouldForcePushWithLease
      ? `Force Push before ${copy.shortLabel}`
      : `Push before ${copy.shortLabel}`,
    title: canPushAndCreate
      ? shouldForcePushWithLease
        ? `Force push with lease before creating a ${copy.reviewLabel}`
        : `Push local commits before creating a ${copy.reviewLabel}`
      : blockedHint,
    hint: canPushAndCreate ? undefined : blockedHint,
    disabled: !canPushAndCreate
  }
  return [createItem, pushCreateItem]
}

function resolveCreateReviewBlockedHint(
  context: DropdownActionContext,
  copy: ReturnType<typeof localizedHostedReviewCopy> & { authInstruction: string }
): string {
  switch (context.hostedReviewCreation?.blockedReason) {
    case 'dirty':
      return 'Commit changes first'
    case 'detached_head':
      return 'Check out a branch first'
    case 'default_branch':
      return 'Switch to a feature branch'
    case 'no_upstream':
      return 'Publish Branch'
    case 'needs_push':
      return 'Push first'
    case 'needs_sync':
      return context.shouldForcePushWithLease ? 'Force Push first' : 'Sync first'
    case 'auth_required':
      return `${copy.authInstruction} in this environment`
    case 'unsupported_provider':
      return 'Unsupported provider'
    case 'existing_review':
      return `A ${copy.reviewLabel} already exists`
    case 'fork_head_unsupported':
      return 'Fork head unsupported'
    case 'base_not_on_remote':
      return 'Base branch is not on the remote'
    case null:
    case undefined:
      return context.upstreamLoading ? 'Checking branch status…' : 'Branch is not ready'
  }
}

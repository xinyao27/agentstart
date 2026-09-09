import type { GitConflictOperation } from '@yiru/protocol/git/status-types'
import { translate } from '~renderer/i18n/i18n'

import { resolveDropdownCommitItems } from './dropdown-commit-items'
import { resolveDropdownActionContext } from './dropdown-context'
import { resolveDropdownRemoteItems } from './dropdown-remote-items'
import { resolveDropdownReviewItems } from './dropdown-review-items'
import type { PrimaryActionInputs } from './primary-action'

export type DropdownActionInputs = PrimaryActionInputs & {
  conflictOperation?: GitConflictOperation
  isPullRequestOperationActive?: boolean
  rebaseBaseRef?: string | null
}

export type DropdownActionKind =
  | 'commit'
  | 'commit_push'
  | 'commit_sync'
  | 'abort_merge'
  | 'abort_rebase'
  | 'create_pr'
  | 'push_create_pr'
  | 'push'
  | 'force_push'
  | 'pull'
  | 'fast_forward'
  | 'sync'
  | 'rebase_base'
  | 'fetch'
  | 'publish'

export type DropdownItem = {
  kind: DropdownActionKind
  label: string
  title: string
  disabled: boolean
  hint?: string
  variant?: 'default' | 'destructive'
}

export type DropdownSeparator = { kind: 'separator' }
export type DropdownEntry = DropdownItem | DropdownSeparator

/** Keep every row mounted so disabled reasons and menu ordering stay stable. */
export function resolveDropdownItems(inputs: DropdownActionInputs): DropdownEntry[] {
  const context = resolveDropdownActionContext(inputs)
  const [commitItem, commitPushItem, commitSyncItem] = resolveDropdownCommitItems(context)
  const [
    pushItem,
    forcePushItem,
    pullItem,
    fastForwardItem,
    syncItem,
    rebaseItem,
    fetchItem,
    publishItem
  ] = resolveDropdownRemoteItems(context)
  const [createReviewItem, pushCreateReviewItem] = resolveDropdownReviewItems(context)
  const entries: DropdownEntry[] = [
    commitItem,
    commitPushItem,
    commitSyncItem,
    { kind: 'separator' },
    pushItem,
    forcePushItem,
    createReviewItem,
    pushCreateReviewItem,
    pullItem,
    fastForwardItem,
    syncItem,
    rebaseItem,
    fetchItem,
    publishItem
  ]
  if (context.conflictOperation === 'merge' || context.conflictOperation === 'rebase') {
    const isRebase = context.conflictOperation === 'rebase'
    entries.push(
      { kind: 'separator' },
      {
        kind: isRebase ? 'abort_rebase' : 'abort_merge',
        label: isRebase ? 'Abort rebase' : 'Abort merge',
        title: context.globalBusy
          ? 'Operation in progress…'
          : `Abort the ${context.conflictOperation} in progress`,
        disabled: context.globalBusy,
        variant: 'destructive'
      }
    )
  }
  if (!context.isPullRequestOperationActive) {
    return entries
  }
  return entries.map((entry) =>
    entry.kind === 'separator'
      ? entry
      : {
          ...entry,
          title: translate(
            'auto.components.right.sidebar.source.control.dropdown.items.7aad2c0240',
            'Hosted review operation in progress…'
          ),
          disabled: true
        }
  )
}

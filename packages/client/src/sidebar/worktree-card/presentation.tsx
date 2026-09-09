import type { GitConflictOperation } from '@yiru/protocol/git/status-types'
import type { CheckStatus } from '@yiru/protocol/hosted-review/pull-request-types'
import type { TerminalTab } from '@yiru/protocol/workspace/tabs'
import React from 'react'
import { GitPullRequest } from '~renderer/icons/hugeicons'

// ── Pure helper functions ────────────────────────────────────────────

export function branchDisplayName(branch: string): string {
  return branch.replace(/^refs\/heads\//, '')
}

export function checksLabel(status: CheckStatus): string {
  switch (status) {
    case 'success':
      return 'Passing'
    case 'failure':
      return 'Failing'
    case 'pending':
      return 'Pending'
    case 'neutral':
      return ''
  }
}

export const CONFLICT_OPERATION_LABELS: Record<Exclude<GitConflictOperation, 'unknown'>, string> = {
  merge: 'Merging',
  rebase: 'Rebasing',
  'cherry-pick': 'Cherry-picking',
  revert: 'Reverting'
}

// ── Stable empty arrays for tabs fallback ────────────────────────────

export const EMPTY_TABS: TerminalTab[] = []
export const EMPTY_BROWSER_TABS: { id: string }[] = []

export function PullRequestIcon({ className }: { className?: string }): React.JSX.Element {
  return <GitPullRequest className={className} aria-hidden />
}

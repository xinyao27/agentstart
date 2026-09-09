import type { GitStatusEntry, GitUpstreamStatus } from '@yiru/protocol/git/status-types'
import {
  normalizeHostedReviewBaseRef,
  normalizeHostedReviewHeadRef
} from '@yiru/protocol/hosted-review/refs'
import { isBehindOnlyUpstream } from '~renderer/source-control/workflow/operation'

import { summarizeCommitFailure } from '../commit-failure-summary'
import { getStageAllPaths } from '../discard-all-sequence'

export type CreatePrIntentRunToken = {
  repoId: string
  worktreeId: string
  worktreePath: string
  branch: string
  baseRef?: string | null
  startedAt: number
}

export type CreatePrIntentCurrentTarget = {
  repoId?: string | null
  worktreeId?: string | null
  worktreePath?: string | null
  branch?: string | null
  baseRef?: string | null
}

export type CreatePrIntentPreparationOutcome = 'ready' | 'stopped' | 'remote_failed' | 'superseded'

type CreatePrIntentPreparationRemoteResult = {
  status: 'ok' | 'failed' | 'superseded' | 'skipped'
}

export async function prepareCreatePrIntentBeforeCommit({
  refresh,
  readUpstreamStatus,
  fastForward,
  stage
}: {
  refresh: () => Promise<boolean>
  readUpstreamStatus: () => GitUpstreamStatus | undefined
  fastForward: () => Promise<CreatePrIntentPreparationRemoteResult>
  stage: () => Promise<boolean>
}): Promise<CreatePrIntentPreparationOutcome> {
  if (!(await refresh())) {
    return 'stopped'
  }

  // Why: update before commit to avoid divergence; cross-host `git pull --ff-only`
  // also refuses concurrent divergence or overwritten local edits.
  if (isBehindOnlyUpstream(readUpstreamStatus())) {
    const result = await fastForward()
    if (result.status === 'superseded') {
      return 'superseded'
    }
    if (result.status !== 'ok') {
      return 'remote_failed'
    }
    if (!(await refresh())) {
      return 'stopped'
    }
  }

  return (await stage()) ? 'ready' : 'stopped'
}

export function createCreatePrIntentRunToken(input: Omit<CreatePrIntentRunToken, 'startedAt'>) {
  return { ...input, startedAt: Date.now() }
}

function normalizeCreatePrIntentBaseIdentityRef(ref: string | null | undefined): string {
  const trimmed = ref?.trim()
  if (!trimmed) {
    return ''
  }
  // Why: compare bases are local git refs; origin/main and upstream/main must
  // stay distinct even though hosted review APIs receive only branch names.
  if (trimmed.startsWith('refs/remotes/')) {
    return trimmed.slice('refs/remotes/'.length)
  }
  if (trimmed.startsWith('remotes/')) {
    return trimmed.slice('remotes/'.length)
  }
  if (trimmed.startsWith('refs/heads/')) {
    return trimmed.slice('refs/heads/'.length)
  }
  return trimmed
}

export function createPrIntentRunTokenMatches(
  token: CreatePrIntentRunToken,
  current: CreatePrIntentCurrentTarget
): boolean {
  return (
    token.repoId === current.repoId &&
    token.worktreeId === current.worktreeId &&
    token.worktreePath === current.worktreePath &&
    token.branch === current.branch &&
    normalizeCreatePrIntentBaseIdentityRef(token.baseRef) ===
      normalizeCreatePrIntentBaseIdentityRef(current.baseRef)
  )
}

export function createPrIntentCurrentTargetConflictsWithToken(
  token: CreatePrIntentRunToken,
  current: CreatePrIntentCurrentTarget
): boolean {
  // Worktree navigation is allowed during a run; only drift within the
  // token's original worktree should be treated as a conflict.
  if (current.worktreeId !== token.worktreeId) {
    return false
  }
  return !createPrIntentRunTokenMatches(token, current)
}

export function createPrIntentGitStatusMatchesToken(
  token: CreatePrIntentRunToken,
  status: { branch?: string | null }
): boolean {
  const branch = normalizeHostedReviewHeadRef(status.branch ?? '')
  return branch.length > 0 && branch === token.branch
}

export function getCreatePrIntentStagePaths(grouped: {
  unstaged: GitStatusEntry[]
  untracked: GitStatusEntry[]
}): string[] {
  return [
    ...getStageAllPaths(grouped.unstaged, 'unstaged'),
    ...getStageAllPaths(grouped.untracked, 'untracked')
  ]
}

export function resolveCreatePrIntentReviewBase({
  currentBaseRef,
  eligibilityDefaultBaseRef,
  composerBaseRef
}: {
  currentBaseRef?: string | null
  eligibilityDefaultBaseRef?: string | null
  composerBaseRef?: string | null
}): string {
  // Why: prefer the remote-validated eligibility default over the raw compare
  // base. The intent flow auto-submits, and its eligibility is recomputed from
  // this same compare base right before creation — so `eligibilityDefaultBaseRef`
  // already keeps a pushed base verbatim and corrects a local-only stacked parent
  // to the repo default. Using it keeps the one-click path consistent with the
  // composer instead of submitting a base the remote cannot resolve. Fall back to
  // the compare base only when eligibility supplied no default.
  return normalizeHostedReviewBaseRef(
    eligibilityDefaultBaseRef?.trim() || currentBaseRef?.trim() || composerBaseRef?.trim() || ''
  )
}

export function getCreatePrIntentCommitFailureNoticeMessage(
  commitError: string | null | undefined,
  copy: {
    fallback: string
    withSummary: (summary: string) => string
  } = {
    fallback: 'Could not commit changes. Fix the issue, then retry Create PR.',
    withSummary: (summary: string) =>
      `Commit blocked: ${summary} Fix the issue, then retry Create PR.`
  }
): string {
  const summary = commitError ? summarizeCommitFailure(commitError) : null

  if (!summary) {
    return copy.fallback
  }

  return copy.withSummary(summary)
}

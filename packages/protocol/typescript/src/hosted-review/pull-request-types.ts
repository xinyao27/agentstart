import type { RepoKindValue as RepoKind } from '../repo-types'

// ─── GitHub ──────────────────────────────────────────────────────────
export type PRState = 'open' | 'closed' | 'merged' | 'draft'
export type CheckStatus = 'pending' | 'success' | 'failure' | 'neutral'

export type PRMergeableState = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
export type PRReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'

export type PRConflictSummary = {
  baseRef: string
  baseCommit: string
  commitsBehind: number
  files: string[]
  localMergeState?: 'clean'
}

export type GitHubRepositoryIdentity = { owner: string; repo: string }

export type GitHubPRMergeMethod = 'merge' | 'squash' | 'rebase'

export type GitHubPRMergeMethodSettings = {
  defaultMethod: GitHubPRMergeMethod
  allowedMethods: Record<GitHubPRMergeMethod, boolean>
}

export type PRInfo = {
  number: number
  title: string
  state: PRState
  url: string
  checksStatus: CheckStatus
  updatedAt: string
  mergeable: PRMergeableState
  reviewDecision?: PRReviewDecision | null
  autoMergeEnabled?: boolean
  autoMergeAllowed?: boolean | null
  mergeQueueRequired?: boolean | null
  mergeMethodSettings?: GitHubPRMergeMethodSettings
  mergeStateStatus?: string | null
  // Why: check-runs are keyed by the PR head commit, not the mutable branch name.
  // Keeping the head SHA in cached PR metadata lets the checks panel poll the
  // correct commit without re-querying GitHub or guessing from local branch refs.
  headSha?: string
  // Why: a merged branch-matched PR stays visible when the worktree head is one
  // of the PR's own commits (behind update-branch/web commits). Cache staleness
  // checks must honor that confirmation without re-querying GitHub.
  confirmedContainedHeadOid?: string
  // Why: the worktree HEAD OID this merged linked PR was confirmed to have
  // diverged from (a definite not-contained probe). Head-scoped, not a bare
  // boolean, so a PR-number-coalesced refresh broadcast cannot clear a sibling
  // worktree whose own head is still on the PR's line of work. Clearing a
  // durable linked PR requires this positive signal for that exact head, never
  // the mere absence of a containment confirmation after a rate-limit/error.
  headDivergedFromMergedPRAtOid?: string
  /** Target branch name for PR-created worktree compare-base repair. */
  baseRefName?: string
  /** PR head branch name. Lets linked-PR consumers detect that the worktree
   *  has switched to a different branch and the durable link is stale. */
  headRefName?: string
  prRepo?: GitHubRepositoryIdentity
  headRepo?: GitHubRepositoryIdentity
  conflictSummary?: PRConflictSummary
}

export type PRRefreshOutcome =
  | { kind: 'found'; pr: PRInfo; fetchedAt: number }
  | { kind: 'no-pr'; fetchedAt: number }
  | {
      kind: 'upstream-error'
      errorType:
        | 'rate_limited'
        | 'auth'
        | 'network'
        | 'permission'
        | 'repo_unavailable'
        | 'gh_unavailable'
        | 'unknown'
      message: string
      fetchedAt: number
    }

export type GitHubPRRefreshReason = 'visible' | 'active' | 'post-push' | 'manual' | 'swr'

export type GitHubPRRefreshEnqueueResult =
  | { kind: 'queued' }
  | { kind: 'skipped'; skippedReason: 'validation-denied' | 'validation-backoff' }
  | { kind: 'fallback' }

export type GitHubPRRefreshAlias = {
  cacheKey: string
  repoId?: string
  repoPath: string
  branch: string
  worktreeId?: string
  connectionId?: string | null
  executionHostId?: string | null
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
  fallbackPRSource?: 'explicit' | 'pr-cache' | 'hosted-review' | null
  // Why: request-time worktree HEAD. Merged branch-matched PRs are only visible
  // for heads that belong to the PR, and refresh consumers need this snapshot to
  // clear a durable linked PR once main confirms the head diverged.
  currentHeadOid?: string | null
}

export type GitHubPRRefreshCandidate = GitHubPRRefreshAlias & {
  repoKind: RepoKind
  repoId: string
  isBare?: boolean
  isArchived?: boolean
  connectionId?: string | null
  executionHostId?: string | null
  connectionState?: 'connected' | 'disconnected' | 'unknown'
  cachedFetchedAt?: number | null
  cachedHasPR?: boolean | null
  cachedPRState?: PRState | null
  cachedChecksStatus?: CheckStatus | null
  cachedMergeable?: PRMergeableState | null
  cachedMergeStateStatus?: string | null
  localGitOptions?: { wslDistro?: string }
}

export type GitHubPRRefreshSkippedReason =
  | 'fresh'
  | 'not-git'
  | 'bare'
  | 'archived'
  | 'disconnected'
  | 'remote'
  | 'rate-limit'

type GitHubPRRefreshEventBase = {
  sequence: number
  reason: GitHubPRRefreshReason
  aliases: GitHubPRRefreshAlias[]
  requestStartedAt?: number
}

export type GitHubPRRefreshEvent =
  | (GitHubPRRefreshEventBase & {
      outcome: PRRefreshOutcome
      status?: never
      pausedUntil?: never
      skippedReason?: never
    })
  | (GitHubPRRefreshEventBase & {
      status: 'queued' | 'in-flight'
      outcome?: never
      pausedUntil?: never
      skippedReason?: never
    })
  | (GitHubPRRefreshEventBase & {
      status: 'paused'
      pausedUntil: number
      skippedReason: 'rate-limit'
      outcome?: never
    })
  | (GitHubPRRefreshEventBase & {
      status: 'skipped'
      skippedReason: GitHubPRRefreshSkippedReason
      outcome?: never
      pausedUntil?: never
    })

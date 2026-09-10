import {
  GitHubChecksState,
  GitHubReviewDecision,
  type GitHubRepoRef,
  type GitHubConflictSummary as ProtocolConflictSummary,
  type GitHubMergeMethodSettings as ProtocolMergeMethodSettings,
  type GitHubUser as ProtocolUser
} from '../../generated/agent_start/runtime/v1/github_pb.js'

export type GitHubOwnerRepo = { owner: string; repo: string }
export type GitHubAssignableUser = { login: string; name: string | null; avatarUrl: string }
export type GitHubPRReviewSummary = {
  login: string
  state?: string | null
  avatarUrl?: string | null
}
export type GitHubPRCheckSummary = {
  state: 'success' | 'failure' | 'pending' | 'none'
  total: number
  passed: number
  failed: number
  pending: number
}
export type GitHubPRMergeMethod = 'merge' | 'squash' | 'rebase'
export type GitHubPRMergeMethodSettings = {
  defaultMethod: GitHubPRMergeMethod
  allowedMethods: Record<GitHubPRMergeMethod, boolean>
}
export type PRConflictSummary = {
  baseRef: string
  baseCommit: string
  commitsBehind: number
  files: string[]
  localMergeState?: 'clean'
}
export type PRState = 'open' | 'closed' | 'merged' | 'draft'
export type CheckStatus = 'pending' | 'success' | 'failure' | 'neutral'
export type PRMergeableState = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
export type PRReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'

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
  headSha?: string
  confirmedContainedHeadOid?: string
  headDivergedFromMergedPRAtOid?: string
  baseRefName?: string
  headRefName?: string
  prRepo?: GitHubOwnerRepo
  headRepo?: GitHubOwnerRepo
  conflictSummary?: PRConflictSummary
}

export function githubOwnerRepo(ref: GitHubRepoRef | undefined): GitHubOwnerRepo | null {
  return ref ? { owner: ref.owner, repo: ref.repo } : null
}

export function prState(value: number): PRState {
  switch (value) {
    case 2:
      return 'closed'
    case 3:
      return 'merged'
    case 4:
      return 'draft'
    default:
      return 'open'
  }
}

export function mergeable(value: number | undefined): PRMergeableState {
  if (value === 2) {
    return 'CONFLICTING'
  }
  if (value === 1) {
    return 'MERGEABLE'
  }
  return 'UNKNOWN'
}

export function checksStatus(value: number): CheckStatus {
  switch (value) {
    case GitHubChecksState.SUCCESS:
      return 'success'
    case GitHubChecksState.FAILURE:
      return 'failure'
    case GitHubChecksState.NONE:
      return 'pending'
    default:
      return 'pending'
  }
}

export function reviewDecision(value: number | undefined): PRReviewDecision | null {
  switch (value) {
    case GitHubReviewDecision.APPROVED:
      return 'APPROVED'
    case GitHubReviewDecision.CHANGES_REQUESTED:
      return 'CHANGES_REQUESTED'
    case GitHubReviewDecision.REVIEW_REQUIRED:
      return 'REVIEW_REQUIRED'
    default:
      return null
  }
}

export function mergeMethodSettings(
  value: ProtocolMergeMethodSettings | undefined
): GitHubPRMergeMethodSettings | undefined {
  if (!value) {
    return undefined
  }
  return {
    defaultMethod: (value.defaultMethod as GitHubPRMergeMethod) || 'squash',
    allowedMethods: {
      merge: value.mergeAllowed,
      squash: value.squashAllowed,
      rebase: value.rebaseAllowed
    }
  }
}

export function conflictSummary(
  value: ProtocolConflictSummary | undefined
): PRConflictSummary | undefined {
  if (!value) {
    return undefined
  }
  return {
    baseRef: value.baseRef,
    baseCommit: value.baseCommit,
    commitsBehind: Number(value.commitsBehind),
    files: value.files,
    ...(value.mergeClean ? { localMergeState: 'clean' as const } : {})
  }
}

export function user(value: ProtocolUser): GitHubAssignableUser {
  return { login: value.login, name: value.name ?? null, avatarUrl: value.avatarUrl }
}

export function reviewSummary(value: ProtocolUser): GitHubPRReviewSummary {
  return { login: value.login, state: value.reviewState ?? null, avatarUrl: value.avatarUrl }
}

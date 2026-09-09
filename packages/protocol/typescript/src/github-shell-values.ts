import { create } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  AppStarSource as ProtocolAppStarSource,
  GitHubPrChecksStatus as ProtocolChecksStatus,
  GitHubPrMergeable as ProtocolMergeable,
  GitHubPrRefreshEnqueueKind as ProtocolEnqueueKind,
  GitHubPrRefreshFallbackSource as ProtocolFallbackSource,
  GitHubPrRefreshCandidateSchema,
  GitHubPrRefreshReason as ProtocolRefreshReason,
  GitHubPrRefreshValidationSkip as ProtocolValidationSkip,
  GitHubPrState as ProtocolPrState,
  type GitHubShellServiceEnqueuePrRefreshResponse,
  type GitHubViewer as ProtocolViewer,
  ProjectRepositoryKind as ProtocolRepositoryKind
} from '../generated/yiru/runtime/v1/github_shell_pb.js'
import { RuntimeProtocolError } from './error.js'

export const GITHUB_SHELL_PROTOCOL_CAPABILITY = 'github.shell.protobuf.v1' as const

export type AppStarSource =
  | 'star_nag'
  | 'agent_value_moment'
  | 'onboarding_completed'
  | 'settings'
  | 'landing'

export type GitHubViewer = { login: string; email: string | null }

export type GitHubPrRefreshReason = 'visible' | 'active' | 'post-push' | 'manual' | 'swr'

export type GitHubPrRefreshCandidate = {
  cacheKey: string
  repoId: string
  repoPath: string
  repoKind: 'git' | 'folder'
  branch: string
  worktreeId?: string
  currentHeadOid?: string | null
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
  fallbackPRSource?: 'explicit' | 'pr-cache' | 'hosted-review' | null
  isBare?: boolean
  isArchived?: boolean
  cachedFetchedAt?: number | null
  cachedHasPR?: boolean | null
  cachedPRState?: 'open' | 'closed' | 'merged' | 'draft' | null
  cachedChecksStatus?: 'pending' | 'success' | 'failure' | 'neutral' | null
  cachedMergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null
  cachedMergeStateStatus?: string | null
}

export type GitHubPrRefreshEnqueueResult =
  | { kind: 'queued' }
  | { kind: 'skipped'; skippedReason: 'validation-denied' | 'validation-backoff' }
  | { kind: 'fallback' }

export function protocolCandidate(candidate: GitHubPrRefreshCandidate) {
  return create(GitHubPrRefreshCandidateSchema, {
    cacheKey: candidate.cacheKey,
    repoId: candidate.repoId,
    repoPath: candidate.repoPath,
    repoKind: repositoryKind(candidate.repoKind),
    branch: candidate.branch,
    ...(candidate.worktreeId ? { worktreeId: candidate.worktreeId } : {}),
    ...(candidate.currentHeadOid ? { currentHeadOid: candidate.currentHeadOid } : {}),
    ...(candidate.linkedPRNumber == null
      ? {}
      : { linkedPrNumber: positiveBigInt(candidate.linkedPRNumber, 'Linked PR number') }),
    ...(candidate.fallbackPRNumber == null
      ? {}
      : { fallbackPrNumber: positiveBigInt(candidate.fallbackPRNumber, 'Fallback PR number') }),
    ...(candidate.fallbackPRSource
      ? { fallbackPrSource: fallbackSource(candidate.fallbackPRSource) }
      : {}),
    isBare: candidate.isBare ?? false,
    isArchived: candidate.isArchived ?? false,
    ...(candidate.cachedFetchedAt == null
      ? {}
      : {
          cachedFetchedAtMs: nonnegativeFinite(candidate.cachedFetchedAt, 'Cached fetch timestamp')
        }),
    ...(candidate.cachedHasPR == null ? {} : { cachedHasPr: candidate.cachedHasPR }),
    ...(candidate.cachedPRState ? { cachedPrState: prState(candidate.cachedPRState) } : {}),
    ...(candidate.cachedChecksStatus
      ? { cachedChecksStatus: checksStatus(candidate.cachedChecksStatus) }
      : {}),
    ...(candidate.cachedMergeable ? { cachedMergeable: mergeable(candidate.cachedMergeable) } : {}),
    ...(candidate.cachedMergeStateStatus
      ? { cachedMergeStateStatus: candidate.cachedMergeStateStatus }
      : {})
  })
}

export function protocolRefreshReason(reason: GitHubPrRefreshReason): ProtocolRefreshReason {
  switch (reason) {
    case 'visible':
      return ProtocolRefreshReason.VISIBLE
    case 'active':
      return ProtocolRefreshReason.ACTIVE
    case 'post-push':
      return ProtocolRefreshReason.POST_PUSH
    case 'manual':
      return ProtocolRefreshReason.MANUAL
    case 'swr':
      return ProtocolRefreshReason.SWR
  }
}

export function protocolStarSource(source: AppStarSource): ProtocolAppStarSource {
  switch (source) {
    case 'star_nag':
      return ProtocolAppStarSource.STAR_NAG
    case 'agent_value_moment':
      return ProtocolAppStarSource.AGENT_VALUE_MOMENT
    case 'onboarding_completed':
      return ProtocolAppStarSource.ONBOARDING_COMPLETED
    case 'settings':
      return ProtocolAppStarSource.SETTINGS
    case 'landing':
      return ProtocolAppStarSource.LANDING
  }
}

export function githubViewer(viewer: ProtocolViewer | undefined): GitHubViewer | null {
  if (!viewer) {
    return null
  }
  if (viewer.login.length === 0) {
    throw invalidResponse('GitHub viewer login is missing')
  }
  return { login: viewer.login, email: viewer.email ?? null }
}

export function enqueueResult(
  response: GitHubShellServiceEnqueuePrRefreshResponse
): GitHubPrRefreshEnqueueResult | false {
  switch (response.kind) {
    case ProtocolEnqueueKind.QUEUED:
      rejectSkip(response.skippedReason)
      return { kind: 'queued' }
    case ProtocolEnqueueKind.SKIPPED:
      return { kind: 'skipped', skippedReason: validationSkip(response.skippedReason) }
    case ProtocolEnqueueKind.FALLBACK:
      rejectSkip(response.skippedReason)
      return { kind: 'fallback' }
    case ProtocolEnqueueKind.UNAVAILABLE:
      rejectSkip(response.skippedReason)
      return false
    case ProtocolEnqueueKind.UNSPECIFIED:
      throw invalidResponse('GitHub PR refresh enqueue kind is unspecified')
  }
  throw invalidResponse('GitHub PR refresh enqueue kind is unknown')
}

function repositoryKind(kind: GitHubPrRefreshCandidate['repoKind']): ProtocolRepositoryKind {
  return kind === 'git' ? ProtocolRepositoryKind.GIT : ProtocolRepositoryKind.FOLDER
}

function fallbackSource(
  source: NonNullable<GitHubPrRefreshCandidate['fallbackPRSource']>
): ProtocolFallbackSource {
  switch (source) {
    case 'explicit':
      return ProtocolFallbackSource.EXPLICIT
    case 'pr-cache':
      return ProtocolFallbackSource.PR_CACHE
    case 'hosted-review':
      return ProtocolFallbackSource.HOSTED_REVIEW
  }
}

function prState(state: NonNullable<GitHubPrRefreshCandidate['cachedPRState']>): ProtocolPrState {
  switch (state) {
    case 'open':
      return ProtocolPrState.OPEN
    case 'closed':
      return ProtocolPrState.CLOSED
    case 'merged':
      return ProtocolPrState.MERGED
    case 'draft':
      return ProtocolPrState.DRAFT
  }
}

function checksStatus(
  status: NonNullable<GitHubPrRefreshCandidate['cachedChecksStatus']>
): ProtocolChecksStatus {
  switch (status) {
    case 'pending':
      return ProtocolChecksStatus.PENDING
    case 'success':
      return ProtocolChecksStatus.SUCCESS
    case 'failure':
      return ProtocolChecksStatus.FAILURE
    case 'neutral':
      return ProtocolChecksStatus.NEUTRAL
  }
}

function mergeable(
  value: NonNullable<GitHubPrRefreshCandidate['cachedMergeable']>
): ProtocolMergeable {
  switch (value) {
    case 'MERGEABLE':
      return ProtocolMergeable.MERGEABLE
    case 'CONFLICTING':
      return ProtocolMergeable.CONFLICTING
    case 'UNKNOWN':
      return ProtocolMergeable.UNKNOWN
  }
}

function validationSkip(
  reason: ProtocolValidationSkip | undefined
): 'validation-denied' | 'validation-backoff' {
  switch (reason) {
    case ProtocolValidationSkip.DENIED:
      return 'validation-denied'
    case ProtocolValidationSkip.BACKOFF:
      return 'validation-backoff'
    case ProtocolValidationSkip.UNSPECIFIED:
    case undefined:
      throw invalidResponse('GitHub PR refresh validation skip reason is missing')
  }
  throw invalidResponse('GitHub PR refresh validation skip reason is unknown')
}

function rejectSkip(reason: ProtocolValidationSkip | undefined): void {
  if (reason !== undefined) {
    throw invalidResponse('GitHub PR refresh enqueue result includes a skip reason')
  }
}

function positiveBigInt(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`)
  }
  return BigInt(value)
}

function nonnegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be finite and nonnegative`)
  }
  return value
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

import { StatusCode } from '../../generated/yiru/protocol/v1/errors_pb.js'
import type {
  GitHubPrSummary as ProtocolPrSummary,
  GitHubRefreshOutcome as ProtocolRefreshOutcome
} from '../../generated/yiru/runtime/v1/github_pb.js'
import { RuntimeProtocolError } from '../error.js'
import {
  checksStatus,
  conflictSummary,
  githubOwnerRepo,
  mergeable,
  mergeMethodSettings,
  prState,
  reviewDecision,
  type PRInfo
} from './values.js'

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

export function githubPrInfo(pr: ProtocolPrSummary | undefined): PRInfo | null {
  if (!pr) {
    return null
  }
  return {
    number: Number(pr.number),
    title: pr.title,
    state: prState(pr.state),
    url: pr.url,
    checksStatus: checksStatus(pr.checksStatus),
    updatedAt: pr.updatedAt,
    mergeable: mergeable(pr.mergeable),
    reviewDecision: reviewDecision(pr.reviewDecision),
    ...(pr.autoMergeEnabled !== undefined ? { autoMergeEnabled: pr.autoMergeEnabled } : {}),
    ...(pr.autoMergeAllowed !== undefined ? { autoMergeAllowed: pr.autoMergeAllowed } : {}),
    ...(pr.mergeQueueRequired !== undefined ? { mergeQueueRequired: pr.mergeQueueRequired } : {}),
    ...(pr.mergeMethodSettings
      ? { mergeMethodSettings: mergeMethodSettings(pr.mergeMethodSettings) }
      : {}),
    ...(pr.mergeStateStatus !== undefined ? { mergeStateStatus: pr.mergeStateStatus } : {}),
    ...(pr.headSha !== undefined ? { headSha: pr.headSha } : {}),
    ...(pr.confirmedContainedHeadOid !== undefined
      ? { confirmedContainedHeadOid: pr.confirmedContainedHeadOid }
      : {}),
    ...(pr.headDivergedFromMergedPrAtOid !== undefined
      ? { headDivergedFromMergedPRAtOid: pr.headDivergedFromMergedPrAtOid }
      : {}),
    ...(pr.baseRefName !== undefined ? { baseRefName: pr.baseRefName } : {}),
    ...(pr.headRefName !== undefined ? { headRefName: pr.headRefName } : {}),
    ...(pr.prRepo ? { prRepo: githubOwnerRepo(pr.prRepo) ?? undefined } : {}),
    ...(pr.headRepo ? { headRepo: githubOwnerRepo(pr.headRepo) ?? undefined } : {}),
    ...(pr.conflictSummary ? { conflictSummary: conflictSummary(pr.conflictSummary) } : {})
  }
}

export function githubRefreshOutcome(
  outcome: ProtocolRefreshOutcome | undefined
): PRRefreshOutcome {
  const fetchedAt = outcome ? Math.round(outcome.fetchedAtMs) : Date.now()
  if (outcome?.result.case === 'found') {
    const pr = githubPrInfo(outcome.result.value)
    if (!pr) {
      throw invalidResponse('GitHub refresh outcome is missing its PR payload')
    }
    return { kind: 'found', pr, fetchedAt }
  }
  if (outcome?.result.case === 'upstreamError') {
    return {
      kind: 'upstream-error',
      errorType: upstreamErrorType(outcome.result.value.errorType),
      message: outcome.result.value.message,
      fetchedAt
    }
  }
  return { kind: 'no-pr', fetchedAt }
}

function upstreamErrorType(
  value: string
): Extract<PRRefreshOutcome, { kind: 'upstream-error' }>['errorType'] {
  const known = [
    'rate_limited',
    'auth',
    'network',
    'permission',
    'repo_unavailable',
    'gh_unavailable',
    'unknown'
  ] as const
  type Known = (typeof known)[number]
  return (known.includes(value as Known) ? value : 'unknown') as Known
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

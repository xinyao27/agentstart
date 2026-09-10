import { StatusCode } from '../../generated/agent_start/protocol/v1/errors_pb.js'
import {
  GitHubHostedReviewBlockedReason,
  GitHubHostedReviewNextAction,
  GitHubHostedReviewProvider,
  type GitHubHostedReviewSummary,
  type GitHubServiceCreateHostedReviewResponse,
  type GitHubServiceGetHostedReviewCreationEligibilityResponse
} from '../../generated/agent_start/runtime/v1/github_pb.js'
import { RuntimeProtocolError } from '../error.js'

export type HostedReviewEligibility = {
  provider: 'github' | 'unsupported'
  review: { number: number; url: string } | null
  defaultBaseRef: string | null
  head: string | null
  canCreate: boolean
  blockedReason:
    | 'detached_head'
    | 'existing_review'
    | 'unsupported_provider'
    | 'default_branch'
    | 'dirty'
    | 'no_upstream'
    | 'needs_sync'
    | 'auth_required'
    | 'needs_push'
    | null
  nextAction:
    | 'open_existing_review'
    | 'commit'
    | 'publish'
    | 'sync'
    | 'authenticate'
    | 'push'
    | null
}

type CreateHostedReviewErrorCode =
  | 'auth_required'
  | 'unsupported_provider'
  | 'already_exists'
  | 'validation'
  | 'timeout'
  | 'unknown_completion'
  | 'push_failed'
  | 'unknown'

export type CreateHostedReviewResult =
  | { ok: true; number: number; url: string }
  | {
      ok: false
      code: CreateHostedReviewErrorCode
      error: string
      existingReview?: { number: number; url: string }
    }

export function githubHostedReviewEligibility(
  response: GitHubServiceGetHostedReviewCreationEligibilityResponse
): HostedReviewEligibility {
  return {
    provider: response.provider === GitHubHostedReviewProvider.GITHUB ? 'github' : 'unsupported',
    review: response.review
      ? { number: Number(response.review.number), url: response.review.url }
      : null,
    defaultBaseRef: response.defaultBaseRef ?? null,
    head: response.head ?? null,
    canCreate: response.canCreate,
    blockedReason: blockedReason(response.blockedReason),
    nextAction: nextAction(response.nextAction)
  }
}

function blockedReason(
  value: GitHubHostedReviewBlockedReason
): HostedReviewEligibility['blockedReason'] {
  switch (value) {
    case GitHubHostedReviewBlockedReason.DETACHED_HEAD:
      return 'detached_head'
    case GitHubHostedReviewBlockedReason.EXISTING_REVIEW:
      return 'existing_review'
    case GitHubHostedReviewBlockedReason.UNSUPPORTED_PROVIDER:
      return 'unsupported_provider'
    case GitHubHostedReviewBlockedReason.DEFAULT_BRANCH:
      return 'default_branch'
    case GitHubHostedReviewBlockedReason.DIRTY:
      return 'dirty'
    case GitHubHostedReviewBlockedReason.NO_UPSTREAM:
      return 'no_upstream'
    case GitHubHostedReviewBlockedReason.NEEDS_SYNC:
      return 'needs_sync'
    case GitHubHostedReviewBlockedReason.AUTH_REQUIRED:
      return 'auth_required'
    case GitHubHostedReviewBlockedReason.NEEDS_PUSH:
      return 'needs_push'
    default:
      return null
  }
}

function nextAction(value: GitHubHostedReviewNextAction): HostedReviewEligibility['nextAction'] {
  switch (value) {
    case GitHubHostedReviewNextAction.OPEN_EXISTING_REVIEW:
      return 'open_existing_review'
    case GitHubHostedReviewNextAction.COMMIT:
      return 'commit'
    case GitHubHostedReviewNextAction.PUBLISH:
      return 'publish'
    case GitHubHostedReviewNextAction.SYNC:
      return 'sync'
    case GitHubHostedReviewNextAction.AUTHENTICATE:
      return 'authenticate'
    case GitHubHostedReviewNextAction.PUSH:
      return 'push'
    default:
      return null
  }
}

function hostedReviewSummary(
  value: GitHubHostedReviewSummary | undefined
): { number: number; url: string } | undefined {
  return value ? { number: Number(value.number), url: value.url } : undefined
}

function createHostedReviewErrorCode(value: string | undefined): CreateHostedReviewErrorCode {
  switch (value) {
    case 'auth_required':
    case 'unsupported_provider':
    case 'already_exists':
    case 'validation':
    case 'timeout':
    case 'unknown_completion':
    case 'push_failed':
      return value
    default:
      return 'unknown'
  }
}

export function githubCreateHostedReviewResult(
  response: GitHubServiceCreateHostedReviewResponse
): CreateHostedReviewResult {
  if (response.ok) {
    if (response.number === undefined || !response.url) {
      throw invalidResponse('Successful hosted review creation is missing its PR identity')
    }
    return { ok: true, number: Number(response.number), url: response.url }
  }
  return {
    ok: false,
    code: createHostedReviewErrorCode(response.code),
    error: response.error || 'Create PR failed',
    existingReview: hostedReviewSummary(response.existingReview)
  }
}

export function githubHostedReviewProviderInput(
  provider: 'github' | 'unsupported'
): GitHubHostedReviewProvider {
  return provider === 'github'
    ? GitHubHostedReviewProvider.GITHUB
    : GitHubHostedReviewProvider.UNSUPPORTED
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

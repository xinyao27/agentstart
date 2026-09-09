import { StatusCode } from '../../generated/yiru/protocol/v1/errors_pb.js'
import {
  GitHubCommentDraftKind,
  GitHubFileStatus,
  GitHubMergeMethod,
  GitHubPrOpenState,
  type GitHubMutationResult as ProtocolMutationResult
} from '../../generated/yiru/runtime/v1/github_pb.js'
import { RuntimeProtocolError } from '../error.js'
import type { GitHubPRFile } from './pr-file-values.js'
import type { GitHubPRMergeMethod } from './values.js'

export type GitHubMutationResult = { ok: true } | { ok: false; error: string }

export function githubMutationResult(
  result: ProtocolMutationResult | undefined
): GitHubMutationResult {
  if (!result) {
    throw invalidResponse('GitHub mutation result is missing')
  }
  return result.ok ? { ok: true } : { ok: false, error: result.error || 'GitHub mutation failed' }
}

export function githubMergeMethodInput(method: GitHubPRMergeMethod): GitHubMergeMethod {
  switch (method) {
    case 'merge':
      return GitHubMergeMethod.MERGE
    case 'rebase':
      return GitHubMergeMethod.REBASE
    default:
      return GitHubMergeMethod.SQUASH
  }
}

export function githubPrOpenStateInput(state: 'open' | 'closed'): GitHubPrOpenState {
  return state === 'closed' ? GitHubPrOpenState.CLOSED : GitHubPrOpenState.OPEN
}

export function githubCommentDraftKindInput(
  kind: 'issue' | 'pull-request'
): GitHubCommentDraftKind {
  return kind === 'pull-request'
    ? GitHubCommentDraftKind.PULL_REQUEST
    : GitHubCommentDraftKind.ISSUE
}

export function githubFileStatusInput(status: GitHubPRFile['status']): GitHubFileStatus {
  switch (status) {
    case 'added':
      return GitHubFileStatus.ADDED
    case 'removed':
      return GitHubFileStatus.REMOVED
    case 'renamed':
      return GitHubFileStatus.RENAMED
    case 'copied':
      return GitHubFileStatus.COPIED
    case 'changed':
      return GitHubFileStatus.CHANGED
    case 'unchanged':
      return GitHubFileStatus.UNCHANGED
    default:
      return GitHubFileStatus.MODIFIED
  }
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

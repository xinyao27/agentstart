import {
  GitForkSyncBlockReason,
  GitForkSyncStatus,
  type GitRemoteServiceForkSyncResponse as ProtocolForkSyncResponse
} from '../../generated/yiru/runtime/v1/git_remote_pb.js'

export type GitForkSyncBlockedReason =
  | 'missing-origin'
  | 'missing-upstream'
  | 'upstream-mismatch'
  | 'missing-upstream-default-branch'
  | 'missing-origin-branch'
  | 'diverged'
export type GitForkSyncResult = {
  status: 'up-to-date' | 'synced' | 'blocked'
  reason?: GitForkSyncBlockedReason
  originRemote: string
  upstreamRemote: string
  branchName?: string
  ahead: number
  behind: number
}
export type GitForkSyncExpectedUpstream = { owner: string; repo: string }

function forkSyncBlockedReasonFromProto(
  value: GitForkSyncBlockReason
): GitForkSyncBlockedReason | undefined {
  switch (value) {
    case GitForkSyncBlockReason.MISSING_ORIGIN:
      return 'missing-origin'
    case GitForkSyncBlockReason.MISSING_UPSTREAM:
      return 'missing-upstream'
    case GitForkSyncBlockReason.UPSTREAM_MISMATCH:
      return 'upstream-mismatch'
    case GitForkSyncBlockReason.MISSING_UPSTREAM_DEFAULT_BRANCH:
      return 'missing-upstream-default-branch'
    case GitForkSyncBlockReason.MISSING_ORIGIN_BRANCH:
      return 'missing-origin-branch'
    case GitForkSyncBlockReason.DIVERGED:
      return 'diverged'
    default:
      return undefined
  }
}

export function gitForkSyncResultFromProto(response: ProtocolForkSyncResponse): GitForkSyncResult {
  const reason =
    response.reason !== undefined ? forkSyncBlockedReasonFromProto(response.reason) : undefined
  return {
    status:
      response.status === GitForkSyncStatus.UP_TO_DATE
        ? 'up-to-date'
        : response.status === GitForkSyncStatus.SYNCED
          ? 'synced'
          : 'blocked',
    ...(reason ? { reason } : {}),
    originRemote: response.originRemote,
    upstreamRemote: response.upstreamRemote,
    ...(response.branchName ? { branchName: response.branchName } : {}),
    ahead: Number(response.ahead),
    behind: Number(response.behind)
  }
}

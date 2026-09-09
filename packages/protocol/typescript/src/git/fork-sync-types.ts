export type ForkSyncMode = 'ask' | 'safe-auto' | 'off'

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

export type GitForkSyncExpectedUpstream = {
  owner: string
  repo: string
}

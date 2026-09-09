import type { WorktreePushTarget } from '../worktree-types'

export function getPublishTargetDisplayName(target: WorktreePushTarget): string {
  return `${target.remoteName}/${target.branchName}`
}

export function getPublishTargetRemoteRef(target: WorktreePushTarget): string {
  return `refs/remotes/${target.remoteName}/${target.branchName}`
}

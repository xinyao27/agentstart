import type { WorktreePushTarget } from '../worktree-types.js'

export type GitPushTarget = WorktreePushTarget

export type BaseRefSearchResult = {
  refName: string
  localBranchName: string
}

export type GitHubPrStartPoint = {
  baseBranch: string
  /** Review target branch to use for Source Control compare after creating from a PR head SHA. */
  compareBaseRef?: string
  pushTarget?: GitPushTarget
  /** Verified PR head commit. Present when checkout can be tied to a stable SHA. */
  headSha?: string
  /** Exact local branch name to create/reuse when the PR head is a safe same-repo branch. */
  branchNameOverride?: string
  /** Fork PRs: false when "Allow edits from maintainers" is off; a push to the fork may be rejected. */
  maintainerCanModify?: boolean
}

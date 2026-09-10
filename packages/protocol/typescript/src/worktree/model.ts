import type { AgentStartWorkspaceLayout } from '../workspace/layout.js'
import type { WorktreeValue, WorktreeGitInfo } from '../worktree-types.js'

export type GitWorktreeInfo = WorktreeGitInfo
export type Worktree = Omit<
  WorktreeValue,
  'parentWorktreeId' | 'childWorktreeIds' | 'lineage' | 'workspaceLineage' | 'git'
>
export type WorktreeMeta = Omit<Worktree, 'id' | 'repoId' | keyof WorktreeGitInfo> & {
  preserveBranchOnDelete?: boolean
  agentstartCreatedAt?: number
  agentstartCreationSource?: 'desktop' | 'runtime' | 'cli' | 'ssh'
  agentstartCreationWorkspaceLayout?: AgentStartWorkspaceLayout
}

export type WorktreeHeadIdentity = {
  worktreePath: string
  head: string
  /** Full ref (e.g. `refs/heads/main`), or null for a detached HEAD. */
  branch: string | null
}

export type WorktreeOwnership = 'agentstart-managed' | 'external' | 'unknown-legacy'

export type DetectedWorktreeListSource = 'git' | 'metadata-fallback' | 'session-fallback'

export type DetectedWorktree = Worktree & {
  ownership: WorktreeOwnership
  selectedCheckout: boolean
  visible: boolean
}

export type DetectedWorktreeListResult = {
  revision?: number
  repoId: string
  authoritative: boolean
  source: DetectedWorktreeListSource
  worktrees: DetectedWorktree[]
}

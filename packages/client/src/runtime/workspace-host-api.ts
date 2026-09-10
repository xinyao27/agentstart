import type { GitHubPrStartPoint } from '@agentstart/protocol/git/worktree-source'
import type { ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { Repo } from '@agentstart/protocol/project/repository'
import type {
  CreateWorktreeResult,
  ForceDeleteWorktreeBranchResult,
  RemoveWorktreeResult,
  WorktreeBaseStatusEvent
} from '@agentstart/protocol/worktree/create-result'
import type { WorktreeLineage, WorkspaceLineage } from '@agentstart/protocol/worktree/lineage'
import type {
  DetectedWorktreeListResult,
  Worktree,
  WorktreeHeadIdentity,
  WorktreeMeta
} from '@agentstart/protocol/worktree/model'
import type { WorktreeCreateProgressEvent as RuntimeWorktreeCreateProgressEvent } from '~renderer/worktree-creation/progress'
import type { CreateWorktreeArgs } from '~renderer/worktree/create-model'

import type { ShellRepoHostApi } from './shell-system-client'

export type RepoWorkspaceApi = ShellRepoHostApi & {
  list: () => Promise<Repo[]>
  add: (args: {
    expectedRevision: number
    path: string
    kind?: 'git' | 'folder'
  }) => Promise<{ repo: Repo; revision?: number } | { error: string }>
  create: (args: {
    expectedRevision: number
    parentPath: string
    name: string
    kind: 'git' | 'folder'
  }) => Promise<{ repo: Repo; revision?: number } | { error: string }>
  isGitAvailable: () => Promise<boolean>
  remove: (args: {
    expectedRevision: number
    repoId: string
  }) => Promise<{ removed: boolean; revision?: number }>
  update: (args: {
    expectedRevision: number
    repoId: string
    updates: Partial<
      Pick<
        Repo,
        | 'displayName'
        | 'badgeColor'
        | 'repoIcon'
        | 'upstream'
        | 'hookSettings'
        | 'worktreeBaseRef'
        | 'worktreeBasePath'
        | 'kind'
        | 'forgeRemotePreference'
        | 'externalWorktreeVisibility'
        | 'externalWorktreeVisibilityPromptDismissedAt'
        | 'externalWorktreeInboxBaselinePaths'
        | 'importedExternalWorktreePaths'
        | 'projectGroupId'
        | 'projectGroupOrder'
        | 'forkSyncMode'
      >
    > & {
      sourceControlAi?: Repo['sourceControlAi'] | null
      externalWorktreeDiscoverySuppressedAt?: Repo['externalWorktreeDiscoverySuppressedAt'] | null
    }
  }) => Promise<{ repo: Repo; revision?: number }>
  clone: (args: {
    expectedRevision: number
    url: string
    destination: string
  }) => Promise<{ repo: Repo; revision?: number }>
  onCloneProgress: (callback: (data: { phase: string; percent: number }) => void) => () => void
  onChanged: (callback: () => void) => () => void
}

export type WorktreeWorkspaceApi = {
  list: (args: { repoId: string }) => Promise<Worktree[]>
  listDetected: (args: { repoId: string }) => Promise<DetectedWorktreeListResult>
  create: (args: CreateWorktreeArgs) => Promise<CreateWorktreeResult>
  onCreateProgress: (
    callback: (data: Omit<RuntimeWorktreeCreateProgressEvent, 'type'>) => void
  ) => () => void
  prefetchCreateBase: (args: { repoId: string; baseBranch?: string }) => Promise<void>
  resolvePrBase: (args: {
    repoId: string
    prNumber: number
    headRefName?: string
    baseRefName?: string
    isCrossRepository?: boolean
  }) => Promise<GitHubPrStartPoint | { error: string }>
  remove: (args: {
    expectedRevision: number
    worktreeId: string
    hostId?: ExecutionHostId
    force?: boolean
    skipArchive?: boolean
  }) => Promise<RemoveWorktreeResult>
  forceDeletePreservedBranch: (args: {
    worktreeId: string
    branchName: string
    expectedHead: string
  }) => Promise<ForceDeleteWorktreeBranchResult>
  updateMeta: (args: {
    expectedRevision: number
    worktreeId: string
    updates: Partial<WorktreeMeta>
  }) => Promise<{ revision?: number; worktree: Worktree }>
  listLineage: () => Promise<{
    lineage: Record<string, WorktreeLineage>
    workspaceLineage?: Record<string, WorkspaceLineage>
  }>
  persistSortOrder: (args: { orderedIds: string[] }) => Promise<void>
  onChanged: (
    callback: (data: {
      repoId: string
      renamed?: { oldWorktreeId: string; newWorktreeId: string }
    }) => void
  ) => () => void
  onGitStatusMetadataChanged: (callback: (data: { repoId: string }) => void) => () => void
  onHeadIdentitiesChanged: (
    callback: (data: { repoId: string; identities: WorktreeHeadIdentity[] }) => void
  ) => () => void
  onBaseStatus: (callback: (data: WorktreeBaseStatusEvent) => void) => () => void
}

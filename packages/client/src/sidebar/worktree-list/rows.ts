import type { ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { Project, ProjectHostSetup } from '@agentstart/protocol/project/model'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { ProjectOrderBy } from '@agentstart/protocol/settings/ui-state'
import type { FolderWorkspace } from '@agentstart/protocol/workspace/folder'
import type { WorkspaceStatusDefinition } from '@agentstart/protocol/workspace/status/model'
import type { WorktreeLineage } from '@agentstart/protocol/worktree/lineage'
import type { DetectedWorktree, Worktree } from '@agentstart/protocol/worktree/model'
import type React from 'react'
import type { AppState } from '~renderer/store/types'

export type WorktreeGroupBy = 'none' | 'workspace-status' | 'repo' | 'pr-status'
export type PinnedWorktreeDisplayPolicy = 'single-location' | 'duplicate-in-groups'

export type GroupHeaderRow = {
  type: 'header'
  key: string
  label: string
  count: number
  tone: string
  icon?: React.ComponentType<{ className?: string }>
  repo?: Repo
  projectGroup?: ProjectGroup | { id: null; name: 'Ungrouped'; tabOrder: number }
  projectGroupDepth?: number
  projectId?: string
  projectIdentityKey?: string
  collapsed?: boolean
  hostId?: ExecutionHostId
  hostWorktreeCounts?: ReadonlyMap<ExecutionHostId, number>
  hostWorktreeIds?: ReadonlyMap<ExecutionHostId, readonly string[]>
  worktreeIds?: readonly string[]
}

export type WorktreeRow = {
  type: 'item'
  rowKey: string
  sectionKey: string
  worktree: Worktree
  repo: Repo | undefined
  depth: number
  groupDepth: number
  lineageTrail: boolean[]
  isLastLineageChild: boolean
  lineageChildCount: number
  lineageGroupKey?: string
  lineageCollapsed?: boolean
  hostContextLabel?: string
}

export type ImportedWorktreesCardCandidate = {
  repo: Repo
  hiddenWorktrees: DetectedWorktree[]
}

export type ImportedWorktreesCardRow = {
  type: 'imported-worktrees-card'
  key: string
  repo: Repo
  hiddenWorktrees: DetectedWorktree[]
  placement: 'repo-group' | 'pinned-fallback'
}

export type NewExternalWorktreesInboxCandidate = {
  repo: Repo
  inboxWorktrees: DetectedWorktree[]
}

export type NewExternalWorktreesInboxRow = {
  type: 'new-external-worktrees-inbox'
  key: string
  repo: Repo
  inboxWorktrees: DetectedWorktree[]
}

export type PendingCreationRef = { creationId: string; repoId: string }

export type PendingCreationRow = {
  type: 'pending-creation'
  key: string
  creationId: string
  repo: Repo | undefined
}

type FolderWorkspaceRow = {
  type: 'folder-workspace'
  key: string
  folderWorkspace: FolderWorkspace
  projectGroup: ProjectGroup
  depth: number
  groupDepth: number
}

export type Row =
  | GroupHeaderRow
  | WorktreeRow
  | ImportedWorktreesCardRow
  | NewExternalWorktreesInboxRow
  | PendingCreationRow
  | FolderWorkspaceRow

export type ProjectGroupingModel = {
  projects: readonly Project[]
  projectHostSetups: readonly ProjectHostSetup[]
}

export type BuildRowsOptions = {
  groupBy: WorktreeGroupBy
  worktrees: Worktree[]
  repoMap: Map<string, Repo>
  prCache: Record<string, unknown> | null
  collapsedGroups: Set<string>
  repoOrder?: Map<string, number>
  workspaceStatuses?: readonly WorkspaceStatusDefinition[]
  projectOrderBy?: ProjectOrderBy
  lineageById?: Record<string, WorktreeLineage>
  worktreeMap?: Map<string, Worktree>
  nestLineage?: boolean
  settings?: AppState['settings']
  projectGroups?: readonly ProjectGroup[]
  placeholderRepoIds?: ReadonlySet<string>
  importedWorktreesByRepo?: ReadonlyMap<string, ImportedWorktreesCardCandidate>
  newExternalWorktreesInboxByRepo?: ReadonlyMap<string, NewExternalWorktreesInboxCandidate>
  pendingCreations?: readonly PendingCreationRef[]
  projectGrouping?: ProjectGroupingModel
  folderWorkspaces?: readonly FolderWorkspace[]
  hostLabelById?: ReadonlyMap<string, string>
  defaultHostId?: ExecutionHostId
  pinnedDisplayPolicy?: PinnedWorktreeDisplayPolicy
}

export type WorktreeGroupEntry = {
  label: string
  items: Worktree[]
  repo?: Repo
  repoIds: Set<string>
  projectId?: string
  projectIdentityKey?: string
}

export type OrderedGroupEntry = [string, WorktreeGroupEntry]

export function buildPendingCreationRow(
  creation: PendingCreationRef,
  repoMap: Map<string, Repo>
): PendingCreationRow {
  return {
    type: 'pending-creation',
    key: `pending:${creation.creationId}`,
    creationId: creation.creationId,
    repo: repoMap.get(creation.repoId)
  }
}

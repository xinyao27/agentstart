import type { ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { ProjectOrderBy } from '@agentstart/protocol/settings/ui-state'
import type { FolderWorkspace } from '@agentstart/protocol/workspace/folder'
import type {
  WorkspaceStatus,
  WorkspaceStatusDefinition
} from '@agentstart/protocol/workspace/status/model'
import type { WorktreeLineage, WorkspaceLineage } from '@agentstart/protocol/worktree/lineage'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import type React from 'react'
import type {
  PendingSidebarRowReveal,
  PendingSidebarWorktreeReveal
} from '~renderer/application-shell/state/slice'
import type { AppState } from '~renderer/store/types'

import type { HostSectionRow } from '../host-section-rows'
import type { ImportedWorktreeCardActionState } from '../imported-worktrees-card-actions'
import type { NewExternalWorktreesInboxActionState } from '../new-external-worktrees-inbox-actions'
import type { WorktreeDragGroup } from '../worktree-manual-order'
import type {
  ImportedWorktreesCardCandidate,
  ProjectGroupingModel,
  WorktreeGroupBy
} from './groups'

export type LegendWorktreeViewportProps = {
  navigationSurface: boolean
  rows: HostSectionRow[]
  activeWorktreeId: string | null
  currentWorktreeId: string | null
  groupBy: WorktreeGroupBy
  projectOrderBy: ProjectOrderBy
  toggleGroup: (key: string) => void
  collapsedGroups: Set<string>
  handleCreateForRepo: (projectId: string) => void
  handleOpenRepoSettings: (projectId: string, sectionId?: string) => void
  handleOpenWorktreeVisibility: (projectId: string) => void
  handleShowImportedWorktrees: (projectId: string) => void
  handleKeepImportedWorktreesHidden: (projectId: string) => void
  importedWorktreesByRepo: ReadonlyMap<string, ImportedWorktreesCardCandidate>
  importedWorktreeCardActionState: ReadonlyMap<string, ImportedWorktreeCardActionState>
  handleImportNewExternalWorktree: (projectId: string, worktreeId: string) => void
  handleImportAllNewExternalWorktrees: (projectId: string) => void
  handleKeepNewExternalWorktreeInboxHidden: (projectId: string) => void
  handleOpenSuppressExternalWorktreeInbox: (projectId: string) => void
  newExternalWorktreeInboxActionState: ReadonlyMap<string, NewExternalWorktreesInboxActionState>
  handleRemoveProject: (repo: Repo) => void
  handleCreateGroupFromRepo: (repo: Repo) => void
  handleMoveProjectToGroup: (repo: Repo, groupId: string) => void
  handleRemoveProjectFromGroup: (repo: Repo) => void
  handleRenameProjectGroup: (groupId: string, currentName: string) => void
  handleDeleteProjectGroup: (groupId: string, groupName: string) => void
  handleCreateFolderWorkspace: (projectGroup: ProjectGroup) => void
  activeModal: string
  pendingRevealWorktree: PendingSidebarWorktreeReveal | null
  pendingRevealSidebarRow: PendingSidebarRowReveal | null
  clearPendingRevealWorktreeId: () => void
  clearPendingRevealSidebarRow: () => void
  agentSendTargetWorktreeId: string | null
  worktrees: Worktree[]
  folderWorkspaces: readonly FolderWorkspace[]
  selectedWorktreeIds: ReadonlySet<string>
  selectedWorktrees: readonly Worktree[]
  onSelectionGesture: (event: React.MouseEvent<HTMLElement>, worktreeId: string) => boolean
  onContextMenuSelect: (
    event: React.MouseEvent<HTMLElement>,
    worktree: Worktree
  ) => readonly Worktree[]
  repoMap: Map<string, Repo>
  worktreeMap: Map<string, Worktree>
  worktreeLineageById: Record<string, WorktreeLineage>
  workspaceLineageByChildKey: Record<string, WorkspaceLineage>
  repoOrder: Map<string, number>
  // The full canonical state.repos id ordering — the drag controller commits
  // permutations of this list, even when some repos aren't currently visible
  // (filtered out / collapsed-only). Visible-only ids would silently drop the
  // hidden repos on reorder.
  allRepoIds: string[]
  onReorderHostSections: (orderedHostIds: ExecutionHostId[]) => void
  onHostDragActiveChange: (active: boolean) => void
  prCache: AppState['prCache'] | null
  hostedReviewCache: AppState['hostedReviewCache'] | null
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  projectGrouping?: ProjectGroupingModel
  projectGroups?: readonly ProjectGroup[]
  onMoveWorktreeToStatus: (worktreeId: string, status: WorkspaceStatus) => void
  onMoveWorktreesToStatus: (worktreeIds: readonly string[], status: WorkspaceStatus) => void
  onMoveWorktreesToStatusAtIndex: (args: {
    worktreeIds: readonly string[]
    status: WorkspaceStatus
    dropIndex: number
    groups: readonly WorktreeDragGroup[]
  }) => void
  onPinWorktree: (worktreeId: string) => void
  onPinWorktrees: (worktreeIds: readonly string[]) => void
  onReorderWorktrees: (args: {
    groups: readonly WorktreeDragGroup[]
    sourceGroupKey: string
    draggedIds: readonly string[]
    dropIndex: number
  }) => void
  // Why: broad grouping changes still remount the viewport. Keep the last
  // physical offset so LegendList can restore that remount without anchoring
  // incremental project hydration above the visible content.
  scrollOffsetRef: React.MutableRefObject<number>
}

import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type { Repo } from '@yiru/protocol/project/repository'
import {
  isConfirmedStaleFolderPathStatus,
  type FolderWorkspacePathStatus
} from '@yiru/protocol/workspace/folder-path'
import type { WorkspaceStatus } from '@yiru/protocol/workspace/status/model'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { RepoForkIndicator } from '~renderer/repo/fork-indicator'
import { RepoIconGlyph } from '~renderer/repo/icon'
import { cn } from '~renderer/ui/class-names'

import { SidebarDisclosure } from '../disclosure'
import { DiscoveredWorktreesAlert } from '../discovered-worktrees-alert'
import { openSidebarWorkspace, prefetchSidebarWorkspace } from '../host-navigation'
import type { ImportedWorktreeCardActionState } from '../imported-worktrees-card-actions'
import { SidebarProjectHeader } from '../project-header'
import { ProjectHeaderActions } from '../project-header-actions'
import { resolveProjectGroupHeaderColor } from '../project-header-color'
import type { GroupHeaderRow, ImportedWorktreesCardCandidate, WorktreeGroupBy } from './groups'
import { PINNED_GROUP_KEY } from './groups'
import { getProjectGroupHeaderPaddingLeft } from './indentation'
import { WORKTREE_SECTION_HEADER_PADDING_LEFT } from './indentation'
import { ProjectGroupHeaderActions } from './project-group-header-actions'
import { RepoHeaderActions } from './repo-header-actions'
import {
  getWorktreeOptionId,
  handleRepoHeaderCollapseAffordancePointerDown,
  shouldIgnoreRepoHeaderToggle
} from './reveal'
import { FolderPathStatusIndicator } from './section-rows'

type HeaderDragMetadata = {
  id: string
  index?: number
  bucket?: string
  sectionEnd?: number
  isDraggable: boolean
  isDragging: boolean
  onPointerDown: (event: React.PointerEvent<HTMLElement>, id: string) => void
}

export function HeaderRow(props: {
  row: GroupHeaderRow
  virtualKey: React.Key
  index: number
  hasTopSpacing: boolean
  groupBy: WorktreeGroupBy
  workspaceStatus: WorkspaceStatus | null
  isCollapsed: boolean
  hasWorkspaceRail: boolean
  highlightedRowKey: string | null
  runtimeLabel: string | null
  navigationSurface: boolean
  repoDrag?: HeaderDragMetadata
  projectGroupDrag?: HeaderDragMetadata
  pathStatus: FolderWorkspacePathStatus | null | undefined
  importedCandidates: readonly ImportedWorktreesCardCandidate[]
  importedActionState: ReadonlyMap<string, ImportedWorktreeCardActionState>
  dragOverStatus: WorkspaceStatus | null
  isPinDragOver: boolean
  projectGroups: readonly ProjectGroup[]
  onToggle: (key: string) => void
  onShowImported: (repoId: string) => void
  onKeepImportedHidden: (repoId: string) => void
  onStatusDragOver: (event: React.DragEvent<HTMLElement>, status: WorkspaceStatus) => void
  onStatusDragLeave: (event: React.DragEvent<HTMLElement>) => void
  onStatusDrop: (event: React.DragEvent<HTMLElement>, status: WorkspaceStatus) => void
  onPinDragOver: (event: React.DragEvent<HTMLElement>) => void
  onPinDragLeave: (event: React.DragEvent<HTMLElement>) => void
  onOpenRepoSettings: (repoId: string, sectionId?: string) => void
  onOpenWorktreeVisibility: (repoId: string) => void
  onCreateGroupFromRepo: (repo: Repo) => void
  onMoveProjectToGroup: (repo: NonNullable<GroupHeaderRow['repo']>, groupId: string) => void
  onRemoveProjectFromGroup: (repo: NonNullable<GroupHeaderRow['repo']>) => void
  onRemoveProject: (repo: NonNullable<GroupHeaderRow['repo']>) => void
  onCreateForRepo: (repoId: string) => void
  onRenameProjectGroup: (groupId: string, label: string) => void
  onDeleteProjectGroup: (groupId: string, label: string) => void
  onCreateFolderWorkspace: (projectGroup: ProjectGroup) => void
}): React.JSX.Element {
  const row = props.row
  const repo = row.repo
  const projectGroup =
    !repo && row.projectGroup && typeof row.projectGroup.id === 'string' ? row.projectGroup : null
  const workspaceStatus = props.workspaceStatus
  const isPinned = row.key === PINNED_GROUP_KEY
  const isRepoHeader = props.groupBy === 'repo' && repo !== undefined
  const isProjectGroupHeader = props.groupBy === 'repo' && row.projectGroup !== undefined
  const showsDisclosure =
    row.count > 0 && (isRepoHeader || isProjectGroupHeader || workspaceStatus !== null)
  const paddingLeft =
    isRepoHeader || isProjectGroupHeader
      ? getProjectGroupHeaderPaddingLeft(row.projectGroupDepth ?? 0)
      : WORKTREE_SECTION_HEADER_PADDING_LEFT
  const color = resolveProjectGroupHeaderColor({
    groupBy: props.groupBy,
    headerKey: row.key,
    badgeColor: repo?.badgeColor
  })
  const openOrToggle = (): void => {
    if (props.navigationSurface && repo && openSidebarWorkspace({ projectId: repo.id })) {
      return
    }
    props.onToggle(row.key)
  }
  const drag = props.repoDrag ?? props.projectGroupDrag

  return (
    <div
      role="presentation"
      data-worktree-virtual-row
      data-worktree-virtual-row-key={String(props.virtualKey)}
      data-worktree-sticky-header=""
      data-index={props.index}
      className={cn('relative z-20 bg-sidebar', props.hasTopSpacing && 'pt-1')}
    >
      <SidebarProjectHeader
        id={getWorktreeOptionId(row.key)}
        role="button"
        tabIndex={0}
        paddingLeft={paddingLeft}
        aria-expanded={showsDisclosure ? !props.isCollapsed : undefined}
        data-repo-header-id={props.repoDrag?.id}
        data-repo-header-index={props.repoDrag?.index}
        data-repo-header-bucket={props.repoDrag?.bucket}
        data-repo-header-section-end={props.repoDrag?.sectionEnd}
        data-repo-header-drag-handle={props.repoDrag?.isDraggable ? '' : undefined}
        data-project-group-header-id={props.projectGroupDrag?.id}
        data-project-group-header-index={props.projectGroupDrag?.index}
        data-project-group-header-bucket={props.projectGroupDrag?.bucket}
        data-project-group-header-section-end={props.projectGroupDrag?.sectionEnd}
        data-project-group-header-drag-handle={props.projectGroupDrag?.isDraggable ? '' : undefined}
        data-workspace-status-drop-target={workspaceStatus ? '' : undefined}
        data-workspace-status={workspaceStatus ?? undefined}
        data-workspace-pin-drop-target={isPinned ? '' : undefined}
        className={cn(
          drag?.isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          props.highlightedRowKey === row.key && 'bg-sidebar-accent',
          drag?.isDragging && 'bg-accent/80 scale-[1.01]',
          workspaceStatus && props.dragOverStatus === workspaceStatus && 'bg-sidebar-accent',
          isPinned && props.isPinDragOver && 'bg-sidebar-accent',
          repo && 'overflow-hidden'
        )}
        icon={
          row.icon ? (
            repo ? (
              <RepoIconGlyph
                repoIcon={repo.repoIcon}
                color={color}
                className="size-5 text-base"
                iconClassName="size-4"
              />
            ) : (
              <row.icon className="size-3" />
            )
          ) : undefined
        }
        iconClassName={cn(
          repo && 'size-5',
          color ? 'text-muted-foreground' : row.tone,
          drag?.isDraggable && 'hover:cursor-grab active:cursor-grabbing'
        )}
        iconProps={{
          'data-repo-header-drag-handle': props.repoDrag?.isDraggable ? '' : undefined,
          'data-project-group-header-drag-handle': props.projectGroupDrag?.isDraggable
            ? ''
            : undefined
        }}
        label={row.label}
        hasWorkspaceRail={props.hasWorkspaceRail}
        labelAfter={
          <>
            {repo && props.runtimeLabel ? (
              <span
                className="text-muted-foreground border-border max-w-24 truncate border-l pl-1.5 text-[10px] font-normal"
                title={translate('extension.sidePanel.daemonOwner', 'Owned by daemon {{value0}}', {
                  value0: props.runtimeLabel
                })}
              >
                {props.runtimeLabel}
              </span>
            ) : null}
            <RepoForkIndicator upstream={repo?.upstream} />
            <FolderPathStatusIndicator status={props.pathStatus} />
          </>
        }
        onDragOver={
          isPinned
            ? props.onPinDragOver
            : workspaceStatus
              ? (event) => props.onStatusDragOver(event, workspaceStatus)
              : undefined
        }
        onDragLeave={
          isPinned ? props.onPinDragLeave : workspaceStatus ? props.onStatusDragLeave : undefined
        }
        onDrop={workspaceStatus ? (event) => props.onStatusDrop(event, workspaceStatus) : undefined}
        onPointerDown={
          drag?.isDraggable ? (event) => drag.onPointerDown(event, drag.id) : undefined
        }
        onPointerEnter={
          props.navigationSurface && repo
            ? () => prefetchSidebarWorkspace({ projectId: repo.id })
            : undefined
        }
        onClick={(event) => {
          if (!shouldIgnoreRepoHeaderToggle(event)) {
            openOrToggle()
          }
        }}
        onKeyDown={(event) => {
          if (shouldIgnoreRepoHeaderToggle(event)) {
            return
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openOrToggle()
          }
        }}
      >
        <ProjectHeaderActions
          trailingAction={
            props.importedCandidates.length > 0 ? (
              <DiscoveredWorktreesAlert
                projectName={row.label}
                candidates={props.importedCandidates}
                actionStateByRepoId={props.importedActionState}
                onShow={props.onShowImported}
                onKeepHidden={props.onKeepImportedHidden}
              />
            ) : undefined
          }
        >
          {showsDisclosure ? (
            <SidebarDisclosure
              expanded={!props.isCollapsed}
              dataAttribute="repo-header-collapse"
              itemLabel={row.label}
              onPointerDown={handleRepoHeaderCollapseAffordancePointerDown}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                props.onToggle(row.key)
              }}
            />
          ) : null}
          {projectGroup ? (
            <ProjectGroupHeaderActions
              projectGroup={projectGroup}
              label={row.label}
              pathStatus={props.pathStatus}
              isCreateDisabled={
                props.pathStatus?.exists === false &&
                isConfirmedStaleFolderPathStatus(props.pathStatus)
              }
              onRename={props.onRenameProjectGroup}
              onDelete={props.onDeleteProjectGroup}
              onCreateWorkspace={props.onCreateFolderWorkspace}
            />
          ) : null}
          {repo && props.groupBy === 'repo' ? (
            <RepoHeaderActions
              repo={repo}
              label={row.label}
              projectGroups={props.projectGroups}
              onOpenSettings={props.onOpenRepoSettings}
              onOpenVisibility={props.onOpenWorktreeVisibility}
              onCreateGroup={props.onCreateGroupFromRepo}
              onMoveToGroup={props.onMoveProjectToGroup}
              onRemoveFromGroup={props.onRemoveProjectFromGroup}
              onRemove={props.onRemoveProject}
              onCreate={props.onCreateForRepo}
            />
          ) : null}
        </ProjectHeaderActions>
      </SidebarProjectHeader>
    </div>
  )
}

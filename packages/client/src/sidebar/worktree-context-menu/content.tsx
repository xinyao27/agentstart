import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  ArrowSquareOut,
  Bell,
  BellSlash as BellOff,
  Bug,
  Copy,
  XCircle as CircleX,
  FolderOpen as FolderInput,
  FolderPlus,
  Folders as FolderTree,
  Moon,
  Pencil,
  PushPin as Pin,
  PushPinSlash as PinOff,
  Tag,
  Trash as Trash2,
  LinkBreak as Unlink,
  FlowArrow as Workflow
} from '~renderer/icons/hugeicons'
import { workspaceStatusLabel } from '~renderer/sidebar/workspace-status-label'
import { cn } from '~renderer/ui/class-names'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '~renderer/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { getWorkspaceStatusVisualMeta } from '../workspace-status'
import { WorktreeOpenInContextSubMenu } from '../worktree-open-in-menu'
import type { DebugLogMenuActions } from './debug-log-actions'
import type { LifecycleMenuActions } from './lifecycle-actions'
import type { LineageMenuActions } from './lineage-actions'
import type { WorktreeContextMenuState } from './state'
import type { WorkspaceMenuActions } from './workspace-actions'

type WorktreeContextMenuContentProps = {
  state: WorktreeContextMenuState
  workspaceActions: WorkspaceMenuActions
  lineageActions: LineageMenuActions
  lifecycleActions: LifecycleMenuActions
  debugLogActions: DebugLogMenuActions
}

function getParentPickerLabel(validParentWorktreeId: string | null): string {
  return validParentWorktreeId
    ? translate(
        'auto.components.sidebar.WorktreeContextMenu.changeParentWorkspace',
        'Change Parent Worktree...'
      )
    : translate(
        'auto.components.sidebar.WorktreeContextMenu.setParentWorkspace',
        'Set Parent Worktree...'
      )
}

export function WorktreeContextMenuContent({
  state,
  workspaceActions,
  lineageActions,
  lifecycleActions,
  debugLogActions
}: WorktreeContextMenuContentProps): React.JSX.Element {
  const {
    contextWorkspaceStatus,
    deleteAction,
    deletingContext,
    eligibleParentCount,
    hasAnyContextLineage,
    isDeleting,
    isMultiContext,
    lineage,
    projectGroups,
    removesProject,
    repo,
    runtimeEnvironmentId,
    sleepableWorktrees,
    sleepLabel,
    validParentWorktreeId,
    workspaceLineage,
    workspaceStatuses,
    worktree
  } = state

  return (
    <ContextMenuContent className="w-52" finalFocus={lineageActions.handleCloseAutoFocus}>
      <ContextMenuLabel>
        {translate('auto.components.sidebar.WorktreeContextMenu.workspaceSection', 'Workspace')}
      </ContextMenuLabel>
      {!isMultiContext && (
        <ContextMenuItem onClick={workspaceActions.handleRename} disabled={isDeleting}>
          <Pencil className="size-3.5" />
          {translate('auto.components.sidebar.WorktreeContextMenu.439fa94d53', 'Update')}
        </ContextMenuItem>
      )}
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={deletingContext}>
          <Tag className="size-3.5" />
          {isMultiContext
            ? translate(
                'auto.components.sidebar.WorktreeContextMenu.56cde9e8e6',
                'Move Statuses To'
              )
            : translate('auto.components.sidebar.WorktreeContextMenu.84cdbb7e30', 'Move to Status')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          <ContextMenuRadioGroup value={contextWorkspaceStatus}>
            {workspaceStatuses.map((status) => {
              const meta = getWorkspaceStatusVisualMeta(status)
              return (
                <ContextMenuRadioItem
                  key={status.id}
                  value={status.id}
                  onClick={() => workspaceActions.handleAssignWorkspaceStatus(status.id)}
                >
                  <meta.icon className={cn('size-3.5', meta.tone)} />
                  {workspaceStatusLabel(status)}
                </ContextMenuRadioItem>
              )
            })}
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      {!isMultiContext && (
        <>
          <WorktreeOpenInContextSubMenu
            worktreePath={worktree.path}
            // Why: Repo.connectionId is dead — nothing sets it since remote
            // hosts were removed (#63) — a direct worktree's owner is never SSH.
            connectionId={null}
            runtimeEnvironmentId={runtimeEnvironmentId}
            disabled={isDeleting}
          />
          {workspaceActions.canOpenDedicatedTab ? (
            <ContextMenuItem
              onClick={workspaceActions.handleOpenDedicatedTab}
              disabled={isDeleting}
            >
              <ArrowSquareOut className="size-3.5" />
              {translate('sidebar.worktree.openDedicatedTab', 'Open Worktree in New Tab')}
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem onClick={workspaceActions.handleCopyPath} disabled={isDeleting}>
            <Copy className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeContextMenu.3350101edb', 'Copy Path')}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={isDeleting || !debugLogActions.hasDebugLogs}>
              <Bug className="size-3.5" />
              {translate('auto.components.sidebar.WorktreeContextMenu.debugLogs', 'Debug Logs')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              <ContextMenuItem onClick={debugLogActions.handleViewDebugLogs}>
                {translate(
                  'auto.components.sidebar.WorktreeContextMenu.viewDebugLogs',
                  'View Logs'
                )}
              </ContextMenuItem>
              <ContextMenuItem onClick={debugLogActions.handleClearDebugLogs}>
                {translate(
                  'auto.components.sidebar.WorktreeContextMenu.clearDebugLogs',
                  'Clear Logs'
                )}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={workspaceActions.handleTogglePin} disabled={isDeleting}>
            {worktree.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            {worktree.isPinned
              ? translate('auto.components.sidebar.WorktreeContextMenu.697d0f6e1b', 'Unpin')
              : translate('auto.components.sidebar.WorktreeContextMenu.3baa7d6507', 'Pin')}
          </ContextMenuItem>
          <ContextMenuItem onClick={workspaceActions.handleToggleRead} disabled={isDeleting}>
            {worktree.isUnread ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
            {worktree.isUnread
              ? translate('auto.components.sidebar.WorktreeContextMenu.8dacff1fe0', 'Mark Read')
              : translate('auto.components.sidebar.WorktreeContextMenu.f50603c6b2', 'Mark Unread')}
          </ContextMenuItem>
          {repo ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={workspaceActions.handleCreateGroupFromRepo}
                disabled={isDeleting}
              >
                <FolderPlus className="size-3.5" />
                {translate(
                  'auto.components.sidebar.WorktreeContextMenu.503ec0f8e6',
                  'New group from project'
                )}
              </ContextMenuItem>
              {projectGroups.length > 0 ? (
                <ContextMenuSub>
                  <ContextMenuSubTrigger disabled={isDeleting}>
                    <FolderInput className="size-3.5" />
                    {translate(
                      'auto.components.sidebar.WorktreeContextMenu.76865d827f',
                      'Move to group'
                    )}
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {projectGroups.map((group) => (
                      <ContextMenuItem
                        key={group.id}
                        disabled={repo.projectGroupId === group.id}
                        onClick={() => workspaceActions.handleMoveProjectToGroup(group.id)}
                      >
                        <span className="max-w-48 truncate">{group.name}</span>
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              ) : null}
              {repo.projectGroupId ? (
                <ContextMenuItem
                  onClick={workspaceActions.handleRemoveProjectFromGroup}
                  disabled={isDeleting}
                >
                  <CircleX className="size-3.5" />
                  {translate(
                    'auto.components.sidebar.WorktreeContextMenu.d35dfeae58',
                    'Remove from group'
                  )}
                </ContextMenuItem>
              ) : null}
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={lineageActions.handleOpenParentPicker}
            disabled={isDeleting || eligibleParentCount === 0}
          >
            <FolderTree className="size-3.5" />
            {getParentPickerLabel(validParentWorktreeId)}
          </ContextMenuItem>
          {(validParentWorktreeId || lineage || workspaceLineage) && (
            <>
              {validParentWorktreeId && (
                <ContextMenuItem onClick={lineageActions.handleOpenParent} disabled={isDeleting}>
                  <Workflow className="size-3.5" />
                  {translate(
                    'auto.components.sidebar.WorktreeContextMenu.8d9cd19d09',
                    'Open Parent Worktree'
                  )}
                </ContextMenuItem>
              )}
              {(lineage || workspaceLineage) && (
                <ContextMenuItem
                  onClick={lineageActions.handleRemoveParentLink}
                  disabled={isDeleting}
                >
                  <Unlink className="size-3.5" />
                  {translate(
                    'auto.components.sidebar.WorktreeContextMenu.579b1a8e61',
                    'Remove from Parent'
                  )}
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
            </>
          )}
        </>
      )}
      {isMultiContext && hasAnyContextLineage ? (
        <>
          <ContextMenuItem
            onClick={lineageActions.handleRemoveParentLink}
            disabled={deletingContext}
          >
            <Unlink className="size-3.5" />
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.579b1a8e61',
              'Remove from Parent'
            )}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      ) : null}

      <Tooltip>
        <TooltipTrigger
          render={
            <ContextMenuItem
              onClick={lifecycleActions.handleCloseTerminals}
              disabled={deletingContext || sleepableWorktrees.length === 0}
            >
              <Moon className="size-3.5" />
              {sleepLabel}
            </ContextMenuItem>
          }
        />
        <TooltipContent side="right" sideOffset={8} className="max-w-[200px] text-pretty">
          {isMultiContext
            ? translate(
                'auto.components.sidebar.WorktreeContextMenu.7d190f7d2b',
                'Close all active panels in the selected workspaces to free up memory and CPU.'
              )
            : translate(
                'auto.components.sidebar.WorktreeContextMenu.0918b35e4f',
                'Close all active panels in this workspace to free up memory and CPU.'
              )}
        </TooltipContent>
      </Tooltip>
      {/* Why: primary checkout rows cannot be git-worktree-removed. Keep the
          disabled worktree action beside the enabled project-removal action. */}
      {!isMultiContext && removesProject ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <div>
                <ContextMenuItem variant="destructive" disabled>
                  <Trash2 className="size-3.5" />
                  {translate(
                    'auto.components.sidebar.WorktreeContextMenu.deleteWorktree',
                    'Delete Worktree'
                  )}
                </ContextMenuItem>
              </div>
            }
          />
          <TooltipContent side="right" sideOffset={8} className="max-w-[200px] text-pretty">
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.primaryDeleteDisabled',
              "Primary worktree — can't be deleted. Remove the project instead."
            )}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <ContextMenuItem
        variant="destructive"
        onClick={lifecycleActions.handleDelete}
        disabled={deleteAction.isDisabled}
        title={deleteAction.title}
      >
        <Trash2 className="size-3.5" />
        {deleteAction.label}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

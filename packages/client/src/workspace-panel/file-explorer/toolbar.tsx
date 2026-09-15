import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  DotsThree as Ellipsis,
  ListDashes as ListCollapse,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { WorktreeOpenInMenuItems } from '~renderer/sidebar/worktree-open-in-menu'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { WORKSPACE_PANEL_BUTTON_SURFACE_CLASS_NAME } from '../workspace-panel-button-styles'

type FileExplorerToolbarProps = {
  repoName: string
  worktreePath?: string
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
  mutationActions?: React.ReactNode
  refresh: {
    isRefreshing: boolean
    showRefreshSpinner: boolean
    handleRefresh: () => void
  }
  canRefresh: boolean
  canCollapseAll: boolean
  onCollapseAll: () => void
  showGitIgnoredFilesToggle: boolean
  showGitIgnoredFiles: boolean
  onToggleGitIgnoredFiles: () => void
  showDotfiles: boolean
  onToggleDotfiles: () => void
}

export function FileExplorerToolbar({
  repoName,
  worktreePath,
  connectionId,
  runtimeEnvironmentId,
  mutationActions,
  refresh,
  canRefresh,
  canCollapseAll,
  onCollapseAll,
  showGitIgnoredFilesToggle,
  showGitIgnoredFiles,
  onToggleGitIgnoredFiles,
  showDotfiles,
  onToggleDotfiles
}: FileExplorerToolbarProps): React.JSX.Element {
  return (
    <div className="flex h-8 min-h-8 items-center gap-2 px-2">
      <span
        className="text-foreground min-w-0 flex-1 truncate text-xs font-medium"
        title={repoName}
      >
        {repoName}
      </span>
      {mutationActions}
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="quiet"
                size="icon-xs"
                className={cn(
                  WORKSPACE_PANEL_BUTTON_SURFACE_CLASS_NAME,
                  ' ',
                  !canCollapseAll && 'cursor-not-allowed opacity-50'
                )}
                aria-label={translate(
                  'auto.components.workspacePanel.FileExplorerToolbar.6026b16950',
                  'Collapse All'
                )}
                aria-disabled={!canCollapseAll}
                // Why: native disabled buttons suppress Radix tooltip triggers in Chromium.
                onClick={(event) => {
                  if (!canCollapseAll) {
                    event.preventDefault()
                    return
                  }
                  onCollapseAll()
                }}
              >
                <ListCollapse className="size-3" />
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={4}>
            {translate(
              'auto.components.workspacePanel.FileExplorerToolbar.6026b16950',
              'Collapse All'
            )}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="quiet"
                size="icon-xs"
                className={cn(
                  WORKSPACE_PANEL_BUTTON_SURFACE_CLASS_NAME,
                  ' ',
                  !canRefresh && 'cursor-not-allowed opacity-50'
                )}
                aria-label={translate(
                  'auto.components.workspacePanel.FileExplorerToolbar.d95e30fe28',
                  'Refresh Explorer'
                )}
                aria-disabled={!canRefresh || refresh.isRefreshing}
                disabled={refresh.isRefreshing}
                onClick={(event) => {
                  if (!canRefresh) {
                    event.preventDefault()
                    return
                  }
                  refresh.handleRefresh()
                }}
              >
                {refresh.showRefreshSpinner ? (
                  <LoadingIndicator className="size-3" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={4}>
            {translate(
              'auto.components.workspacePanel.FileExplorerToolbar.d95e30fe28',
              'Refresh Explorer'
            )}
          </TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={translate(
                        'auto.components.workspacePanel.FileExplorerToolbar.31b4c3195d',
                        'More Explorer Actions'
                      )}
                    >
                      <Ellipsis className="size-3" />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent side="bottom" sideOffset={4}>
              {translate(
                'auto.components.workspacePanel.FileExplorerToolbar.31b4c3195d',
                'More Explorer Actions'
              )}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            <DropdownMenuCheckboxItem checked={showDotfiles} onCheckedChange={onToggleDotfiles}>
              {translate(
                'auto.components.workspacePanel.FileExplorerToolbar.78f133232c',
                'Show Dotfiles'
              )}
            </DropdownMenuCheckboxItem>
            {showGitIgnoredFilesToggle ? (
              <DropdownMenuCheckboxItem
                checked={showGitIgnoredFiles}
                onCheckedChange={onToggleGitIgnoredFiles}
              >
                {translate(
                  'auto.components.workspacePanel.FileExplorerToolbar.d238264654',
                  'Show Git Ignored Files'
                )}
              </DropdownMenuCheckboxItem>
            ) : null}
            {worktreePath ? (
              <>
                <DropdownMenuSeparator />
                <WorktreeOpenInMenuItems
                  worktreePath={worktreePath}
                  connectionId={connectionId}
                  runtimeEnvironmentId={runtimeEnvironmentId}
                  labelPrefix="Open in "
                />
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

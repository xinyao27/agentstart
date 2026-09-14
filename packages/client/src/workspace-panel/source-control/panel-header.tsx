import { DiffNotesSendMenu } from '~renderer/editor/diff-notes-send-menu'
import { translate } from '~renderer/i18n/i18n'
import {
  Check,
  Copy,
  DotsThree as MoreHorizontal,
  CaretDown as ChevronDown,
  Chat as MessageSquare,
  Trash as Trash2
} from '~renderer/icons/hugeicons'
import { DetachedHeadBadge } from '~renderer/source-control/detached-head-badge'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~renderer/ui/tooltip'
import { SourceControlHeaderToolbar } from '~renderer/workspace-panel/source-control/header/header-toolbar'
import {
  SourceControlScopeToolbarActions,
  SourceControlScopeToolbarSelect
} from '~renderer/workspace-panel/source-control/header/scope-toolbar'
import { DiffCommentsInlineList } from '~renderer/workspace-panel/source-control/review/diff-comments-inline-list'

import { openGitGraphTab } from '../git-graph/open-tab'
import type { SourceControlController } from './controller'
import { SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME } from './panel-constants'

export function SourceControlPanelHeader({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element {
  const {
    activeGroupId,
    activeWorktreeId,
    branchSummary,
    deleteDiffComment,
    detachedHeadDisplay,
    diffCommentCount,
    diffCommentsCopied,
    diffCommentsExpanded,
    diffCommentsForActive,
    filterExpanded,
    filterQuery,
    handleCopyDiffComments,
    handleOpenComment,
    handleToggleSourceControlViewMode,
    isVisible,
    refreshBranchCompare,
    setBaseRefDialogOpen,
    setDiffCommentsExpanded,
    setFilterExpanded,
    setFilterQuery,
    setPendingDiffCommentsClear,
    settings,
    sourceControlViewMode,
    worktreePath
  } = controller
  const activeGitGraphTabId = useAppStore((s) => {
    if (!activeWorktreeId || !activeGroupId) {
      return null
    }
    const activeUnifiedTabId = (s.groupsByWorktree[activeWorktreeId] ?? []).find(
      (group) => group.id === activeGroupId
    )?.activeTabId
    return (
      (s.unifiedTabsByWorktree[activeWorktreeId] ?? []).find(
        (tab) => tab.id === activeUnifiedTabId && tab.contentType === 'git-graph'
      )?.id ?? null
    )
  })
  const isGitGraphOpen = activeGitGraphTabId !== null
  const closeUnifiedTab = useAppStore((s) => s.closeUnifiedTab)

  return (
    <>
      <SourceControlHeaderToolbar
        filterQuery={filterQuery}
        filterExpanded={filterExpanded}
        onFilterQueryChange={setFilterQuery}
        onFilterExpandedChange={setFilterExpanded}
        scopeSelect={<SourceControlScopeToolbarSelect controller={controller} />}
        scopeActions={<SourceControlScopeToolbarActions controller={controller} />}
        sourceControlViewMode={sourceControlViewMode}
        viewModeToggleDisabled={settings === null}
        onToggleViewMode={handleToggleSourceControlViewMode}
        onChangeBaseRef={() => setBaseRefDialogOpen(true)}
        onRefreshBranchCompare={() => void refreshBranchCompare()}
        branchCompareRefreshDisabled={!branchSummary || branchSummary.status === 'loading'}
        diffCommentCount={diffCommentCount}
        onExpandNotes={() => setDiffCommentsExpanded(true)}
        isGitGraphOpen={isGitGraphOpen}
        onToggleGitGraph={() => {
          if (!activeWorktreeId) {
            return
          }
          if (activeGitGraphTabId) {
            closeUnifiedTab(activeGitGraphTabId)
            return
          }
          openGitGraphTab(activeWorktreeId, activeGroupId ?? undefined)
        }}
      />

      {detachedHeadDisplay ? (
        <div className={cn('py-2', SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME)}>
          <DetachedHeadBadge display={detachedHeadDisplay} side="bottom" />
        </div>
      ) : null}

      {activeWorktreeId && worktreePath && diffCommentCount > 0 ? (
        <div>
          <div
            className={cn('flex items-center gap-1 py-1.5', SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME)}
          >
            <Button
              variant="quiet"
              size="xs"
              type="button"
              className="flex h-auto min-w-0 flex-1 justify-start gap-1.5 border-0 p-0 text-left font-normal whitespace-normal"
              onClick={() => setDiffCommentsExpanded((previous) => !previous)}
              aria-expanded={diffCommentsExpanded}
              title={
                diffCommentsExpanded
                  ? translate(
                      'auto.components.workspacePanel.SourceControl.d13edef890',
                      'Collapse notes'
                    )
                  : translate(
                      'auto.components.workspacePanel.SourceControl.72f2bea3f4',
                      'Expand notes'
                    )
              }
            >
              <ChevronDown
                className={cn(
                  'size-3 shrink-0 transition-transform',
                  !diffCommentsExpanded && '-rotate-90'
                )}
              />
              <MessageSquare className="size-3.5 shrink-0" />
              <span>
                {translate('auto.components.workspacePanel.SourceControl.cc474e0b8c', 'Notes')}
              </span>
              <span className="text-muted-foreground text-[11px] leading-none tabular-nums">
                {diffCommentCount}
              </span>
            </Button>
            <div className="ml-1 flex shrink-0 items-center gap-1.5">
              <DiffNotesSendMenu
                worktreeId={activeWorktreeId}
                groupId={activeGroupId ?? activeWorktreeId}
                comments={diffCommentsForActive}
                triggerClassName="size-6"
                // Why: the panel is a single shell-level instance, so it is the
                // only consumer of the global shortcut request while visible.
                respondToOpenRequest={isVisible}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="quiet"
                        size="icon-xs"
                        type="button"
                        onClick={() => void handleCopyDiffComments()}
                        aria-label={translate(
                          'auto.components.workspacePanel.SourceControl.3baf6c77b4',
                          'Copy all notes to clipboard'
                        )}
                      >
                        {diffCommentsCopied ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                    }
                  />
                  <TooltipContent side="bottom" sideOffset={6}>
                    {translate(
                      'auto.components.workspacePanel.SourceControl.eae2d051af',
                      'Copy all notes'
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="quiet"
                              size="icon-xs"
                              type="button"
                              aria-label={translate(
                                'auto.components.workspacePanel.SourceControl.2fe2a67580',
                                'More note actions'
                              )}
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          }
                        />
                      }
                    />
                    <TooltipContent side="bottom" sideOffset={6}>
                      {translate(
                        'auto.components.workspacePanel.SourceControl.2fe2a67580',
                        'More note actions'
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() =>
                      setPendingDiffCommentsClear({ kind: 'all', worktreeId: activeWorktreeId })
                    }
                  >
                    <Trash2 className="size-3.5" />
                    {translate(
                      'auto.components.workspacePanel.SourceControl.1406954883',
                      'Clear all notes...'
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {diffCommentsExpanded ? (
            <DiffCommentsInlineList
              comments={diffCommentsForActive}
              onDelete={(id) => void deleteDiffComment(activeWorktreeId, id)}
              onOpen={handleOpenComment}
              onClearFile={(filePath) =>
                setPendingDiffCommentsClear({
                  kind: 'file',
                  worktreeId: activeWorktreeId,
                  filePath
                })
              }
            />
          ) : null}
        </div>
      ) : null}
    </>
  )
}

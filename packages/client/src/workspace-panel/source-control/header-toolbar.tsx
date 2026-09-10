import type { GitBranchCompareSummary } from '@agentstart/protocol/git/branch-compare-types'
import type { SourceControlViewMode } from '@agentstart/protocol/settings/workspace-preferences'
import React, { useEffect, useRef } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { GitBranch, MagnifyingGlass as Search, X } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from '../right-sidebar-button-styles'
import { SourceControlHeaderOverflowMenu } from './header-overflow-menu'
import { SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME } from './panel-constants'

type SourceControlHeaderToolbarProps = {
  filterQuery: string
  filterExpanded: boolean
  onFilterQueryChange: (value: string) => void
  onFilterExpandedChange: (expanded: boolean) => void
  scopeSelect: React.ReactNode
  scopeActions: React.ReactNode
  sourceControlViewMode: SourceControlViewMode
  viewModeToggleDisabled: boolean
  onToggleViewMode: () => void
  onChangeBaseRef: () => void
  onRefreshBranchCompare: () => void
  branchCompareRefreshDisabled: boolean
  diffCommentCount: number
  onExpandNotes: () => void
  isGitGraphOpen: boolean
  onToggleGitGraph: () => void
}

function renderOverflowMenu(
  props: Pick<
    SourceControlHeaderToolbarProps,
    | 'sourceControlViewMode'
    | 'viewModeToggleDisabled'
    | 'onToggleViewMode'
    | 'onChangeBaseRef'
    | 'onRefreshBranchCompare'
    | 'branchCompareRefreshDisabled'
    | 'diffCommentCount'
    | 'onExpandNotes'
  >
): React.JSX.Element {
  return <SourceControlHeaderOverflowMenu {...props} />
}

export function SourceControlHeaderToolbar({
  filterQuery,
  filterExpanded,
  onFilterQueryChange,
  onFilterExpandedChange,
  scopeSelect,
  scopeActions,
  sourceControlViewMode,
  viewModeToggleDisabled,
  onToggleViewMode,
  onChangeBaseRef,
  onRefreshBranchCompare,
  branchCompareRefreshDisabled,
  diffCommentCount,
  onExpandNotes,
  isGitGraphOpen,
  onToggleGitGraph
}: SourceControlHeaderToolbarProps): React.JSX.Element {
  const filterInputRef = useRef<HTMLInputElement>(null)
  const normalizedFilter = filterQuery.trim()
  const showCollapsedToolbar = !filterExpanded
  const overflowProps = {
    sourceControlViewMode,
    viewModeToggleDisabled,
    onToggleViewMode,
    onChangeBaseRef,
    onRefreshBranchCompare,
    branchCompareRefreshDisabled,
    diffCommentCount,
    onExpandNotes
  }

  const expandFilter = () => {
    onFilterExpandedChange(true)
  }

  const collapseFilter = () => {
    onFilterExpandedChange(false)
  }

  const clearAndCollapseFilter = () => {
    onFilterQueryChange('')
    onFilterExpandedChange(false)
  }

  useEffect(() => {
    if (!filterExpanded) {
      return
    }
    filterInputRef.current?.focus()
    filterInputRef.current?.select()
  }, [filterExpanded])

  const filterToggleTitle = normalizedFilter
    ? translate('auto.components.right.sidebar.SourceControl.c8e4a1f902', 'Filter: {{value0}}', {
        value0: filterQuery
      })
    : translate('auto.components.right.sidebar.SourceControl.b3c8f1a902', 'Filter files by name')
  const gitGraphToggleTitle = translate(
    'auto.components.right.sidebar.SourceControl.e7f8a9b0c1',
    'Git Graph'
  )
  const clearFilterTitle = translate(
    'auto.components.right.sidebar.SourceControl.d4f8c2a901',
    'Clear and close filter'
  )

  return (
    <div
      className={cn('border-border border-b pt-1.5 pb-1', SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME)}
    >
      <div
        className={cn('flex min-w-0 items-center gap-1', filterExpanded && 'w-full gap-1.5')}
        data-filter-expanded={filterExpanded ? 'true' : 'false'}
      >
        {showCollapsedToolbar ? (
          <>
            {scopeSelect}
            {/* Why: the scope select keeps its natural width; every action stays
                in one right-aligned group whatever that width is. */}
            <span className="min-w-0 flex-1" aria-hidden="true" />
            {scopeActions}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-toolbar"
                    data-testid="source-control-git-graph-toggle"
                    className={cn(
                      RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME,
                      isGitGraphOpen && 'bg-muted'
                    )}
                    onClick={onToggleGitGraph}
                    aria-label={gitGraphToggleTitle}
                    aria-pressed={isGitGraphOpen}
                  >
                    <GitBranch className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom" sideOffset={6}>
                {gitGraphToggleTitle}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-toolbar"
                    data-testid="source-control-filter-toggle"
                    className={cn(
                      RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME,
                      'relative',
                      normalizedFilter && 'bg-muted'
                    )}
                    onClick={expandFilter}
                    aria-label={filterToggleTitle}
                    aria-expanded={false}
                  >
                    <Search className="size-3.5" />
                    {normalizedFilter ? (
                      <span className="bg-foreground absolute top-1 right-1 size-1.5 rounded-full" />
                    ) : null}
                  </Button>
                }
              />
              <TooltipContent side="bottom" sideOffset={6}>
                {filterToggleTitle}
              </TooltipContent>
            </Tooltip>
            {renderOverflowMenu(overflowProps)}
          </>
        ) : (
          <>
            {/* Why: expanded filter owns the toolbar row so typing isn't squeezed
                beside PR links or overflow actions — collapse to reach those. */}
            <div className="focus-within:bg-accent flex w-full min-w-0 flex-1 items-center gap-1.5">
              <Search className="text-muted-foreground size-3.5 shrink-0" />
              <Input
                ref={filterInputRef}
                data-testid="source-control-filter-input"
                type="text"
                variant="chrome-free"
                size="xs"
                value={filterQuery}
                onChange={(event) => onFilterQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    collapseFilter()
                  }
                }}
                placeholder={translate(
                  'auto.components.right.sidebar.SourceControl.c35baf2f1e',
                  'Filter files…'
                )}
                className="flex-1"
                aria-label={translate(
                  'auto.components.right.sidebar.SourceControl.c35baf2f1e',
                  'Filter files…'
                )}
              />
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-toolbar"
                    aria-label={clearFilterTitle}
                    onClick={clearAndCollapseFilter}
                  >
                    <X className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom" sideOffset={6}>
                {clearFilterTitle}
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  )
}

export function shouldShowSourceControlCompareUnavailableCard(
  summary: GitBranchCompareSummary | null | undefined,
  hasUncommittedEntries: boolean,
  hasBranchEntries: boolean,
  hasFilter: boolean
): boolean {
  if (!summary || summary.status === 'loading' || summary.status === 'ready' || hasFilter) {
    return false
  }
  return !hasUncommittedEntries && !hasBranchEntries
}

export function getNextSourceControlViewMode(mode: SourceControlViewMode): SourceControlViewMode {
  return mode === 'list' ? 'tree' : 'list'
}

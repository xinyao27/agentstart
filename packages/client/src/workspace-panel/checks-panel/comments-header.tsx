import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Chat as MessageSquare,
  PaperPlaneTilt as SendHorizontal,
  Sparkle as Sparkles,
  SlidersHorizontal,
  Plus,
  X
} from '~renderer/icons/hugeicons'
import type { PRCommentGroup } from '~renderer/source-control/pr-comment-groups'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { getPrCommentAudienceFilters, type PRCommentAudienceFilter } from '../pr-comment-audience'
import type { PRCommentPresentationClasses } from '../pr-comment-presentation'

export type PRCommentsListDisplayMode = 'triage' | 'timeline'

const PR_COMMENT_LIST_DISPLAY_MODES: PRCommentsListDisplayMode[] = ['triage', 'timeline']

function getPRCommentsListDisplayModeLabel(mode: PRCommentsListDisplayMode): string {
  return mode === 'triage'
    ? translate('auto.components.right.sidebar.checks.panel.content.8a621a2c4f', 'Grouped')
    : translate('auto.components.right.sidebar.checks.panel.content.b13f85d75c', 'Timeline')
}

type PRCommentsHeaderProps = {
  presentation: PRCommentPresentationClasses
  commentsCount: number
  commentCounts: Record<PRCommentAudienceFilter, number>
  commentFilter: PRCommentAudienceFilter
  displayMode: PRCommentsListDisplayMode
  commentsLoading: boolean
  commentsDisabled?: boolean
  commentsDisabledReason?: string
  resolveCommentsWithAIDisabled?: boolean
  resolveCommentsWithAIDisabledReason?: string
  canShowResolveWithAI: boolean
  isSelectingForAI: boolean
  selectableGroups: PRCommentGroup[]
  selectedGroups: PRCommentGroup[]
  clearSelection: () => void
  onResolveSelectedCommentsWithAI?: (groups: PRCommentGroup[]) => void
  onCommentFilterChange: (filter: PRCommentAudienceFilter) => void
  onDisplayModeChange: (mode: PRCommentsListDisplayMode) => void
  onStartAddComment?: () => void
}

export function PRCommentsHeader({
  presentation,
  commentsCount,
  commentCounts,
  commentFilter,
  displayMode,
  commentsLoading,
  commentsDisabled,
  commentsDisabledReason,
  resolveCommentsWithAIDisabled,
  resolveCommentsWithAIDisabledReason,
  canShowResolveWithAI,
  isSelectingForAI,
  selectableGroups,
  selectedGroups,
  clearSelection,
  onResolveSelectedCommentsWithAI,
  onCommentFilterChange,
  onDisplayModeChange,
  onStartAddComment
}: PRCommentsHeaderProps): React.JSX.Element {
  const selectedCommentQueueCount = selectedGroups.length
  return (
    <div
      className={cn(
        presentation.sectionHeader,
        // Why: the checks sidebar scrolls as one column; pinning this header keeps
        // filter and add-comment actions reachable while reading long threads.
        'sticky top-0 z-10 bg-sidebar'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <MessageSquare className="text-muted-foreground size-3.5" />
        <span className={presentation.sectionHeaderLabel}>
          {translate('auto.components.right.sidebar.checks.panel.content.94557d68e2', 'Comments')}
        </span>
        {commentsCount > 0 && <span className={presentation.sectionCount}>{commentsCount}</span>}
        <div className="-mr-1 ml-auto flex items-center gap-0.5">
          {canShowResolveWithAI && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon-xs"
                      aria-label={translate(
                        'auto.components.right.sidebar.checks.panel.content.d7a2f9c401',
                        'Send unresolved {{value0}} comments',
                        { value0: 'PR' }
                      )}
                      disabled={commentsLoading || resolveCommentsWithAIDisabled}
                      title={
                        resolveCommentsWithAIDisabled
                          ? resolveCommentsWithAIDisabledReason
                          : undefined
                      }
                      onClick={() => onResolveSelectedCommentsWithAI?.(selectableGroups)}
                    >
                      <Sparkles className="size-3" />
                    </Button>
                  }
                />
                <TooltipContent side="top" sideOffset={4}>
                  {resolveCommentsWithAIDisabled && resolveCommentsWithAIDisabledReason
                    ? resolveCommentsWithAIDisabledReason
                    : translate(
                        'auto.components.right.sidebar.checks.panel.content.d7a2f9c401',
                        'Send unresolved {{value0}} comments',
                        { value0: 'PR' }
                      )}
                </TooltipContent>
              </Tooltip>
              {isSelectingForAI && (
                <>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="default"
                          size="icon-xs"
                          className="relative"
                          aria-label={translate(
                            'auto.components.right.sidebar.checks.panel.content.d91f2a6c39',
                            'Send {{value0}} queued comments to AI',
                            { value0: selectedCommentQueueCount }
                          )}
                          disabled={
                            selectedCommentQueueCount === 0 ||
                            commentsLoading ||
                            resolveCommentsWithAIDisabled
                          }
                          title={
                            resolveCommentsWithAIDisabled
                              ? resolveCommentsWithAIDisabledReason
                              : undefined
                          }
                          onClick={() => onResolveSelectedCommentsWithAI?.(selectedGroups)}
                        >
                          <SendHorizontal className="size-3" />
                          <span className="border-border bg-background text-foreground absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center border px-0.5 text-[9px] leading-none tabular-nums">
                            {selectedCommentQueueCount}
                          </span>
                        </Button>
                      }
                    />
                    <TooltipContent side="top" sideOffset={4}>
                      {resolveCommentsWithAIDisabled && resolveCommentsWithAIDisabledReason
                        ? resolveCommentsWithAIDisabledReason
                        : translate(
                            'auto.components.right.sidebar.checks.panel.content.d91f2a6c39',
                            'Send {{value0}} queued comments to AI',
                            { value0: selectedCommentQueueCount }
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
                          aria-label={translate(
                            'auto.components.right.sidebar.checks.panel.content.a6de3e5a20',
                            'Clear queued comments'
                          )}
                          onClick={clearSelection}
                        >
                          <X className="size-3" />
                        </Button>
                      }
                    />
                    <TooltipContent side="top" sideOffset={4}>
                      {translate(
                        'auto.components.right.sidebar.checks.panel.content.a6de3e5a20',
                        'Clear queued comments'
                      )}
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </>
          )}
          {commentsCount > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="quiet"
                    size="icon-xs"
                    aria-label={translate(
                      'auto.components.right.sidebar.checks.panel.content.f5cf324efa',
                      'Comment display options'
                    )}
                  >
                    <SlidersHorizontal className="size-3" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" side="bottom" sideOffset={6}>
                <DropdownMenuLabel>
                  {translate(
                    'auto.components.right.sidebar.checks.panel.content.5e6e5a13fa',
                    'View'
                  )}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={displayMode}
                  onValueChange={(value) => onDisplayModeChange(value as PRCommentsListDisplayMode)}
                >
                  {PR_COMMENT_LIST_DISPLAY_MODES.map((mode) => (
                    <DropdownMenuRadioItem key={mode} value={mode}>
                      {getPRCommentsListDisplayModeLabel(mode)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onStartAddComment && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="quiet"
                    size="icon-xs"
                    aria-label={
                      commentsCount === 0
                        ? translate(
                            'auto.components.right.sidebar.checks.panel.content.7440d09d2c',
                            'Start conversation'
                          )
                        : translate(
                            'auto.components.right.sidebar.checks.panel.content.2b2be92919',
                            'Add comment'
                          )
                    }
                    disabled={commentsDisabled}
                    title={commentsDisabled ? commentsDisabledReason : undefined}
                    onClick={onStartAddComment}
                  >
                    <Plus className="size-3" />
                  </Button>
                }
              />
              <TooltipContent side="top" sideOffset={4}>
                {commentsDisabled && commentsDisabledReason
                  ? commentsDisabledReason
                  : commentsCount === 0
                    ? translate(
                        'auto.components.right.sidebar.checks.panel.content.7440d09d2c',
                        'Start conversation'
                      )
                    : translate(
                        'auto.components.right.sidebar.checks.panel.content.2b2be92919',
                        'Add comment'
                      )}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {commentsCount > 0 && (
        <div className={presentation.audienceTabs}>
          {getPrCommentAudienceFilters().map((filter) => {
            const isActive = commentFilter === filter.value
            return (
              <Button
                variant="ghost"
                size="xs"
                key={filter.value}
                type="button"
                className={cn(
                  'p-0 h-auto border-0 focus-visible:bg-accent',
                  presentation.audienceTab,
                  isActive && presentation.audienceTabActive
                )}
                aria-pressed={isActive}
                onClick={() => onCommentFilterChange(filter.value)}
              >
                <span>{filter.label}</span>
                <span className="tabular-nums">{commentCounts[filter.value]}</span>
              </Button>
            )
          })}
        </div>
      )}
      {commentsCount >= 100 && (
        <div className="text-muted-foreground mt-1.5 text-[10px]">
          {translate(
            'auto.components.right.sidebar.checks.panel.content.751f7c6e5c',
            'Showing first 100 comments per source'
          )}
        </div>
      )}
    </div>
  )
}

import type { GitBranchCompareSummary } from '@yiru/protocol/git/branch-compare-types'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  GearSix as Settings2,
  type Icon,
  ArrowUp,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '~renderer/ui/tooltip'

import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from '../right-sidebar-button-styles'

export type BranchCompareStatusHeadSnapshot = {
  baseRef: string
  statusHead: string | null
  worktreeId: string
}

export type BranchCompareRemoteStatusSnapshot = {
  ahead: number | null
  baseRef: string
  behind: number | null
  hasUpstream: boolean | null
  upstreamName: string | null
  worktreeId: string
}

export function shouldRefreshBranchCompareForStatusHead(
  previous: BranchCompareStatusHeadSnapshot | null,
  current: BranchCompareStatusHeadSnapshot
): boolean {
  return (
    current.statusHead !== null &&
    previous !== null &&
    previous.worktreeId === current.worktreeId &&
    previous.baseRef === current.baseRef &&
    previous.statusHead !== current.statusHead
  )
}

export function shouldRefreshBranchCompareForRemoteStatus(
  previous: BranchCompareRemoteStatusSnapshot | null,
  current: BranchCompareRemoteStatusSnapshot
): boolean {
  return (
    previous !== null &&
    previous.worktreeId === current.worktreeId &&
    previous.baseRef === current.baseRef &&
    (previous.hasUpstream !== current.hasUpstream ||
      previous.upstreamName !== current.upstreamName ||
      previous.ahead !== current.ahead ||
      previous.behind !== current.behind)
  )
}

export function shouldShowCompareSummary(summary: GitBranchCompareSummary | null): boolean {
  if (!summary || summary.status === 'loading') {
    return true
  }
  if (summary.status !== 'ready') {
    return true
  }
  return typeof summary.commitsAhead === 'number' && summary.commitsAhead > 0
}

export function CompareSummary({
  summary,
  onChangeBaseRef,
  onRetry
}: {
  summary: GitBranchCompareSummary | null
  onChangeBaseRef: () => void
  onRetry: () => void
}): React.JSX.Element | null {
  if (!summary || summary.status === 'loading') {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <LoadingIndicator className="size-3.5" />
        <span>
          {translate('auto.components.right.sidebar.SourceControl.11b5dd8e41', 'Comparing against')}
          {summary?.baseRef ?? '…'}
        </span>
      </div>
    )
  }

  if (summary.status !== 'ready') {
    return (
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate">
          {summary.errorMessage ??
            translate(
              'auto.components.right.sidebar.SourceControl.715d229c86',
              'Branch compare unavailable'
            )}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <CompareSummaryToolbarButton
            icon={Settings2}
            label={translate(
              'auto.components.right.sidebar.SourceControl.493f963029',
              'Change base ref'
            )}
            onClick={onChangeBaseRef}
          />
          <CompareSummaryToolbarButton
            icon={RefreshCw}
            label={translate('auto.components.right.sidebar.SourceControl.286dbda4d6', 'Retry')}
            onClick={onRetry}
          />
        </div>
      </div>
    )
  }

  const commitsAhead = summary.commitsAhead
  const showCommitsAhead = typeof commitsAhead === 'number' && commitsAhead > 0
  const commitsAheadTitle = showCommitsAhead
    ? `${commitsAhead} ${commitsAhead === 1 ? 'commit' : 'commits'} ahead of ${summary.baseRef}`
    : undefined

  if (!showCommitsAhead) {
    return null
  }

  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <span className="flex min-w-0 items-center gap-1" title={commitsAheadTitle}>
        <ArrowUp className="size-3" />
        <span>
          {commitsAhead}{' '}
          {translate('auto.components.right.sidebar.SourceControl.3278b2767b', 'ahead')}
        </span>
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <CompareSummaryToolbarButton
          icon={Settings2}
          label={translate(
            'auto.components.right.sidebar.SourceControl.493f963029',
            'Change base ref'
          )}
          onClick={onChangeBaseRef}
        />
        <CompareSummaryToolbarButton
          icon={RefreshCw}
          label={translate(
            'auto.components.right.sidebar.SourceControl.ed34038d0d',
            'Refresh branch compare'
          )}
          onClick={onRetry}
        />
      </div>
    </div>
  )
}

export function CompareSummaryToolbarButton({
  icon: Icon,
  label,
  onClick
}: {
  icon: Icon
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className={RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME}
            aria-label={label}
            onClick={onClick}
          >
            <Icon className="size-3.5" />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function CompareUnavailable({
  summary,
  onChangeBaseRef,
  onRetry
}: {
  summary: GitBranchCompareSummary
  onChangeBaseRef: () => void
  onRetry: () => void
}): React.JSX.Element {
  const changeBaseRefAllowed =
    summary.status === 'invalid-base' ||
    summary.status === 'no-merge-base' ||
    summary.status === 'error'

  return (
    <div className="border-border/60 bg-muted/20 m-2 border px-3 py-3 text-xs">
      <div className="text-foreground font-medium">
        {summary.status === 'error'
          ? translate(
              'auto.components.right.sidebar.SourceControl.97d8b03cdf',
              'Branch compare failed'
            )
          : translate(
              'auto.components.right.sidebar.SourceControl.715d229c86',
              'Branch compare unavailable'
            )}
      </div>
      <div className="text-muted-foreground mt-1">
        {summary.errorMessage ??
          translate(
            'auto.components.right.sidebar.SourceControl.b6922abb13',
            'Unable to load branch compare.'
          )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {changeBaseRefAllowed && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onChangeBaseRef}
          >
            <Settings2 className="size-3.5" />
            {translate('auto.components.right.sidebar.SourceControl.476b77745b', 'Change Base Ref')}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          {translate('auto.components.right.sidebar.SourceControl.286dbda4d6', 'Retry')}
        </Button>
      </div>
    </div>
  )
}

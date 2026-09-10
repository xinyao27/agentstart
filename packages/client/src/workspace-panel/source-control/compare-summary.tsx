import type { GitBranchCompareSummary } from '@agentstart/protocol/git/branch-compare-types'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { GearSix as Settings2, ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
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

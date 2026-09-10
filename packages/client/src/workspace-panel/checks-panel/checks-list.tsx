import type {
  PRCheckDetail,
  PRCheckRunDetails
} from '@agentstart/protocol/hosted-review/review-types'
import React, { useEffect, useMemo, useState } from 'react'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import {
  CircleDashed,
  CaretRight as ChevronRight,
  ArrowSquareOut as ExternalLink
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useActiveWorktree } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { CHECK_COLOR, CHECK_ICON } from '../check-status-presentation'
import { CheckRunDetails } from './check-run-details'
import {
  CHECK_SORT_ORDER,
  getCheckDetailsKey,
  getCheckStatusLabel,
  isFailedCheck,
  type CheckDetailsLoadState,
  type CheckDetailsStickySurface
} from './check-status'
import { ChecksSummary } from './checks-summary'

export function ChecksList({
  checks,
  checksLoading,
  checkDetailsContextKey,
  onLoadCheckDetails,
  worktreeId: worktreeIdOverride,
  persistDetails = true,
  detailsStickySurface = 'sidebar',
  workspacePanelTabId
}: {
  checks: PRCheckDetail[]
  checksLoading: boolean
  checkDetailsContextKey: string
  onLoadCheckDetails?: (check: PRCheckDetail) => Promise<PRCheckRunDetails | null>
  /** Why: folder-workspace PR checks render rows for attached worktrees, not the active one. */
  worktreeId?: string
  persistDetails?: boolean
  detailsStickySurface?: CheckDetailsStickySurface
  workspacePanelTabId?: string
}): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  // Why: projection-only remote checks must not write details into the local Worktree cache.
  const resolvedWorktreeId = persistDetails
    ? (worktreeIdOverride ?? activeWorktree?.id ?? null)
    : null
  const patchOpenCheckRunDetails = useAppStore((s) => s.patchOpenCheckRunDetails)
  const [checksExpanded, setChecksExpanded] = useState(true)
  const [expandedState, setExpandedState] = useState<{
    contextKey: string
    keys: Set<string>
  }>({ contextKey: '', keys: new Set() })
  const [detailsState, setDetailsState] = useState<{
    contextKey: string
    values: Record<string, CheckDetailsLoadState>
  }>({ contextKey: '', values: {} })
  const sorted = useMemo(
    () =>
      [...checks].sort(
        (a, b) =>
          (CHECK_SORT_ORDER[a.conclusion ?? 'pending'] ?? 3) -
          (CHECK_SORT_ORDER[b.conclusion ?? 'pending'] ?? 3)
      ),
    [checks]
  )
  const rows = useMemo(
    () =>
      sorted.map((check, index) => ({
        check,
        key: getCheckDetailsKey(checkDetailsContextKey, check, index)
      })),
    [checkDetailsContextKey, sorted]
  )
  const passingCount = checks.filter((c) => c.conclusion === 'success').length
  const failingCount = checks.filter((c) => isFailedCheck(c)).length
  const pendingCount = checks.filter(
    (c) => c.conclusion === 'pending' || c.conclusion === null
  ).length
  const expandedCheckKeys = useMemo(() => {
    const validKeys = new Set(rows.map((row) => row.key))
    const next = new Set(
      expandedState.contextKey === checkDetailsContextKey
        ? [...expandedState.keys].filter((key) => validKeys.has(key))
        : []
    )
    if (expandedState.contextKey !== checkDetailsContextKey) {
      const firstFailed = rows.find((row) => isFailedCheck(row.check))
      if (firstFailed) {
        next.add(firstFailed.key)
      }
    }
    return next
  }, [checkDetailsContextKey, expandedState, rows])
  const storedDetails =
    detailsState.contextKey === checkDetailsContextKey ? detailsState.values : {}
  const detailsByCheckKey = Object.fromEntries(
    rows.flatMap((row) => {
      const cached = storedDetails[row.key]
      if (
        !cached ||
        (cached.details &&
          (cached.details.status !== row.check.status ||
            cached.details.conclusion !== row.check.conclusion))
      ) {
        return []
      }
      return [[row.key, cached]]
    })
  ) satisfies Record<string, CheckDetailsLoadState>
  const updateDetails = useEventCallback(
    (
      update: (
        current: Record<string, CheckDetailsLoadState>
      ) => Record<string, CheckDetailsLoadState>
    ): void => {
      setDetailsState((current) => ({
        contextKey: checkDetailsContextKey,
        values: update(current.contextKey === checkDetailsContextKey ? current.values : {})
      }))
    }
  )
  const isCurrentDetailsContext = useEventCallback(
    (requestContextKey: string): boolean => requestContextKey === checkDetailsContextKey
  )

  const requestCheckDetails = useEventCallback((row: { check: PRCheckDetail; key: string }) => {
    if (detailsByCheckKey[row.key]?.loading || detailsByCheckKey[row.key]?.details) {
      return
    }
    if (!row.check.checkRunId && !row.check.workflowRunId && !row.check.url) {
      updateDetails((current) => ({
        ...current,
        [row.key]: {
          loading: false,
          details: null,
          error: translate(
            'auto.components.right.sidebar.checks.panel.content.e15a8b77ef',
            'No inline details are available for this check.'
          )
        }
      }))
      return
    }
    if (!onLoadCheckDetails) {
      updateDetails((current) => ({
        ...current,
        [row.key]: {
          loading: false,
          details: null,
          error: translate(
            'auto.components.right.sidebar.checks.panel.content.e15a8b77ef',
            'No inline details are available for this check.'
          )
        }
      }))
      return
    }
    const requestContextKey = checkDetailsContextKey
    updateDetails((current) => ({
      ...current,
      [row.key]: { loading: true, details: null, error: null }
    }))
    void onLoadCheckDetails(row.check)
      .then((details) => {
        if (!isCurrentDetailsContext(requestContextKey)) {
          return
        }
        updateDetails((current) => ({
          ...current,
          [row.key]: {
            loading: false,
            details,
            error: details ? null : 'No inline details are available for this check.'
          }
        }))
      })
      .catch((err) => {
        if (!isCurrentDetailsContext(requestContextKey)) {
          return
        }
        updateDetails((current) => ({
          ...current,
          [row.key]: {
            loading: false,
            details: null,
            error: err instanceof Error ? err.message : 'Failed to load check details.'
          }
        }))
      })
  })

  useEffect(() => {
    if (!checksExpanded) {
      return
    }
    for (const row of rows) {
      if (expandedCheckKeys.has(row.key) && !detailsByCheckKey[row.key]) {
        requestCheckDetails(row)
      }
    }
  }, [checksExpanded, detailsByCheckKey, expandedCheckKeys, requestCheckDetails, rows])

  useEffect(() => {
    if (!resolvedWorktreeId) {
      return
    }
    for (const row of rows) {
      const detailsState = detailsByCheckKey[row.key]
      if (!detailsState) {
        continue
      }
      patchOpenCheckRunDetails(resolvedWorktreeId, checkDetailsContextKey, row.check, {
        details: detailsState.details ?? null,
        loading: detailsState.loading ?? false,
        error: detailsState.error ?? null
      })
    }
  }, [
    checkDetailsContextKey,
    detailsByCheckKey,
    patchOpenCheckRunDetails,
    resolvedWorktreeId,
    rows
  ])

  const toggleCheckExpanded = (row: { check: PRCheckDetail; key: string }) => {
    const willExpand = !expandedCheckKeys.has(row.key)
    setExpandedState(() => {
      const next = new Set(expandedCheckKeys)
      if (next.has(row.key)) {
        next.delete(row.key)
      } else {
        next.add(row.key)
      }
      return { contextKey: checkDetailsContextKey, keys: next }
    })
    if (willExpand) {
      requestCheckDetails(row)
    }
  }

  return (
    <>
      <ChecksSummary
        checksCount={checks.length}
        passingCount={passingCount}
        failingCount={failingCount}
        pendingCount={pendingCount}
        checksLoading={checksLoading}
        checksExpanded={checksExpanded}
        onToggle={() => setChecksExpanded((expanded) => !expanded)}
      />

      {/* Checks List */}
      {checksLoading && checks.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <LoadingIndicator className="text-muted-foreground size-5" />
        </div>
      ) : checks.length === 0 ? (
        <div className="text-muted-foreground px-4 py-8 text-[11px]">
          {translate(
            'auto.components.right.sidebar.checks.panel.content.991f50c7e4',
            'No checks configured'
          )}
        </div>
      ) : !checksExpanded ? null : (
        <>
          <div className="py-1">
            {rows.map((row) => {
              const check = row.check
              const conclusion = check.conclusion ?? 'pending'
              const Icon = CHECK_ICON[conclusion] ?? CircleDashed
              const color = CHECK_COLOR[conclusion] ?? 'text-muted-foreground'
              const expanded = expandedCheckKeys.has(row.key)
              const openUrl = check.url
              return (
                <div key={row.key} className="min-w-0">
                  <div
                    className={cn(
                      'group/check-row flex min-w-0 cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors hover:bg-accent/40',
                      expanded && 'bg-accent/25'
                    )}
                    onClick={() => toggleCheckExpanded(row)}
                  >
                    <ChevronRight
                      className={cn(
                        'size-3 shrink-0 text-muted-foreground transition-transform',
                        expanded && 'rotate-90'
                      )}
                    />
                    <Icon className={cn('size-3.5 shrink-0', color)} />
                    <span className="text-foreground flex-1 truncate text-[12px]">
                      {check.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="text-muted-foreground text-[11px]">
                        {getCheckStatusLabel(check)}
                      </span>
                      {openUrl && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="quiet"
                                size="icon-xs"
                                className="size-6"
                                aria-label={translate(
                                  'auto.components.right.sidebar.checks.panel.content.0dca6bfab5',
                                  'Open check details'
                                )}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openHttpLink(openUrl, {
                                    event,
                                    worktreeId: resolvedWorktreeId
                                  })
                                }}
                              >
                                <ExternalLink className="size-3" />
                              </Button>
                            }
                          />
                          <TooltipContent side="left" sideOffset={4}>
                            {translate(
                              'auto.components.right.sidebar.checks.panel.content.0dca6bfab5',
                              'Open check details'
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </div>
                  {expanded && (
                    <CheckRunDetails
                      check={check}
                      state={detailsByCheckKey[row.key]}
                      checkDetailsContextKey={checkDetailsContextKey}
                      worktreeId={resolvedWorktreeId}
                      detailsStickySurface={detailsStickySurface}
                      workspacePanelTabId={workspacePanelTabId}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {checks.length >= 100 && (
            <div className="border-border text-muted-foreground border-b px-3 py-1.5 text-[10px]">
              {translate(
                'auto.components.right.sidebar.checks.panel.content.cbcc4ab3db',
                'Showing first 100 checks'
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

import type { MemorySnapshot } from '@agentstart/protocol/diagnostics/memory-values'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  Memory as MemoryStick,
  Trash as Trash2,
  ArrowClockwise as RotateCw
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import type { DaemonActionsApi } from '../daemon-actions/use-actions'
import { formatCpu, formatMemory, formatPercent } from './resource-usage-metrics'

type ResourceManagerSummaryProps = {
  daemonActions: DaemonActionsApi
  isDaemonUnreachable: boolean
  hasSessionsError: boolean
  snapshot: MemorySnapshot | null
  totalCpu: number
  totalMemory: number
  hostShare: number
  orphanCount: number
}

export function ResourceManagerSummary({
  daemonActions,
  isDaemonUnreachable,
  hasSessionsError,
  snapshot,
  totalCpu,
  totalMemory,
  hostShare,
  orphanCount
}: ResourceManagerSummaryProps): React.JSX.Element {
  return (
    <>
      <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <div className="text-foreground flex min-w-0 items-center gap-1.5 text-[11px] font-medium">
          <MemoryStick className="text-muted-foreground size-3 shrink-0" />
          <span className="truncate">
            {translate('auto.components.status.bar.StatusBar.d1e1a7a6bf', 'Resource Manager')}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <SummaryAction
            label={translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.c9382662bb',
              'Restart daemon'
            )}
            disabled={daemonActions.isBusy}
            onClick={() => daemonActions.setPending('restart')}
          >
            <RotateCw className="size-3" />
          </SummaryAction>
          <SummaryAction
            label={translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.bd19fd7a59',
              'Kill all sessions'
            )}
            disabled={daemonActions.isBusy}
            onClick={() => daemonActions.setPending('killAll')}
            destructive
          >
            <Trash2 className="size-3" />
          </SummaryAction>
        </div>
      </div>

      {isDaemonUnreachable ? (
        <div className="border-border text-foreground flex items-start gap-2 border-b bg-yellow-500/10 px-3 py-2 text-[11px]">
          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-yellow-500" />
          <div className="flex-1">
            <div className="font-medium">
              {translate(
                'auto.components.status.bar.ResourceUsageStatusSegment.f8e0d794b4',
                'Daemon is not responding'
              )}
            </div>
            <div className="text-muted-foreground">
              {translate(
                'auto.components.status.bar.ResourceUsageStatusSegment.f85af9cda6',
                'Resource snapshots and terminal sessions are unavailable.'
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => daemonActions.setPending('restart')}
            disabled={daemonActions.isBusy}
          >
            <RotateCw className="mr-1 size-3" />
            {translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.93b0de3c21',
              'Restart'
            )}
          </Button>
        </div>
      ) : hasSessionsError ? (
        <div
          className="border-border bg-muted/40 text-muted-foreground flex items-center gap-2 border-b px-3 py-1.5 text-[11px]"
          role="status"
        >
          <AlertTriangle className="size-3 shrink-0 text-yellow-500" />
          <span>
            {translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.e7cf14ec78',
              'Terminal sessions unavailable. The list may be stale.'
            )}
          </span>
        </div>
      ) : null}

      {snapshot ? (
        <div className="border-border flex items-baseline justify-between gap-3 border-b px-3 py-2 text-xs tabular-nums">
          <div className="flex min-w-0 items-baseline gap-3">
            <SummaryMetric
              value={formatCpu(totalCpu)}
              description={translate(
                'auto.components.status.bar.ResourceUsageStatusSegment.1fedf94eae',
                'Combined CPU load. Values above 100% mean more than one core is working at once.'
              )}
            />
            <span className="text-muted-foreground/50">·</span>
            <SummaryMetric
              value={formatMemory(totalMemory)}
              description={translate(
                'auto.components.status.bar.ResourceUsageStatusSegment.9e2525c89f',
                "Resident memory held by AgentStart plus the processes under each worktree's terminals."
              )}
            />
            <span className="text-muted-foreground/50">·</span>
            <SummaryMetric
              muted
              value={`${formatPercent(hostShare)} ${translate(
                'auto.components.status.bar.ResourceUsageStatusSegment.e7ccce7e87',
                'of system RAM'
              )}`}
              description={translate(
                'auto.components.status.bar.ResourceUsageStatusSegment.6449a95c78',
                "How much of this machine's physical RAM the AgentStart-tracked processes are sitting on."
              )}
            />
          </div>
          {orphanCount > 0 ? (
            <span className="shrink-0 text-yellow-500" aria-live="polite">
              {translate(
                orphanCount === 1
                  ? 'auto.components.status.bar.ResourceUsageStatusSegment.30ff2c3c31'
                  : 'auto.components.status.bar.ResourceUsageStatusSegment.b8f4a2c1d0e3',
                orphanCount === 1 ? '{{value0}} orphan' : '{{value0}} orphans',
                { value0: orphanCount }
              )}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

function SummaryAction({
  label,
  disabled,
  onClick,
  destructive = false,
  children
}: {
  label: string
  disabled: boolean
  onClick: () => void
  destructive?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={destructive ? 'destructive' : 'quiet'}
            size="icon-xs"
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={
              destructive
                ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive transition-colors disabled:opacity-40'
                : 'disabled:opacity-40'
            }
          >
            {children}
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function SummaryMetric({
  value,
  description,
  muted = false
}: {
  value: string
  description: string
  muted?: boolean
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className={
              muted
                ? 'text-muted-foreground focus-visible:outline-none'
                : 'text-foreground font-medium focus-visible:outline-none'
            }
          >
            {value}
          </span>
        }
      />
      <TooltipContent side="top" sideOffset={6} className="z-[70] max-w-xs">
        {description}
      </TooltipContent>
    </Tooltip>
  )
}

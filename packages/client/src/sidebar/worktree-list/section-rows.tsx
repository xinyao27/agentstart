import {
  isConfirmedStaleFolderPathStatus,
  type FolderWorkspacePathStatus
} from '@agentstart/protocol/workspace/folder-path'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  CaretDown as ChevronDown,
  FolderMinus as FolderX,
  HardDrives as Server,
  HardDrive as ServerOff
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import {
  getFolderWorkspacePathStatusDescription,
  getFolderWorkspacePathStatusTitle
} from '../folder-workspace-path-status'
import { HostSectionHeaderMenu } from '../host-section-header-menu'
import type { HostHeaderRow } from '../host-section-rows'

function formatSectionActivityLabel(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`
}

function SectionMetricsBadge({ count }: { count: number }): React.JSX.Element {
  const totalLabel = formatSectionActivityLabel(count, 'workspace')
  return (
    <span
      className="border-sidebar-border bg-sidebar-accent text-muted-foreground/90 inline-flex h-4 shrink-0 overflow-hidden rounded-sm border text-[9px] leading-none font-medium"
      aria-label={totalLabel}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex h-full min-w-4 items-center justify-center px-1.5">
              {count}
            </span>
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {totalLabel}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}

function HostHeaderHealthIcon({
  health
}: {
  health: HostHeaderRow['health']
}): React.JSX.Element | null {
  // Why: healthy is the default state. Only states needing attention earn a mark.
  if (health === 'connecting') {
    return <LoadingIndicator className="text-muted-foreground size-3 shrink-0" />
  }
  if (health === 'blocked' || health === 'error') {
    return <AlertTriangle className="text-destructive size-3 shrink-0" />
  }
  return null
}

function getHostHeaderDetail(row: HostHeaderRow): { text: string; isWarning: boolean } | null {
  if (row.health === 'blocked') {
    return {
      text: translate('auto.components.sidebar.WorktreeList.7a8b9c0d1e', 'Update required'),
      isWarning: true
    }
  }
  if (row.health === 'disconnected') {
    return {
      text: translate('auto.components.sidebar.WorktreeList.hostDisconnected', 'Disconnected'),
      isWarning: false
    }
  }
  // Why: the transport suffix is useful only on remote hosts.
  return row.kind === 'local' ? null : { text: row.detail, isWarning: false }
}

export function HostSectionHeader({
  row,
  onToggle,
  onDragPointerDown,
  dragging
}: {
  row: HostHeaderRow
  onToggle: () => void
  onDragPointerDown?: (event: React.PointerEvent<HTMLElement>) => void
  dragging?: boolean
}): React.JSX.Element {
  const isBlocked = row.health === 'blocked'
  const isDisconnected = row.health === 'disconnected'
  const detail = getHostHeaderDetail(row)
  return (
    <div className="px-2 pt-1">
      <div
        role="button"
        tabIndex={0}
        data-host-header-drag-id={row.hostId}
        aria-expanded={!row.collapsed}
        className={cn(
          'group/host-header flex h-8 w-full cursor-pointer items-center gap-2 border px-2 text-left transition-all outline-none focus-visible:border-ring',
          onDragPointerDown && 'cursor-grab active:cursor-grabbing',
          isBlocked
            ? 'border-destructive/40 bg-destructive/10'
            : isDisconnected
              ? 'border-sidebar-border/70 bg-sidebar-accent/35 text-muted-foreground'
              : 'border-sidebar-border bg-sidebar-accent/70',
          dragging && 'pointer-events-none opacity-0'
        )}
        onPointerDown={onDragPointerDown}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
      >
        {isDisconnected ? (
          <ServerOff className="text-muted-foreground/80 size-3.5 shrink-0" />
        ) : (
          <Server className="text-muted-foreground size-3.5 shrink-0" />
        )}
        <HostHeaderHealthIcon health={row.health} />
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span
            className={cn(
              'min-w-0 truncate text-[12px] font-semibold leading-none',
              isDisconnected ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {row.label}
          </span>
          {detail ? (
            <span
              className={cn(
                'shrink-0 truncate text-[10px] leading-none',
                detail.isWarning ? 'text-destructive' : 'text-muted-foreground/70'
              )}
            >
              {detail.text}
            </span>
          ) : null}
          <SectionMetricsBadge count={row.count} />
        </div>
        <div className="text-muted-foreground/60 can-hover:opacity-0 flex size-4 shrink-0 items-center justify-center transition-opacity group-hover/host-header:opacity-100">
          <ChevronDown
            className={cn('size-3.5 transition-transform', row.collapsed && '-rotate-90')}
          />
        </div>
        <span data-host-header-action="">
          <HostSectionHeaderMenu row={row} />
        </span>
      </div>
    </div>
  )
}

export function FolderPathStatusIndicator({
  status
}: {
  status: FolderWorkspacePathStatus | null | undefined
}): React.JSX.Element | null {
  const title = getFolderWorkspacePathStatusTitle(status)
  if (!status || status.exists || !title) {
    return null
  }
  const destructive = isConfirmedStaleFolderPathStatus(status)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              'inline-flex size-4 shrink-0 items-center justify-center',
              destructive ? 'text-destructive' : 'text-muted-foreground'
            )}
            aria-label={title}
          >
            <FolderX className="size-3.5" />
          </span>
        }
      />
      <TooltipContent side="bottom" sideOffset={6} className="max-w-72">
        <div className="space-y-1">
          <div className="font-medium">{title}</div>
          <div className="text-muted-foreground">
            {getFolderWorkspacePathStatusDescription(status)}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

import type {
  WorkspaceSpaceItemValue as WorkspaceSpaceItem,
  WorkspaceSpaceWorktreeValue as WorkspaceSpaceWorktree
} from '@yiru/protocol'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'

import { formatBytes, formatCompactCount } from './workspace-space-format'
import { getLargestWorkspaceSpaceItemSize } from './workspace-space-presentation'

export function SizeBar({ value, max }: { value: number; max: number }): React.JSX.Element {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="bg-muted h-1.5 overflow-hidden">
      <div className="bg-foreground/65 h-full" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function BreakdownList({
  worktree,
  isScanning
}: {
  worktree: WorkspaceSpaceWorktree | null
  isScanning: boolean
}): React.JSX.Element {
  if (!worktree) {
    return (
      <div className="border-border/70 bg-muted/15 text-muted-foreground flex h-full min-h-72 items-center justify-center border border-dashed text-sm">
        <span className="flex items-center gap-2">
          {isScanning ? <LoadingIndicator className="size-4" /> : null}
          {isScanning
            ? translate(
                'auto.components.status.bar.WorkspaceSpaceManagerPanel.c5135e7e4a',
                'Scanning workspace sizes. You can leave this page.'
              )
            : translate(
                'auto.components.status.bar.WorkspaceSpaceManagerPanel.5c6d25720c',
                'Select a workspace to inspect.'
              )}
        </span>
      </div>
    )
  }

  const maxChildSize = getLargestWorkspaceSpaceItemSize(worktree.topLevelItems)
  const topLevelItemCount = worktree.topLevelItems.length + worktree.omittedTopLevelItemCount
  return (
    <div className="border-border/70 bg-background/35 min-h-72 border">
      <div className="border-border/60 border-b px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{worktree.displayName}</div>
            <div className="text-muted-foreground mt-0.5 truncate text-xs">
              {worktree.repoDisplayName}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold tabular-nums">
              {formatBytes(worktree.sizeBytes)}
            </div>
            <div className="text-muted-foreground text-[11px]">
              {formatCompactCount(topLevelItemCount)}{' '}
              {translate(
                'auto.components.status.bar.WorkspaceSpaceManagerPanel.b25c2c1086',
                'top-level items'
              )}
            </div>
          </div>
        </div>
      </div>

      {worktree.status !== 'ok' ? (
        <div className="text-destructive flex items-start gap-2 px-4 py-4 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">
            {worktree.error ??
              translate(
                'auto.components.status.bar.WorkspaceSpaceManagerPanel.0ba046fbc5',
                'Scan failed.'
              )}
          </span>
        </div>
      ) : worktree.topLevelItems.length === 0 ? (
        <div className="text-muted-foreground px-4 py-8 text-center text-sm">
          {translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.16988df079',
            'No files found.'
          )}
        </div>
      ) : (
        <div className="scrollbar-sleek max-h-72 overflow-y-auto px-3 py-3">
          <div className="space-y-2">
            {worktree.topLevelItems.slice(0, 12).map((item) => (
              <BreakdownRow key={`${item.path}:${item.name}`} item={item} maxSize={maxChildSize} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BreakdownRow({
  item,
  maxSize
}: {
  item: WorkspaceSpaceItem
  maxSize: number
}): React.JSX.Element {
  return (
    <div className="hover:bg-accent/50 space-y-1.5 px-2 py-1.5">
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-medium">{item.name}</span>
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {formatBytes(item.sizeBytes)}
        </span>
      </div>
      <SizeBar value={item.sizeBytes} max={maxSize} />
    </div>
  )
}

import type { WorkspaceSpaceWorktreeValue as WorkspaceSpaceWorktree } from '@yiru/protocol'
import { useEffect, useState } from 'react'
import { installWindowVisibilityInterval } from '~renderer/application-shell/window-visibility-interval'
import { translate } from '~renderer/i18n/i18n'
import { Check, Circle, Minus, ArrowDown, ArrowUp } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'

import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import type {
  WorkspaceDecisionDetails,
  WorkspaceSpaceDeleteState
} from './workspace-space-decision'
import {
  getWorkspaceSpaceScanDateTimeLabel,
  getWorkspaceSpaceScanTimeLabel,
  getWorkspaceSpaceStatusLabel
} from './workspace-space-format'
import type { TreemapRect } from './workspace-space-layout'
import type {
  WorkspaceSpaceSortDirection,
  WorkspaceSpaceSortKey
} from './workspace-space-presentation'

const TREEMAP_FILLS = [
  'color-mix(in srgb, var(--chart-2) 34%, var(--card))',
  'color-mix(in srgb, var(--foreground) 20%, var(--card))',
  'color-mix(in srgb, var(--chart-4) 28%, var(--card))',
  'color-mix(in srgb, var(--primary) 24%, var(--card))',
  'color-mix(in srgb, var(--chart-1) 38%, var(--card))'
]
export function getTreemapFill(rect: TreemapRect, selected: boolean): string {
  if (selected) {
    return 'color-mix(in srgb, var(--ring) 40%, var(--card))'
  }
  return TREEMAP_FILLS[rect.index % TREEMAP_FILLS.length]
}

export function Metric({
  label,
  value,
  title
}: {
  label: string
  value: string
  title?: string
}): React.JSX.Element {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-muted-foreground truncate text-[11px] font-medium tracking-[0.14em] uppercase">
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums" title={title}>
        {value}
      </div>
    </div>
  )
}

export function UpdatedMetric({
  scannedAt,
  isScanning
}: {
  scannedAt: number | null
  isScanning: boolean
}): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (scannedAt === null) {
      return
    }
    return installWindowVisibilityInterval({ run: () => setNow(Date.now()), intervalMs: 60_000 })
  }, [scannedAt])

  return (
    <Metric
      label={translate(
        'auto.components.status.bar.WorkspaceSpaceManagerPanel.52b629eb84',
        'Updated'
      )}
      title={scannedAt === null ? undefined : getWorkspaceSpaceScanDateTimeLabel(scannedAt)}
      value={
        scannedAt === null
          ? isScanning
            ? 'Scanning'
            : '—'
          : getWorkspaceSpaceScanTimeLabel(scannedAt, now)
      }
    />
  )
}

export function CheckButton({
  checked,
  disabled,
  label,
  onClick
}: {
  checked: boolean | 'mixed'
  disabled?: boolean
  label: string
  onClick: () => void
}): React.JSX.Element {
  const isChecked = checked === true
  const isMixed = checked === 'mixed'
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={cn('flex transition-colors ', disabled && 'cursor-default opacity-35')}
    >
      <span
        className={cn(
          'flex size-4 items-center justify-center border transition-colors',
          isChecked || isMixed
            ? 'border-foreground bg-foreground text-background'
            : 'border-muted-foreground/50 bg-background/40 text-transparent'
        )}
      >
        {isChecked ? <Check className="size-3" /> : null}
        {isMixed ? <Minus className="size-3" /> : null}
      </span>
    </Button>
  )
}

export function SortIndicator({
  sortKey,
  activeKey,
  direction
}: {
  sortKey: WorkspaceSpaceSortKey
  activeKey: WorkspaceSpaceSortKey
  direction: WorkspaceSpaceSortDirection
}): React.JSX.Element {
  if (sortKey !== activeKey) {
    return <Circle className="size-3 opacity-0" />
  }
  return direction === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
}

export function StatusBadge({
  worktree,
  decisionDetails,
  deleteState
}: {
  worktree: WorkspaceSpaceWorktree
  decisionDetails?: WorkspaceDecisionDetails
  deleteState?: WorkspaceSpaceDeleteState
}): React.JSX.Element {
  if (deleteState?.isDeleting) {
    return (
      <Badge variant="outline" className="text-muted-foreground gap-1.5">
        <LoadingIndicator className="size-3" />
        {translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.33653dbac2', 'Deleting')}
      </Badge>
    )
  }
  if (deleteState?.error) {
    return (
      <Badge variant="outline" className="border-destructive/30 text-destructive">
        {translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.39801484e0', 'Failed')}
      </Badge>
    )
  }
  if (worktree.status !== 'ok') {
    return (
      <Badge variant="outline" className="border-destructive/30 text-destructive">
        {getWorkspaceSpaceStatusLabel(worktree.status)}
      </Badge>
    )
  }
  if (worktree.isMainWorktree) {
    return (
      <Badge variant="outline">
        {translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.2b501ee391',
          'Keep: main'
        )}
      </Badge>
    )
  }
  if (decisionDetails?.isActive) {
    return (
      <Badge variant="outline">
        {translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.7f7895514e',
          'Keep: active'
        )}
      </Badge>
    )
  }
  if ((decisionDetails?.changedFileCount ?? 0) > 0) {
    return (
      <Badge variant="outline">
        {translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.7ab8d7e2d7',
          'Keep: changed files'
        )}
      </Badge>
    )
  }
  if (decisionDetails?.changedFileCount === null) {
    return (
      <Badge variant="outline">
        {translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.ec7b076a75',
          'Keep: git not checked'
        )}
      </Badge>
    )
  }
  if ((decisionDetails?.dirtyEditorBufferCount ?? 0) > 0) {
    return (
      <Badge variant="outline">
        {translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.2055bc6a5a',
          'Keep: unsaved edits'
        )}
      </Badge>
    )
  }
  if (
    (decisionDetails?.activeAgentCount ?? 0) > 0 ||
    (decisionDetails?.liveTerminalCount ?? 0) > 0 ||
    (decisionDetails?.browserTabCount ?? 0) > 0
  ) {
    return (
      <Badge variant="outline">
        {translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.cbc343a7a8',
          'Keep: in use'
        )}
      </Badge>
    )
  }
  if (decisionDetails?.reviewLabel) {
    return (
      <Badge variant="outline">
        {translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.720870a18e',
          'Keep: linked'
        )}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    >
      {translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.7d7745bb8f', 'Can delete')}
    </Badge>
  )
}

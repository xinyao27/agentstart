import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretDown as ChevronDown } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

// Why: these rows are the top level of the same tree as the files below them, so
// the metrics mirror Pierre's row CSS (26px tall, 8px inline padding, 12px text,
// sidebar-accent hover) instead of inventing a section-header look.
export function SourceControlGroupRow({
  label,
  count,
  conflictCount = 0,
  isExpanded,
  onToggle,
  actions
}: {
  label: string
  count: number
  conflictCount?: number
  isExpanded: boolean
  onToggle: () => void
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    // Why: the panel scroller is a flex column, so every row-sized child must
    // opt out of shrinking or the browser compresses it to fit.
    <div className="group/group-row hover:bg-sidebar-accent flex h-[26px] shrink-0 items-center px-2">
      <Button
        type="button"
        variant="quiet"
        size="xs"
        className="h-[26px] min-w-0 flex-1 justify-start gap-1.5 p-0 text-[12px] font-normal"
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <ChevronDown
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            !isExpanded && '-rotate-90'
          )}
        />
        <span className="min-w-0 truncate">{label}</span>
        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">{count}</span>
        {conflictCount > 0 ? (
          <span className="text-destructive/80 shrink-0 text-[11px] tabular-nums">
            {conflictCount}{' '}
            {translate('auto.components.workspacePanel.SourceControl.413a3ba113', 'conflict')}
            {conflictCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </Button>
      {actions ? (
        // Why: no-hover and keyboard users still need these, so the lane only
        // fades out where hover is actually available.
        <div className="can-hover:opacity-0 flex shrink-0 items-center transition-opacity group-focus-within/group-row:opacity-100 group-hover/group-row:opacity-100 focus-within:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

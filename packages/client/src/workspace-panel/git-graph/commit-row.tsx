import type { GitHistoryItem } from '@agentstart/protocol/git/history-types'
import type React from 'react'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { type GitGraphColumnWidths, gitGraphColumnFlexStyle } from './column-widths'
import { formatGitGraphShortDate } from './format'
import { GitGraphRefBadge } from './ref-badge'

export type GitGraphCommitRowProps = {
  item: GitHistoryItem
  graphColumnWidth: number
  columnWidths: GitGraphColumnWidths
  isCurrent: boolean
  isDetailsOpen: boolean
  isFindMatch: boolean
  isFindCurrent: boolean
  onClick: () => void
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>
}

export const GitGraphCommitRow = function GitGraphCommitRow({
  item,
  graphColumnWidth,
  columnWidths,
  isCurrent,
  isDetailsOpen,
  isFindMatch,
  isFindCurrent,
  onClick,
  onContextMenu
}: GitGraphCommitRowProps): React.JSX.Element {
  const rowTooltip = item.message || item.subject

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      onContextMenu={onContextMenu}
      className={cn(
        'flex w-full min-w-0 cursor-pointer items-center text-left text-xs transition-colors outline-none',
        isDetailsOpen ? 'bg-accent/60 hover:bg-accent/80' : 'hover:bg-accent/40',
        isFindMatch && !isFindCurrent && 'bg-primary/10',
        isFindCurrent && 'bg-primary/20'
      )}
      style={{ height: 24 }}
    >
      <span className="h-full shrink-0" style={{ width: graphColumnWidth }} aria-hidden="true" />
      <span
        className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden pr-2"
        style={gitGraphColumnFlexStyle('description', columnWidths)}
      >
        {(item.references ?? []).map((ref) => (
          <GitGraphRefBadge key={ref.id} itemRef={ref} />
        ))}
        {/* Why: a long commit body is the one tooltip worth hovering — the popup
            keeps pointer events so its clamped, scrollable body can be read. */}
        <Tooltip disableHoverablePopup={false}>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  'text-foreground block min-w-0 flex-1 truncate',
                  isCurrent && 'font-bold'
                )}
              >
                {item.subject}
              </span>
            }
          />
          {/* Why: the popup is width-fit, so a ScrollArea (percentage-sized
              viewport) cannot resolve its width here — scroll natively. */}
          <TooltipContent
            side="bottom"
            sideOffset={6}
            className="scrollbar-sleek pointer-events-auto max-h-64 max-w-96 overflow-y-auto whitespace-pre-wrap"
          >
            {rowTooltip}
          </TooltipContent>
        </Tooltip>
      </span>
      <span
        className="text-muted-foreground shrink-0 truncate pr-2"
        style={gitGraphColumnFlexStyle('date', columnWidths)}
      >
        {formatGitGraphShortDate(item.timestamp)}
      </span>
      <span
        className="text-muted-foreground shrink-0 truncate pr-2"
        style={gitGraphColumnFlexStyle('author', columnWidths)}
      >
        {item.author ?? ''}
      </span>
      <span
        className="text-muted-foreground shrink-0 truncate pr-2 font-mono"
        style={gitGraphColumnFlexStyle('commit', columnWidths)}
      >
        {item.displayId ?? item.id.slice(0, 8)}
      </span>
    </div>
  )
}

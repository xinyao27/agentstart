import React from 'react'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'
import {
  SOURCE_CONTROL_TREE_FILE_PADDING_PX,
  SOURCE_CONTROL_TREE_INDENT_PX,
  SUBMODULE_EMPTY_LABEL,
  SUBMODULE_ERROR_LABEL,
  SUBMODULE_LOADING_LABEL
} from '~renderer/workspace-panel/source-control/panel-constants'

export function DiffLineCounts({
  added,
  removed
}: {
  added?: number
  removed?: number
}): React.JSX.Element | null {
  const hasAdded = typeof added === 'number' && added > 0
  const hasRemoved = typeof removed === 'number' && removed > 0
  if (!hasAdded && !hasRemoved) {
    return null
  }
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 text-[10px] tabular-nums">
      {hasAdded && <span style={{ color: 'var(--git-decoration-added)' }}>+{added}</span>}
      {hasRemoved && <span style={{ color: 'var(--git-decoration-deleted)' }}>-{removed}</span>}
    </span>
  )
}

export function SubmodulePlaceholderRow({
  depth,
  state,
  message
}: {
  depth: number
  state: 'loading' | 'empty' | 'error'
  message?: string
}): React.JSX.Element {
  const fallback =
    state === 'error'
      ? SUBMODULE_ERROR_LABEL
      : state === 'empty'
        ? SUBMODULE_EMPTY_LABEL
        : SUBMODULE_LOADING_LABEL
  return (
    <div
      className={cn(
        'flex items-center gap-1 pr-3 py-1 text-[11px]',
        state === 'error' ? 'text-destructive' : 'text-muted-foreground'
      )}
      style={{
        paddingLeft: `${depth * SOURCE_CONTROL_TREE_INDENT_PX + SOURCE_CONTROL_TREE_FILE_PADDING_PX}px`
      }}
    >
      {state === 'loading' && <LoadingIndicator className="size-3 shrink-0" />}
      <span className="min-w-0 truncate">{message ?? fallback}</span>
    </div>
  )
}

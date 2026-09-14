import React from 'react'
import { cn } from '~renderer/ui/class-names'
import {
  SOURCE_CONTROL_TREE_DIRECTORY_PADDING_PX,
  SOURCE_CONTROL_TREE_FILE_PADDING_PX,
  SOURCE_CONTROL_TREE_INDENT_PX
} from '~renderer/workspace-panel/source-control/panel-constants'

type SourceControlTreeRowProps = Omit<React.ComponentProps<'div'>, 'className' | 'style'> & {
  depth: number
  rowType: 'directory' | 'file'
  isCurrent?: boolean
}

export function SourceControlTreeRow(props: SourceControlTreeRowProps): React.JSX.Element {
  const { depth, rowType, isCurrent = false, children, ...divProps } = props
  const padding =
    rowType === 'directory'
      ? SOURCE_CONTROL_TREE_DIRECTORY_PADDING_PX
      : SOURCE_CONTROL_TREE_FILE_PADDING_PX

  return (
    <div
      {...divProps}
      data-current={isCurrent ? 'true' : undefined}
      className={cn(
        'group hover:bg-accent focus-within:bg-accent relative flex items-center gap-1 py-1 pr-3 transition-colors',
        rowType === 'file'
          ? 'cursor-pointer'
          : 'text-muted-foreground hover:text-foreground focus-within:text-foreground',
        isCurrent && 'bg-accent'
      )}
      style={{ paddingLeft: `${depth * SOURCE_CONTROL_TREE_INDENT_PX + padding}px` }}
    >
      {children}
    </div>
  )
}

type SourceControlRowActionsProps = {
  children: React.ReactNode
}

export function SourceControlRowActions(props: SourceControlRowActionsProps): React.JSX.Element {
  const { children } = props
  // Why: faded actions stay mounted so their tooltip triggers remain
  // measurable and keyboard focus can reveal them.
  return (
    <div className="bg-accent pointer-events-none absolute inset-y-0 right-0 flex shrink-0 items-center gap-1.5 pr-3 pl-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
      {children}
    </div>
  )
}

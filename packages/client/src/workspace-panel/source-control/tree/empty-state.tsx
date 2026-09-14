import React from 'react'
import { cn } from '~renderer/ui/class-names'
import { SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME } from '~renderer/workspace-panel/source-control/panel-constants'

export function EmptyState({
  heading,
  supportingText
}: {
  heading: string
  supportingText: string
}): React.JSX.Element {
  return (
    <div className={cn('py-6', SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME)}>
      <div className="text-foreground text-sm font-medium">{heading}</div>
      <div className="text-muted-foreground mt-1 text-xs">{supportingText}</div>
    </div>
  )
}

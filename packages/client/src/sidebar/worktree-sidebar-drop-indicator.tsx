import type { ReactElement } from 'react'
import { cn } from '~renderer/ui/class-names'

type WorktreeSidebarDropIndicatorProps = {
  y: number
  className?: string
}

export function WorktreeSidebarDropIndicator({
  y,
  className
}: WorktreeSidebarDropIndicatorProps): ReactElement {
  return (
    <div
      role="presentation"
      className={cn(
        'pointer-events-none absolute left-3 right-2 z-30 flex h-3 -translate-y-1/2 items-center',
        className
      )}
      style={{ top: `${y}px` }}
    >
      <span className="bg-sidebar-ring size-1.5 shrink-0 rounded-full" />
      <span className="bg-sidebar-ring h-0.5 flex-1 rounded-full" />
      <span className="bg-sidebar-ring size-1.5 shrink-0 rounded-full" />
    </div>
  )
}

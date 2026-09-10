import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'

import './scroll-area.css'

function ScrollArea({
  className,
  horizontalScrollBar,
  hasVerticalScrollBar = true,
  viewportClassName,
  viewportRef,
  viewportTabIndex,
  viewportProps,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  viewportClassName?: string
  viewportRef?: React.Ref<HTMLDivElement>
  /** Renders the horizontal track for content that scrolls on both axes (grids,
   *  tables). base-ui hides it on its own when there is no horizontal overflow. */
  horizontalScrollBar?: boolean
  hasVerticalScrollBar?: boolean
  /** Set e.g. -1 so the viewport can receive programmatic focus (explorer keyboard shortcuts after inline rename). */
  viewportTabIndex?: number
  viewportProps?: ScrollAreaPrimitive.Viewport.Props
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative isolate', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        tabIndex={viewportTabIndex}
        data-slot="scroll-area-viewport"
        className={cn(
          'size-full rounded-[inherit] border border-transparent transition-[color] outline-none focus-visible:border-ring',
          viewportClassName
        )}
        {...viewportProps}
      >
        <ScrollAreaPrimitive.Content>{children}</ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      {hasVerticalScrollBar ? <ScrollBar /> : null}
      {horizontalScrollBar ? <ScrollBar orientation="horizontal" /> : null}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'z-20 flex touch-none bg-transparent p-px transition-colors select-none',
        orientation === 'vertical' && 'h-full w-3 py-2 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-3 px-2 flex-col border-t border-t-transparent',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="bg-muted-foreground/40 hover:bg-muted-foreground/60 relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea }

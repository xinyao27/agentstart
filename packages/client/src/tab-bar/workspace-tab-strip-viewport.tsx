import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretLeft as ChevronLeft, CaretRight as ChevronRight } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { useTabStripDragScrollHandlers } from './tab-strip-drag-scroll'
import { useTabStripOverflowNavigation } from './tab-strip-overflow-navigation'
import { getTabStripScrollMaskClassName } from './tab-strip-scroll-metrics'

type WorkspaceTabStripViewportProps = {
  activeTabId: string | null
  layoutKey: string
  tabCount: number
  navigationScopeId: string
  children: React.ReactNode
  stripClassName?: string
  stripProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>
}

export function WorkspaceTabStripViewport({
  activeTabId,
  layoutKey,
  tabCount,
  navigationScopeId,
  children,
  stripClassName,
  stripProps
}: WorkspaceTabStripViewportProps): React.JSX.Element {
  const { tabStripRef, tabStripOverflowState, scrollTabStrip } = useTabStripOverflowNavigation({
    activeVisibleTabId: activeTabId,
    layoutKey,
    tabCount,
    worktreeId: navigationScopeId
  })
  const tabStripDragScroll = useTabStripDragScrollHandlers(scrollTabStrip, {
    start: tabStripOverflowState.canScrollStart,
    end: tabStripOverflowState.canScrollEnd
  })

  return (
    // Why: content-sized growth keeps the native new-tab button beside the
    // final tab; flex shrink still bounds overflowing local and remote strips.
    <div className="flex h-full min-w-0 flex-[0_1_auto] items-stretch overflow-hidden">
      {tabStripOverflowState.hasOverflow ? (
        <TabStripScrollButton
          direction="start"
          canScroll={tabStripOverflowState.canScrollStart}
          isTabDragActive={tabStripDragScroll.isTabDragActive}
          onClick={() => scrollTabStrip('start')}
          onPointerEnter={tabStripDragScroll.onDragScrollStartEnter}
          onPointerLeave={tabStripDragScroll.onDragScrollLeave}
        />
      ) : null}
      {/* Why: the edge masks provide overflow feedback without adding divider lines beside the
          icon controls, keeping the scroll shoulders visually open. */}
      <div className="relative flex min-h-0 max-w-full min-w-0 flex-[0_1_auto]">
        <div
          {...stripProps}
          ref={tabStripRef}
          className={cn(
            // Why: the scrolling content reserves the same 12px as each shoulder,
            // keeping first/last selected corners inside the clipping viewport.
            'terminal-tab-strip flex h-full min-w-0 max-w-full flex-1 items-stretch overflow-x-auto overflow-y-hidden px-3',
            getTabStripScrollMaskClassName(tabStripOverflowState),
            stripClassName
          )}
        >
          {children}
        </div>
      </div>
      {tabStripOverflowState.hasOverflow ? (
        <TabStripScrollButton
          direction="end"
          canScroll={tabStripOverflowState.canScrollEnd}
          isTabDragActive={tabStripDragScroll.isTabDragActive}
          onClick={() => scrollTabStrip('end')}
          onPointerEnter={tabStripDragScroll.onDragScrollEndEnter}
          onPointerLeave={tabStripDragScroll.onDragScrollLeave}
        />
      ) : null}
    </div>
  )
}

function TabStripScrollButton({
  direction,
  canScroll,
  isTabDragActive,
  onClick,
  onPointerEnter,
  onPointerLeave
}: {
  direction: 'start' | 'end'
  canScroll: boolean
  isTabDragActive: boolean
  onClick: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
}): React.JSX.Element {
  const isStart = direction === 'start'
  const label = isStart
    ? translate('auto.components.tab.bar.TabBar.7a9b4af2af', 'Scroll tabs left')
    : translate('auto.components.tab.bar.TabBar.232e075b07', 'Scroll tabs right')
  const Icon = isStart ? ChevronLeft : ChevronRight
  return (
    // Why: intrinsic icon buttons need a full-height flex wrapper to stay vertically centered
    // without putting `h-full` back on the button itself; mirrored margins keep both shoulders
    // separated from the viewport and neighboring Header controls by the same amount.
    <div className="mx-1 flex h-full shrink-0 items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="tab-strip-scroll"
              size="icon-sm"
              aria-label={label}
              aria-disabled={!canScroll}
              disabled={!isTabDragActive && !canScroll}
              onClick={onClick}
              onPointerEnter={onPointerEnter}
              onPointerLeave={onPointerLeave}
            >
              <Icon className="size-3.5" />
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

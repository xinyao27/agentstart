import type { ActiveRightSidebarTab } from '@agentstart/protocol/settings/ui-state'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { ButtonGroup } from '~renderer/ui/button-group'
import { cn } from '~renderer/ui/class-names'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger
} from '~renderer/ui/context-menu'
import { SidebarResizeOverlay, useSidebarResize } from '~renderer/ui/use-resizable-sidebar'

import {
  ActivityBarButton,
  TopActivityOverflowMenu,
  type ActivityBarItem
} from './activity-bar-buttons'
import { getTopActivityBarLayout } from './activity-bar-overflow'
import { setWorkspaceSidebarChromeWidth, WorkspaceSidebarToggleButton } from './sidebar-chrome'
import {
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  canFitWorkspaceSidebar,
  clampWorkspaceSidebarWidth,
  getWorkspaceSidebarMaxWidth
} from './sidebar-width'

const SIDE_ACTIVITY_BAR_WIDTH = 40
const KEYBOARD_RESIZE_STEP = 16

type ActivityBarPosition = 'top' | 'side'

type WorkspaceSidebarFrameProps = {
  activeView: ActiveRightSidebarTab
  activityBarPosition: ActivityBarPosition
  children: React.ReactNode
  isOpen: boolean
  items: readonly ActivityBarItem[]
  onActivityBarPositionChange: (position: ActivityBarPosition) => void
  onOpenChange: (open: boolean) => void
  onSelectView: (view: ActiveRightSidebarTab) => void
  onWidthChange: (width: number) => void
  placement: 'left' | 'right'
  reservedWorktreeSidebarWidth: number
  toggleShortcut: string
  width: number
}

export function WorkspaceSidebarFrame({
  activeView,
  activityBarPosition,
  children,
  isOpen,
  items,
  onActivityBarPositionChange,
  onOpenChange,
  onSelectView,
  onWidthChange,
  placement,
  reservedWorktreeSidebarWidth,
  toggleShortcut,
  width
}: WorkspaceSidebarFrameProps): React.JSX.Element {
  const [activityStripWidth, setActivityStripWidth] = useState<number | null>(null)
  const collapsedChromeRef = useRef<HTMLDivElement | null>(null)
  const windowWidth = useWindowWidth()
  const workspaceWidth = windowWidth === null ? null : windowWidth - reservedWorktreeSidebarWidth
  const activityBarWidth = activityBarPosition === 'side' ? SIDE_ACTIVITY_BAR_WIDTH : 0
  const hasSidebarSpace = canFitWorkspaceSidebar(workspaceWidth, activityBarWidth)
  const isVisible = isOpen && hasSidebarSpace
  const maxWidth = getWorkspaceSidebarMaxWidth(workspaceWidth, activityBarWidth)
  const renderedWidth = clampWorkspaceSidebarWidth(width, workspaceWidth, activityBarWidth)
  const {
    containerRef,
    isResizing,
    onResizeStart,
    renderedWidth: liveRenderedWidth
  } = useSidebarResize<HTMLDivElement>({
    isOpen: isVisible,
    width: renderedWidth,
    minWidth: WORKSPACE_SIDEBAR_MIN_WIDTH,
    maxWidth,
    deltaSign: placement === 'left' ? 1 : -1,
    renderedExtraWidth: activityBarWidth,
    setWidth: onWidthChange
  })
  const activityStripRef = useMeasuredWidth(setActivityStripWidth)
  const activityLayout = (() => getTopActivityBarLayout(items, activityStripWidth, activeView))()
  const activeTitle = items.find((item) => item.id === activeView)?.title ?? ''

  useCollapsedChromeWidth(collapsedChromeRef, isVisible)

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    let nextWidth: number | null = null
    switch (event.key) {
      case 'ArrowLeft':
        nextWidth =
          renderedWidth + (placement === 'right' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP)
        break
      case 'ArrowRight':
        nextWidth =
          renderedWidth + (placement === 'left' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP)
        break
      case 'Home':
        nextWidth = WORKSPACE_SIDEBAR_MIN_WIDTH
        break
      case 'End':
        nextWidth = maxWidth
        break
    }
    if (nextWidth === null) {
      return
    }
    event.preventDefault()
    onWidthChange(Math.min(maxWidth, Math.max(WORKSPACE_SIDEBAR_MIN_WIDTH, nextWidth)))
  }

  const sidebarToggle = isVisible ? (
    <WorkspaceSidebarToggleButton
      mergeTrailingEdge={placement === 'left'}
      placement={placement}
      shortcut={toggleShortcut}
      onToggle={() => onOpenChange(false)}
    />
  ) : null

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex shrink-0 flex-row overflow-visible',
        isVisible &&
          (placement === 'left'
            ? 'border-sidebar-border border-r'
            : 'border-sidebar-border border-l')
      )}
      style={{ width: liveRenderedWidth }}
    >
      <SidebarResizeOverlay visible={isResizing} />
      {!isVisible ? (
        <div
          ref={collapsedChromeRef}
          className={cn(
            'fixed top-0 z-20 h-[var(--titlebar-height)]',
            placement === 'left' ? 'left-0' : 'right-0'
          )}
        >
          {/* Why: collapsed chrome keeps the panel destinations reachable; selecting
              one uses the same route as the expanded activity bar and opens the sidebar. */}
          <ButtonGroup
            presentation="titlebar"
            className="border-border/70 h-full overflow-hidden rounded-lg border"
          >
            {items.map((item, itemIndex) => (
              <ActivityBarButton
                key={item.id}
                item={item}
                active={false}
                onClick={() => onSelectView(item.id)}
                layout="top"
                mergeLeadingEdge={itemIndex === 0}
              />
            ))}
            <WorkspaceSidebarToggleButton
              placement={placement}
              shortcut={toggleShortcut}
              onToggle={() => onOpenChange(true)}
            />
          </ButtonGroup>
        </div>
      ) : null}
      {isVisible ? (
        <div className="bg-sidebar flex min-w-0 flex-1 flex-col overflow-hidden">
          {activityBarPosition === 'top' ? (
            <ContextMenu>
              <ContextMenuTrigger
                render={
                  <div
                    className={cn(
                      'border-border flex h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] items-center border-b'
                    )}
                  >
                    <div
                      ref={activityStripRef}
                      className="flex h-full min-w-0 flex-1 items-center overflow-hidden"
                    >
                      <TopActivityItems
                        activeView={activeView}
                        layout={activityLayout}
                        onSelectView={onSelectView}
                      />
                    </div>
                    <div className="border-border/70 h-full shrink-0 overflow-hidden rounded-lg border">
                      {sidebarToggle}
                    </div>
                  </div>
                }
              />
              <ActivityBarPositionMenu
                currentPosition={activityBarPosition}
                onChangePosition={onActivityBarPositionChange}
              />
            </ContextMenu>
          ) : (
            <div
              className={cn(
                'border-border flex h-[var(--titlebar-height)] min-h-[var(--titlebar-height)] items-center justify-between border-b px-3'
              )}
            >
              <span className="text-foreground truncate text-[11px] font-semibold tracking-wider uppercase">
                {activeTitle}
              </span>
              <div className="border-border/70 h-full overflow-hidden rounded-lg border">
                {sidebarToggle}
              </div>
            </div>
          )}

          <div className="scrollbar-sleek-parent flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>

          <div
            className={cn(
              'hover:bg-border active:bg-ring absolute top-0 z-10 h-full w-1 cursor-col-resize transition-colors',
              placement === 'left' ? 'right-0' : 'left-0'
            )}
            role="separator"
            tabIndex={0}
            aria-label={activeTitle}
            aria-orientation="vertical"
            aria-valuemin={WORKSPACE_SIDEBAR_MIN_WIDTH}
            aria-valuemax={Math.round(maxWidth)}
            aria-valuenow={Math.round(renderedWidth)}
            onKeyDown={handleResizeKeyDown}
            onMouseDown={onResizeStart}
          />
        </div>
      ) : null}

      {isVisible && activityBarPosition === 'side' ? (
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <div className="border-border bg-sidebar flex w-10 min-w-10 flex-col items-center border-l pt-[var(--window-controls-height,0px)]">
                {items.map((item) => (
                  <ActivityBarButton
                    key={item.id}
                    item={item}
                    active={activeView === item.id}
                    onClick={() => onSelectView(item.id)}
                    layout="side"
                  />
                ))}
              </div>
            }
          />
          <ActivityBarPositionMenu
            currentPosition={activityBarPosition}
            onChangePosition={onActivityBarPositionChange}
          />
        </ContextMenu>
      ) : null}
    </div>
  )
}

function useCollapsedChromeWidth(
  chromeRef: React.RefObject<HTMLDivElement | null>,
  isVisible: boolean
): void {
  useLayoutEffect(() => {
    const chrome = chromeRef.current
    if (isVisible || !chrome) {
      setWorkspaceSidebarChromeWidth(0)
      return
    }

    const updateWidth = (): void => {
      setWorkspaceSidebarChromeWidth(chrome.getBoundingClientRect().width)
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(chrome)
    return () => {
      observer.disconnect()
      setWorkspaceSidebarChromeWidth(0)
    }
  }, [chromeRef, isVisible])
}

function TopActivityItems({
  activeView,
  layout,
  onSelectView
}: {
  activeView: ActiveRightSidebarTab
  layout: { visibleItems: ActivityBarItem[]; overflowItems: ActivityBarItem[] }
  onSelectView: (view: ActiveRightSidebarTab) => void
}): React.JSX.Element {
  return (
    <div className="flex h-full min-w-0 flex-1 shrink">
      <ButtonGroup
        presentation="titlebar"
        className="border-border/70 min-w-0 shrink-0 overflow-hidden rounded-lg border"
      >
        {layout.visibleItems.map((item, itemIndex) => (
          <ActivityBarButton
            key={item.id}
            item={item}
            active={activeView === item.id}
            onClick={() => onSelectView(item.id)}
            layout="top"
            mergeLeadingEdge={itemIndex === 0}
          />
        ))}
        {layout.overflowItems.length > 0 ? (
          <TopActivityOverflowMenu
            items={layout.overflowItems}
            activeTab={activeView}
            onSelect={onSelectView}
          />
        ) : null}
      </ButtonGroup>
    </div>
  )
}

function ActivityBarPositionMenu({
  currentPosition,
  onChangePosition
}: {
  currentPosition: ActivityBarPosition
  onChangePosition: (position: ActivityBarPosition) => void
}): React.JSX.Element {
  return (
    <ContextMenuContent>
      <ContextMenuLabel>
        {translate('auto.components.right.sidebar.index.864111caa2', 'Activity Bar Position')}
      </ContextMenuLabel>
      <ContextMenuRadioGroup
        value={currentPosition}
        onValueChange={(value) => {
          if (value === 'top' || value === 'side') {
            onChangePosition(value)
          }
        }}
      >
        <ContextMenuRadioItem value="top">
          {translate('auto.components.right.sidebar.index.7b415c39e9', 'Top')}
        </ContextMenuRadioItem>
        <ContextMenuRadioItem value="side">
          {translate('auto.components.right.sidebar.index.70893f017b', 'Side')}
        </ContextMenuRadioItem>
      </ContextMenuRadioGroup>
    </ContextMenuContent>
  )
}

function useMeasuredWidth(onWidth: (width: number | null) => void) {
  const observerRef = useRef<ResizeObserver | null>(null)
  const widthRef = useRef<number | null>(null)

  return (node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null

    const commitWidth = (width: number | null): void => {
      if (Object.is(widthRef.current, width)) {
        return
      }
      widthRef.current = width
      onWidth(width)
    }

    if (!node || typeof ResizeObserver === 'undefined') {
      commitWidth(node ? node.getBoundingClientRect().width : null)
      return
    }

    const updateWidth = (): void => commitWidth(node.getBoundingClientRect().width)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(node)
    observerRef.current = observer
  }
}

function useWindowWidth(): number | null {
  const [windowWidth, setWindowWidth] = useState<number | null>(() => getWindowWidth())

  useEffect(() => {
    const update = (): void => setWindowWidth(getWindowWidth())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return windowWidth
}

function getWindowWidth(): number | null {
  if (typeof window === 'undefined' || !Number.isFinite(window.innerWidth)) {
    return null
  }
  return window.innerWidth
}

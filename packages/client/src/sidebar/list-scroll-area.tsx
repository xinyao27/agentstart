import type {
  LayoutRectangle,
  NativeScrollEvent,
  NativeSyntheticEvent
} from '@legendapp/list/react'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'
import { ScrollArea } from '~renderer/ui/scroll-area'

type LegendListStyle =
  | React.CSSProperties
  | (React.CSSProperties | null | undefined | false)[]
  | null
  | undefined
  | false

type LegendListScrollOptions = {
  animated?: boolean
  x?: number
  y?: number
}

type LegendListOffsetOptions = {
  animated?: boolean
  offset: number
}

type LegendListScrollAreaHandle = {
  flashScrollIndicators: () => void
  getBoundingClientRect: () => DOMRect | undefined
  getCurrentScrollOffset: () => number
  getNativeScrollRef: () => HTMLDivElement | null
  getScrollableNode: () => HTMLDivElement | null
  getScrollEventTarget: () => HTMLDivElement | null
  getScrollResponder: () => HTMLDivElement | null
  isWindowScroll: () => false
  scrollBy: (x: number, y: number) => void
  scrollTo: (options: LegendListScrollOptions) => void
  scrollToEnd: (options?: { animated?: boolean }) => void
  scrollToOffset: (options: LegendListOffsetOptions) => void
}

type LegendListScrollAreaProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'children' | 'onScroll' | 'style'
> & {
  /** Set by lists whose content is wider than the viewport (grids, tables) so
   *  the horizontal thumb is rendered — the viewport otherwise hides it. */
  showHorizontalScrollBar?: boolean
  children?: React.ReactNode
  contentContainerClassName?: string
  contentContainerStyle?: LegendListStyle
  contentInset?: unknown
  contentOffset?: { x: number; y: number }
  horizontal?: boolean
  maintainVisibleContentPosition?: { minIndexForVisible: number }
  onLayout?: (event: { nativeEvent: { layout: LayoutRectangle } }) => void
  onMomentumScrollEnd?: unknown
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  refreshControl?: React.ReactNode
  ref?: React.Ref<LegendListScrollAreaHandle>
  scrollEventThrottle?: number
  ScrollComponent?: unknown
  style?: LegendListStyle
}

function flattenStyle(style: LegendListStyle): React.CSSProperties {
  if (!Array.isArray(style)) {
    return style || {}
  }
  return Object.assign({}, ...style.filter(Boolean))
}

function getScrollBehavior(animated: boolean | undefined): ScrollBehavior {
  return animated ? 'smooth' : 'auto'
}

function LegendListScrollArea({
  children,
  className,
  contentContainerClassName,
  contentContainerStyle,
  contentInset: _contentInset,
  contentOffset,
  horizontal: _horizontal,
  maintainVisibleContentPosition,
  onLayout,
  onMomentumScrollEnd: _onMomentumScrollEnd,
  onScroll,
  refreshControl,
  ref: forwardedRef,
  scrollEventThrottle: _scrollEventThrottle,
  ScrollComponent: _ScrollComponent,
  showHorizontalScrollBar,
  style,
  ...viewportProps
}: LegendListScrollAreaProps): React.JSX.Element {
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const scrollFrameRef = React.useRef<number | null>(null)
  const contentOffsetX = contentOffset?.x
  const contentOffsetY = contentOffset?.y
  const viewportStyle: React.CSSProperties = (() =>
    maintainVisibleContentPosition
      ? { ...flattenStyle(style), overflowAnchor: 'none' }
      : flattenStyle(style))()
  const contentStyle: React.CSSProperties = (() => {
    const resolvedStyle = {
      display: 'block',
      minHeight: '100%',
      ...flattenStyle(contentContainerStyle)
    } satisfies React.CSSProperties
    return maintainVisibleContentPosition
      ? { ...resolvedStyle, overflowAnchor: 'none' }
      : resolvedStyle
  })()

  const emitScroll = () => {
    const viewport = viewportRef.current
    if (!viewport || !onScroll) {
      return
    }
    onScroll({
      nativeEvent: {
        contentInset: { top: 0, right: 0, bottom: 0, left: 0 },
        contentOffset: { x: viewport.scrollLeft, y: viewport.scrollTop },
        contentSize: { width: viewport.scrollWidth, height: viewport.scrollHeight },
        layoutMeasurement: { width: viewport.clientWidth, height: viewport.clientHeight },
        zoomScale: 1
      }
    })
  }

  const handleScroll = () => {
    if (scrollFrameRef.current !== null) {
      return
    }
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      emitScroll()
    })
  }

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      flashScrollIndicators: () => {},
      getBoundingClientRect: () => viewportRef.current?.getBoundingClientRect(),
      getCurrentScrollOffset: () => viewportRef.current?.scrollTop ?? 0,
      getNativeScrollRef: () => viewportRef.current,
      getScrollableNode: () => viewportRef.current,
      getScrollEventTarget: () => viewportRef.current,
      getScrollResponder: () => viewportRef.current,
      isWindowScroll: () => false,
      scrollBy: (x, y) => viewportRef.current?.scrollBy({ left: x, top: y }),
      scrollTo: ({ animated, x = 0, y = 0 }) =>
        viewportRef.current?.scrollTo({ behavior: getScrollBehavior(animated), left: x, top: y }),
      scrollToEnd: ({ animated } = {}) =>
        viewportRef.current?.scrollTo({
          behavior: getScrollBehavior(animated),
          top: viewportRef.current.scrollHeight
        }),
      scrollToOffset: ({ animated, offset }) =>
        viewportRef.current?.scrollTo({
          behavior: getScrollBehavior(animated),
          top: offset
        })
    }),
    []
  )

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !onLayout) {
      return
    }
    const emitLayout = (): void => {
      const rect = viewport.getBoundingClientRect()
      onLayout({
        nativeEvent: {
          layout: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
      })
    }
    emitLayout()
    const observer = new ResizeObserver(emitLayout)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [onLayout])

  React.useLayoutEffect(() => {
    if (contentOffsetX === undefined || contentOffsetY === undefined) {
      return
    }
    const applyOffset = (): void => {
      viewportRef.current?.scrollTo({ left: contentOffsetX, top: contentOffsetY })
    }
    applyOffset()
    const frameId = window.requestAnimationFrame(applyOffset)
    return () => window.cancelAnimationFrame(frameId)
  }, [contentOffsetX, contentOffsetY])

  React.useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
    },
    []
  )

  const resolvedViewportProps = (() => ({
    ...viewportProps,
    onScroll: handleScroll,
    style: viewportStyle
  }))()

  return (
    <ScrollArea
      horizontalScrollBar={showHorizontalScrollBar}
      className="h-full min-h-0"
      viewportClassName={cn(
        showHorizontalScrollBar ? 'overflow-x-auto' : 'overflow-x-hidden',
        className
      )}
      viewportRef={viewportRef}
      viewportProps={resolvedViewportProps}
    >
      {refreshControl}
      <div
        className={cn('legend-list-content-container', contentContainerClassName)}
        style={contentStyle}
      >
        {children}
      </div>
    </ScrollArea>
  )
}

// Why: LegendList 3.3.3 supports this documented Web API at runtime but omits it
// from the React entrypoint's prop override, so spreading keeps the remaining
// props type-checked while every list renders inside the app's ScrollArea.
export const LEGEND_LIST_SCROLL_AREA_PROPS = {
  renderScrollComponent: LegendListScrollArea
}

function LegendListHorizontalScrollArea(props: LegendListScrollAreaProps): React.JSX.Element {
  return <LegendListScrollArea {...props} showHorizontalScrollBar />
}

// Why: grids and tables scroll on both axes, and LegendList's prop type rejects
// extra props, so the horizontal thumb ships as its own scroll component.
export const LEGEND_LIST_HORIZONTAL_SCROLL_AREA_PROPS = {
  renderScrollComponent: LegendListHorizontalScrollArea
}

type LegendListScrollHandle = {
  getScrollableNode: () => HTMLElement | null
}

function isLegendListScrollHandle(value: unknown): value is LegendListScrollHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getScrollableNode' in value &&
    typeof value.getScrollableNode === 'function'
  )
}

/** Resolves the scroll element behind a `refScrollView` value, which LegendList
 *  fills with either the DOM node or the scroll component's imperative handle. */
export function getLegendListScrollElement(value: unknown): HTMLDivElement | null {
  if (value instanceof HTMLDivElement) {
    return value
  }
  const element = isLegendListScrollHandle(value) ? value.getScrollableNode() : null
  return element instanceof HTMLDivElement ? element : null
}

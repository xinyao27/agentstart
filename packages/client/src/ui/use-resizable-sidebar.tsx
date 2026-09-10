import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useEventCallback } from '../react/use-event-callback'

type UseSidebarResizeOptions = {
  isOpen: boolean
  width: number
  minWidth: number
  maxWidth: number
  deltaSign: 1 | -1
  renderedExtraWidth?: number
  setWidth: (width: number) => void
}

type UseSidebarResizeResult<T extends HTMLElement> = {
  containerRef: React.RefObject<T | null>
  isResizing: boolean
  onResizeStart: (event: React.MouseEvent) => void
  renderedWidth: string
}

function clampSidebarResizeWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, width))
}

function getRenderedSidebarWidthCssValue(
  isOpen: boolean,
  width: number,
  renderedExtraWidth: number
): string {
  return isOpen ? `${width + renderedExtraWidth}px` : '0px'
}

function getNextSidebarResizeWidth({
  clientX,
  startX,
  startWidth,
  deltaSign,
  minWidth,
  maxWidth
}: {
  clientX: number
  startX: number
  startWidth: number
  deltaSign: 1 | -1
  minWidth: number
  maxWidth: number
}): number {
  const delta = (clientX - startX) * deltaSign
  return clampSidebarResizeWidth(startWidth + delta, minWidth, maxWidth)
}

export function SidebarResizeOverlay({ visible }: { visible: boolean }): React.JSX.Element | null {
  if (!visible) {
    return null
  }
  // Why: Chromium PDF embeds consume pointer events before they reach the app.
  // A React-owned portal keeps the drag lifecycle connected across those surfaces.
  return createPortal(
    <div className="fixed inset-0 z-[2147483647] cursor-col-resize bg-transparent" aria-hidden />,
    document.body
  )
}

export function useSidebarResize<T extends HTMLElement>({
  isOpen,
  width,
  minWidth,
  maxWidth,
  deltaSign,
  renderedExtraWidth = 0,
  setWidth
}: UseSidebarResizeOptions): UseSidebarResizeResult<T> {
  const containerRef = useRef<T | null>(null)
  const isResizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(width)
  const draftWidthRef = useRef(width)
  const frameRef = useRef<number | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [draftWidth, setDraftWidth] = useState(width)

  const stopResize = useEventCallback(() => {
    if (!isResizingRef.current) {
      return
    }
    isResizingRef.current = false
    setIsResizing(false)
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    const finalWidth = draftWidthRef.current
    setDraftWidth(finalWidth)
    if (finalWidth !== width) {
      setWidth(finalWidth)
    }
  })

  const handleMouseMove = useEventCallback((event: MouseEvent) => {
    if (!isResizingRef.current) {
      return
    }
    const nextWidth = getNextSidebarResizeWidth({
      clientX: event.clientX,
      startX: startXRef.current,
      startWidth: startWidthRef.current,
      deltaSign,
      minWidth,
      maxWidth
    })
    if (nextWidth === draftWidthRef.current) {
      return
    }
    draftWidthRef.current = nextWidth
    if (frameRef.current !== null) {
      return
    }
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      setDraftWidth(draftWidthRef.current)
    })
  })

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopResize)
    window.addEventListener('blur', stopResize)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopResize)
      window.removeEventListener('blur', stopResize)
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      isResizingRef.current = false
    }
  }, [handleMouseMove, stopResize])

  const onResizeStart = (event: React.MouseEvent) => {
    event.preventDefault()
    isResizingRef.current = true
    setIsResizing(true)
    startXRef.current = event.clientX
    startWidthRef.current = width
    draftWidthRef.current = width
    setDraftWidth(width)
  }

  return {
    containerRef,
    isResizing,
    onResizeStart,
    renderedWidth: getRenderedSidebarWidthCssValue(
      isOpen,
      isResizing ? draftWidth : width,
      renderedExtraWidth
    )
  }
}

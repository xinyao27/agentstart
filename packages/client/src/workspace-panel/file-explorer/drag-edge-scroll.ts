import { useRef } from 'react'

const DRAG_EDGE_ZONE_PX = 48

function getDragEdgeScrollTarget({
  scrollTop,
  scrollHeight,
  clientHeight,
  localY,
  edgeZonePx = DRAG_EDGE_ZONE_PX
}: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  localY: number
  edgeZonePx?: number
}): number | null {
  let delta = 0
  if (localY < edgeZonePx) {
    const strength = (edgeZonePx - localY) / edgeZonePx
    delta = -(1.25 + strength * 9)
  } else if (localY > clientHeight - edgeZonePx) {
    const strength = (localY - (clientHeight - edgeZonePx)) / edgeZonePx
    delta = 1.25 + strength * 9
  }
  if (delta === 0) {
    return null
  }

  const maxScroll = Math.max(0, scrollHeight - clientHeight)
  const nextScrollTop = Math.max(0, Math.min(maxScroll, scrollTop + delta))
  return nextScrollTop === scrollTop ? null : nextScrollTop
}

export function useFileExplorerDragEdgeScroll(scrollElement: HTMLDivElement | null): {
  recordDragClientY: (clientY: number) => void
  stopDragEdgeScroll: () => void
} {
  const lastDragClientYRef = useRef<number | null>(null)
  const edgeScrollRafRef = useRef<number | null>(null)

  const stopDragEdgeScroll = () => {
    lastDragClientYRef.current = null
    if (edgeScrollRafRef.current !== null) {
      cancelAnimationFrame(edgeScrollRafRef.current)
      edgeScrollRafRef.current = null
    }
  }

  const tickDragEdgeScroll = () => {
    edgeScrollRafRef.current = null
    const viewport = scrollElement
    const clientY = lastDragClientYRef.current
    if (!viewport || clientY === null) {
      return
    }
    const rect = viewport.getBoundingClientRect()
    const nextScrollTop = getDragEdgeScrollTarget({
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
      localY: clientY - rect.top
    })
    if (nextScrollTop !== null) {
      viewport.scrollTo({ top: nextScrollTop })
      edgeScrollRafRef.current = requestAnimationFrame(tickDragEdgeScroll)
    }
  }

  const recordDragClientY = (clientY: number): void => {
    lastDragClientYRef.current = clientY
    if (edgeScrollRafRef.current === null) {
      edgeScrollRafRef.current = requestAnimationFrame(tickDragEdgeScroll)
    }
  }

  return { recordDragClientY, stopDragEdgeScroll }
}

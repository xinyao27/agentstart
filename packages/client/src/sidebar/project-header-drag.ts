import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import { commitProjectHeaderDragDrop } from './project-header-drag-commit'
import {
  INITIAL_REPO_DRAG_STATE,
  PROJECT_HEADER_DRAG_THRESHOLD_PX,
  type ProjectHeaderDragSession,
  type RepoDragState,
  type RepoHeaderDragController,
  type UseRepoHeaderDragArgs
} from './project-header-drag-contract'
import { createProjectHeaderDragSession } from './project-header-drag-start'
import {
  computeProjectHeaderDropPreview,
  measureProjectHeaderDragRects
} from './project-header-drop'
import { getWorktreeSidebarDragAutoscroll } from './worktree-sidebar-drag-autoscroll'

// Why pointer events instead of HTML5 DnD: rows are absolutely-positioned by
// the list virtualizer and unmount/remount as scroll changes, so DnD enter/leave fire
// against stale targets. With pointer events we cache the active set of repo
// header positions and compute the drop index from the live pointer Y.

export function useRepoHeaderDrag({
  orderedRepoIds,
  sidebarRepoHeaderIdsByBucket,
  repoById,
  usesProjectGroupOrdering,
  onCommitRepoOrder,
  onCommitProjectGroupOrder,
  getScrollContainer
}: UseRepoHeaderDragArgs): RepoHeaderDragController {
  const [state, setState] = useState<RepoDragState>(INITIAL_REPO_DRAG_STATE)
  const [sessionArmed, setSessionArmed] = useState(false)
  const latestDropIndexRef = useRef<number | null>(null)
  const orderedIdsRef = useRef(orderedRepoIds)
  const sidebarRepoHeaderIdsByBucketRef = useRef(sidebarRepoHeaderIdsByBucket)
  const repoByIdRef = useRef(repoById)
  const usesProjectGroupOrderingRef = useRef(usesProjectGroupOrdering)
  const onCommitRepoOrderRef = useRef(onCommitRepoOrder)
  const onCommitProjectGroupOrderRef = useRef(onCommitProjectGroupOrder)
  const getContainerRef = useRef(getScrollContainer)
  useLayoutEffect(() => {
    orderedIdsRef.current = orderedRepoIds
    sidebarRepoHeaderIdsByBucketRef.current = sidebarRepoHeaderIdsByBucket
    repoByIdRef.current = repoById
    usesProjectGroupOrderingRef.current = usesProjectGroupOrdering
    onCommitRepoOrderRef.current = onCommitRepoOrder
    onCommitProjectGroupOrderRef.current = onCommitProjectGroupOrder
    getContainerRef.current = getScrollContainer
  }, [
    getScrollContainer,
    onCommitProjectGroupOrder,
    onCommitRepoOrder,
    orderedRepoIds,
    repoById,
    sidebarRepoHeaderIdsByBucket,
    usesProjectGroupOrdering
  ])
  const autoscrollLastFrameTimeRef = useRef<number | null>(null)
  const autoscrollFrameIdRef = useRef<number | null>(null)

  const dragSessionRef = useRef<ProjectHeaderDragSession | null>(null)
  const clickSwallowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshHeaderRects = useEventCallback(() => {
    const container = getContainerRef.current()
    const session = dragSessionRef.current
    if (!container || !session) {
      return []
    }
    const rects = measureProjectHeaderDragRects(container, session.bucketKey)
    session.headerRects = rects
    return rects
  })

  const computeDrop = useEventCallback(
    (pointerY: number): { dropIndex: number; dropIndicatorY: number } | null => {
      const session = dragSessionRef.current
      const container = getContainerRef.current()
      if (!session || !container) {
        return null
      }
      return computeProjectHeaderDropPreview({
        pointerY,
        containerTop: container.getBoundingClientRect().top,
        scrollTop: container.scrollTop,
        rects: session.headerRects,
        sidebarRepoHeaderIds: session.sidebarRepoHeaderIds,
        contentBottom: container.scrollHeight
      })
    }
  )

  const applyDrop = useEventCallback(
    (repoId: string, drop: { dropIndex: number; dropIndicatorY: number } | null) => {
      latestDropIndexRef.current = drop?.dropIndex ?? null
      const nextState: RepoDragState = drop
        ? { draggingRepoId: repoId, ...drop }
        : { draggingRepoId: repoId, dropIndex: null, dropIndicatorY: null }
      setState((prev) =>
        prev.draggingRepoId === nextState.draggingRepoId &&
        prev.dropIndex === nextState.dropIndex &&
        prev.dropIndicatorY === nextState.dropIndicatorY
          ? prev
          : nextState
      )
    }
  )

  const cancelAutoscroll = useEventCallback(() => {
    if (autoscrollFrameIdRef.current !== null) {
      window.cancelAnimationFrame(autoscrollFrameIdRef.current)
      autoscrollFrameIdRef.current = null
    }
    autoscrollLastFrameTimeRef.current = null
  })

  const endDrag = useEventCallback((commit: boolean) => {
    cancelAutoscroll()
    const session = dragSessionRef.current
    if (!session) {
      setState(INITIAL_REPO_DRAG_STATE)
      setSessionArmed(false)
      return
    }
    try {
      session.handleEl.releasePointerCapture(session.pointerId)
    } catch {
      // capture may already be released (pointercancel, element unmounted)
    }
    if (session.promoted) {
      const handleEl = session.handleEl
      const swallow = (e: MouseEvent): void => {
        const target = e.target as Node | null
        if (target && handleEl.contains(target)) {
          e.stopPropagation()
          e.preventDefault()
        }
        window.removeEventListener('click', swallow, true)
      }
      window.addEventListener('click', swallow, true)
      clickSwallowTimeoutRef.current = setTimeout(() => {
        window.removeEventListener('click', swallow, true)
        clickSwallowTimeoutRef.current = null
      }, 0)
    }
    const sidebarDropIndex =
      commit && session.promoted && latestDropIndexRef.current !== null
        ? latestDropIndexRef.current
        : null
    dragSessionRef.current = null
    setState(INITIAL_REPO_DRAG_STATE)
    setSessionArmed(false)
    if (sidebarDropIndex === null) {
      return
    }

    commitProjectHeaderDragDrop({
      session,
      sidebarDropIndex,
      orderedRepoIds: orderedIdsRef.current,
      repoById: repoByIdRef.current,
      usesProjectGroupOrdering: usesProjectGroupOrderingRef.current,
      onCommitRepoOrder: onCommitRepoOrderRef.current,
      onCommitProjectGroupOrder: onCommitProjectGroupOrderRef.current
    })
  })

  const runAutoscrollFrame = (frameTime: number) => {
    autoscrollFrameIdRef.current = null
    const session = dragSessionRef.current
    const container = getContainerRef.current()
    if (!session?.promoted || !container) {
      cancelAutoscroll()
      return
    }

    const previousFrameTime = autoscrollLastFrameTimeRef.current ?? frameTime
    autoscrollLastFrameTimeRef.current = frameTime
    const autoscroll = getWorktreeSidebarDragAutoscroll({
      point: { clientX: 0, clientY: session.latestPointerY },
      containerRect: container.getBoundingClientRect(),
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      elapsedMs: frameTime - previousFrameTime
    })
    if (autoscroll) {
      container.scrollTop = autoscroll.scrollTop
      refreshHeaderRects()
    }

    applyDrop(session.repoId, computeDrop(session.latestPointerY))

    autoscrollFrameIdRef.current = window.requestAnimationFrame(runAutoscrollFrame)
  }

  const ensureAutoscroll = useEventCallback(() => {
    if (autoscrollFrameIdRef.current !== null) {
      return
    }
    autoscrollLastFrameTimeRef.current = null
    autoscrollFrameIdRef.current = window.requestAnimationFrame(runAutoscrollFrame)
  })

  useEffect(() => {
    if (!sessionArmed) {
      return
    }
    const onPointerMove = (e: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session || e.pointerId !== session.pointerId) {
        return
      }
      session.latestPointerY = e.clientY
      if (!session.promoted) {
        const dx = e.clientX - session.startX
        const dy = e.clientY - session.startY
        if (
          dx * dx + dy * dy <
          PROJECT_HEADER_DRAG_THRESHOLD_PX * PROJECT_HEADER_DRAG_THRESHOLD_PX
        ) {
          return
        }
        session.promoted = true
        // Why: setPointerCapture can throw if the element is detached. Check
        // isConnected first to avoid the throw; the global pointer listeners
        // still fire, so dragging keeps working even if capture fails.
        if (session.handleEl.isConnected) {
          try {
            session.handleEl.setPointerCapture(session.pointerId)
          } catch {
            // Ignore capture failure; global listeners will handle the drag.
          }
        }
        refreshHeaderRects()
        setState({ draggingRepoId: session.repoId, dropIndex: null, dropIndicatorY: null })
      }
      refreshHeaderRects()
      applyDrop(session.repoId, computeDrop(e.clientY))
      ensureAutoscroll()
    }
    const onPointerUp = (e: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session || e.pointerId !== session.pointerId) {
        return
      }
      endDrag(true)
    }
    const onPointerCancel = (e: PointerEvent): void => {
      const session = dragSessionRef.current
      if (!session || e.pointerId !== session.pointerId) {
        return
      }
      endDrag(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        endDrag(false)
      }
    }
    const onBlur = (): void => endDrag(false)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
      cancelAutoscroll()
      if (clickSwallowTimeoutRef.current !== null) {
        clearTimeout(clickSwallowTimeoutRef.current)
        clickSwallowTimeoutRef.current = null
      }
    }
  }, [
    applyDrop,
    cancelAutoscroll,
    computeDrop,
    endDrag,
    ensureAutoscroll,
    refreshHeaderRects,
    sessionArmed
  ])

  useEffect(() => {
    if (state.draggingRepoId === null) {
      return
    }
    const body = document.body
    const prevCursor = body.style.cursor
    const prevUserSelect = body.style.userSelect
    body.style.cursor = 'grabbing'
    body.style.userSelect = 'none'
    return () => {
      body.style.cursor = prevCursor
      body.style.userSelect = prevUserSelect
    }
  }, [state.draggingRepoId])

  const onHandlePointerDown = (event: React.PointerEvent<HTMLElement>, repoId: string) => {
    const session = createProjectHeaderDragSession({
      event,
      repoId,
      repoById: repoByIdRef.current,
      sidebarRepoHeaderIdsByBucket: sidebarRepoHeaderIdsByBucketRef.current,
      getScrollContainer: getContainerRef.current
    })
    if (!session) {
      return
    }
    dragSessionRef.current = session
    setSessionArmed(true)
  }

  return { state, onHandlePointerDown }
}

export { isRepoHeaderActionTarget } from './project-header-drag-contract'

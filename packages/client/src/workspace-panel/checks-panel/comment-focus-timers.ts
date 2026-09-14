export type CommentFocusTimerRef = {
  current: ReturnType<typeof setTimeout> | null
}

export function clearCommentFocusTimer(timerRef: CommentFocusTimerRef): void {
  if (timerRef.current === null) {
    return
  }
  clearTimeout(timerRef.current)
  timerRef.current = null
}

export function scheduleCommentFocusTimer(
  timerRef: CommentFocusTimerRef,
  callback: () => void
): void {
  // Why: workspace-panel panels can unmount before deferred focus work runs.
  // Replacing the pending timer keeps stale focus callbacks from surviving.
  clearCommentFocusTimer(timerRef)
  timerRef.current = setTimeout(() => {
    timerRef.current = null
    callback()
  }, 0)
}

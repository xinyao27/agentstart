import { useSyncExternalStore } from 'react'

export type WorktreeNavigationDirection = 'down' | 'up'

/** Select the Nth workspace of the sidebar's own visible ordering. */
export type WorktreeIndexRequest = { index: number }

export type WorktreeNavigationRequest = WorktreeNavigationDirection | WorktreeIndexRequest

const WORKTREE_NAVIGATION_REQUEST_EVENT = 'agentstart:worktree-navigation-request'
const navigationTargetSubscribers = new Set<() => void>()
let hasNavigationTargets = false

function subscribeToNavigationTargets(listener: () => void): () => void {
  navigationTargetSubscribers.add(listener)
  return () => navigationTargetSubscribers.delete(listener)
}

function getHasNavigationTargets(): boolean {
  return hasNavigationTargets
}

export function setHasWorktreeNavigationTargets(hasTargets: boolean): void {
  if (hasNavigationTargets === hasTargets) {
    return
  }
  hasNavigationTargets = hasTargets
  for (const listener of navigationTargetSubscribers) {
    listener()
  }
}

export function useHasWorktreeNavigationTargets(): boolean {
  return useSyncExternalStore(
    subscribeToNavigationTargets,
    getHasNavigationTargets,
    getHasNavigationTargets
  )
}

export function requestWorktreeNavigation(direction: WorktreeNavigationDirection): void {
  window.dispatchEvent(
    new CustomEvent<WorktreeNavigationRequest>(WORKTREE_NAVIGATION_REQUEST_EVENT, {
      detail: direction
    })
  )
}

export function requestWorktreeByIndex(index: number): void {
  window.dispatchEvent(
    new CustomEvent<WorktreeNavigationRequest>(WORKTREE_NAVIGATION_REQUEST_EVENT, {
      detail: { index }
    })
  )
}

function isWorktreeIndexRequest(detail: unknown): detail is WorktreeIndexRequest {
  return (
    typeof detail === 'object' &&
    detail !== null &&
    'index' in detail &&
    typeof detail.index === 'number' &&
    Number.isInteger(detail.index) &&
    detail.index >= 0
  )
}

export function subscribeToWorktreeNavigationRequests(
  listener: (request: WorktreeNavigationRequest) => void
): () => void {
  const handleRequest = (event: Event): void => {
    if (!(event instanceof CustomEvent)) {
      return
    }
    const detail: unknown = event.detail
    if (detail === 'down' || detail === 'up') {
      listener(detail)
      return
    }
    if (isWorktreeIndexRequest(detail)) {
      listener(detail)
    }
  }

  window.addEventListener(WORKTREE_NAVIGATION_REQUEST_EVENT, handleRequest)
  return () => window.removeEventListener(WORKTREE_NAVIGATION_REQUEST_EVENT, handleRequest)
}

import { useSyncExternalStore } from 'react'

export type WorktreeNavigationDirection = 'down' | 'up'

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
    new CustomEvent<WorktreeNavigationDirection>(WORKTREE_NAVIGATION_REQUEST_EVENT, {
      detail: direction
    })
  )
}

export function subscribeToWorktreeNavigationRequests(
  listener: (direction: WorktreeNavigationDirection) => void
): () => void {
  const handleRequest = (event: Event): void => {
    if (!(event instanceof CustomEvent)) {
      return
    }
    const direction: unknown = event.detail
    if (direction === 'down' || direction === 'up') {
      listener(direction)
    }
  }

  window.addEventListener(WORKTREE_NAVIGATION_REQUEST_EVENT, handleRequest)
  return () => window.removeEventListener(WORKTREE_NAVIGATION_REQUEST_EVENT, handleRequest)
}

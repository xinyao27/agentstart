import type { FsChangedPayload } from '@agentstart/protocol/files/watch-values'
import { normalizeRuntimePathForComparison } from '@agentstart/protocol/host/path'
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { subscribeRuntimeFileChanges } from '~renderer/runtime/file-client'
import { useAppStore } from '~renderer/store/state'

import { createExternalWatchEventHandler } from './external-watch-handler'
import { getEditorExternalWatchTargets, getWatchedTargetKey } from './external-watch-targets'
import type { WatchedTarget } from './external-watch-types'

export function useEditorExternalWatch(): void {
  const { targets, targetsKey } = useAppStore(getEditorExternalWatchTargets)
  const targetsRef = useRef<WatchedTarget[]>([])
  const unsubscribeByTargetRef = useRef(new Map<string, () => void>())
  const eventHandlerRef = useRef<
    ((payload: FsChangedPayload, runtimeEnvironmentId?: string | null) => void) | null
  >(null)

  useEffect(() => {
    const nextTargets = targets
    const previousTargets = targetsRef.current
    const previousKeys = new Set(previousTargets.map(getWatchedTargetKey))
    const nextKeys = new Set(nextTargets.map(getWatchedTargetKey))
    const removed = previousTargets.filter((target) => !nextKeys.has(getWatchedTargetKey(target)))
    const added = nextTargets.filter((target) => !previousKeys.has(getWatchedTargetKey(target)))
    for (const target of removed) {
      const key = getWatchedTargetKey(target)
      unsubscribeByTargetRef.current.get(key)?.()
      unsubscribeByTargetRef.current.delete(key)
    }
    for (const target of added) {
      subscribeTarget(target, unsubscribeByTargetRef.current, eventHandlerRef)
    }
    targetsRef.current = nextTargets
  }, [targets, targetsKey])

  useEffect(() => {
    const unsubscribeByTarget = unsubscribeByTargetRef.current
    const { handleFsChanged, dispose } = createExternalWatchEventHandler(
      (worktreePath, runtimeEnvironmentId) =>
        targetsRef.current.find(
          (target) =>
            normalizeRuntimePathForComparison(target.worktreePath) ===
              normalizeRuntimePathForComparison(worktreePath) &&
            target.runtimeEnvironmentId === runtimeEnvironmentId
        )
    )
    eventHandlerRef.current = handleFsChanged
    return () => {
      dispose()
      eventHandlerRef.current = null
      for (const unsubscribe of unsubscribeByTarget.values()) {
        unsubscribe()
      }
      unsubscribeByTarget.clear()
      targetsRef.current = []
    }
  }, [])
}

function subscribeTarget(
  target: WatchedTarget,
  unsubscribeByTarget: Map<string, () => void>,
  eventHandlerRef: RefObject<
    ((payload: FsChangedPayload, runtimeEnvironmentId?: string | null) => void) | null
  >
): void {
  const key = getWatchedTargetKey(target)
  let isCancelled = false
  const pendingUnsubscribe = (): void => {
    isCancelled = true
  }
  unsubscribeByTarget.set(key, pendingUnsubscribe)
  void subscribeRuntimeFileChanges(
    {
      settings: { activeRuntimeEnvironmentId: target.runtimeEnvironmentId },
      worktreeId: target.worktreeId,
      worktreePath: target.worktreePath,
      connectionId: target.connectionId
    },
    (payload) => eventHandlerRef.current?.(payload, target.runtimeEnvironmentId),
    (error) => warnExternalWatchFailure(target, error)
  )
    .then((unsubscribe) => {
      if (isCancelled) {
        unsubscribe()
      } else if (unsubscribeByTarget.get(key) === pendingUnsubscribe) {
        unsubscribeByTarget.set(key, unsubscribe)
      } else {
        unsubscribe()
      }
    })
    .catch((error) => {
      if (unsubscribeByTarget.get(key) === pendingUnsubscribe) {
        unsubscribeByTarget.delete(key)
      }
      warnExternalWatchFailure(target, error)
    })
}

function warnExternalWatchFailure(target: WatchedTarget, error: unknown): void {
  console.warn('[filesystem-watch] failed to watch worktree', {
    worktreeId: target.worktreeId,
    worktreePath: target.worktreePath,
    connectionId: target.connectionId,
    error: error instanceof Error ? error.message : String(error)
  })
}

import { useEffect } from 'react'
import { useAppStore } from '~renderer/store/state'
import {
  getExplicitRuntimeEnvironmentIdForWorktree,
  getRuntimeSessionMirrorEnvironmentIds
} from '~renderer/worktree/runtime-owner'

import {
  beginRemoteRuntimeWakeTerminalRespawn,
  endRemoteRuntimeWakeTerminalRespawn,
  shouldSkipRemoteRuntimeWakeTerminalRespawn
} from '../remote-runtime-wake-terminal-respawn'
import { requireSessionTabsClient } from '../session-tabs-target'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import {
  applyFreshRemoteSessionTabsSnapshots,
  applyRemoteSessionTabsSnapshot,
  applyRemoteSessionTabsStorePatch
} from './tabs-application'
import {
  createAndRefreshRemoteSessionTerminal,
  subscribeAllRemoteSessionTabs
} from './tabs-subscription'
import {
  acceptReplayedRemoteSessionTabsSnapshot,
  clearRemoteSessionTabsTrackingForEnvironment,
  shouldApplyRemoteSessionTabsSnapshot,
  shouldBootstrapInitialRemoteRuntimeTerminal,
  shouldRespawnRemoteRuntimeTerminalAfterWake,
  shouldSyncAllRuntimeSessionTabs,
  shouldSyncRuntimeSessionTabs
} from './tabs-tracking'
import type { SessionTabsStreamEvent } from './tabs-tracking'

export function useRemoteSessionTabsSync(): void {
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const runtimeSessionMirrorEnvironmentKey = useAppStore((state) =>
    getRuntimeSessionMirrorEnvironmentIds(state).join('\u0000')
  )
  const activeWorktreeRuntimeEnvironmentId = useAppStore((state) =>
    getExplicitRuntimeEnvironmentIdForWorktree(state, state.activeWorktreeId)
  )
  const workspaceSessionReady = useAppStore((state) => state.workspaceSessionReady)

  useEffect(() => {
    const environmentIds = runtimeSessionMirrorEnvironmentKey
      ? runtimeSessionMirrorEnvironmentKey.split('\u0000').filter((id) => id.trim())
      : []
    // Why: startup hydration writes browser-local session state; applying the
    // host snapshot before that point gets clobbered and leaves the sidebar stale.
    // Selectedness is not liveness: desktop and web clients both mirror the
    // runtime's session bindings so background worktrees do not look asleep.
    if (!workspaceSessionReady || environmentIds.length === 0) {
      return
    }

    let disposed = false
    const unsubscribes: (() => void)[] = []
    // Why: the streaming RPC emits an initial snapshots event, but startup can
    // render a paired web session before that event is applied. A one-shot
    // fetch makes initial parity deterministic; the stream remains the live
    // update path afterward.
    for (const environmentId of environmentIds) {
      if (
        !shouldSyncAllRuntimeSessionTabs({
          activeRuntimeEnvironmentId: environmentId,
          workspaceSessionReady
        })
      ) {
        continue
      }
      void requireSessionTabsClient({ kind: 'environment', environmentId })
        .then((client) => client.listAll({ timeoutMs: 15_000 }))
        .then((result) => {
          if (disposed) {
            return
          }
          applyRemoteSessionTabsStorePatch((state) =>
            applyFreshRemoteSessionTabsSnapshots(state, result, environmentId)
          )
        })
        .catch((error) => {
          if (!disposed) {
            console.warn(
              '[remote-session-tabs-sync] failed to load initial session tabs:',
              error instanceof Error ? error.message : String(error)
            )
          }
        })

      subscribeAllRemoteSessionTabs(
        environmentId,
        () => disposed,
        (unsubscribe) => unsubscribes.push(unsubscribe)
      )
    }

    return () => {
      disposed = true
      for (const unsubscribe of unsubscribes) {
        unsubscribe()
      }
      // Why: environment ids can churn as paired runtimes reconnect or switch;
      // stale freshness/mapping entries should not live for the renderer lifetime.
      for (const environmentId of environmentIds) {
        clearRemoteSessionTabsTrackingForEnvironment(environmentId)
      }
    }
  }, [runtimeSessionMirrorEnvironmentKey, workspaceSessionReady])

  useEffect(() => {
    const environmentId = activeWorktreeRuntimeEnvironmentId?.trim()
    if (
      !shouldSyncRuntimeSessionTabs({
        activeWorktreeId,
        activeWorktreeRuntimeEnvironmentId,
        workspaceSessionReady
      }) ||
      !environmentId ||
      !activeWorktreeId
    ) {
      return
    }

    let disposed = false
    const isDisposed = (): boolean => disposed
    const requestState = { initial: false, respawnAfterWake: false }
    const handleSessionTabsEvent = (event: SessionTabsStreamEvent, replayed: boolean): void => {
      if (event.type !== 'snapshot' && event.type !== 'updated') {
        return
      }
      if (replayed) {
        acceptReplayedRemoteSessionTabsSnapshot(environmentId, event.worktree)
      }
      const fresh = shouldApplyRemoteSessionTabsSnapshot(event, environmentId)
      const syncState = useAppStore.getState()
      const localWorktreeTabs = syncState.tabsByWorktree[activeWorktreeId] ?? []
      const localTerminalCount = localWorktreeTabs.length
      const hasLiveLocalPty = localWorktreeTabs.some(
        (tab) => (syncState.ptyIdsByTabId[tab.id] ?? []).length > 0
      )
      const shouldBootstrapInitialTerminal = shouldBootstrapInitialRemoteRuntimeTerminal({
        event,
        activeWorktreeId,
        requestedInitialTerminal: requestState.initial,
        snapshotIsFresh: fresh,
        localTerminalCount
      })
      const shouldRespawnAfterWake = shouldRespawnRemoteRuntimeTerminalAfterWake({
        event,
        activeWorktreeId,
        requestedRespawnAfterWake: requestState.respawnAfterWake,
        snapshotIsFresh: fresh,
        localTerminalCount,
        hasLiveLocalPty,
        skipWakeRespawn: shouldSkipRemoteRuntimeWakeTerminalRespawn(activeWorktreeId)
      })
      if (fresh) {
        applyRemoteSessionTabsStorePatch((state) =>
          applyRemoteSessionTabsSnapshot(state, event, environmentId)
        )
      }
      if (!isDisposed() && shouldBootstrapInitialTerminal) {
        requestState.initial = true
        void createAndRefreshRemoteSessionTerminal({
          worktreeId: activeWorktreeId,
          environmentId
        })
      } else if (
        !isDisposed() &&
        shouldRespawnAfterWake &&
        beginRemoteRuntimeWakeTerminalRespawn(activeWorktreeId)
      ) {
        requestState.respawnAfterWake = true
        // Why: wake recovery must recreate the terminal without changing
        // selected worktree to avoid re-triggering activation churn.
        void createAndRefreshRemoteSessionTerminal({
          worktreeId: activeWorktreeId,
          environmentId
        }).finally(() => {
          endRemoteRuntimeWakeTerminalRespawn(activeWorktreeId)
        })
      }
    }

    const controller = new AbortController()
    void (async () => {
      let cancel: ((reason?: string) => Promise<void>) | null = null
      try {
        const client = await requireSessionTabsClient({
          kind: 'environment',
          environmentId
        })
        const stream = await client.subscribe(toRuntimeWorktreeSelector(activeWorktreeId), {
          signal: controller.signal
        })
        cancel = stream.cancel
        for await (const event of stream.events) {
          if (isDisposed() || controller.signal.aborted) {
            return
          }
          handleSessionTabsEvent(event, false)
        }
      } catch (error) {
        if (!isDisposed() && !controller.signal.aborted) {
          console.warn(
            '[remote-session-tabs-sync] subscription error:',
            error instanceof Error ? error.message : String(error)
          )
        }
      } finally {
        await cancel?.('remote session tabs subscription closed')
      }
    })()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [activeWorktreeId, activeWorktreeRuntimeEnvironmentId, workspaceSessionReady])
}

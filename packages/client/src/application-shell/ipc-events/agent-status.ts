import type { AgentStatusIpcPayload } from '@agentstart/protocol/agent/status-records'
import {
  getAgentStatusSnapshot,
  getMigrationUnsupportedAgentStatusSnapshot
} from '~renderer/runtime/agent-status-client'
import { subscribeAgentStatusEvents } from '~renderer/runtime/agent-status-events-client'
import { useAppStore } from '~renderer/store/state'

import {
  resetAgentHookCompletionNotificationCoordinators,
  syncAgentHookCompletionNotificationsForStoreUpdate
} from '../agent-hook-completion-notifications'
import {
  retryPendingAgentStatusEvents,
  type PendingAgentStatusEvent
} from '../pending-agent-status-retry'
import { createAgentStatusApplier } from './agent-status-apply'
import { resolvePaneStatusRoute } from './agent-status-routing'

const PENDING_RETRY_MS = 100
const PENDING_TTL_MS = 15_000
const MAX_PENDING_EVENTS = 100

export function subscribeAgentStatusState(): () => void {
  const pendingEvents: PendingAgentStatusEvent<AgentStatusIpcPayload>[] = []
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let isFlushing = false

  const scheduleFlush = (): void => {
    if (retryTimer !== null || pendingEvents.length === 0) {
      return
    }
    retryTimer = globalThis.setTimeout(() => {
      retryTimer = null
      flushPending()
    }, PENDING_RETRY_MS)
  }
  const enqueuePending = (data: AgentStatusIpcPayload, options?: { replay?: boolean }): void => {
    pendingEvents.push({ data, firstSeenAt: Date.now(), replay: options?.replay === true })
    while (pendingEvents.length > MAX_PENDING_EVENTS) {
      pendingEvents.shift()
    }
    scheduleFlush()
  }
  const discardPendingForPane = (paneKey: string): void => {
    for (let index = pendingEvents.length - 1; index >= 0; index -= 1) {
      if (pendingEvents[index].data.paneKey === paneKey) {
        pendingEvents.splice(index, 1)
      }
    }
  }
  const applyAgentStatus = createAgentStatusApplier(enqueuePending, discardPendingForPane)
  const flushPending = (): void => {
    if (isFlushing || pendingEvents.length === 0) {
      return
    }
    isFlushing = true
    try {
      const remaining = retryPendingAgentStatusEvents(pendingEvents, {
        now: Date.now(),
        ttlMs: PENDING_TTL_MS,
        apply: applyAgentStatus
      })
      pendingEvents.length = 0
      pendingEvents.push(...remaining)
      if (pendingEvents.length === 0 && retryTimer !== null) {
        globalThis.clearTimeout(retryTimer)
        retryTimer = null
      }
    } finally {
      isFlushing = false
    }
    scheduleFlush()
  }

  let snapshotRequestedForReadyWindow = false
  let snapshotRequestId = 0
  const requestSnapshotIfReady = (): void => {
    const store = useAppStore.getState()
    if (!store.workspaceSessionReady) {
      snapshotRequestedForReadyWindow = false
      return
    }
    if (snapshotRequestedForReadyWindow) {
      return
    }
    snapshotRequestedForReadyWindow = true
    const requestId = ++snapshotRequestId
    void getAgentStatusSnapshot()
      .then((entries) => {
        if (requestId !== snapshotRequestId || !useAppStore.getState().workspaceSessionReady) {
          return
        }
        entries.forEach((entry) => applyAgentStatus(entry, { replay: true }))
        void getMigrationUnsupportedAgentStatusSnapshot().then((unsupportedEntries) => {
          const current = useAppStore.getState()
          if (!current.workspaceSessionReady) {
            return
          }
          for (const entry of unsupportedEntries) {
            if (entry.paneKey && resolvePaneStatusRoute(current, entry.paneKey).exists) {
              current.setMigrationUnsupportedPty(entry)
            }
          }
        })
      })
      .catch((error) => console.warn('[agent-status] failed to load startup snapshot:', error))
  }

  const unsubscribeEvents = subscribeAgentStatusEvents({
    onReady: (snapshot) => {
      snapshot.statuses.forEach((status) => applyAgentStatus(status, { replay: true }))
      const store = useAppStore.getState()
      if (!store.workspaceSessionReady) {
        return
      }
      for (const entry of snapshot.migrationUnsupportedPtys) {
        if (entry.paneKey && resolvePaneStatusRoute(store, entry.paneKey).exists) {
          store.setMigrationUnsupportedPty(entry)
        }
      }
    },
    onSet: applyAgentStatus,
    onClear: (paneKey) => {
      const store = useAppStore.getState()
      if (store.agentStatusByPaneKey[paneKey]?.state !== 'done') {
        store.removeAgentStatus(paneKey)
      }
    },
    onMigrationUnsupported: (entry) => {
      const store = useAppStore.getState()
      if (
        store.workspaceSessionReady &&
        entry.paneKey &&
        resolvePaneStatusRoute(store, entry.paneKey).exists
      ) {
        store.setMigrationUnsupportedPty(entry)
      }
    },
    onMigrationUnsupportedClear: (ptyId) =>
      useAppStore.getState().clearMigrationUnsupportedPty(ptyId)
  })
  requestSnapshotIfReady()
  const unsubscribeStore = useAppStore.subscribe((state, previous) => {
    requestSnapshotIfReady()
    flushPending()
    syncAgentHookCompletionNotificationsForStoreUpdate(state, previous)
  })

  return () => {
    if (retryTimer !== null) {
      globalThis.clearTimeout(retryTimer)
    }
    pendingEvents.length = 0
    unsubscribeEvents()
    unsubscribeStore()
    resetAgentHookCompletionNotificationCoordinators()
  }
}

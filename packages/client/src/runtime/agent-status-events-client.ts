import type { AgentStatusHostSnapshotValue } from '@yiru/protocol'
import type {
  AgentStatusIpcPayload,
  MigrationUnsupportedPtyEntry
} from '@yiru/protocol/agent/status-records'

import { openAgentStatusProtocolClient } from './agent-status-target'

type AgentStatusEventHandlers = {
  onReady: (snapshot: AgentStatusHostSnapshotValue) => void
  onSet: (status: AgentStatusIpcPayload) => void
  onClear: (paneKey: string) => void
  onMigrationUnsupported: (entry: MigrationUnsupportedPtyEntry) => void
  onMigrationUnsupportedClear: (ptyId: string) => void
}

const AGENT_STATUS_RECONNECT_MS = 1_000

export function subscribeAgentStatusEvents(handlers: AgentStatusEventHandlers): () => void {
  let cancelled = false
  let generation = 0
  let controller: AbortController | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const openStream = (): void => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    controller?.abort()
    if (cancelled) {
      return
    }
    const currentGeneration = ++generation
    const streamController = new AbortController()
    controller = streamController
    void (async () => {
      let cancel: ((reason?: string) => Promise<void>) | null = null
      try {
        const client = await openAgentStatusProtocolClient()
        if (!client || streamController.signal.aborted || currentGeneration !== generation) {
          return
        }
        const stream = await client.subscribe({
          signal: streamController.signal
        })
        cancel = stream.cancel
        for await (const event of stream.events) {
          if (streamController.signal.aborted || currentGeneration !== generation) {
            return
          }
          if (event.type === 'ready') {
            handlers.onReady(event.snapshot)
          } else if (event.type === 'set') {
            handlers.onSet(event.status)
          } else if (event.type === 'clear') {
            handlers.onClear(event.paneKey)
          } else if (event.type === 'migrationUnsupported') {
            handlers.onMigrationUnsupported(event.entry)
          } else if (event.type === 'migrationUnsupportedClear') {
            handlers.onMigrationUnsupportedClear(event.ptyId)
          }
        }
      } catch {
        // Why: renderer teardown aborts the iterator; a dropped host stream is
        // retried below instead of surfacing a user-visible failure.
      } finally {
        await cancel?.('agent-status subscription closed')
        if (!cancelled && !streamController.signal.aborted && currentGeneration === generation) {
          retryTimer = setTimeout(openStream, AGENT_STATUS_RECONNECT_MS)
        }
      }
    })()
  }

  openStream()
  return () => {
    cancelled = true
    generation += 1
    controller?.abort()
    if (retryTimer) {
      clearTimeout(retryTimer)
    }
  }
}

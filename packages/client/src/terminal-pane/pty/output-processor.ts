import type { PtyDataMeta } from '~renderer/runtime/pty-data-meta'

import { createAgentStatusOscProcessor } from './agent-status-osc'
import type { PtyTransport, RuntimePtyTransportOptions } from './transport-types'

type PtyOutputCallbacks = Parameters<PtyTransport['connect']>[0]['callbacks']

type PtyOutputProcessorOptions = Pick<RuntimePtyTransportOptions, 'onAgentStatus'>

type ProcessPtyOutputOptions = {
  replayingBufferedData?: boolean
  suppressAttentionEvents?: boolean
  clearBeforeReplay?: boolean
  pendingEscapeTailAnsi?: string
  snapshotCols?: number
  snapshotRows?: number
  onReplayParsed?: () => void
}

export function createPtyOutputProcessor({ onAgentStatus }: PtyOutputProcessorOptions): {
  processData: (
    data: string,
    callbacks: PtyOutputCallbacks,
    options?: ProcessPtyOutputOptions,
    meta?: PtyDataMeta
  ) => void
  clearAccumulatedState: () => void
  resetAgentStatusCarry: () => void
} {
  let processAgentStatusChunk = createAgentStatusOscProcessor()

  function processData(
    data: string,
    callbacks: PtyOutputCallbacks,
    options: ProcessPtyOutputOptions = {},
    meta?: PtyDataMeta
  ): void {
    const rawLength = meta?.rawLength ?? data.length
    const processed = processAgentStatusChunk(data)
    data = processed.cleanData

    if (!options.suppressAttentionEvents && onAgentStatus) {
      for (const payload of processed.payloads) {
        onAgentStatus(payload)
      }
    }

    if (options.replayingBufferedData && callbacks.onReplayData) {
      const replayMeta = {
        ...(options.clearBeforeReplay === false ? { clearBeforeReplay: false } : {}),
        ...(options.pendingEscapeTailAnsi
          ? { pendingEscapeTailAnsi: options.pendingEscapeTailAnsi }
          : {}),
        ...(options.snapshotCols ? { snapshotCols: options.snapshotCols } : {}),
        ...(options.snapshotRows ? { snapshotRows: options.snapshotRows } : {}),
        ...(options.onReplayParsed ? { onParsed: options.onReplayParsed } : {})
      }
      if (Object.keys(replayMeta).length > 0) {
        callbacks.onReplayData(data, replayMeta)
      } else {
        callbacks.onReplayData(data)
      }
      return
    }

    if (meta) {
      callbacks.onData?.(data, { ...meta, rawLength })
    } else {
      callbacks.onData?.(data)
    }
  }

  const resetAgentStatusCarry = (): void => {
    processAgentStatusChunk = createAgentStatusOscProcessor()
  }

  return {
    processData,
    clearAccumulatedState: resetAgentStatusCarry,
    resetAgentStatusCarry
  }
}

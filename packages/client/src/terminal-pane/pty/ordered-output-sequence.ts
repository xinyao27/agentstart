import type { PtyDataMeta } from '~renderer/runtime/pty-data-meta'

export type OrderedOutputChunk = {
  data: string
  seq?: number
  rawLength?: number
}

type RestoredSnapshotReconciliation =
  | { action: 'write'; data: string; meta: PtyDataMeta | undefined }
  | { action: 'drop-duplicate' }
  | { action: 'force-fresh-restore' }

type OrderedOutputSequenceOptions = {
  getPtyId: () => string | null
}

export type OrderedOutputSequence = {
  setSnapshotBaseline: (
    ptyId: string,
    snapshot: { seq?: number; pendingDeliveryStartSeq?: number }
  ) => void
  clearSnapshotBaseline: () => void
  reconcileLive: (data: string, meta: PtyDataMeta | undefined) => RestoredSnapshotReconciliation
  recordRendered: (meta?: Pick<PtyDataMeta, 'seq'>) => void
  observeChannel: (meta: PtyDataMeta | undefined) => void
  sliceAfterRendered: (data: string, meta: PtyDataMeta | undefined) => string | null
  sliceAfterSnapshot: (chunk: OrderedOutputChunk, snapshotSeq: number | undefined) => string | null
  advanceExpectedSeq: (seq: number) => void
  resetForExit: (ptyId: string) => void
}

export function createOrderedOutputSequence(
  options: OrderedOutputSequenceOptions
): OrderedOutputSequence {
  let snapshotBaselineSeq: number | null = null
  let snapshotBaselinePtyId: string | null = null
  let snapshotExpectedStartSeq: number | null = null
  let snapshotDeliveryWindowStartSeq: number | null = null
  let renderedPtyId: string | null = null
  let renderedSeq: number | null = null
  let channelPtyId: string | null = null
  let channelSeq: number | null = null

  const clearSnapshotBaseline = (): void => {
    snapshotBaselineSeq = null
    snapshotBaselinePtyId = null
    snapshotExpectedStartSeq = null
    snapshotDeliveryWindowStartSeq = null
  }

  const sliceAfterSnapshot = (
    chunk: OrderedOutputChunk,
    snapshotSeq: number | undefined
  ): string | null => {
    if (typeof snapshotSeq !== 'number' || typeof chunk.seq !== 'number') {
      return chunk.data
    }
    const rawLength = chunk.rawLength ?? chunk.data.length
    const startSeq = chunk.seq - rawLength
    if (snapshotSeq >= chunk.seq) {
      return ''
    }
    if (snapshotSeq <= startSeq) {
      return chunk.data
    }
    if (rawLength !== chunk.data.length) {
      return null
    }
    return chunk.data.slice(snapshotSeq - startSeq)
  }

  const recordRendered = (meta?: Pick<PtyDataMeta, 'seq'>): void => {
    if (typeof meta?.seq !== 'number') {
      return
    }
    const ptyId = options.getPtyId()
    if (!ptyId) {
      return
    }
    if (renderedPtyId !== ptyId) {
      renderedPtyId = ptyId
      renderedSeq = meta.seq
      return
    }
    renderedSeq = Math.max(renderedSeq ?? 0, meta.seq)
  }

  return {
    setSnapshotBaseline: (ptyId, snapshot) => {
      if (typeof snapshot.seq !== 'number') {
        clearSnapshotBaseline()
        return
      }
      const windowStartSeq =
        typeof snapshot.pendingDeliveryStartSeq === 'number'
          ? Math.min(snapshot.pendingDeliveryStartSeq, snapshot.seq)
          : null
      if (windowStartSeq !== null && windowStartSeq >= snapshot.seq) {
        // Why: an empty undelivered window means no duplicate can still arrive.
        // Keeping this baseline could drop a restarted or synthetic seq domain.
        clearSnapshotBaseline()
        return
      }
      snapshotBaselineSeq = snapshot.seq
      snapshotBaselinePtyId = ptyId
      snapshotExpectedStartSeq = snapshot.seq
      snapshotDeliveryWindowStartSeq = windowStartSeq
    },
    clearSnapshotBaseline,
    reconcileLive: (data, meta) => {
      if (snapshotBaselineSeq === null) {
        return { action: 'write', data, meta }
      }
      if (options.getPtyId() !== snapshotBaselinePtyId) {
        clearSnapshotBaseline()
        return { action: 'write', data, meta }
      }
      if (typeof meta?.seq !== 'number') {
        return { action: 'write', data, meta }
      }
      if (snapshotDeliveryWindowStartSeq !== null && meta.seq <= snapshotDeliveryWindowStartSeq) {
        clearSnapshotBaseline()
        return { action: 'write', data, meta }
      }
      const rawLength = meta.rawLength ?? data.length
      const startSeq = meta.seq - rawLength
      const expectedStartSeq = snapshotExpectedStartSeq
      snapshotExpectedStartSeq = Math.max(expectedStartSeq ?? meta.seq, meta.seq)
      if (expectedStartSeq !== null && startSeq > expectedStartSeq) {
        return { action: 'force-fresh-restore' }
      }
      if (meta.seq <= snapshotBaselineSeq) {
        return { action: 'drop-duplicate' }
      }
      if (startSeq >= snapshotBaselineSeq) {
        return { action: 'write', data, meta }
      }
      if (rawLength !== data.length) {
        return { action: 'force-fresh-restore' }
      }
      const sliced = data.slice(snapshotBaselineSeq - startSeq)
      return {
        action: 'write',
        data: sliced,
        meta: { ...meta, rawLength: sliced.length }
      }
    },
    recordRendered,
    observeChannel: (meta) => {
      if (typeof meta?.seq !== 'number') {
        return
      }
      const ptyId = options.getPtyId()
      if (!ptyId) {
        return
      }
      if (channelPtyId !== ptyId) {
        channelPtyId = ptyId
        channelSeq = meta.seq
        return
      }
      if (channelSeq !== null && meta.seq < channelSeq && renderedPtyId === ptyId) {
        // Why: FIFO seq only regresses when a revived session restarts its
        // counter without an observed exit; retire the stale high-water mark.
        renderedPtyId = null
        renderedSeq = null
      }
      channelSeq = meta.seq
    },
    sliceAfterRendered: (data, meta) => {
      if (renderedPtyId === null || renderedSeq === null || options.getPtyId() !== renderedPtyId) {
        return data
      }
      return sliceAfterSnapshot({ data, seq: meta?.seq, rawLength: meta?.rawLength }, renderedSeq)
    },
    sliceAfterSnapshot,
    advanceExpectedSeq: (seq) => {
      if (snapshotExpectedStartSeq !== null) {
        snapshotExpectedStartSeq = Math.max(snapshotExpectedStartSeq, seq)
      }
    },
    resetForExit: (ptyId) => {
      if (snapshotBaselinePtyId === ptyId) {
        clearSnapshotBaseline()
      }
      if (renderedPtyId === ptyId) {
        renderedPtyId = null
        renderedSeq = null
      }
      if (channelPtyId === ptyId) {
        channelPtyId = null
        channelSeq = null
      }
    }
  }
}

export type TerminalMultiplexSnapshotReason =
  | 'initial'
  | 'manual'
  | 'recovery'
  | 'reveal'
  | 'resume'
  | 'pending-cap'
  | 'normal-buffer-resize'

const SNAPSHOT_REASON_BY_WIRE = [
  'initial',
  'manual',
  'recovery',
  'reveal',
  'resume',
  'pending-cap',
  'normal-buffer-resize'
] as const satisfies readonly TerminalMultiplexSnapshotReason[]

export type TerminalMultiplexSnapshotStartRecord = {
  snapshotId: number
  reason: TerminalMultiplexSnapshotReason
  source: 0 | 1
  activeBuffer: 0 | 1
  truncated: boolean
  byteBudget: boolean
  coldRestore: boolean
  cols: number
  rows: number
  retainedScrollbackRows: number
  coverageEndSeq: bigint
  pendingDeliveryStartSeq: bigint
  sectionBytes: readonly [number, number, number, number, number]
}

export type TerminalMultiplexSnapshotChunkRecord = {
  snapshotId: number
  section: 0 | 1 | 2 | 3 | 4
  sectionOffset: number
  data: Uint8Array<ArrayBufferLike>
}

export type TerminalMultiplexSnapshotEndRecord = {
  snapshotId: number
  status: 0 | 1 | 2 | 3
  coverageEndSeq: bigint
  assembledBytes: number
  crc32c: number
}

export const TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE = {
  start: {
    bytes: 64,
    snapshotIdOffset: 0,
    reasonOffset: 4,
    reasonMax: 6,
    sourceOffset: 5,
    sourceMax: 1,
    activeBufferOffset: 6,
    activeBufferMax: 1,
    flagsOffset: 7,
    flagsMask: 7,
    truncatedFlag: 1,
    byteBudgetFlag: 2,
    coldRestoreFlag: 4,
    colsOffset: 8,
    colsMin: 1,
    colsMax: 1000,
    rowsOffset: 10,
    rowsMin: 1,
    rowsMax: 500,
    retainedScrollbackRowsOffset: 12,
    reserved64Offset: 16,
    coverageEndSeqOffset: 24,
    pendingDeliveryStartSeqOffset: 32,
    sectionBytesOffset: 40,
    sectionCount: 5,
    sectionStrideBytes: 4,
    reserved32Offset: 60
  },
  chunk: {
    headerBytes: 16,
    snapshotIdOffset: 0,
    sectionOffset: 4,
    sectionMax: 4,
    reserved8Offset: 5,
    reserved16Offset: 6,
    dataOffsetOffset: 8,
    dataBytesOffset: 12,
    maxDataBytes: 48 * 1024
  },
  end: {
    bytes: 24,
    snapshotIdOffset: 0,
    statusOffset: 4,
    statusMax: 3,
    reserved8Offset: 5,
    reserved16Offset: 6,
    coverageEndSeqOffset: 8,
    assembledBytesOffset: 16,
    crc32cOffset: 20
  }
} as const

export const TERMINAL_MULTIPLEX_SNAPSHOT_CHUNK_DATA_BYTES =
  TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE.chunk.maxDataBytes

export function encodeTerminalMultiplexSnapshotStartRecord(
  record: TerminalMultiplexSnapshotStartRecord
): Uint8Array<ArrayBuffer> {
  const wire = TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE.start
  const out = new Uint8Array(wire.bytes)
  const view = new DataView(out.buffer)
  const flags =
    (record.truncated ? wire.truncatedFlag : 0) |
    (record.byteBudget ? wire.byteBudgetFlag : 0) |
    (record.coldRestore ? wire.coldRestoreFlag : 0)
  view.setUint32(wire.snapshotIdOffset, record.snapshotId, true)
  view.setUint8(wire.reasonOffset, encodeTerminalMultiplexSnapshotReason(record.reason))
  view.setUint8(wire.sourceOffset, record.source)
  view.setUint8(wire.activeBufferOffset, record.activeBuffer)
  view.setUint8(wire.flagsOffset, flags)
  view.setUint16(wire.colsOffset, record.cols, true)
  view.setUint16(wire.rowsOffset, record.rows, true)
  view.setUint32(wire.retainedScrollbackRowsOffset, record.retainedScrollbackRows, true)
  view.setBigUint64(wire.reserved64Offset, 0n, true)
  view.setBigUint64(wire.coverageEndSeqOffset, record.coverageEndSeq, true)
  view.setBigUint64(wire.pendingDeliveryStartSeqOffset, record.pendingDeliveryStartSeq, true)
  record.sectionBytes.forEach((bytes, index) =>
    view.setUint32(wire.sectionBytesOffset + index * wire.sectionStrideBytes, bytes, true)
  )
  view.setUint32(wire.reserved32Offset, 0, true)
  return out
}

export function decodeTerminalMultiplexSnapshotStartRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexSnapshotStartRecord | null {
  const wire = TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE.start
  if (payload.byteLength !== wire.bytes) {
    return null
  }
  const view = payloadView(payload)
  const reasonWire = view.getUint8(wire.reasonOffset)
  const reason = SNAPSHOT_REASON_BY_WIRE[reasonWire]
  const source = view.getUint8(wire.sourceOffset)
  const activeBuffer = view.getUint8(wire.activeBufferOffset)
  const flags = view.getUint8(wire.flagsOffset)
  const coverageEndSeq = view.getBigUint64(wire.coverageEndSeqOffset, true)
  const pendingDeliveryStartSeq = view.getBigUint64(wire.pendingDeliveryStartSeqOffset, true)
  if (
    reason === undefined ||
    reasonWire > wire.reasonMax ||
    source > wire.sourceMax ||
    activeBuffer > wire.activeBufferMax ||
    (flags & ~wire.flagsMask) !== 0 ||
    view.getUint16(wire.colsOffset, true) < wire.colsMin ||
    view.getUint16(wire.colsOffset, true) > wire.colsMax ||
    view.getUint16(wire.rowsOffset, true) < wire.rowsMin ||
    view.getUint16(wire.rowsOffset, true) > wire.rowsMax ||
    view.getBigUint64(wire.reserved64Offset, true) !== 0n ||
    pendingDeliveryStartSeq > coverageEndSeq ||
    view.getUint32(wire.reserved32Offset, true) !== 0
  ) {
    return null
  }
  return {
    snapshotId: view.getUint32(wire.snapshotIdOffset, true),
    reason,
    source: source as TerminalMultiplexSnapshotStartRecord['source'],
    activeBuffer: activeBuffer as TerminalMultiplexSnapshotStartRecord['activeBuffer'],
    truncated: (flags & wire.truncatedFlag) !== 0,
    byteBudget: (flags & wire.byteBudgetFlag) !== 0,
    coldRestore: (flags & wire.coldRestoreFlag) !== 0,
    cols: view.getUint16(wire.colsOffset, true),
    rows: view.getUint16(wire.rowsOffset, true),
    retainedScrollbackRows: view.getUint32(wire.retainedScrollbackRowsOffset, true),
    coverageEndSeq,
    pendingDeliveryStartSeq,
    sectionBytes: [
      view.getUint32(wire.sectionBytesOffset, true),
      view.getUint32(wire.sectionBytesOffset + wire.sectionStrideBytes, true),
      view.getUint32(wire.sectionBytesOffset + wire.sectionStrideBytes * 2, true),
      view.getUint32(wire.sectionBytesOffset + wire.sectionStrideBytes * 3, true),
      view.getUint32(wire.sectionBytesOffset + wire.sectionStrideBytes * 4, true)
    ]
  }
}

export function encodeTerminalMultiplexSnapshotReason(
  reason: TerminalMultiplexSnapshotReason
): number {
  return SNAPSHOT_REASON_BY_WIRE.indexOf(reason)
}

export function encodeTerminalMultiplexSnapshotChunkRecord(
  record: TerminalMultiplexSnapshotChunkRecord
): Uint8Array<ArrayBuffer> {
  const wire = TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE.chunk
  const out = new Uint8Array(wire.headerBytes + record.data.byteLength)
  const view = new DataView(out.buffer)
  view.setUint32(wire.snapshotIdOffset, record.snapshotId, true)
  view.setUint8(wire.sectionOffset, record.section)
  view.setUint8(wire.reserved8Offset, 0)
  view.setUint16(wire.reserved16Offset, 0, true)
  view.setUint32(wire.dataOffsetOffset, record.sectionOffset, true)
  view.setUint32(wire.dataBytesOffset, record.data.byteLength, true)
  out.set(record.data, wire.headerBytes)
  return out
}

export function decodeTerminalMultiplexSnapshotChunkRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexSnapshotChunkRecord | null {
  const wire = TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE.chunk
  if (payload.byteLength < wire.headerBytes) {
    return null
  }
  const view = payloadView(payload)
  const section = view.getUint8(wire.sectionOffset)
  if (
    section > wire.sectionMax ||
    view.getUint8(wire.reserved8Offset) !== 0 ||
    view.getUint16(wire.reserved16Offset, true) !== 0 ||
    view.getUint32(wire.dataBytesOffset, true) !== payload.byteLength - wire.headerBytes ||
    payload.byteLength - wire.headerBytes > wire.maxDataBytes
  ) {
    return null
  }
  return {
    snapshotId: view.getUint32(wire.snapshotIdOffset, true),
    section: section as TerminalMultiplexSnapshotChunkRecord['section'],
    sectionOffset: view.getUint32(wire.dataOffsetOffset, true),
    data: payload.slice(wire.headerBytes)
  }
}

export function encodeTerminalMultiplexSnapshotEndRecord(
  record: TerminalMultiplexSnapshotEndRecord
): Uint8Array<ArrayBuffer> {
  const wire = TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE.end
  const out = new Uint8Array(wire.bytes)
  const view = new DataView(out.buffer)
  view.setUint32(wire.snapshotIdOffset, record.snapshotId, true)
  view.setUint8(wire.statusOffset, record.status)
  view.setUint8(wire.reserved8Offset, 0)
  view.setUint16(wire.reserved16Offset, 0, true)
  view.setBigUint64(wire.coverageEndSeqOffset, record.coverageEndSeq, true)
  view.setUint32(wire.assembledBytesOffset, record.assembledBytes, true)
  view.setUint32(wire.crc32cOffset, record.crc32c, true)
  return out
}

export function decodeTerminalMultiplexSnapshotEndRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexSnapshotEndRecord | null {
  const wire = TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE.end
  if (payload.byteLength !== wire.bytes) {
    return null
  }
  const view = payloadView(payload)
  const status = view.getUint8(wire.statusOffset)
  if (
    status > wire.statusMax ||
    view.getUint8(wire.reserved8Offset) !== 0 ||
    view.getUint16(wire.reserved16Offset, true) !== 0
  ) {
    return null
  }
  return {
    snapshotId: view.getUint32(wire.snapshotIdOffset, true),
    status: status as TerminalMultiplexSnapshotEndRecord['status'],
    coverageEndSeq: view.getBigUint64(wire.coverageEndSeqOffset, true),
    assembledBytes: view.getUint32(wire.assembledBytesOffset, true),
    crc32c: view.getUint32(wire.crc32cOffset, true)
  }
}

function payloadView(payload: Uint8Array<ArrayBufferLike>): DataView {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
}

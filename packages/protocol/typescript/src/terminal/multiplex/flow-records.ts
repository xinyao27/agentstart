export const TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE = {
  boolean: { falseValue: 0, trueValue: 1 },
  ack: {
    bytes: 24,
    kindOffset: 0,
    kindMax: 3,
    statusOffset: 1,
    statusMax: 3,
    errorCodeOffset: 2,
    acknowledgedBytesOffset: 4,
    cumulativeSeqOffset: 8,
    receiverQueueBytesOffset: 16,
    reserved32Offset: 20
  },
  credit: {
    bytes: 16,
    directionOffset: 0,
    directionMax: 1,
    reasonOffset: 1,
    reasonMax: 3,
    reserved16Offset: 2,
    maxInFlightBytesOffset: 4,
    ackEveryBytesOffset: 8,
    maxFrameBytesOffset: 12
  },
  visibility: {
    bytes: 8,
    visibleOffset: 0,
    deliveryInterestOffset: 1,
    priorityOffset: 2,
    priorityMax: 2,
    reserved8Offset: 3,
    stateVersionOffset: 4
  },
  kill: {
    bytes: 8,
    keepHistoryOffset: 0,
    immediateOffset: 1,
    immediateValue: 1,
    reserved16Offset: 2,
    reserved32Offset: 4
  },
  input: {
    headerBytes: 8,
    kindOffset: 0,
    kindMax: 1,
    reserved8Offset: 1,
    reserved16Offset: 2,
    dataBytesOffset: 4
  }
} as const

export type TerminalMultiplexAckRecord = {
  kind: 0 | 1 | 2 | 3
  status: 0 | 1 | 2 | 3
  errorCode: number
  acknowledgedBytes: number
  cumulativeSeq: bigint
  receiverQueueBytes: number
}

export type TerminalMultiplexCreditRecord = {
  direction: 0 | 1
  reason: 0 | 1 | 2 | 3
  maxInFlightBytes: number
  ackEveryBytes: number
  maxFrameBytes: number
}

export type TerminalMultiplexVisibilityRecord = {
  visible: boolean
  deliveryInterest: boolean
  priority: 0 | 1 | 2
  stateVersion: number
}

export type TerminalMultiplexKillRecord = { keepHistory: boolean; immediate: true }

export type TerminalMultiplexInputRecord = {
  kind: 0 | 1
  data: Uint8Array<ArrayBufferLike>
}

export function encodeTerminalMultiplexAckRecord(
  record: TerminalMultiplexAckRecord
): Uint8Array<ArrayBuffer> {
  const wire = TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.ack
  const out = new Uint8Array(wire.bytes)
  const view = new DataView(out.buffer)
  view.setUint8(wire.kindOffset, record.kind)
  view.setUint8(wire.statusOffset, record.status)
  view.setUint16(wire.errorCodeOffset, record.errorCode, true)
  view.setUint32(wire.acknowledgedBytesOffset, record.acknowledgedBytes, true)
  view.setBigUint64(wire.cumulativeSeqOffset, record.cumulativeSeq, true)
  view.setUint32(wire.receiverQueueBytesOffset, record.receiverQueueBytes, true)
  view.setUint32(wire.reserved32Offset, 0, true)
  return out
}

export function decodeTerminalMultiplexAckRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexAckRecord | null {
  const wire = TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.ack
  if (payload.byteLength !== wire.bytes) {
    return null
  }
  const view = payloadView(payload)
  const kind = view.getUint8(wire.kindOffset)
  const status = view.getUint8(wire.statusOffset)
  if (
    kind > wire.kindMax ||
    status > wire.statusMax ||
    view.getUint32(wire.reserved32Offset, true) !== 0
  ) {
    return null
  }
  return {
    kind: kind as TerminalMultiplexAckRecord['kind'],
    status: status as TerminalMultiplexAckRecord['status'],
    errorCode: view.getUint16(wire.errorCodeOffset, true),
    acknowledgedBytes: view.getUint32(wire.acknowledgedBytesOffset, true),
    cumulativeSeq: view.getBigUint64(wire.cumulativeSeqOffset, true),
    receiverQueueBytes: view.getUint32(wire.receiverQueueBytesOffset, true)
  }
}

export function encodeTerminalMultiplexCreditRecord(
  record: TerminalMultiplexCreditRecord
): Uint8Array<ArrayBuffer> {
  const wire = TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.credit
  const out = new Uint8Array(wire.bytes)
  const view = new DataView(out.buffer)
  view.setUint8(wire.directionOffset, record.direction)
  view.setUint8(wire.reasonOffset, record.reason)
  view.setUint16(wire.reserved16Offset, 0, true)
  view.setUint32(wire.maxInFlightBytesOffset, record.maxInFlightBytes, true)
  view.setUint32(wire.ackEveryBytesOffset, record.ackEveryBytes, true)
  view.setUint32(wire.maxFrameBytesOffset, record.maxFrameBytes, true)
  return out
}

export function decodeTerminalMultiplexCreditRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexCreditRecord | null {
  const wire = TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.credit
  if (payload.byteLength !== wire.bytes) {
    return null
  }
  const view = payloadView(payload)
  const direction = view.getUint8(wire.directionOffset)
  const reason = view.getUint8(wire.reasonOffset)
  if (
    direction > wire.directionMax ||
    reason > wire.reasonMax ||
    view.getUint16(wire.reserved16Offset, true) !== 0
  ) {
    return null
  }
  return {
    direction: direction as TerminalMultiplexCreditRecord['direction'],
    reason: reason as TerminalMultiplexCreditRecord['reason'],
    maxInFlightBytes: view.getUint32(wire.maxInFlightBytesOffset, true),
    ackEveryBytes: view.getUint32(wire.ackEveryBytesOffset, true),
    maxFrameBytes: view.getUint32(wire.maxFrameBytesOffset, true)
  }
}

export function encodeTerminalMultiplexVisibilityRecord(
  record: TerminalMultiplexVisibilityRecord
): Uint8Array<ArrayBuffer> {
  const wire = TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.visibility
  const out = new Uint8Array(wire.bytes)
  const view = new DataView(out.buffer)
  view.setUint8(wire.visibleOffset, encodeBool(record.visible))
  view.setUint8(wire.deliveryInterestOffset, encodeBool(record.deliveryInterest))
  view.setUint8(wire.priorityOffset, record.priority)
  view.setUint8(wire.reserved8Offset, 0)
  view.setUint32(wire.stateVersionOffset, record.stateVersion, true)
  return out
}

export function decodeTerminalMultiplexVisibilityRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexVisibilityRecord | null {
  const wire = TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.visibility
  if (payload.byteLength !== wire.bytes) {
    return null
  }
  const view = payloadView(payload)
  const visible = decodeBool(view.getUint8(wire.visibleOffset))
  const deliveryInterest = decodeBool(view.getUint8(wire.deliveryInterestOffset))
  const priority = view.getUint8(wire.priorityOffset)
  if (
    visible === null ||
    deliveryInterest === null ||
    priority > wire.priorityMax ||
    view.getUint8(wire.reserved8Offset) !== 0
  ) {
    return null
  }
  return {
    visible,
    deliveryInterest,
    priority: priority as TerminalMultiplexVisibilityRecord['priority'],
    stateVersion: view.getUint32(wire.stateVersionOffset, true)
  }
}

export function encodeTerminalMultiplexKillRecord(
  record: TerminalMultiplexKillRecord
): Uint8Array<ArrayBuffer> {
  const wire = TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.kill
  const out = new Uint8Array(wire.bytes)
  const view = new DataView(out.buffer)
  view.setUint8(wire.keepHistoryOffset, encodeBool(record.keepHistory))
  view.setUint8(wire.immediateOffset, wire.immediateValue)
  return out
}

export function decodeTerminalMultiplexKillRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexKillRecord | null {
  const wire = TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.kill
  if (payload.byteLength !== wire.bytes) {
    return null
  }
  const view = payloadView(payload)
  const keepHistory = decodeBool(view.getUint8(wire.keepHistoryOffset))
  if (
    keepHistory === null ||
    view.getUint8(wire.immediateOffset) !== wire.immediateValue ||
    view.getUint16(wire.reserved16Offset, true) !== 0 ||
    view.getUint32(wire.reserved32Offset, true) !== 0
  ) {
    return null
  }
  return { keepHistory, immediate: true }
}

export function encodeTerminalMultiplexInputRecord(
  record: TerminalMultiplexInputRecord
): Uint8Array<ArrayBuffer> {
  const wire = TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.input
  const out = new Uint8Array(wire.headerBytes + record.data.byteLength)
  const view = new DataView(out.buffer)
  view.setUint8(wire.kindOffset, record.kind)
  view.setUint8(wire.reserved8Offset, 0)
  view.setUint16(wire.reserved16Offset, 0, true)
  view.setUint32(wire.dataBytesOffset, record.data.byteLength, true)
  out.set(record.data, wire.headerBytes)
  return out
}

export function decodeTerminalMultiplexInputRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexInputRecord | null {
  const wire = TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.input
  if (payload.byteLength < wire.headerBytes) {
    return null
  }
  const view = payloadView(payload)
  const kind = view.getUint8(wire.kindOffset)
  const dataBytes = view.getUint32(wire.dataBytesOffset, true)
  if (
    kind > wire.kindMax ||
    view.getUint8(wire.reserved8Offset) !== 0 ||
    view.getUint16(wire.reserved16Offset, true) !== 0 ||
    dataBytes !== payload.byteLength - wire.headerBytes ||
    !isStrictUtf8(payload.subarray(wire.headerBytes))
  ) {
    return null
  }
  return {
    kind: kind as TerminalMultiplexInputRecord['kind'],
    data: payload.slice(wire.headerBytes)
  }
}

function payloadView(payload: Uint8Array<ArrayBufferLike>): DataView {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
}

function decodeBool(value: number): boolean | null {
  return value === TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.boolean.falseValue
    ? false
    : value === TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.boolean.trueValue
      ? true
      : null
}

function encodeBool(value: boolean): number {
  return value
    ? TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.boolean.trueValue
    : TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE.boolean.falseValue
}

function isStrictUtf8(payload: Uint8Array<ArrayBufferLike>): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(payload)
    return true
  } catch {
    return false
  }
}

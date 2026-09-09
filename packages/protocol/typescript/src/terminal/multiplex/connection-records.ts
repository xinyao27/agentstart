export const TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE = {
  phase: { offer: 0, accept: 1 },
  appState: { foreground: 0, background: 1, unknown: 2 },
  epoch: {
    bytes: 24,
    phaseOffset: 0,
    protocolMinorOffset: 1,
    reserved16Offset: 2,
    maxFrameBytesOffset: 4,
    maxStreamsOffset: 8,
    heartbeatMsOffset: 12,
    connectionGenerationOffset: 16,
    reserved32Offset: 20
  },
  heartbeat: {
    bytes: 16,
    phaseOffset: 0,
    appStateOffset: 1,
    reserved16Offset: 2,
    senderQueueBytesOffset: 4,
    monotonicMicrosOffset: 8
  }
} as const

type TerminalMultiplexHandshakePhase =
  (typeof TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.phase)[keyof typeof TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.phase]

type TerminalMultiplexHeartbeatAppState =
  (typeof TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.appState)[keyof typeof TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.appState]

export type TerminalMultiplexEpochRecord = {
  phase: TerminalMultiplexHandshakePhase
  protocolMinor: number
  maxFrameBytes: number
  maxStreams: number
  heartbeatMs: number
  connectionGeneration: number
}

export type TerminalMultiplexHeartbeatRecord = {
  phase: TerminalMultiplexHandshakePhase
  appState: TerminalMultiplexHeartbeatAppState
  senderQueueBytes: number
  monotonicMicros: bigint
}

export function encodeTerminalMultiplexEpochRecord(
  record: TerminalMultiplexEpochRecord
): Uint8Array<ArrayBuffer> {
  const wire = TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.epoch
  const out = new Uint8Array(wire.bytes)
  const view = new DataView(out.buffer)
  view.setUint8(wire.phaseOffset, record.phase)
  view.setUint8(wire.protocolMinorOffset, record.protocolMinor)
  view.setUint16(wire.reserved16Offset, 0, true)
  view.setUint32(wire.maxFrameBytesOffset, record.maxFrameBytes, true)
  view.setUint32(wire.maxStreamsOffset, record.maxStreams, true)
  view.setUint32(wire.heartbeatMsOffset, record.heartbeatMs, true)
  view.setUint32(wire.connectionGenerationOffset, record.connectionGeneration, true)
  view.setUint32(wire.reserved32Offset, 0, true)
  return out
}

export function decodeTerminalMultiplexEpochRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexEpochRecord | null {
  const wire = TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.epoch
  if (payload.byteLength !== wire.bytes) {
    return null
  }
  const view = payloadView(payload)
  const phase = view.getUint8(wire.phaseOffset)
  if (
    (phase !== TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.phase.offer &&
      phase !== TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.phase.accept) ||
    view.getUint16(wire.reserved16Offset, true) !== 0 ||
    view.getUint32(wire.reserved32Offset, true) !== 0
  ) {
    return null
  }
  return {
    phase,
    protocolMinor: view.getUint8(wire.protocolMinorOffset),
    maxFrameBytes: view.getUint32(wire.maxFrameBytesOffset, true),
    maxStreams: view.getUint32(wire.maxStreamsOffset, true),
    heartbeatMs: view.getUint32(wire.heartbeatMsOffset, true),
    connectionGeneration: view.getUint32(wire.connectionGenerationOffset, true)
  }
}

export function encodeTerminalMultiplexHeartbeatRecord(
  record: TerminalMultiplexHeartbeatRecord
): Uint8Array<ArrayBuffer> {
  const wire = TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.heartbeat
  const out = new Uint8Array(wire.bytes)
  const view = new DataView(out.buffer)
  view.setUint8(wire.phaseOffset, record.phase)
  view.setUint8(wire.appStateOffset, record.appState)
  view.setUint16(wire.reserved16Offset, 0, true)
  view.setUint32(wire.senderQueueBytesOffset, record.senderQueueBytes, true)
  view.setBigUint64(wire.monotonicMicrosOffset, record.monotonicMicros, true)
  return out
}

export function decodeTerminalMultiplexHeartbeatRecord(
  payload: Uint8Array<ArrayBufferLike>
): TerminalMultiplexHeartbeatRecord | null {
  const wire = TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.heartbeat
  if (payload.byteLength !== wire.bytes) {
    return null
  }
  const view = payloadView(payload)
  const phase = view.getUint8(wire.phaseOffset)
  const appState = view.getUint8(wire.appStateOffset)
  if (
    (phase !== TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.phase.offer &&
      phase !== TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.phase.accept) ||
    appState > TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.appState.unknown ||
    view.getUint16(wire.reserved16Offset, true) !== 0
  ) {
    return null
  }
  return {
    phase,
    appState: decodeHeartbeatAppState(appState),
    senderQueueBytes: view.getUint32(wire.senderQueueBytesOffset, true),
    monotonicMicros: view.getBigUint64(wire.monotonicMicrosOffset, true)
  }
}

function decodeHeartbeatAppState(appState: number): TerminalMultiplexHeartbeatAppState {
  if (appState === TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.appState.foreground) {
    return TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.appState.foreground
  }
  if (appState === TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.appState.background) {
    return TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.appState.background
  }
  return TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE.appState.unknown
}

function payloadView(payload: Uint8Array<ArrayBufferLike>): DataView {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
}

export const TERMINAL_MULTIPLEX_HEADER_BYTES = 40
export const TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES = 64 * 1024
export const TERMINAL_MULTIPLEX_HARD_MAX_FRAME_BYTES = 1024 * 1024

export const TERMINAL_MULTIPLEX_KIND = 0x74
export const TERMINAL_MULTIPLEX_VERSION = 1

export const TerminalMultiplexOpcode = {
  Epoch: 0x01,
  Heartbeat: 0x02,
  Subscribe: 0x10,
  Subscribed: 0x11,
  Unsubscribe: 0x12,
  End: 0x13,
  Error: 0x14,
  Output: 0x15,
  Ack: 0x16,
  Credit: 0x17,
  Input: 0x18,
  Resize: 0x19,
  Resized: 0x1a,
  ClaimViewport: 0x1b,
  SnapshotRequest: 0x1c,
  SnapshotStart: 0x1d,
  SnapshotChunk: 0x1e,
  SnapshotEnd: 0x1f,
  VisibilityGate: 0x20,
  RevealSnapshot: 0x21,
  SideEffectBatch: 0x22,
  ClearBuffer: 0x23,
  ModelRestore: 0x24,
  Signal: 0x25,
  Kill: 0x26,
  Metadata: 0x27,
  FitOverride: 0x28,
  Driver: 0x29
} as const

export type TerminalMultiplexOpcode =
  (typeof TerminalMultiplexOpcode)[keyof typeof TerminalMultiplexOpcode]

export type TerminalMultiplexFrame = {
  opcode: TerminalMultiplexOpcode
  unsupportedOpcode?: number
  routeId: number
  epoch: bigint
  seq: bigint
  correlationId: number
  payload: Uint8Array<ArrayBufferLike>
}

export type TerminalMultiplexFrameDecodeError = {
  closeCode: 1002 | 1009
  code: 'invalid_header' | 'invalid_length' | 'invalid_route' | 'unsupported_opcode'
  opcode?: number
  routeId?: number
}

export type TerminalMultiplexFrameDecodeResult =
  | { ok: true; frame: TerminalMultiplexFrame }
  | { ok: false; error: TerminalMultiplexFrameDecodeError }

export function encodeTerminalMultiplexFrame(
  frame: TerminalMultiplexFrame
): Uint8Array<ArrayBuffer> {
  validateUnsignedInteger(frame.routeId, 0xffffffff, 'routeId')
  validateUnsignedInteger(frame.correlationId, 0xffffffff, 'correlationId')
  validateUnsignedBigInt(frame.epoch, 'epoch')
  validateUnsignedBigInt(frame.seq, 'seq')
  if (!isTerminalMultiplexOpcode(frame.opcode)) {
    throw new Error('Invalid terminal multiplex opcode')
  }
  if (frame.unsupportedOpcode !== undefined) {
    throw new Error('Cannot encode a decoded unsupported terminal multiplex opcode')
  }
  if (!isRouteValid(frame.opcode, frame.routeId)) {
    throw new Error('Invalid terminal multiplex route')
  }
  if (frame.payload.byteLength > TERMINAL_MULTIPLEX_HARD_MAX_FRAME_BYTES) {
    throw new Error('Terminal multiplex payload exceeds the hard frame limit')
  }

  const out = new Uint8Array(TERMINAL_MULTIPLEX_HEADER_BYTES + frame.payload.byteLength)
  const view = new DataView(out.buffer)
  view.setUint8(0, TERMINAL_MULTIPLEX_KIND)
  view.setUint8(1, TERMINAL_MULTIPLEX_VERSION)
  view.setUint8(2, frame.opcode)
  view.setUint8(3, 0)
  view.setUint16(4, TERMINAL_MULTIPLEX_HEADER_BYTES, true)
  view.setUint16(6, 0, true)
  view.setUint32(8, frame.routeId, true)
  view.setUint32(12, frame.payload.byteLength, true)
  view.setBigUint64(16, frame.epoch, true)
  view.setBigUint64(24, frame.seq, true)
  view.setUint32(32, frame.correlationId, true)
  view.setUint32(36, 0, true)
  out.set(frame.payload, TERMINAL_MULTIPLEX_HEADER_BYTES)
  return out
}

export function decodeTerminalMultiplexFrame(
  bytes: Uint8Array<ArrayBufferLike>,
  maxFrameBytes = TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES
): TerminalMultiplexFrameDecodeResult {
  if (bytes.byteLength < TERMINAL_MULTIPLEX_HEADER_BYTES) {
    return decodeFailure(1002, 'invalid_header')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    view.getUint8(0) !== TERMINAL_MULTIPLEX_KIND ||
    view.getUint8(1) !== TERMINAL_MULTIPLEX_VERSION ||
    view.getUint8(3) !== 0 ||
    view.getUint16(4, true) !== TERMINAL_MULTIPLEX_HEADER_BYTES ||
    view.getUint16(6, true) !== 0 ||
    view.getUint32(36, true) !== 0
  ) {
    return decodeFailure(1002, 'invalid_header')
  }

  const opcodeValue = view.getUint8(2)
  const routeId = view.getUint32(8, true)
  if (!isTerminalMultiplexOpcode(opcodeValue)) {
    if (routeId === 0) {
      return decodeFailure(1002, 'invalid_route', { opcode: opcodeValue, routeId })
    }
    const payloadBytes = view.getUint32(12, true)
    const lengthError = validateTerminalMultiplexPayloadLength(bytes, payloadBytes, maxFrameBytes)
    if (lengthError) {
      return decodeFailure(1009, 'invalid_length', { opcode: opcodeValue, routeId })
    }
    // Why: docs/reference/terminal-multiplex.md §7.3 scopes an unknown opcode to its stream.
    // Error is an internal sentinel; unsupportedOpcode prevents it from being re-encoded.
    return {
      ok: true,
      frame: {
        opcode: TerminalMultiplexOpcode.Error,
        unsupportedOpcode: opcodeValue,
        routeId,
        epoch: view.getBigUint64(16, true),
        seq: view.getBigUint64(24, true),
        correlationId: view.getUint32(32, true),
        payload: bytes.slice(TERMINAL_MULTIPLEX_HEADER_BYTES)
      }
    }
  }
  if (!isRouteValid(opcodeValue, routeId)) {
    return decodeFailure(1002, 'invalid_route', { opcode: opcodeValue, routeId })
  }

  const payloadBytes = view.getUint32(12, true)
  if (validateTerminalMultiplexPayloadLength(bytes, payloadBytes, maxFrameBytes)) {
    return decodeFailure(1009, 'invalid_length', { opcode: opcodeValue, routeId })
  }

  return {
    ok: true,
    frame: {
      opcode: opcodeValue,
      routeId,
      epoch: view.getBigUint64(16, true),
      seq: view.getBigUint64(24, true),
      correlationId: view.getUint32(32, true),
      payload: bytes.slice(TERMINAL_MULTIPLEX_HEADER_BYTES)
    }
  }
}

function validateTerminalMultiplexPayloadLength(
  bytes: Uint8Array<ArrayBufferLike>,
  payloadBytes: number,
  maxFrameBytes: number
): boolean {
  const effectiveMax = Math.min(
    Math.max(0, Math.floor(maxFrameBytes)),
    TERMINAL_MULTIPLEX_HARD_MAX_FRAME_BYTES
  )
  return (
    payloadBytes > effectiveMax ||
    payloadBytes > TERMINAL_MULTIPLEX_HARD_MAX_FRAME_BYTES ||
    bytes.byteLength !== TERMINAL_MULTIPLEX_HEADER_BYTES + payloadBytes
  )
}

export function isTerminalMultiplexControlOpcode(opcode: TerminalMultiplexOpcode): boolean {
  return opcode === TerminalMultiplexOpcode.Epoch || opcode === TerminalMultiplexOpcode.Heartbeat
}

export function isTerminalMultiplexOpcode(value: number): value is TerminalMultiplexOpcode {
  return Object.values(TerminalMultiplexOpcode).some((opcode) => opcode === value)
}

function isRouteValid(opcode: TerminalMultiplexOpcode, routeId: number): boolean {
  return isTerminalMultiplexControlOpcode(opcode) ? routeId === 0 : routeId > 0
}

function decodeFailure(
  closeCode: 1002 | 1009,
  code: TerminalMultiplexFrameDecodeError['code'],
  details: Pick<TerminalMultiplexFrameDecodeError, 'opcode' | 'routeId'> = {}
): TerminalMultiplexFrameDecodeResult {
  return { ok: false, error: { closeCode, code, ...details } }
}

function validateUnsignedInteger(value: number, max: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`Invalid terminal multiplex ${name}`)
  }
}

function validateUnsignedBigInt(value: bigint, name: string): void {
  if (value < 0n || value > 0xffffffffffffffffn) {
    throw new Error(`Invalid terminal multiplex ${name}`)
  }
}

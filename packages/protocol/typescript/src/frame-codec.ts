import { fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import { FrameSchema } from '../generated/yiru/protocol/v1/frame_pb.js'
import type { Frame } from '../generated/yiru/protocol/v1/frame_pb.js'
import { RuntimeProtocolError } from './error.js'
import { PROTOCOL_VERSION } from './peer-values.js'

const WIRE_MAGIC = Uint8Array.of(0x59, 0x49, 0x52, 0x55)
export const WIRE_PREAMBLE_BYTES = WIRE_MAGIC.byteLength + 1

export function encodeProtocolFrame(frame: Frame): Uint8Array {
  const payload = toBinary(FrameSchema, frame)
  const bytes = new Uint8Array(WIRE_PREAMBLE_BYTES + payload.byteLength)
  bytes.set(WIRE_MAGIC)
  bytes[WIRE_MAGIC.byteLength] = PROTOCOL_VERSION
  bytes.set(payload, WIRE_PREAMBLE_BYTES)
  return bytes
}

export function decodeProtocolFrame(bytes: Uint8Array): Frame | null {
  if (!hasProtocolMagic(bytes)) {
    return null
  }
  if (bytes.byteLength < WIRE_PREAMBLE_BYTES) {
    throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Runtime protocol preamble is incomplete')
  }
  if (bytes[WIRE_MAGIC.byteLength] !== PROTOCOL_VERSION) {
    throw new RuntimeProtocolError(
      StatusCode.FAILED_PRECONDITION,
      'Runtime protocol wire version mismatch'
    )
  }
  try {
    const frame = fromBinary(FrameSchema, bytes.subarray(WIRE_PREAMBLE_BYTES))
    if (frame.body.case === undefined) {
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Runtime protocol frame body is missing')
    }
    if (frame.protocolVersion !== PROTOCOL_VERSION) {
      throw new RuntimeProtocolError(
        StatusCode.FAILED_PRECONDITION,
        'Runtime protocol frame version mismatch'
      )
    }
    return frame
  } catch (error) {
    if (error instanceof RuntimeProtocolError) {
      throw error
    }
    throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Runtime protocol frame is malformed')
  }
}

export function hasProtocolMagic(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= WIRE_MAGIC.byteLength &&
    bytes[0] === WIRE_MAGIC[0] &&
    bytes[1] === WIRE_MAGIC[1] &&
    bytes[2] === WIRE_MAGIC[2] &&
    bytes[3] === WIRE_MAGIC[3]
  )
}

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import type { Frame, Welcome } from '../generated/yiru/protocol/v1/frame_pb.js'
import { RuntimeProtocolError } from './error.js'
import { decodeProtocolFrame, hasProtocolMagic } from './frame-codec.js'
import { MAX_FRAME_BYTES } from './peer-values.js'

export class ProtocolReceiver {
  private maxFrameBytes = MAX_FRAME_BYTES
  private sequence = 0n

  configure(welcome: Welcome): void {
    this.maxFrameBytes = welcome.maxFrameBytes
  }

  claims(bytes: Uint8Array): boolean {
    return hasProtocolMagic(bytes)
  }

  dispatch(
    bytes: Uint8Array,
    handle: (frame: Frame) => void,
    closed: boolean,
    terminate: (error: unknown) => void
  ): boolean {
    if (closed) {
      return this.claims(bytes)
    }
    try {
      const frame = this.receive(bytes)
      if (!frame) {
        return false
      }
      handle(frame)
    } catch (error) {
      terminate(error)
    }
    return true
  }

  receive(bytes: Uint8Array): Frame | null {
    if (bytes.byteLength > this.maxFrameBytes) {
      if (!hasProtocolMagic(bytes)) {
        return null
      }
      throw new RuntimeProtocolError(
        StatusCode.RESOURCE_EXHAUSTED,
        'Runtime protocol frame exceeds the limit'
      )
    }
    const frame = decodeProtocolFrame(bytes)
    if (!frame) {
      return null
    }
    if (frame.sequence !== this.sequence + 1n) {
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Runtime protocol sequence failed')
    }
    this.sequence = frame.sequence
    return frame
  }
}

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import { TransportFeature, type Welcome } from '../generated/yiru/protocol/v1/frame_pb.js'
import type { PendingHandshake } from './call-state.js'
import { RuntimeProtocolError } from './error.js'
import { WIRE_PREAMBLE_BYTES } from './frame-codec.js'
import type { ProtocolReceiver } from './frame-receiver.js'
import type { ProtocolSender } from './frame-sender.js'
import {
  boundedTimeout,
  DEFAULT_TIMEOUT_MS,
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  resolveTransportFeatures
} from './peer-values.js'
import type { RuntimePeerInfo } from './transport.js'

export class ProtocolHandshake {
  private offeredTransportFeatures = new Set<TransportFeature>()
  private pending: PendingHandshake | null = null
  private welcome: Welcome | null = null

  get accepted(): Welcome | null {
    return this.welcome
  }

  async open(
    info: RuntimePeerInfo,
    sender: ProtocolSender,
    terminate: (error: unknown) => void,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<Welcome> {
    if (this.welcome) {
      return this.welcome
    }
    if (this.pending) {
      throw new RuntimeProtocolError(
        StatusCode.FAILED_PRECONDITION,
        'Runtime protocol handshake is already pending'
      )
    }
    const abort = new AbortController()
    this.offeredTransportFeatures = new Set(resolveTransportFeatures(info))
    const ready = new Promise<Welcome>((resolve, reject) => {
      this.pending = {
        abort,
        resolve,
        reject,
        timeout: setTimeout(
          () =>
            terminate(
              new RuntimeProtocolError(
                StatusCode.DEADLINE_EXCEEDED,
                'Runtime protocol handshake timed out'
              )
            ),
          boundedTimeout(timeoutMs)
        )
      }
    })
    void ready.catch(() => {})
    try {
      await sender.hello(info, abort.signal)
      return await ready
    } catch (error) {
      terminate(error)
      await ready.catch(() => {})
      throw error
    }
  }

  accept(welcome: Welcome, receiver: ProtocolReceiver, sender: ProtocolSender): void {
    if (
      this.welcome ||
      !this.pending ||
      welcome.protocolVersion !== PROTOCOL_VERSION ||
      welcome.maxFrameBytes < WIRE_PREAMBLE_BYTES ||
      welcome.maxFrameBytes > MAX_FRAME_BYTES ||
      welcome.initialCallCreditBytes < 1n ||
      welcome.keepAliveIntervalMs < 1 ||
      !welcome.enabledTransportFeatures.every(
        (feature, index) =>
          feature !== TransportFeature.UNSPECIFIED &&
          this.offeredTransportFeatures.has(feature) &&
          welcome.enabledTransportFeatures.indexOf(feature) === index
      ) ||
      !welcome.runtimeId ||
      !welcome.sessionId
    ) {
      throw new RuntimeProtocolError(
        StatusCode.FAILED_PRECONDITION,
        'Daemon sent an invalid Welcome'
      )
    }
    this.welcome = welcome
    receiver.configure(welcome)
    sender.configure(welcome)
    clearTimeout(this.pending.timeout)
    this.pending.resolve(welcome)
    this.pending = null
    sender.keepAlive(welcome.keepAliveIntervalMs)
  }

  fail(error: unknown): void {
    if (!this.pending) {
      return
    }
    clearTimeout(this.pending.timeout)
    this.pending.abort.abort(error)
    this.pending.reject(error)
    this.pending = null
  }
}

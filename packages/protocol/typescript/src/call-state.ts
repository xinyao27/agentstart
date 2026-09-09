import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import type { Status } from '../generated/yiru/protocol/v1/errors_pb.js'
import type { Welcome } from '../generated/yiru/protocol/v1/frame_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeEventStream } from './event-stream.js'
import { boundedTimeout, statusError } from './peer-values.js'
import type { RuntimeCall } from './transport.js'

export type PendingUnary = {
  abort: AbortController
  kind: 'unary'
  resolve: (payload: Uint8Array) => void
  reject: (reason?: unknown) => void
  payloads: Uint8Array[]
  cleanup: () => void
  bufferedResponseBytes: number
  incomingCreditBytes: number
  requestBytes: number
}

export type PendingStream = {
  abort: AbortController
  kind: 'stream'
  stream: RuntimeEventStream
  cleanup: () => void
  bufferedResponseBytes: number
  incomingCreditBytes: number
  isRemoteEnded: boolean
  requestBytes: number
}

export type PendingCall = PendingUnary | PendingStream

export type PendingHandshake = Readonly<{
  abort: AbortController
  resolve: (welcome: Welcome) => void
  reject: (reason?: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}>

export type CallLifecycle = Readonly<{
  abort: AbortController
  cleanup: () => void
  timeoutMs: number
}>

export function completePendingCall(
  pending: PendingCall,
  status?: Pick<Status, 'code' | 'message'>
): void {
  const error = statusError(status)
  if (error) {
    failPendingCall(pending, error)
  } else if (pending.kind === 'stream') {
    pending.stream.end()
  } else if (pending.payloads.length === 1) {
    pending.resolve(pending.payloads[0])
  } else {
    pending.reject(
      new RuntimeProtocolError(StatusCode.INTERNAL, 'Unary call returned an invalid payload count')
    )
  }
}

export function failPendingCall(pending: PendingCall, error: unknown): void {
  if (pending.kind === 'unary') {
    pending.reject(error)
  } else {
    pending.stream.fail(error)
  }
}

export function createCallLifecycle(
  call: RuntimeCall,
  fallbackMs: number | undefined,
  cancel: (code: StatusCode, message: string) => void
): CallLifecycle {
  const abort = new AbortController()
  const timeoutMs = boundedTimeout(call.options?.timeoutMs, fallbackMs)
  const signal = call.options?.signal
  const cancelFromSignal = (): void => {
    abort.abort(signal?.reason)
    cancel(StatusCode.CANCELLED, 'Runtime call cancelled')
  }
  if (!signal?.aborted) {
    signal?.addEventListener('abort', cancelFromSignal, { once: true })
  }
  const timeout = timeoutMs
    ? setTimeout(() => {
        const error = new RuntimeProtocolError(
          StatusCode.DEADLINE_EXCEEDED,
          'Runtime call deadline exceeded'
        )
        abort.abort(error)
        cancel(error.code, error.message)
      }, timeoutMs)
    : null
  return {
    abort,
    timeoutMs,
    cleanup: () => {
      if (timeout) {
        clearTimeout(timeout)
      }
      signal?.removeEventListener('abort', cancelFromSignal)
    }
  }
}

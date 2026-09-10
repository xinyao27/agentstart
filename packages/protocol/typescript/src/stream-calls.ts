import type { Welcome } from '../generated/agent_start/protocol/v1/frame_pb.js'
import type { CallLifecycle } from './call-state.js'
import type { DuplexRequests } from './duplex-requests.js'
import { RuntimeEventStream } from './event-stream.js'
import type { ProtocolSender } from './frame-sender.js'
import { INITIAL_CALL_CREDIT_BYTES } from './peer-values.js'
import type { PendingCalls } from './pending-calls.js'
import type { RuntimeCall, RuntimeDuplex, RuntimeStream } from './transport.js'

type StreamContext = {
  welcome: Welcome | null
  callId: bigint
  lifecycle: CallLifecycle
  pending: PendingCalls
  duplexRequests: DuplexRequests
  sender: ProtocolSender
  cancel: (reason?: string) => Promise<void>
  restoreCredit: (bytes: number) => Promise<void>
  finishFailed: (error: unknown) => void
}

export function openRuntimeStream(
  call: RuntimeCall,
  duplex: true,
  context: StreamContext
): Promise<RuntimeDuplex>
export function openRuntimeStream(
  call: RuntimeCall,
  duplex: false,
  context: StreamContext
): Promise<RuntimeStream>
export async function openRuntimeStream(
  call: RuntimeCall,
  duplex: boolean,
  context: StreamContext
): Promise<RuntimeStream | RuntimeDuplex> {
  const callId = context.callId
  const stream = new RuntimeEventStream(
    async (reason) => context.cancel(reason),
    (bytes) => void context.restoreCredit(bytes).catch(() => {})
  )
  const lifecycle = context.lifecycle
  try {
    context.pending.reserveRequestBytes(call.payload.byteLength)
  } catch (error) {
    lifecycle.cleanup()
    lifecycle.abort.abort(error)
    throw error
  }
  context.pending.add(callId, {
    abort: lifecycle.abort,
    kind: 'stream',
    stream,
    cleanup: () => {
      lifecycle.cleanup()
      context.duplexRequests.close(callId)
    },
    bufferedResponseBytes: 0,
    incomingCreditBytes: INITIAL_CALL_CREDIT_BYTES,
    isRemoteEnded: false,
    requestBytes: call.payload.byteLength
  })
  if (call.options?.signal?.aborted) {
    context.finishFailed(call.options.signal.reason)
    throw call.options.signal.reason
  }
  if (duplex) {
    context.duplexRequests.open(
      callId,
      context.welcome?.initialCallCreditBytes ?? 0n,
      call.payload.byteLength,
      lifecycle.abort.signal
    )
  }
  await context.sender.start(callId, call, lifecycle, duplex).catch((error: unknown) => {
    context.finishFailed(error)
    throw error
  })
  return duplex
    ? {
        ...stream.asRuntimeStream(),
        send: async (payload: Uint8Array) => {
          try {
            await context.duplexRequests.send(callId, payload, context.sender)
          } catch (error) {
            await context.cancel().catch(() => {})
            throw error
          }
        },
        end: async () => {
          try {
            await context.duplexRequests.end(callId, context.sender)
          } catch (error) {
            await context.cancel().catch(() => {})
            throw error
          }
        }
      }
    : stream.asRuntimeStream()
}

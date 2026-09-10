import { StatusCode, type Status } from '../generated/agent_start/protocol/v1/errors_pb.js'
import type { CallStart, Frame, Welcome } from '../generated/agent_start/protocol/v1/frame_pb.js'
import { RuntimeProtocolError } from './error.js'
import { statusError } from './peer-values.js'

type IncomingFrameActions = {
  acceptCallStart: (start: CallStart) => void
  acceptPong: (nonce: bigint) => void
  acceptPayload: (callId: bigint, data: Uint8Array) => void
  acceptWelcome: (welcome: Welcome) => void
  finishCall: (callId: bigint, status?: Pick<Status, 'code' | 'message'>) => void
  finishCancelled: (callId: bigint, status?: Pick<Status, 'code' | 'message'>) => void
  isReady: () => boolean
  pong: (nonce: bigint) => Promise<void>
  terminate: (error: unknown) => void
  updateCredit: (callId: bigint, creditBytes: bigint) => void
}

export function createIncomingFrameHandler(actions: IncomingFrameActions): (frame: Frame) => void {
  return (frame) => {
    const body = frame.body
    if (!actions.isReady() && body.case !== 'welcome' && body.case !== 'goAway') {
      throw new RuntimeProtocolError(
        StatusCode.FAILED_PRECONDITION,
        'Runtime sent a call frame before Welcome'
      )
    }
    switch (body.case) {
      case 'welcome':
        actions.acceptWelcome(body.value)
        return
      case 'payload':
        actions.acceptPayload(body.value.callId, body.value.data)
        return
      case 'callStart':
        actions.acceptCallStart(body.value)
        return
      case 'callEnd':
        actions.finishCall(body.value.callId, body.value.status)
        return
      case 'cancel':
        actions.finishCancelled(body.value.callId, body.value.status)
        return
      case 'goAway':
        actions.terminate(
          statusError(body.value.status) ??
            new RuntimeProtocolError(StatusCode.UNAVAILABLE, 'Daemon left')
        )
        return
      case 'ping':
        return void actions.pong(body.value.nonce).catch(() => {})
      case 'pong':
        actions.acceptPong(body.value.nonce)
        break
      case 'windowUpdate':
        actions.updateCredit(body.value.callId, body.value.creditBytes)
        return
      case 'hello':
      case undefined:
        throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Daemon sent an invalid protocol frame')
    }
  }
}

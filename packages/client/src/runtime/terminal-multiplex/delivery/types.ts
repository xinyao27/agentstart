import type { TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue } from '@yiru/protocol/terminal-multiplex/frame'

import type { RemoteRuntimeMultiplexedTerminalCallbacks } from '../types'

export type RemoteTerminalSendFrame = (
  opcode: TerminalMultiplexOpcodeValue,
  routeId: number,
  seq: bigint,
  correlationId: number,
  payload?: Uint8Array<ArrayBufferLike>
) => boolean

export type PendingRemoteTerminalOutput = {
  payload: Uint8Array<ArrayBufferLike>
  startSeq: bigint
  endSeq: bigint
}

export type RemoteTerminalDeliveryOptions = {
  routeId: number
  callbacks: RemoteRuntimeMultiplexedTerminalCallbacks
  send: RemoteTerminalSendFrame
  allocateCorrelationId: () => number
  setCredit: (bytes: number, reason?: 0 | 1 | 2 | 3) => void
  onEnd: () => void
}

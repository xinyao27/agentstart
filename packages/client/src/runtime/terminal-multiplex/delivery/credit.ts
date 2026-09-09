import { decodeTerminalMultiplexCreditRecord } from '@yiru/protocol/terminal-multiplex/flow-records'
import type { TerminalMultiplexFrame } from '@yiru/protocol/terminal-multiplex/frame'

export function applyRemoteTerminalOutputCredit(
  frame: TerminalMultiplexFrame,
  setCredit: (bytes: number, reason?: 0 | 1 | 2 | 3) => void
): boolean {
  const credit = decodeTerminalMultiplexCreditRecord(frame.payload)
  if (!credit || credit.direction !== 0 || frame.seq !== 0n || frame.correlationId !== 0) {
    return false
  }
  // Why: the host derives the adaptive output window from parse ACK RTT and
  // queue telemetry. Echo it as the receiver's absolute Credit publication.
  setCredit(credit.maxInFlightBytes, credit.reason)
  return true
}

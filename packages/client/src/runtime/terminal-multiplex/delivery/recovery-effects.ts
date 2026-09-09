import { TerminalMultiplexOpcode } from '@yiru/protocol/terminal-multiplex/frame'
import { encodeTerminalMultiplexJson } from '@yiru/protocol/terminal-multiplex/json'
import type { TerminalMultiplexRecoveryEffect } from '@yiru/protocol/terminal-multiplex/recovery'

import type { RemoteTerminalDeliveryOptions } from './types'

type SnapshotClearer = { clear: () => void }

export function executeRemoteTerminalRecoveryEffect(
  effect: TerminalMultiplexRecoveryEffect,
  snapshot: SnapshotClearer,
  options: RemoteTerminalDeliveryOptions,
  parsedSeq: bigint
): void {
  switch (effect.type) {
    case 'clear-client-snapshot':
      snapshot.clear()
      return
    case 'set-output-credit':
      options.setCredit(effect.bytes)
      return
    case 'request-client-snapshot':
      options.send(
        TerminalMultiplexOpcode.SnapshotRequest,
        options.routeId,
        parsedSeq,
        options.allocateCorrelationId(),
        encodeTerminalMultiplexJson({ requestedScrollbackRows: 1_000 })
      )
      return
    case 'start-host-snapshot':
    case 'send-superseded-snapshot':
    case 'complete-host-snapshot':
    case 'complete-host-manual-snapshot':
    case 'host-snapshot-ack-result':
    case 'reject-manual-snapshot':
    case 'send-model-restore':
      throw new Error('Host recovery effect reached the terminal client')
  }
}

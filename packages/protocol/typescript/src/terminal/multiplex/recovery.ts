import {
  hostSnapshotAckTransition,
  hostSnapshotSentTransition,
  startHostSnapshotTransition
} from './host-recovery.js'
import type { TerminalMultiplexSnapshotReason } from './snapshot-records.js'

export type TerminalMultiplexRecoveryCause = 'ack-stall' | 'pending-cap' | 'provider-gap'

type ActiveSnapshot = { id: number; reason: TerminalMultiplexSnapshotReason }
type PendingSnapshot = ActiveSnapshot & { coverageEndSeq: bigint }
type SupersededSnapshotAck = { id: number; coverageEndSeq: bigint }

type RecoveryMemory = {
  delivery: 'active' | 'gated'
  activeSnapshot: ActiveSnapshot | null
  pendingSnapshot: PendingSnapshot | null
  supersededSnapshotAcks: readonly SupersededSnapshotAck[]
  recoveryRequested: boolean
  clientSnapshotting: boolean
}

export type TerminalMultiplexRecoveryState =
  | { kind: 'live'; memory: RecoveryMemory }
  | { kind: 'gated'; memory: RecoveryMemory }
  | { kind: 'snapshotting'; memory: RecoveryMemory }
  | { kind: 'recovering'; memory: RecoveryMemory }

export type TerminalMultiplexRecoveryEvent =
  | { type: 'delivery-gated' }
  | { type: 'delivery-active' }
  | { type: 'host-start'; id: number; reason: TerminalMultiplexSnapshotReason }
  | { type: 'host-manual-request'; id: number; seq: bigint }
  | {
      type: 'host-snapshot-sent'
      coverageEndSeq: bigint
      status: 0 | 1 | 2 | 3
    }
  | { type: 'host-snapshot-ack'; id: number; coverageEndSeq: bigint }
  | { type: 'host-recover'; cause: TerminalMultiplexRecoveryCause; snapshotId?: number }
  | { type: 'client-begin-initial' }
  | { type: 'client-gate-credit' }
  | { type: 'client-begin-reveal' }
  | { type: 'client-snapshot-started'; accepted: boolean }
  | { type: 'client-model-restore'; snapshotFollows: boolean }
  | { type: 'client-recovery-needed' }
  | { type: 'client-resumed' }
  | { type: 'reset' }

export type TerminalMultiplexRecoveryEffect =
  | { type: 'start-host-snapshot'; id: number; reason: TerminalMultiplexSnapshotReason }
  | { type: 'send-superseded-snapshot'; id: number; coverageEndSeq: bigint }
  | { type: 'complete-host-snapshot'; coverageEndSeq: bigint }
  | { type: 'complete-host-manual-snapshot' }
  | { type: 'host-snapshot-ack-result'; accepted: boolean }
  | { type: 'reject-manual-snapshot'; id: number; seq: bigint }
  | {
      type: 'send-model-restore'
      cause: TerminalMultiplexRecoveryCause
      snapshotFollows: boolean
    }
  | { type: 'clear-client-snapshot' }
  | { type: 'set-output-credit'; bytes: number }
  | { type: 'request-client-snapshot' }

export type TerminalMultiplexRecoveryTransition = {
  state: TerminalMultiplexRecoveryState
  effects: readonly TerminalMultiplexRecoveryEffect[]
}

export function createTerminalMultiplexRecoveryState(
  delivery: 'active' | 'gated' = 'active'
): TerminalMultiplexRecoveryState {
  return withKind('snapshotting', emptyMemory(delivery))
}

export function reduceRecovery(
  state: TerminalMultiplexRecoveryState,
  event: TerminalMultiplexRecoveryEvent
): TerminalMultiplexRecoveryTransition {
  switch (event.type) {
    case 'delivery-gated':
      return transition(withKind('gated', { ...state.memory, delivery: 'gated' }))
    case 'delivery-active':
      return transition(withKind(state.kind, { ...state.memory, delivery: 'active' }))
    case 'host-start':
      return startHostSnapshotTransition(state, event.id, event.reason)
    case 'host-manual-request':
      return state.memory.activeSnapshot
        ? transition(state, [{ type: 'reject-manual-snapshot', id: event.id, seq: event.seq }])
        : startHostSnapshotTransition(state, event.id, 'manual')
    case 'host-snapshot-sent':
      return hostSnapshotSentTransition(state, event)
    case 'host-snapshot-ack':
      return hostSnapshotAckTransition(state, event.id, event.coverageEndSeq)
    case 'host-recover': {
      const snapshotFollows = state.memory.delivery === 'active'
      const restored = transition(state, [
        { type: 'send-model-restore', cause: event.cause, snapshotFollows }
      ])
      if (!snapshotFollows || event.snapshotId === undefined) {
        return restored
      }
      const reason = event.cause === 'pending-cap' ? 'pending-cap' : 'recovery'
      const started = startHostSnapshotTransition(state, event.snapshotId, reason)
      return { state: started.state, effects: [...restored.effects, ...started.effects] }
    }
    case 'client-begin-initial':
      return transition(
        withKind('snapshotting', {
          ...state.memory,
          recoveryRequested: false,
          clientSnapshotting: true
        }),
        [{ type: 'set-output-credit', bytes: 0 }]
      )
    case 'client-gate-credit':
      return transition(state, [{ type: 'set-output-credit', bytes: 0 }])
    case 'client-begin-reveal':
      return transition(withKind('snapshotting', { ...state.memory, clientSnapshotting: true }))
    case 'client-snapshot-started':
      if (event.accepted) {
        return transition(
          withKind('snapshotting', {
            ...state.memory,
            recoveryRequested: false,
            clientSnapshotting: true
          })
        )
      }
      return requestClientRecovery(
        withKind('snapshotting', { ...state.memory, recoveryRequested: false })
      )
    case 'client-model-restore':
      return transition(
        withKind('recovering', {
          ...state.memory,
          recoveryRequested: event.snapshotFollows,
          clientSnapshotting: true
        }),
        [{ type: 'clear-client-snapshot' }, { type: 'set-output-credit', bytes: 0 }]
      )
    case 'client-recovery-needed':
      return requestClientRecovery(state)
    case 'client-resumed':
      return transition(
        withKind(deliveryKind(state.memory), { ...state.memory, clientSnapshotting: false }),
        [{ type: 'set-output-credit', bytes: 2 * 1024 * 1024 }]
      )
    case 'reset':
      return transition(withKind('snapshotting', emptyMemory(state.memory.delivery)))
  }
}

function requestClientRecovery(
  state: TerminalMultiplexRecoveryState
): TerminalMultiplexRecoveryTransition {
  if (state.memory.recoveryRequested) {
    return transition(state)
  }
  return transition(
    withKind('recovering', {
      ...state.memory,
      recoveryRequested: true,
      clientSnapshotting: true
    }),
    [
      { type: 'clear-client-snapshot' },
      { type: 'set-output-credit', bytes: 0 },
      { type: 'request-client-snapshot' }
    ]
  )
}

function emptyMemory(delivery: RecoveryMemory['delivery']): RecoveryMemory {
  return {
    delivery,
    activeSnapshot: null,
    pendingSnapshot: null,
    supersededSnapshotAcks: [],
    recoveryRequested: false,
    clientSnapshotting: true
  }
}

function deliveryKind(memory: RecoveryMemory): 'live' | 'gated' {
  return memory.delivery === 'active' ? 'live' : 'gated'
}

function withKind(
  kind: TerminalMultiplexRecoveryState['kind'],
  memory: RecoveryMemory
): TerminalMultiplexRecoveryState {
  return { kind, memory }
}

function transition(
  state: TerminalMultiplexRecoveryState,
  effects: readonly TerminalMultiplexRecoveryEffect[] = []
): TerminalMultiplexRecoveryTransition {
  return { state, effects }
}

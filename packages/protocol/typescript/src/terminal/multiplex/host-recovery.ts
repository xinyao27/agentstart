import type {
  TerminalMultiplexRecoveryEffect,
  TerminalMultiplexRecoveryEvent,
  TerminalMultiplexRecoveryState,
  TerminalMultiplexRecoveryTransition
} from './recovery.js'
import type { TerminalMultiplexSnapshotReason } from './snapshot-records.js'

const SUPERSEDED_SNAPSHOT_ACK_LIMIT = 1_024

type PendingSnapshot = {
  id: number
  reason: TerminalMultiplexSnapshotReason
  coverageEndSeq: bigint
}

type SupersededSnapshotAck = { id: number; coverageEndSeq: bigint }

export function startHostSnapshotTransition(
  state: TerminalMultiplexRecoveryState,
  id: number,
  reason: TerminalMultiplexSnapshotReason
): TerminalMultiplexRecoveryTransition {
  const active = state.memory.activeSnapshot
  if (active && snapshotPriority(reason) <= snapshotPriority(active.reason)) {
    return transition(state)
  }
  const effects: TerminalMultiplexRecoveryEffect[] = []
  let supersededSnapshotAcks = state.memory.supersededSnapshotAcks
  const pending = state.memory.pendingSnapshot
  if (pending) {
    supersededSnapshotAcks = rememberSuperseded(supersededSnapshotAcks, pending)
    effects.push({
      type: 'send-superseded-snapshot',
      id: pending.id,
      coverageEndSeq: pending.coverageEndSeq
    })
  }
  effects.push({ type: 'start-host-snapshot', id, reason })
  return transition(
    {
      kind: reason === 'initial' ? 'snapshotting' : 'recovering',
      memory: {
        ...state.memory,
        activeSnapshot: { id, reason },
        pendingSnapshot: null,
        supersededSnapshotAcks
      }
    },
    effects
  )
}

export function hostSnapshotSentTransition(
  state: TerminalMultiplexRecoveryState,
  event: Extract<TerminalMultiplexRecoveryEvent, { type: 'host-snapshot-sent' }>
): TerminalMultiplexRecoveryTransition {
  const active = state.memory.activeSnapshot
  if (!active) {
    return transition(state)
  }
  if (event.status === 0) {
    return transition({
      kind: state.kind,
      memory: {
        ...state.memory,
        pendingSnapshot: {
          id: active.id,
          reason: active.reason,
          coverageEndSeq: event.coverageEndSeq
        }
      }
    })
  }
  const effect: TerminalMultiplexRecoveryEffect =
    active.reason === 'manual'
      ? { type: 'complete-host-manual-snapshot' }
      : { type: 'complete-host-snapshot', coverageEndSeq: event.coverageEndSeq }
  return transition(
    {
      kind: deliveryKind(state),
      memory: { ...state.memory, activeSnapshot: null, pendingSnapshot: null }
    },
    [effect]
  )
}

export function hostSnapshotAckTransition(
  state: TerminalMultiplexRecoveryState,
  id: number,
  coverageEndSeq: bigint
): TerminalMultiplexRecoveryTransition {
  const pending = state.memory.pendingSnapshot
  if (pending?.id === id && pending.coverageEndSeq === coverageEndSeq) {
    const completion: TerminalMultiplexRecoveryEffect =
      pending.reason === 'manual'
        ? { type: 'complete-host-manual-snapshot' }
        : { type: 'complete-host-snapshot', coverageEndSeq }
    return transition(
      {
        kind: deliveryKind(state),
        memory: { ...state.memory, activeSnapshot: null, pendingSnapshot: null }
      },
      [completion, { type: 'host-snapshot-ack-result', accepted: true }]
    )
  }
  const matched = state.memory.supersededSnapshotAcks.some(
    (entry) => entry.id === id && entry.coverageEndSeq === coverageEndSeq
  )
  return transition(
    {
      kind: state.kind,
      memory: {
        ...state.memory,
        supersededSnapshotAcks: matched
          ? state.memory.supersededSnapshotAcks.filter((entry) => entry.id !== id)
          : state.memory.supersededSnapshotAcks
      }
    },
    [{ type: 'host-snapshot-ack-result', accepted: matched }]
  )
}

function rememberSuperseded(
  entries: readonly SupersededSnapshotAck[],
  pending: PendingSnapshot
): readonly SupersededSnapshotAck[] {
  const remembered = [...entries]
  const existingIndex = remembered.findIndex((entry) => entry.id === pending.id)
  const entry = { id: pending.id, coverageEndSeq: pending.coverageEndSeq }
  if (existingIndex >= 0) {
    remembered[existingIndex] = entry
  } else {
    remembered.push(entry)
  }
  return remembered.slice(-SUPERSEDED_SNAPSHOT_ACK_LIMIT)
}

function snapshotPriority(reason: TerminalMultiplexSnapshotReason): number {
  if (reason === 'initial') {
    return 5
  }
  if (reason === 'recovery' || reason === 'pending-cap' || reason === 'normal-buffer-resize') {
    return 4
  }
  if (reason === 'reveal') {
    return 3
  }
  if (reason === 'resume') {
    return 2
  }
  return 1
}

function deliveryKind(state: TerminalMultiplexRecoveryState): 'live' | 'gated' {
  return state.memory.delivery === 'active' ? 'live' : 'gated'
}

function transition(
  state: TerminalMultiplexRecoveryState,
  effects: readonly TerminalMultiplexRecoveryEffect[] = []
): TerminalMultiplexRecoveryTransition {
  return { state, effects }
}

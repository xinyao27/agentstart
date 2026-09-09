import type {
  WorkspaceEvent,
  WorkspaceEventValue
} from '../generated/yiru/runtime/v1/workspace_events_pb.js'

export const WORKSPACE_EVENTS_PROTOCOL_CAPABILITY = 'workspaceEvents.journal.protobuf.v1' as const

// Why: the console/performance appends mounted in a later wave than the journal
// watch, so a daemon can advertise the journal capability without accepting
// appends.
export const WORKSPACE_EVENTS_APPEND_PROTOCOL_CAPABILITY =
  'workspaceEvents.append.protobuf.v1' as const

export type WorkspaceEventPayloadValue = boolean | number | string | null

export type WorkspaceEventRecord = Readonly<{
  id: number
  kind: string
  occurredAt: number
  payload: Readonly<Record<string, WorkspaceEventPayloadValue>>
  revision: number
  scope: string
}>

export type WorkspaceEventWatchMessage =
  | Readonly<{ type: 'ready'; afterId: number; revision: number }>
  | Readonly<{ type: 'event'; event: WorkspaceEventRecord }>

export function workspaceEventRecord(event: WorkspaceEvent): WorkspaceEventRecord {
  // Why: Object.fromEntries defines data properties for keys such as `__proto__`; assigning
  // untrusted journal keys onto `{}` would mutate its prototype instead of preserving payload.
  const payload = Object.fromEntries(
    event.payload.map((entry) => [entry.key, payloadValue(entry.value)] as const)
  )
  return {
    id: journalNumber(event.id, 'Workspace event id'),
    kind: event.kind,
    occurredAt: journalNumber(event.occurredAt, 'Workspace event timestamp'),
    payload,
    revision: journalNumber(event.revision, 'Workspace event revision'),
    scope: event.scope
  }
}

export function journalCursor(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`)
  }
  return BigInt(value)
}

export function journalNumber(value: bigint, label: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new TypeError(`${label} is outside the safe integer range`)
  }
  return number
}

// Why: an unset protocol value is the JSON null the journal stored, and the
// scalar cases mirror what the journal accepts.
function payloadValue(value: WorkspaceEventValue | undefined): WorkspaceEventPayloadValue {
  switch (value?.value.case) {
    case 'boolean':
      return value.value.value
    case 'number':
      return value.value.value
    case 'text':
      return value.value.value
    case undefined:
      return null
  }
}

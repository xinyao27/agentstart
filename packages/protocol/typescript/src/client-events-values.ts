import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import type {
  ClientEventsActivateWorktree,
  ClientEventsJsonValue,
  ClientEventsServiceEvent
} from '../generated/agent_start/runtime/v1/client_events_pb.js'
import { RuntimeProtocolError } from './error.js'

export const CLIENT_EVENTS_PROTOCOL_CAPABILITY = 'runtime.clientEvents.protobuf.v1' as const

export type ClientEventsPlainJsonValue =
  | null
  | boolean
  | number
  | string
  | ClientEventsPlainJsonValue[]
  | { [key: string]: ClientEventsPlainJsonValue }

export type ClientEventsHeadIdentityValue = Readonly<{
  worktreePath: string
  head: string
  branch: string | null
}>

// Why: the setup/startup/default-tabs payloads are the worktree's own open
// documents, so they stay plain JSON values for the caller to interpret.
export type ClientEventsActivateWorktreeValue = Readonly<{
  repoId: string
  worktreeId: string
  setup?: ClientEventsPlainJsonValue
  startup?: ClientEventsPlainJsonValue
  defaultTabs?: ClientEventsPlainJsonValue
}>

export type ClientEventsSubscriptionEventValue =
  | { type: 'ready'; subscriptionId: string }
  | { type: 'reposChanged' }
  | {
      type: 'worktreesChanged'
      repoId: string
      renamed?: { oldWorktreeId: string; newWorktreeId: string }
    }
  | ({ type: 'activateWorktree' } & ClientEventsActivateWorktreeValue)
  | {
      type: 'worktreeHeadIdentitiesChanged'
      repoId: string
      identities: ClientEventsHeadIdentityValue[]
    }
  | { type: 'end' }

export function clientEventsSubscriptionEvent(
  event: ClientEventsServiceEvent
): ClientEventsSubscriptionEventValue {
  switch (event.event.case) {
    case 'ready':
      return { type: 'ready', subscriptionId: event.event.value.subscriptionId }
    case 'reposChanged':
      return { type: 'reposChanged' }
    case 'worktreesChanged':
      return {
        type: 'worktreesChanged',
        repoId: event.event.value.repoId,
        ...(event.event.value.renamed
          ? {
              renamed: {
                oldWorktreeId: event.event.value.renamed.oldWorktreeId,
                newWorktreeId: event.event.value.renamed.newWorktreeId
              }
            }
          : {})
      }
    case 'activateWorktree':
      return activateWorktree(event.event.value)
    case 'worktreeHeadIdentitiesChanged':
      return {
        type: 'worktreeHeadIdentitiesChanged',
        repoId: event.event.value.repoId,
        identities: event.event.value.identities.map((identity) => ({
          worktreePath: identity.worktreePath,
          head: identity.head,
          branch: identity.branch ?? null
        }))
      }
    case 'end':
      return { type: 'end' }
    case undefined:
      throw new RuntimeProtocolError(
        StatusCode.DATA_LOSS,
        'Client event stream sent an empty event'
      )
  }
}

function activateWorktree(
  value: ClientEventsActivateWorktree
): { type: 'activateWorktree' } & ClientEventsActivateWorktreeValue {
  return {
    type: 'activateWorktree',
    repoId: value.repoId,
    worktreeId: value.worktreeId,
    ...(value.setup === undefined ? {} : { setup: plainJson(value.setup) }),
    ...(value.startup === undefined ? {} : { startup: plainJson(value.startup) }),
    ...(value.defaultTabs === undefined ? {} : { defaultTabs: plainJson(value.defaultTabs) })
  }
}

function plainJson(value: ClientEventsJsonValue): ClientEventsPlainJsonValue {
  switch (value.kind.case) {
    case undefined:
    case 'nullValue':
      return null
    case 'boolValue':
      return value.kind.value
    case 'numberValue':
      return value.kind.value
    case 'stringValue':
      return value.kind.value
    case 'listValue':
      return value.kind.value.values.map(plainJson)
    case 'objectValue':
      return Object.fromEntries(
        value.kind.value.entries.map((entry) => [
          entry.key,
          entry.value === undefined ? null : plainJson(entry.value)
        ])
      )
  }
}

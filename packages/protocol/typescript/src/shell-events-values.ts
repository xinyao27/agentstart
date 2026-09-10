import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ShellEventsStarNagSurface,
  type ShellEventsServiceEvent
} from '../generated/agent_start/runtime/v1/shell_events_pb.js'
import { StarNagPromptMode } from '../generated/agent_start/runtime/v1/star_nag_pb.js'
import { RuntimeProtocolError } from './error.js'
import {
  shellKeybindingsSnapshot,
  type ShellKeybindingsSnapshotValue
} from './shell-keybindings-values.js'

export const SHELL_EVENTS_PROTOCOL_CAPABILITY = 'shell.events.protobuf.v1' as const

export type ShellEventsStarNagSurfaceName = 'card' | 'toast'

export type ShellEventsStarNagShowValue = {
  mode?: 'gh' | 'web'
  surface?: ShellEventsStarNagSurfaceName
}

// Why: the cursor sequence is the replay position the legacy channel carried as
// a bare number, so every decoded event keeps its `seq` beside the payload.
export type ShellEventsSubscriptionEventValue =
  | { type: 'ready'; seq: number }
  | { type: 'resync'; seq: number }
  | {
      type: 'keybindingsChanged'
      seq: number
      snapshot: ShellKeybindingsSnapshotValue
    }
  | ({ type: 'starNagShow'; seq: number } & ShellEventsStarNagShowValue)
  | { type: 'starNagHide'; seq: number }

export function shellEventsSubscriptionEvent(
  event: ShellEventsServiceEvent
): ShellEventsSubscriptionEventValue {
  switch (event.event.case) {
    case 'ready':
      return { type: 'ready', seq: cursor(event.event.value.cursor) }
    case 'resync':
      return { type: 'resync', seq: cursor(event.event.value.cursor) }
    case 'keybindingsChanged': {
      const snapshot = event.event.value.snapshot
      if (!snapshot) {
        throw new RuntimeProtocolError(
          StatusCode.DATA_LOSS,
          'Shell keybindings event sent no snapshot'
        )
      }
      return {
        type: 'keybindingsChanged',
        seq: cursor(event.event.value.cursor),
        snapshot: shellKeybindingsSnapshot(snapshot)
      }
    }
    case 'starNagShow':
      return {
        type: 'starNagShow',
        seq: cursor(event.event.value.cursor),
        ...(event.event.value.mode === undefined
          ? {}
          : { mode: promptMode(event.event.value.mode) }),
        ...(event.event.value.surface === undefined ||
        event.event.value.surface === ShellEventsStarNagSurface.UNSPECIFIED
          ? {}
          : { surface: starNagSurface(event.event.value.surface) })
      }
    case 'starNagHide':
      return { type: 'starNagHide', seq: cursor(event.event.value.cursor) }
    case undefined:
      throw new RuntimeProtocolError(StatusCode.DATA_LOSS, 'Shell event stream sent an empty event')
  }
}

function cursor(value: { seq: number } | undefined): number {
  return value?.seq ?? 0
}

function promptMode(mode: StarNagPromptMode): 'gh' | 'web' {
  switch (mode) {
    case StarNagPromptMode.GH:
      return 'gh'
    case StarNagPromptMode.WEB:
      return 'web'
    case StarNagPromptMode.UNSPECIFIED:
      break
  }
  throw new RuntimeProtocolError(StatusCode.DATA_LOSS, 'Shell event star nag mode is missing')
}

function starNagSurface(surface: ShellEventsStarNagSurface): ShellEventsStarNagSurfaceName {
  switch (surface) {
    case ShellEventsStarNagSurface.CARD:
      return 'card'
    case ShellEventsStarNagSurface.TOAST:
      return 'toast'
    case ShellEventsStarNagSurface.UNSPECIFIED:
      break
  }
  throw new RuntimeProtocolError(StatusCode.DATA_LOSS, 'Shell event star nag surface is missing')
}

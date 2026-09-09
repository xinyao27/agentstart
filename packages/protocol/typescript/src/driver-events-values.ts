import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  DriverEventsFitOverrideMode,
  type DriverEventsServiceEvent,
  type DriverEventsTerminalDriver
} from '../generated/yiru/runtime/v1/driver_events_pb.js'
import { RuntimeProtocolError } from './error.js'

export const DRIVER_EVENTS_PROTOCOL_CAPABILITY = 'runtime.driverEvents.protobuf.v1' as const

// Why: the decoded driver reuses the shell's `TerminalDriverState` vocabulary
// (idle | desktop | named mobile client) so driver events hydrate the same
// consumer state the fit-override and driver reads produce.
export type DriverEventsTerminalDriverValue =
  | { kind: 'idle' }
  | { kind: 'desktop' }
  | { kind: 'mobile'; clientId: string }

export type DriverEventsSubscriptionEventValue =
  | { type: 'ready'; subscriptionId: string }
  | {
      type: 'terminalDriverChanged'
      ptyId: string
      driver: DriverEventsTerminalDriverValue
    }
  | {
      type: 'terminalFitOverrideChanged'
      ptyId: string
      mode: 'mobile-fit' | 'desktop-fit'
      cols: number
      rows: number
    }
  | { type: 'end' }

export function driverEventsSubscriptionEvent(
  event: DriverEventsServiceEvent
): DriverEventsSubscriptionEventValue {
  switch (event.event.case) {
    case 'ready':
      return { type: 'ready', subscriptionId: event.event.value.subscriptionId }
    case 'terminalDriverChanged':
      return {
        type: 'terminalDriverChanged',
        ptyId: event.event.value.ptyId,
        driver: terminalDriver(event.event.value.driver)
      }
    case 'terminalFitOverrideChanged':
      return {
        type: 'terminalFitOverrideChanged',
        ptyId: event.event.value.ptyId,
        mode: fitOverrideMode(event.event.value.mode),
        cols: event.event.value.cols,
        rows: event.event.value.rows
      }
    case 'end':
      return { type: 'end' }
    case undefined:
      throw new RuntimeProtocolError(
        StatusCode.DATA_LOSS,
        'Driver event stream sent an empty event'
      )
  }
}

// Why: the driver state is a closed three-way union (idle, desktop, or a named
// mobile client), so the oneof case names the state.
function terminalDriver(
  value: DriverEventsTerminalDriver | undefined
): DriverEventsTerminalDriverValue {
  switch (value?.state.case) {
    case 'desktop':
      return { kind: 'desktop' }
    case 'mobileClientId':
      return { kind: 'mobile', clientId: value.state.value }
    case undefined:
    case 'idle':
      return { kind: 'idle' }
  }
}

function fitOverrideMode(mode: DriverEventsFitOverrideMode): 'mobile-fit' | 'desktop-fit' {
  switch (mode) {
    case DriverEventsFitOverrideMode.MOBILE_FIT:
      return 'mobile-fit'
    case DriverEventsFitOverrideMode.DESKTOP_FIT:
      return 'desktop-fit'
    case DriverEventsFitOverrideMode.UNSPECIFIED:
      break
  }
  throw new RuntimeProtocolError(StatusCode.DATA_LOSS, 'Driver fit override mode is missing')
}

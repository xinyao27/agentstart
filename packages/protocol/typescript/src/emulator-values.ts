import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  EmulatorGesturePointKind,
  EmulatorOrientation,
  type EmulatorDeviceInfo,
  type EmulatorHelperStatus,
  type EmulatorJsonValue,
  type EmulatorServiceAvailabilityResponse,
  type EmulatorServiceAttachResponse,
  type EmulatorServiceExecResponse,
  type EmulatorServiceKillResponse,
  type EmulatorServiceListResponse,
  type EmulatorServiceShutdownResponse,
  type EmulatorSessionInfo
} from '../generated/yiru/runtime/v1/emulator_pb.js'
import { RuntimeProtocolError } from './error.js'

export const EMULATOR_PROTOCOL_CAPABILITY = 'emulator.protobuf.v1' as const

export type EmulatorDeviceValue = {
  name: string
  udid: string
  state: string
  runtime: string
  isAvailable?: boolean
}

export type EmulatorHelperStatusValue = { ok: boolean; message?: string }

export type EmulatorAvailabilityValue = {
  platform: string
  available: boolean
  devices: EmulatorDeviceValue[]
  simctl: EmulatorHelperStatusValue
  serveSim: EmulatorHelperStatusValue
  message: string
}

export type EmulatorSessionInfoValue = {
  deviceUdid: string
  wsUrl: string
  streamUrl: string
  axUrl?: string
  helperPid?: number
}

export type EmulatorAttachResultValue = {
  attached: boolean
  info?: EmulatorSessionInfoValue
}

export type EmulatorStopResultValue = { ok: boolean; deviceUdid?: string }

export type EmulatorTargetInput = { device?: string; worktree?: string }

export type EmulatorGesturePointInput = {
  x: number
  y: number
  type: 'begin' | 'move' | 'end'
  edge?: number
}

export type EmulatorOrientationInput =
  | 'portrait'
  | 'portrait_upside_down'
  | 'landscape_left'
  | 'landscape_right'

// Why: `emulator list` and `emulator exec` surface the serve-sim helper's own
// JSON verbatim, so the client hands callers an equally untyped JSON value.
export type EmulatorJsonResultValue =
  | null
  | boolean
  | number
  | string
  | EmulatorJsonResultValue[]
  | { [key: string]: EmulatorJsonResultValue }

export function emulatorDeviceInfo(value: EmulatorDeviceInfo): EmulatorDeviceValue {
  return {
    name: required(value.name, 'Device name'),
    udid: required(value.udid, 'Device UDID'),
    state: value.state,
    runtime: value.runtime,
    ...(value.isAvailable === undefined ? {} : { isAvailable: value.isAvailable })
  }
}

export function emulatorAvailability(
  value: EmulatorServiceAvailabilityResponse
): EmulatorAvailabilityValue {
  return {
    platform: value.platform,
    available: value.available,
    devices: value.devices.map(emulatorDeviceInfo),
    simctl: helperStatus(value.simctl, 'simctl'),
    serveSim: helperStatus(value.serveSim, 'serve-sim'),
    message: value.message
  }
}

export function emulatorAttachResult(
  value: EmulatorServiceAttachResponse
): EmulatorAttachResultValue {
  return {
    attached: value.attached,
    ...(value.info ? { info: emulatorSessionInfo(value.info) } : {})
  }
}

export function emulatorStopResult(
  value: EmulatorServiceKillResponse | EmulatorServiceShutdownResponse
): EmulatorStopResultValue {
  return {
    ok: value.ok,
    ...(value.deviceUdid === undefined ? {} : { deviceUdid: value.deviceUdid })
  }
}

export function emulatorSessionInfo(value: EmulatorSessionInfo): EmulatorSessionInfoValue {
  return {
    deviceUdid: required(value.deviceUdid, 'Device UDID'),
    wsUrl: required(value.wsUrl, 'Device WebSocket URL'),
    streamUrl: required(value.streamUrl, 'Device stream URL'),
    ...(value.axUrl === undefined ? {} : { axUrl: value.axUrl }),
    ...(value.helperPid === undefined ? {} : { helperPid: value.helperPid })
  }
}

export function emulatorJsonResult(value: EmulatorServiceListResponse): EmulatorJsonResultValue {
  return value.sessions ? jsonValue(value.sessions) : null
}

export function emulatorExecResult(value: EmulatorServiceExecResponse): EmulatorJsonResultValue {
  return value.result ? jsonValue(value.result) : null
}

export function jsonValue(value: EmulatorJsonValue): EmulatorJsonResultValue {
  switch (value.kind.case) {
    case 'nullValue':
      return null
    case 'boolValue':
      return value.kind.value
    case 'numberValue':
      return value.kind.value
    case 'stringValue':
      return value.kind.value
    case 'listValue':
      return value.kind.value.values.map(jsonValue)
    case 'objectValue':
      return Object.fromEntries(
        value.kind.value.entries.map((entry) => [
          entry.key,
          entry.value ? jsonValue(entry.value) : null
        ])
      )
    case undefined:
      return null
  }
}

export function gesturePointKind(
  value: EmulatorGesturePointInput['type']
): EmulatorGesturePointKind {
  switch (value) {
    case 'begin':
      return EmulatorGesturePointKind.BEGIN
    case 'move':
      return EmulatorGesturePointKind.MOVE
    case 'end':
      return EmulatorGesturePointKind.END
  }
}

export function orientation(value: EmulatorOrientationInput): EmulatorOrientation {
  switch (value) {
    case 'portrait':
      return EmulatorOrientation.PORTRAIT
    case 'portrait_upside_down':
      return EmulatorOrientation.PORTRAIT_UPSIDE_DOWN
    case 'landscape_left':
      return EmulatorOrientation.LANDSCAPE_LEFT
    case 'landscape_right':
      return EmulatorOrientation.LANDSCAPE_RIGHT
  }
}

function helperStatus(
  value: EmulatorHelperStatus | undefined,
  label: string
): EmulatorHelperStatusValue {
  if (!value) {
    throw invalidResponse(`Emulator ${label} status is missing`)
  }
  return {
    ok: value.ok,
    ...(value.message === undefined ? {} : { message: value.message })
  }
}

function required(value: string, label: string): string {
  if (value.length === 0) {
    throw invalidResponse(`${label} is missing`)
  }
  return value
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

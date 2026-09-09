import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  TerminalDriverKind as ProtocolDriverKind,
  type TerminalDriverSnapshot as ProtocolDriverSnapshot,
  type TerminalFitOverride as ProtocolFitOverride,
  TerminalFitOverrideMode as ProtocolFitOverrideMode
} from '../generated/yiru/runtime/v1/terminal_fit_pb.js'
import { RuntimeProtocolError } from './error.js'

export const TERMINAL_FIT_PROTOCOL_CAPABILITY = 'terminal.fit.protobuf.v1' as const

export type TerminalDriverState =
  | { kind: 'idle' }
  | { kind: 'desktop' }
  | { kind: 'mobile'; clientId: string }

export type TerminalDriver = {
  ptyId: string
  driver: TerminalDriverState
}

export type TerminalFitOverride = {
  ptyId: string
  mode: 'mobile-fit' | 'remote-desktop-fit'
  cols: number
  rows: number
}

export function terminalDriver(snapshot: ProtocolDriverSnapshot): TerminalDriver {
  const ptyId = requiredIdentity(snapshot.ptyId, 'Terminal driver PTY ID')
  switch (snapshot.kind) {
    case ProtocolDriverKind.IDLE:
      rejectClientId(snapshot.clientId, 'Idle terminal driver')
      return { ptyId, driver: { kind: 'idle' } }
    case ProtocolDriverKind.DESKTOP:
      rejectClientId(snapshot.clientId, 'Desktop terminal driver')
      return { ptyId, driver: { kind: 'desktop' } }
    case ProtocolDriverKind.MOBILE:
      return {
        ptyId,
        driver: {
          kind: 'mobile',
          clientId: requiredIdentity(snapshot.clientId ?? '', 'Mobile terminal driver client ID')
        }
      }
    case ProtocolDriverKind.UNSPECIFIED:
      throw invalidResponse('Terminal driver kind is unspecified')
  }
  throw invalidResponse('Terminal driver kind is unknown')
}

export function terminalFitOverride(override: ProtocolFitOverride): TerminalFitOverride {
  return {
    ptyId: requiredIdentity(override.ptyId, 'Terminal fit override PTY ID'),
    mode: fitMode(override.mode),
    cols: terminalDimension(override.cols, 'Terminal fit override columns'),
    rows: terminalDimension(override.rows, 'Terminal fit override rows')
  }
}

function fitMode(mode: ProtocolFitOverrideMode): TerminalFitOverride['mode'] {
  switch (mode) {
    case ProtocolFitOverrideMode.MOBILE_FIT:
      return 'mobile-fit'
    case ProtocolFitOverrideMode.REMOTE_DESKTOP_FIT:
      return 'remote-desktop-fit'
    case ProtocolFitOverrideMode.UNSPECIFIED:
      throw invalidResponse('Terminal fit override mode is unspecified')
  }
  throw invalidResponse('Terminal fit override mode is unknown')
}

function requiredIdentity(value: string, label: string): string {
  if (value.length === 0) {
    throw invalidResponse(`${label} is missing`)
  }
  return value
}

function rejectClientId(clientId: string | undefined, label: string): void {
  if (clientId !== undefined) {
    throw invalidResponse(`${label} includes a client ID`)
  }
}

function terminalDimension(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw invalidResponse(`${label} is invalid`)
  }
  return value
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

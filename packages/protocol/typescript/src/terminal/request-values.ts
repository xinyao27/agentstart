import {
  TerminalClientKind,
  TerminalSplitTelemetrySource
} from '../../generated/agent_start/runtime/v1/terminal_pb.js'
import type { TerminalClientIdentity, TerminalViewport } from './types.js'

export function required(value: string, label: string): string {
  if (value.length === 0) {
    throw new TypeError(`${label} must not be empty`)
  }
  return value
}

export function dimension(value: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} are invalid`)
  }
  return value
}

export function viewport(value: TerminalViewport): TerminalViewport {
  return {
    cols: dimension(value.cols, 1_000, 'Terminal columns'),
    rows: dimension(value.rows, 500, 'Terminal rows')
  }
}

export function clientIdentity(client: TerminalClientIdentity): {
  id: string
  kind: TerminalClientKind
} {
  return { id: required(client.id, 'Terminal client ID'), kind: clientKind(client.type) }
}

function clientKind(value: TerminalClientIdentity['type']): TerminalClientKind {
  switch (value) {
    case undefined:
    case 'desktop':
      return TerminalClientKind.DESKTOP
    case 'mobile':
      return TerminalClientKind.MOBILE
    case 'extension':
      return TerminalClientKind.EXTENSION
    case 'daemon':
      return TerminalClientKind.DAEMON
    case 'cli':
      return TerminalClientKind.CLI
  }
}

export function listLimit(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('Terminal list limit must be finite')
  }
  return Math.min(0xffffffff, Math.max(1, Math.floor(value)))
}

export function readLimit(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined
  }
  return Math.min(2_000, Math.floor(value))
}

export function cursor(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Terminal cursor must be a nonnegative safe integer')
  }
  return BigInt(value)
}

export function safeInteger(value: bigint, label: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`${label} is outside the nonnegative safe integer range`)
  }
  return number
}

// Why: the runtime encodes "no bound pane runtime" as -1 in the int64
// pane_runtime_id field, and the renderer mirrors that sentinel, so the
// adapter must pass it through instead of rejecting a negative value.
export function paneRuntimeIdOrNone(value: bigint, label: string): number {
  const number = Number(value)
  if (number === -1) {
    return number
  }
  return safeInteger(value, label)
}

export function splitTelemetrySource(
  value: 'contextual_tour' | 'keyboard' | 'context_menu' | 'command' | 'unknown' | undefined
): TerminalSplitTelemetrySource {
  switch (value) {
    case undefined:
      return TerminalSplitTelemetrySource.UNSPECIFIED
    case 'contextual_tour':
      return TerminalSplitTelemetrySource.CONTEXTUAL_TOUR
    case 'keyboard':
      return TerminalSplitTelemetrySource.KEYBOARD
    case 'context_menu':
      return TerminalSplitTelemetrySource.CONTEXT_MENU
    case 'command':
      return TerminalSplitTelemetrySource.COMMAND
    case 'unknown':
      return TerminalSplitTelemetrySource.UNKNOWN
  }
}

export const TerminalMultiplexErrorCode = {
  none: 0,
  invalid_payload: 1,
  unknown_stream: 2,
  stale_epoch: 3,
  stale_transport_generation: 4,
  input_locked: 5,
  viewport_rejected: 6,
  unsupported_signal: 7,
  snapshot_busy: 8,
  snapshot_too_large: 9,
  provider_unavailable: 10,
  connection_use_conflict: 11,
  input_gap: 12,
  operation_superseded: 13
} as const

export type TerminalMultiplexErrorName = keyof typeof TerminalMultiplexErrorCode

export function terminalMultiplexErrorCode(name: TerminalMultiplexErrorName): number {
  return TerminalMultiplexErrorCode[name]
}

export function terminalMultiplexErrorName(code: number): TerminalMultiplexErrorName | null {
  for (const [name, value] of Object.entries(TerminalMultiplexErrorCode)) {
    if (value === code) {
      return name as TerminalMultiplexErrorName
    }
  }
  return null
}

// Why: the daemon reports every request against a dropped terminal as
// terminal_not_found (TerminalSessionError::NotFound and multiplex subscribe
// admission); terminal_gone is synthesized by the client when a transport
// claim never lands. Anything else is a real failure and must stay loud.
const TERMINAL_GONE_CODES = ['terminal_not_found', 'terminal_gone'] as const

export function isRuntimeTerminalGoneError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return TERMINAL_GONE_CODES.some((code) => message.includes(code))
}

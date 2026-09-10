const TERMINAL_SESSION_STATE_SAVE_FAILED_CODE = 'AGENTSTART_TERMINAL_SESSION_STATE_SAVE_FAILED'

export function isTerminalSessionStateSaveFailure(message: string): boolean {
  return (
    message.includes(TERMINAL_SESSION_STATE_SAVE_FAILED_CODE) ||
    message.includes('Failed to save terminal session state')
  )
}

export const AGENTSTART_TERMINAL_COMMAND_FINISHED_EVENT = 'agentstart:terminal-command-finished'

export type TerminalCommandFinishedEventDetail = {
  worktreeId: string
}

// Why: the OSC 133;D handler lives in a per-pane closure; a window event lets
// decoupled consumers (e.g. git status refresh) react to shell commands
// finishing without reaching into terminal internals.
export function dispatchTerminalCommandFinishedEvent(worktreeId: string): void {
  // Why: non-DOM renderer hosts may not provide the browser event target methods.
  if (typeof window.dispatchEvent !== 'function') {
    return
  }

  window.dispatchEvent(
    new CustomEvent<TerminalCommandFinishedEventDetail>(
      AGENTSTART_TERMINAL_COMMAND_FINISHED_EVENT,
      {
        detail: { worktreeId }
      }
    )
  )
}

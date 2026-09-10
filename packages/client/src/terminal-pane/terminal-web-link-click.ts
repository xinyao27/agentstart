import type { Terminal } from '@xterm/xterm'

import { isTerminalHttpLinkActivation } from './terminal-http-link-activation'
import type { LinkHandlerDeps } from './terminal-link-handlers'
import { handleOscLink } from './terminal-osc-link-routing'
import { openHttpLinkAtTerminalMouseEvent } from './terminal-url-link-hit-testing'

type TerminalWebLinkClickDeps = Pick<
  LinkHandlerDeps,
  'worktreeId' | 'worktreePath' | 'startupCwd' | 'runtimeEnvironmentId' | 'terminalHomePath'
> & {
  terminal: Terminal | null
}

export function handleTerminalWebLinkClick(
  url: string,
  event: MouseEvent | undefined,
  deps: TerminalWebLinkClickDeps
): boolean {
  if (!event || !isTerminalHttpLinkActivation(event)) {
    return false
  }

  let handled: boolean
  if (
    deps.terminal &&
    openHttpLinkAtTerminalMouseEvent(deps.terminal, event, {
      worktreeId: deps.worktreeId,
      runtimeEnvironmentId: deps.runtimeEnvironmentId
    })
  ) {
    // Why: WebLinksAddon only knows the physical row; AgentStart's logical hit-test
    // preserves the complete URL rendered across hard-wrapped TUI rows.
    event.preventDefault()
    handled = true
  } else {
    handled = handleOscLink(url, event, deps)
  }

  if (handled) {
    // Why: link navigation can steal focus before xterm's mouseup cleanup;
    // clearing selection also detaches its pending drag-selection listeners.
    deps.terminal?.clearSelection()
  }
  return handled
}

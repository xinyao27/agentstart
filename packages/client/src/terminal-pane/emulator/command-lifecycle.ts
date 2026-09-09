import type { Terminal, IDisposable } from '@xterm/xterm'

export function observeTerminalCommandStarts(
  terminal: Terminal,
  onCommandStarted: () => void
): IDisposable {
  // Why: shell execution changes the visible foreground process; completion
  // arrives only through the daemon fact stream, including for parked panes.
  return terminal.parser.registerOscHandler(133, (payload) => {
    if (payload.split(';', 1)[0] === 'C') {
      onCommandStarted()
    }
    return true
  })
}
